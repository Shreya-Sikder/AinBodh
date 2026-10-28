import {
  ChangeEvent,
  DragEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  Camera,
  Check,
  ExternalLink,
  FileText,
  Loader2,
  Mic,
  Paperclip,
  Plus,
  RotateCcw,
  Scale,
  Send,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import {
  useVoiceTranscriber,
  type VoiceLanguage,
} from "../hooks/useVoiceTranscriber";

import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";

import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useApp } from "../context/AppContext";

import {
  analyzeUploadedDocument,
  askQuestion,
  askQuestionOffline,
  isOfflineDemoMode,
  reanalyzeDocumentText,
} from "../services/api";
import type { ChatMessage, DocumentAnalysisMessage } from "../context/AppContext";
import AssistantMessage, { ThinkingSteps } from "../components/chat/AssistantMessage";
import DocumentViewer from "../components/DocumentViewer";
import { loadDocumentFile, saveDocumentFile, type ActiveDocument } from "../services/documentStore";

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Short text form of a document analysis, used as chat history and for copying. */
function documentSummary(doc: DocumentAnalysisMessage): string {
  const points = doc.keyPoints
    .map((item) => [item.label || item.title, item.value || item.description].filter(Boolean).join(": "))
    .filter(Boolean)
    .slice(0, 8);
  return [`[${doc.name}] ${doc.overview}`, ...points.map((point) => `- ${point}`)].join("\n");
}

export default function UploadPage() {
  const { lang } = useLanguage();

  const {
    pendingFile,
    pendingText,
    setPendingInput,
    addDocument,
    addMessage,
    addMessageToChat,
    notify,
    theme,
    chatMessages,
    activeChatId,
    updateMessage,
    startFreshChat,
    playbackSpeed,
  } = useApp();

  const navigate = useNavigate();

  const documentInputRef =
    useRef<HTMLInputElement>(null);

  const cameraInputRef =
    useRef<HTMLInputElement>(null);

  const videoRef =
    useRef<HTMLVideoElement>(null);

  const canvasRef =
    useRef<HTMLCanvasElement>(null);

  const cameraStreamRef =
    useRef<MediaStream | null>(null);

  const composerRef =
    useRef<HTMLTextAreaElement>(null);

  const [dragging, setDragging] =
    useState(false);

  const [voicePreview, setVoicePreview] =
    useState<string | null>(null);

  const [voiceEditorOpen, setVoiceEditorOpen] =
    useState(false);

  const [voiceLanguage, setVoiceLanguage] =
    useState<VoiceLanguage>(
      lang === "bn" ? "bn" : "en",
    );

  const [sending, setSending] =
    useState(false);

  const [cameraOpen, setCameraOpen] =
    useState(false);

  const [cameraLoading, setCameraLoading] =
    useState(false);

  const [capturedImage, setCapturedImage] =
    useState<string | null>(null);

  /*
   * The conversation shown on this page is the saved chat from AppContext
   * (the same one listed in My Chats). The composer text is only a draft:
   * sending snapshots it into an immutable message and clears the box.
   */
  // Live progress of the answer being prepared ("Reading the document…").
  const [thinking, setThinking] =
    useState<{ steps: string[]; startedAt: number } | null>(null);
  const askingQuestion = thinking !== null;

  const [viewerDocument, setViewerDocument] =
    useState<ActiveDocument | null>(null);
  const [viewerText, setViewerText] = useState("");
  const [reanalyzingId, setReanalyzingId] =
    useState<string | null>(null);

  const [speakingId, setSpeakingId] =
    useState<string | null>(null);

  const sendLockRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);


  const bn = lang === "bn";
  const dark = theme === "dark";
  const offlineDemo =
  isOfflineDemoMode();

  /*
   * =============================================================
   * VOICE INPUT
   * =============================================================
   */

  // Called continuously while the person speaks (live words) and once at the end.
  const handleVoiceTranscript = (text: string) => {
    setVoicePreview(text);
  };

  const {
    recording,
    transcribing: voiceTranscribing,
    supported: voiceSupported,
    error: voiceError,
    interim: voiceInterim,
    finalText: voiceFinal,
    start: startVoice,
    stop: stopVoice,
  } = useVoiceTranscriber({
    language: voiceLanguage,
    onTranscript: handleVoiceTranscript,
  });

  /*
   * =============================================================
   * READ ALOUD
   * =============================================================
   */

  const {
    supported: speechSupported,
    speaking,
    speak,
    stop: stopSpeaking,
  } = useSpeechSynthesis();

  /*
   * Keep voice language aligned with the app language
   * when the user changes the application's language.
   */
  useEffect(() => {
    setVoiceLanguage(
      lang === "bn" ? "bn" : "en",
    );
  }, [lang]);

  /*
   * Surface speech-recognition errors through the
   * existing AinBodh notification system.
   */
  useEffect(() => {
    if (!voiceError) return;
    notify(voiceError);
  }, [voiceError, notify]);

  /*
   * Stop voice recording / speech / camera when
   * leaving the page.
   */
  useEffect(() => {
    return () => {
      stopVoice();
      stopSpeaking();
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (chatMessages.length === 0 && !askingQuestion) return;
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [chatMessages.length, askingQuestion]);

  useEffect(() => {
    if (!speaking) setSpeakingId(null);
  }, [speaking]);

  /*
   * Detect whether an answer contains Bengali script.
   * Bengali script gets Bengali speech synthesis;
   * otherwise English speech synthesis is used.
   *
   * Banglish is intentionally read using the English
   * speech voice because the current speech hook supports
   * English and Bangla voices, not a separate Banglish voice.
   */
  const getSpeechLanguage = (
    text: string,
  ): "en" | "bn" => {
    const bengaliCharacters =
      text.match(/[\u0980-\u09FF]/g);

    return bengaliCharacters &&
      bengaliCharacters.length > 0
      ? "bn"
      : "en";
  };

  const toggleReadAloud = (messageId: string, answer: string) => {
    if (!answer) return;

    if (speaking) {
      stopSpeaking();
      if (speakingId === messageId) return;
    }

    if (!speechSupported) {
      notify(
        bn
          ? "এই ব্রাউজারে ভয়েস পড়ে শোনানোর সুবিধা সমর্থিত নয়।"
          : "Read-aloud is not supported in this browser.",
      );
      return;
    }

    const speechLanguage =
      getSpeechLanguage(answer);

    setSpeakingId(messageId);
    void speak(answer, speechLanguage, playbackSpeed).catch((error: Error) => {
      setSpeakingId(null);
      notify(error.message);
    });
  };

  /*
   * =============================================================
   * CAMERA
   * =============================================================
   */

  const stopCamera = () => {
    cameraStreamRef.current
      ?.getTracks()
      .forEach((track) => {
        track.stop();
      });

    cameraStreamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  /*
   * =============================================================
   * INPUT HELPERS
   * =============================================================
   */

  const appendText = (text: string) => {
    const value = text.trim();

    if (!value) return;

    setPendingInput(
      pendingFile,
      pendingText.trim()
        ? `${pendingText.trim()} ${value}`
        : value,
    );

    window.setTimeout(() => {
      composerRef.current?.focus();
    }, 0);
  };

  const handleFile = (file?: File) => {
    if (!file) return;

    setPendingInput(
      file,
      pendingText,
    );

    notify(
      bn
        ? `${file.name} যোগ করা হয়েছে।`
        : `${file.name} attached.`,
    );
  };

  const onDrop = (
    event: DragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();

    setDragging(false);

    handleFile(
      event.dataTransfer.files[0],
    );
  };

  /*
   * =============================================================
   * VOICE CONTROLS
   * =============================================================
   */

  const toggleVoice = () => {
    if (!voiceSupported) {
      notify(
        bn
          ? "এই ব্রাউজারে ভয়েস ইনপুট সমর্থিত নয়।"
          : "Voice input is not supported in this browser.",
      );
      return;
    }

    if (recording) {
      stopVoice();
      return;
    }

    // Record only the new speech; it is appended to the draft after review.
    // The panel opens right away so the words appear live as they are spoken.
    setVoicePreview("");
    setVoiceEditorOpen(true);
    startVoice("");
  };

  const useVoiceTranscript = () => {
    if (!voicePreview?.trim()) return;

    appendText(voicePreview);

    setVoicePreview(null);
    setVoiceEditorOpen(false);

    notify(
      bn
        ? "ভয়েস ট্রান্সক্রিপ্ট যোগ করা হয়েছে।"
        : "Voice transcript added.",
    );
  };

  /*
   * =============================================================
   * CAMERA
   * =============================================================
   */

  const openCamera = async () => {
    setCameraLoading(true);
    setCapturedImage(null);

    try {
      if (
        !navigator.mediaDevices?.getUserMedia
      ) {
        cameraInputRef.current?.click();
        return;
      }

      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal: "environment",
            },
            width: {
              ideal: 1920,
            },
            height: {
              ideal: 1080,
            },
          },
          audio: false,
        });

      cameraStreamRef.current = stream;
      setCameraOpen(true);

      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 50);
    } catch {
      notify(
        bn
          ? "ক্যামেরা চালু করা যায়নি। ছবি আপলোড করুন।"
          : "Camera could not be opened. You can upload an image instead.",
      );

      cameraInputRef.current?.click();
    } finally {
      setCameraLoading(false);
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    const width = video.videoWidth;
    const height = video.videoHeight;

    if (!width || !height) {
      notify(
        bn
          ? "ক্যামেরা এখনও প্রস্তুত নয়। একটু অপেক্ষা করুন।"
          : "Camera is not ready yet. Please wait a moment.",
      );
      return;
    }

    canvas.width = width;
    canvas.height = height;

    const context =
      canvas.getContext("2d");

    if (!context) return;

    context.drawImage(
      video,
      0,
      0,
      width,
      height,
    );

    const image =
      canvas.toDataURL(
        "image/jpeg",
        0.9,
      );

    setCapturedImage(image);

    stopCamera();
  };

  const retakePhoto = async () => {
    setCapturedImage(null);

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal: "environment",
            },
            width: {
              ideal: 1920,
            },
            height: {
              ideal: 1080,
            },
          },
          audio: false,
        });

      cameraStreamRef.current = stream;

      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 50);
    } catch {
      notify(
        bn
          ? "ক্যামেরা পুনরায় চালু করা যায়নি।"
          : "The camera could not be restarted.",
      );
    }
  };

  const useCapturedPhoto = async () => {
    if (!capturedImage) return;

    try {
      const response =
        await fetch(capturedImage);

      const blob =
        await response.blob();

      const file = new File(
        [blob],
        `ainbodh-scan-${Date.now()}.jpg`,
        {
          type: "image/jpeg",
        },
      );

      handleFile(file);

      setCapturedImage(null);
      setCameraOpen(false);

      notify(
        bn
          ? "ছবিটি নথিতে যোগ করা হয়েছে।"
          : "Photo added to your document.",
      );
    } catch {
      notify(
        bn
          ? "ছবিটি যোগ করা যায়নি। আবার চেষ্টা করুন।"
          : "The photo could not be added. Please try again.",
      );
    }
  };

  const closeCamera = () => {
    stopCamera();
    setCapturedImage(null);
    setCameraOpen(false);
  };

  /*
   * =============================================================
   * CITATIONS
   * =============================================================
   */

  /*
   * =============================================================
   * SEND
   * =============================================================
   */

  /** The latest document in this conversation, so follow-up questions can refer to it. */
  const latestDocument = (): DocumentAnalysisMessage | undefined => {
    for (let index = chatMessages.length - 1; index >= 0; index--) {
      const doc = chatMessages[index].document;
      if (doc) return doc;
    }
    return undefined;
  };

  const historyFrom = (messages: ChatMessage[]) =>
    messages.map((message) => {
      const text = message.document ? documentSummary(message.document) : message.text;
      return { role: message.role, text, content: text };
    });

  /** Collects progress steps for the "thinking" line and the saved "Thought for N s". */
  const trackSteps = () => {
    const startedAt = Date.now();
    const steps: string[] = [];
    setThinking({ steps: [], startedAt });
    return {
      steps,
      startedAt,
      onStep: (step: string) => {
        if (steps.includes(step)) return;
        steps.push(step);
        setThinking({ steps: [...steps], startedAt });
      },
    };
  };

  const errorText = (error: unknown) =>
    error instanceof Error
      ? error.message
      : bn
        ? "উত্তর পাওয়া যায়নি। আবার চেষ্টা করুন।"
        : "The answer could not be loaded. Please try again.";

  const runQuestion = async (
    chatId: string,
    question: string,
    history: Array<{ role: "user" | "assistant"; text: string; content: string }>,
    doc?: DocumentAnalysisMessage,
  ) => {
    const tracker = trackSteps();
    try {
      const result = isOfflineDemoMode()
        ? await askQuestionOffline(question)
        : await askQuestion(
            question,
            undefined,
            history,
            lang,
            doc ? { name: doc.name, text: doc.mainText } : undefined,
            tracker.onStep,
          );

      addMessageToChat(chatId, {
        id: newId("message"),
        role: "assistant",
        text: result.answer,
        citations: result.citations ?? [],
        steps: [...tracker.steps],
        thinkingMs: Date.now() - tracker.startedAt,
        createdAt: Date.now(),
      });
    } catch (error) {
      console.error("Inquiry failed:", error);
      addMessageToChat(chatId, {
        id: newId("message-error"),
        role: "assistant",
        text: errorText(error),
        createdAt: Date.now(),
      });
    } finally {
      setThinking(null);
    }
  };

  /** Read, clean and analyse an attached document — all inside the chat. */
  const runDocument = async (chatId: string, file: File): Promise<DocumentAnalysisMessage | undefined> => {
    const tracker = trackSteps();
    try {
      const result = await analyzeUploadedDocument(file, lang, tracker.onStep);

      // The original file stays in this browser so "View original" works after a reload.
      void saveDocumentFile(result.document.id, {
        file,
        name: result.document.name,
        mimeType: result.document.mimeType,
        pages: result.document.pages,
        pageData: result.pageData,
      });

      addDocument({
        id: result.document.id,
        name: result.document.name,
        pages: result.document.pages,
        type: result.analysis.type || result.document.type,
        size: result.document.size,
        status: "Reviewed",
        uploadedAt: Date.now(),
      });

      const doc: DocumentAnalysisMessage = {
        id: result.document.id,
        name: result.document.name,
        mimeType: result.document.mimeType,
        pages: result.document.pages,
        mainText: result.mainText,
        excluded: result.excluded,
        hasUnclear: result.hasUnclear,
        warnings: result.warnings,
        uncertainWords: result.uncertainWords,
        type: result.analysis.type,
        overview: result.analysis.overview,
        keyPoints: result.analysis.keyPoints,
        attention: result.analysis.attention,
        missing: result.analysis.missing,
        terms: result.analysis.terms,
      };

      addMessageToChat(chatId, {
        id: newId("message"),
        role: "assistant",
        text: documentSummary(doc),
        document: doc,
        citations: result.analysis.citations,
        steps: [...tracker.steps],
        thinkingMs: Date.now() - tracker.startedAt,
        createdAt: Date.now(),
      });
      return doc;
    } catch (error) {
      console.error("Document failed:", error);
      addMessageToChat(chatId, {
        id: newId("message-error"),
        role: "assistant",
        text:
          error instanceof Error
            ? error.message
            : bn
              ? "নথিটি প্রক্রিয়া করা যায়নি। আবার চেষ্টা করুন।"
              : "The document could not be processed. Please try again.",
        createdAt: Date.now(),
      });
      return undefined;
    } finally {
      setThinking(null);
    }
  };

  const sendInquiry = async () => {
    const text = pendingText.trim();
    const file = pendingFile;

    if (!file && !text) {
      notify(
        bn
          ? "আগে একটি নথি সংযুক্ত করুন বা আপনার প্রশ্ন লিখুন।"
          : "Attach a document or enter your inquiry first.",
      );
      return;
    }

    // Closes the gap before React re-renders, so Enter + click can't send twice.
    if (sendLockRef.current) return;
    sendLockRef.current = true;

    if (recording) stopVoice();
    setSending(true);

    const history = historyFrom(chatMessages);

    try {
      // The question (and file) become an immutable message; the box is cleared.
      const chatId = addMessage({
        id: newId("message"),
        role: "user",
        text,
        attachment: file ? { name: file.name, size: file.size, mimeType: file.type } : undefined,
        createdAt: Date.now(),
      });
      setPendingInput(null, "");

      if (file) {
        const doc = await runDocument(chatId, file);
        // A question sent together with the file is answered right after the analysis.
        if (doc && text) {
          const summary = documentSummary(doc);
          await runQuestion(chatId, text, [...history, { role: "assistant", text: summary, content: summary }], doc);
        }
        return;
      }

      await runQuestion(chatId, text, history, latestDocument());
    } finally {
      sendLockRef.current = false;
      setSending(false);
    }
  };

  /** The person corrected the document text: analyse it again and update that message. */
  const reanalyze = async (message: ChatMessage, text: string) => {
    const doc = message.document;
    if (!doc || !activeChatId) return;
    const chatId = activeChatId;
    setReanalyzingId(message.id);
    try {
      const analysis = await reanalyzeDocumentText({ text, name: doc.name, pages: doc.pages, language: lang }, () => {});
      const next: DocumentAnalysisMessage = {
        ...doc,
        mainText: text,
        edited: true,
        type: analysis.type || doc.type,
        overview: analysis.overview,
        keyPoints: analysis.keyPoints,
        attention: analysis.attention,
        missing: analysis.missing,
        terms: analysis.terms,
      };
      updateMessage(chatId, message.id, {
        document: next,
        text: documentSummary(next),
        citations: analysis.citations,
        translation: undefined,
      });
      notify(bn ? "সংশোধিত লেখা দিয়ে বিশ্লেষণ হালনাগাদ হয়েছে।" : "The analysis was updated with your corrected text.");
    } catch (error) {
      notify(errorText(error));
    } finally {
      setReanalyzingId(null);
    }
  };

  const viewDocument = async (doc: DocumentAnalysisMessage) => {
    const stored = await loadDocumentFile(doc.id);
    setViewerText(stored ? "" : doc.mainText);
    setViewerDocument({
      id: doc.id,
      name: doc.name,
      mimeType: doc.mimeType,
      size: stored?.file.size ?? 0,
      pages: doc.pages,
      file: stored?.file ?? null,
      pageData: stored?.pageData ?? [],
      warnings: doc.warnings,
      savedAt: Date.now(),
    });
  };

  const handleComposerKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      if (!sending) {
        void sendInquiry();
      }
    }
  };

  return (
    <>
      <main
        className={`flex min-h-[calc(100vh-80px)] flex-col transition-colors duration-200 ${
          dark
            ? "bg-[#0b1220]"
            : "bg-[#faf9f5]"
        }`}
      >
        {offlineDemo && (
  <div
    className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
      dark
        ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
        : "border-amber-300 bg-amber-50 text-amber-800"
    }`}
  >
    <div className="font-semibold">
      Offline Demo Mode
    </div>

    <div className="mt-1 text-xs opacity-80">
      Using locally stored demonstration cases.
      No internet connection, backend, Supabase,
      or external AI service is required.
    </div>
  </div>
)}
        <div className="mx-auto flex w-full max-w-[900px] flex-1 flex-col px-4 pb-5 pt-5 sm:px-6 md:px-8 md:pt-8">
          <div className="flex-1">
            {chatMessages.length > 0 ? (
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    // Starting a new conversation is always an explicit action.
                    startFreshChat();
                    stopSpeaking();
                    composerRef.current?.focus();
                  }}
                  disabled={askingQuestion}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    dark
                      ? "border-teal/35 text-[#5ee0d0] hover:bg-white/10"
                      : "border-[#e7e4dc] bg-white text-teal hover:bg-[#f3f2ee]"
                  } ${bn ? "bn" : ""}`}
                >
                  <Plus className="size-3.5" />
                  {bn ? "নতুন চ্যাট" : "New chat"}
                </button>
              </div>
            ) : null}

            {/* INITIAL ASSISTANT MESSAGE */}

            <div className="flex items-start gap-3 sm:gap-4">
              <div className="brand-icon flex size-10 shrink-0 items-center justify-center rounded-full sm:size-11">
                <Scale
                  className="size-[18px] text-white sm:size-5"
                  strokeWidth={2}
                />
              </div>

              <div className="min-w-0 max-w-[720px] flex-1">
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className={`text-[14px] font-bold sm:text-[15px] ${
                      dark
                        ? "text-[#f1f5f9]"
                        : "text-[#172033]"
                    } ${bn ? "bn" : ""}`}
                  >
                    AinBodh
                  </span>

                  <span
                    className={`rounded-full border px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide ${
                      dark
                        ? "border-teal/35 bg-teal/10 text-[#5ee0d0]"
                        : "border-teal/20 bg-teal/5 text-teal"
                    }`}
                  >
                    AI Assistant
                  </span>
                </div>

                <div
                  className={`rounded-2xl border px-4 py-3.5 text-[13px] leading-6 shadow-[0_2px_12px_rgba(20,30,45,0.04)] transition-colors duration-200 sm:px-5 sm:py-4 sm:text-[14px] ${
                    dark
                      ? "border-teal/45 bg-[#111c2d] text-[#d8e2ec] shadow-[0_6px_22px_rgba(0,0,0,0.22)]"
                      : "border-[#e7e4dc] bg-white text-[#263247]"
                  } ${bn ? "bn" : ""}`}
                >
                  <p>
                    {bn
                      ? "আমি আপনার আইনি নথি সহজ ভাষায় বুঝতে, গুরুত্বপূর্ণ শর্ত ও ঝুঁকি শনাক্ত করতে এবং আইনি বিষয়গুলো ব্যাখ্যা করতে সাহায্য করতে পারি।"
                      : "I can help you understand legal documents, explain legal terms, and identify important clauses or potential risks."}
                  </p>

                  <p className="mt-2">
                    {bn
                      ? "আপনি লেখা, ভয়েস, ছবি বা নথি দিয়ে আপনার বিষয়টি জানাতে পারেন।"
                      : "You can tell me what you need using text, voice, a photo, or a document."}
                  </p>

                  <p
                    className={`mt-2 font-semibold ${
                      dark
                        ? "text-[#f1f5f9]"
                        : "text-[#172033]"
                    }`}
                  >
                    {bn
                      ? "আজ কীভাবে সাহায্য করতে পারি?"
                      : "How can I help you today?"}
                  </p>
                </div>
              </div>
            </div>

            {/* CONVERSATION — the saved chat, one block per message */}

            {chatMessages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="mt-6 flex justify-end">
                  <div className="flex max-w-[76%] flex-col items-end gap-1.5 sm:max-w-[70%]">
                    {message.attachment ? (
                      <div
                        className={`flex max-w-full items-center gap-2.5 rounded-xl border px-3 py-2 ${
                          dark ? "border-teal/30 bg-[#142637]" : "border-teal/20 bg-[#f0faf8]"
                        }`}
                      >
                        <FileText className="size-4 shrink-0 text-teal" />
                        <span className={`truncate text-[12px] font-semibold ${dark ? "text-[#e8f0f7]" : "text-[#172033]"}`}>
                          {message.attachment.name}
                        </span>
                        <span className={`shrink-0 text-[10px] ${dark ? "text-[#91a4b8]" : "text-[#7d8490]"}`}>
                          {Math.max(1, Math.round(message.attachment.size / 1024))} KB
                        </span>
                      </div>
                    ) : null}
                    {message.text ? (
                      <div
                        className={`rounded-2xl rounded-br-md bg-[#0d829f] px-4 py-3 text-[13px] leading-6 text-white shadow-sm sm:px-5 sm:py-3.5 sm:text-[14px] ${
                          bn ? "bn" : ""
                        }`}
                      >
                        {message.text}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <AssistantMessage
                  key={message.id}
                  message={message}
                  chatId={activeChatId}
                  bn={bn}
                  dark={dark}
                  speaking={speaking && speakingId === message.id}
                  onToggleSpeak={toggleReadAloud}
                  onViewDocument={(doc) => void viewDocument(doc)}
                  onReanalyze={(item, text) => void reanalyze(item, text)}
                  reanalyzing={reanalyzingId === message.id}
                />
              ),
            )}

            {/* THINKING — short, live progress steps */}

            {thinking ? (
              <div className="mt-6 flex items-start gap-3 sm:gap-4">
                <div className="brand-icon flex size-10 shrink-0 items-center justify-center rounded-full sm:size-11">
                  <Scale
                    className="size-[18px] text-white sm:size-5"
                    strokeWidth={2}
                  />
                </div>

                <div
                  className={`rounded-2xl rounded-tl-md border px-4 py-3 sm:px-5 ${
                    dark
                      ? "border-teal/35 bg-[#111c2d]"
                      : "border-[#e7e4dc] bg-white"
                  } ${bn ? "bn" : ""}`}
                >
                  <ThinkingSteps steps={thinking.steps} live bn={bn} dark={dark} />
                </div>
              </div>
            ) : null}

            <div ref={messagesEndRef} aria-hidden="true" />
          </div>

          {/* COMPOSER */}

          <section className="mt-auto pt-8 sm:pt-12">
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() =>
                setDragging(false)
              }
              onDrop={onDrop}
              className={`overflow-hidden rounded-[22px] border-2 shadow-[0_6px_30px_rgba(15,23,42,0.08)] transition-all duration-200 ${
                dragging
                  ? dark
                    ? "border-[#2dd4bf] bg-[#102a2c]"
                    : "border-teal bg-[#f1fbfa]"
                  : dark
                    ? "border-[#2aa99d]/70 bg-[#111c2d]"
                    : "border-[#dcd9d1] bg-white"
              }`}
            >
              <textarea
                ref={composerRef}
                value={pendingText}
                onChange={(event) => {
                  // Editing the draft never touches messages already sent.
                  setPendingInput(
                    pendingFile,
                    event.target.value,
                  );
                }}
                onKeyDown={
                  handleComposerKeyDown
                }
                rows={2}
                className={`block max-h-[180px] min-h-[72px] w-full resize-none border-0 bg-transparent px-5 pb-2 pt-4 text-[14px] leading-6 outline-none sm:text-[15px] ${
                  dark
                    ? "text-[#edf4fb] placeholder:text-[#7f93aa]"
                    : "text-[#172033] placeholder:text-[#8b9099]"
                } ${bn ? "bn" : ""}`}
                placeholder={
                  bn
                    ? "আপনার আইনি প্রশ্ন লিখুন..."
                    : "Message AinBodh..."
                }
              />

              {pendingFile ? (
                <div
                  className={`mx-3 mb-2.5 flex items-center gap-3 rounded-xl border p-2.5 ${
                    dark
                      ? "border-teal/30 bg-[#142637]"
                      : "border-teal/20 bg-[#f0faf8]"
                  }`}
                >
                  <div
                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg shadow-sm ${
                      dark
                        ? "bg-[#1c3447] text-[#5ee0d0]"
                        : "bg-white text-teal"
                    }`}
                  >
                    <FileText className="size-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-[11px] font-semibold ${
                        dark
                          ? "text-[#e8f0f7]"
                          : "text-[#172033]"
                      }`}
                    >
                      {pendingFile.name}
                    </p>

                    <p
                      className={`pt-0.5 text-[9px] ${
                        dark
                          ? "text-[#91a4b8]"
                          : "text-[#7d8490]"
                      }`}
                    >
                      {Math.max(
                        1,
                        Math.round(
                          pendingFile.size /
                            1024,
                        ),
                      )}{" "}
                      KB ·{" "}
                      {bn
                        ? "সংযুক্ত"
                        : "Attached"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setPendingInput(
                        null,
                        pendingText,
                      )
                    }
                    className={`rounded-md p-1.5 transition ${
                      dark
                        ? "text-[#8da0b4] hover:bg-white/10 hover:text-red-400"
                        : "text-[#777d87] hover:bg-white hover:text-red-600"
                    }`}
                    aria-label={
                      bn
                        ? "সংযুক্তি সরান"
                        : "Remove attachment"
                    }
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : null}

              <div
                className={`flex items-center gap-1 border-t px-3 py-2.5 ${
                  dark
                    ? "border-teal/25"
                    : "border-[#ece9e2]"
                }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    documentInputRef.current?.click()
                  }
                  className={`flex size-9 items-center justify-center rounded-lg transition ${
                    dark
                      ? "text-[#91a4b8] hover:bg-white/10 hover:text-[#5ee0d0]"
                      : "text-[#5e6673] hover:bg-[#f3f2ee] hover:text-teal"
                  }`}
                  aria-label={
                    bn
                      ? "নথি সংযুক্ত করুন"
                      : "Attach document"
                  }
                  title={
                    bn
                      ? "নথি সংযুক্ত করুন"
                      : "Attach document"
                  }
                >
                  <Paperclip
                    className="size-[18px]"
                    strokeWidth={2.1}
                  />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void openCamera()
                  }
                  disabled={cameraLoading}
                  className={`flex size-9 items-center justify-center rounded-lg transition disabled:opacity-50 ${
                    dark
                      ? "text-[#91a4b8] hover:bg-white/10 hover:text-[#5ee0d0]"
                      : "text-[#5e6673] hover:bg-[#f3f2ee] hover:text-teal"
                  }`}
                  aria-label={
                    bn
                      ? "ছবি তুলুন"
                      : "Scan document"
                  }
                  title={
                    bn
                      ? "ছবি তুলুন"
                      : "Scan document"
                  }
                >
                  {cameraLoading ? (
                    <Loader2 className="size-[18px] animate-spin" />
                  ) : (
                    <Camera
                      className="size-[18px]"
                      strokeWidth={2.1}
                    />
                  )}
                </button>

                {/* VOICE BUTTON */}

                <button
                  type="button"
                  onClick={toggleVoice}
                  className={`flex size-9 items-center justify-center rounded-lg transition ${
                    recording
                      ? "bg-red-500/10 !text-red-400"
                      : dark
                        ? "text-[#91a4b8] hover:bg-white/10 hover:text-[#5ee0d0]"
                        : "text-[#5e6673] hover:bg-[#f3f2ee] hover:text-teal"
                  }`}
                  aria-label={
                    recording
                      ? bn
                        ? "ভয়েস রেকর্ডিং বন্ধ করুন"
                        : "Stop voice input"
                      : bn
                        ? "ভয়েস ইনপুট"
                        : "Voice input"
                  }
                  title={
                    recording
                      ? bn
                        ? "ভয়েস রেকর্ডিং বন্ধ করুন"
                        : "Stop voice input"
                      : bn
                        ? "ভয়েস ইনপুট"
                        : "Voice input"
                  }
                >
                  <Mic
                    className={`size-[18px] ${
                      recording
                        ? "animate-pulse"
                        : ""
                    }`}
                    strokeWidth={2.1}
                  />
                </button>

                <input
                  ref={documentInputRef}
                  type="file"
                  hidden
                  accept=".pdf,.docx,image/png,image/jpeg,image/webp"
                  onChange={(
                    event: ChangeEvent<HTMLInputElement>,
                  ) => {
                    handleFile(
                      event.target.files?.[0],
                    );

                    event.target.value = "";
                  }}
                />

                <input
                  ref={cameraInputRef}
                  type="file"
                  hidden
                  accept="image/*"
                  capture="environment"
                  onChange={(
                    event: ChangeEvent<HTMLInputElement>,
                  ) => {
                    handleFile(
                      event.target.files?.[0],
                    );

                    event.target.value = "";
                  }}
                />

                <div className="flex-1" />

                <button
                  type="button"
                  onClick={() =>
                    void sendInquiry()
                  }
                  disabled={sending}
                  className="flex size-9 items-center justify-center rounded-full bg-teal text-white shadow-sm transition hover:bg-[#08768e] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={
                    bn
                      ? "পাঠান"
                      : "Send inquiry"
                  }
                  title={
                    bn
                      ? "পাঠান"
                      : "Send inquiry"
                  }
                >
                  {sending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </button>
              </div>
            </div>

            <p
              className={`mt-2.5 text-center text-[9px] ${
                dark
                  ? "text-[#74879d]"
                  : "text-[#8a8f97]"
              } ${bn ? "bn" : ""}`}
            >
              {bn
                ? "Enter চাপলে পাঠানো হবে · নতুন লাইনের জন্য Shift + Enter"
                : "Press Enter to send · Shift + Enter for a new line"}
            </p>
          </section>
        </div>
      </main>

      {/* =========================================================
          CAMERA MODAL
      ========================================================= */}

      {cameraOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#07111f]/90 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[520px] overflow-hidden rounded-2xl border-2 border-teal/40 bg-[#101d31] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/15 px-4 py-3">
              <div>
                <p
                  className={`text-[13px] font-semibold text-white ${
                    bn ? "bn" : ""
                  }`}
                >
                  {bn
                    ? "নথি স্ক্যান করুন"
                    : "Scan document"}
                </p>

                <p className="mt-0.5 text-[9px] text-white/55">
                  {bn
                    ? "নথিটি ফ্রেমের মধ্যে রাখুন"
                    : "Keep the document inside the frame"}
                </p>
              </div>

              <button
                type="button"
                onClick={closeCamera}
                className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Close camera"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="relative aspect-[4/3] bg-black">
              {!capturedImage ? (
                <>
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />

                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="relative h-[72%] w-[82%] rounded-xl border-2 border-[#5ee0d0] shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]">
                      <span className="absolute -left-0.5 -top-0.5 h-7 w-7 border-l-4 border-t-4 border-[#5ee0d0]" />
                      <span className="absolute -right-0.5 -top-0.5 h-7 w-7 border-r-4 border-t-4 border-[#5ee0d0]" />
                      <span className="absolute -bottom-0.5 -left-0.5 h-7 w-7 border-b-4 border-l-4 border-[#5ee0d0]" />
                      <span className="absolute -bottom-0.5 -right-0.5 h-7 w-7 border-b-4 border-r-4 border-[#5ee0d0]" />

                      <div className="absolute left-0 right-0 top-1/2 h-px bg-[#5ee0d0]/50" />
                    </div>
                  </div>

                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/65 px-3 py-1.5 text-[9px] text-white/85 backdrop-blur">
                    {bn
                      ? "ভালো আলোতে ছবি তুলুন"
                      : "Use good lighting for a clearer scan"}
                  </div>
                </>
              ) : (
                <>
                  <img
                    src={capturedImage}
                    alt={
                      bn
                        ? "ধারণ করা নথির ছবি"
                        : "Captured document"
                    }
                    className="h-full w-full object-contain"
                  />

                  <div className="absolute left-3 top-3 rounded-full bg-[#0d829f] px-3 py-1.5 text-[9px] font-semibold text-white shadow-lg">
                    {bn
                      ? "প্রিভিউ"
                      : "Preview"}
                  </div>
                </>
              )}
            </div>

            <canvas
              ref={canvasRef}
              className="hidden"
            />

            <div className="flex items-center justify-center gap-3 px-4 py-4">
              {!capturedImage ? (
                <button
                  type="button"
                  onClick={capturePhoto}
                  className="flex size-14 items-center justify-center rounded-full border-2 border-white/30 bg-white text-[#101d31] shadow-lg transition-transform hover:scale-105 active:scale-95"
                  aria-label={
                    bn
                      ? "ছবি তুলুন"
                      : "Capture photo"
                  }
                >
                  <Camera
                    className="size-6"
                    strokeWidth={2.5}
                  />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      void retakePhoto()
                    }
                    className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-[11px] font-semibold text-white hover:bg-white/15"
                  >
                    <RotateCcw className="size-4" />

                    {bn
                      ? "আবার তুলুন"
                      : "Retake"}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void useCapturedPhoto()
                    }
                    className="inline-flex items-center gap-2 rounded-lg bg-[#0d829f] px-5 py-3 text-[11px] font-semibold text-white hover:bg-[#1191ad]"
                  >
                    <Check className="size-4" />

                    {bn
                      ? "ছবিটি ব্যবহার করুন"
                      : "Use Photo"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* =========================================================
          VOICE EDITOR
      ========================================================= */}

      {voiceEditorOpen ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#07111f]/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[480px] rounded-2xl border-2 border-teal/35 bg-[#111f38] p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#173f48] text-[#5ee0d0]">
                <Mic className="size-5" />
              </div>

              <div className="min-w-0 flex-1">
                <h2
                  className={`text-[15px] font-bold text-white ${
                    bn ? "bn" : ""
                  }`}
                >
                  {bn
                    ? "আপনি যা বলেছেন"
                    : "Review your voice input"}
                </h2>

                <p
                  className={`mt-1 text-[10px] leading-4 text-slate-400 ${
                    bn ? "bn" : ""
                  }`}
                >
                  {bn
                    ? "প্রয়োজনে পাঠানোর আগে কথাগুলো সম্পাদনা করুন।"
                    : "Check or edit the transcript before sending it."}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (recording) stopVoice();
                  setVoiceEditorOpen(
                    false,
                  );
                  setVoicePreview(null);
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                aria-label={
                  bn
                    ? "বন্ধ করুন"
                    : "Close"
                }
              >
                <X className="size-4" />
              </button>
            </div>

            {/* LANGUAGE SELECTOR */}

            <div className="mt-5">
              <p className="mb-2 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                {bn
                  ? "ভয়েস ভাষা"
                  : "Voice language"}
              </p>

              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["bn", "বাংলা"],
                    ["en", "English"],
                    ["banglish", "Banglish"],
                  ] as const
                ).map(
                  ([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      disabled={recording}
                      onClick={() =>
                        setVoiceLanguage(
                          value,
                        )
                      }
                      className={`rounded-lg border px-2 py-2 text-[10px] font-semibold transition ${
                        voiceLanguage ===
                        value
                          ? "border-teal bg-teal/15 text-[#5ee0d0]"
                          : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-white"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>
            </div>

            {recording || voiceTranscribing ? (
              <div
                aria-live="polite"
                className={`mt-4 min-h-[130px] w-full rounded-xl border-2 border-teal/35 bg-[#0b1728] p-3 text-[13px] leading-6 text-white ${
                  bn ? "bn" : ""
                }`}
              >
                <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold text-[#5ee0d0]">
                  {voiceTranscribing ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <span className="size-2 animate-pulse rounded-full bg-red-400" />
                  )}
                  {voiceTranscribing
                    ? bn
                      ? "কথাগুলো লেখায় রূপান্তর হচ্ছে…"
                      : "Turning your speech into text…"
                    : bn
                      ? "শুনছি… কথা বলুন"
                      : "Listening… speak now"}
                </div>
                {voiceFinal || voiceInterim ? (
                  <p>
                    <span>{voiceFinal}</span>{" "}
                    <span className="text-slate-400">{voiceInterim}</span>
                  </p>
                ) : (
                  <p className="text-slate-500">
                    {bn
                      ? "আপনার কথাগুলো এখানে সঙ্গে সঙ্গে দেখা যাবে…"
                      : "Your words will appear here as you speak…"}
                  </p>
                )}
              </div>
            ) : (
              <textarea
                value={
                  voicePreview ?? ""
                }
                onChange={(event) =>
                  setVoicePreview(
                    event.target.value,
                  )
                }
                autoFocus
                className={`mt-4 min-h-[130px] w-full resize-none rounded-xl border-2 border-teal/35 bg-[#0b1728] p-3 text-[13px] leading-6 text-white outline-none placeholder:text-slate-500 focus:border-teal ${
                  bn ? "bn" : ""
                }`}
                placeholder={
                  bn
                    ? "আপনার কথাগুলো এখানে দেখা যাবে..."
                    : "Your transcript will appear here..."
                }
              />
            )}

            <div className="mt-4 flex justify-between gap-2">
              <button
                type="button"
                onClick={toggleVoice}
                className={`inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-[10px] font-semibold transition ${
                  recording
                    ? "border-red-400/30 bg-red-500/10 text-red-300"
                    : "border-teal/30 text-slate-300 hover:bg-white/10"
                }`}
              >
                <Mic
                  className={`size-3.5 ${
                    recording
                      ? "animate-pulse"
                      : ""
                  }`}
                />

                {recording
                  ? bn
                    ? "বন্ধ করুন"
                    : "Stop"
                  : bn
                    ? "আবার বলুন"
                    : "Record again"}
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (recording) stopVoice();
                    setVoiceEditorOpen(
                      false,
                    );
                    setVoicePreview(null);
                  }}
                  className="h-10 rounded-lg border border-teal/30 px-4 text-[11px] font-semibold text-slate-300 transition hover:bg-white/10"
                >
                  {bn
                    ? "বাতিল"
                    : "Cancel"}
                </button>

                <button
                  type="button"
                  onClick={
                    useVoiceTranscript
                  }
                  disabled={
                    !voicePreview?.trim() || recording || voiceTranscribing
                  }
                  className="inline-flex h-10 items-center rounded-lg bg-teal px-4 text-[11px] font-semibold text-white transition hover:bg-[#08768e] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Check className="mr-1.5 size-3.5" />

                  {bn
                    ? "ব্যবহার করুন"
                    : "Use Transcript"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {viewerDocument ? (
        <DocumentViewer
          document={viewerDocument}
          verifiedText={viewerText}
          onClose={() => setViewerDocument(null)}
        />
      ) : null}
    </>
  );
}


