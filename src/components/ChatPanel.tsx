import {
  Loader2,
  Mic,
  Send,
  Volume2,
  ExternalLink,
  BookOpen,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { useLanguage } from "../context/LanguageContext";
import {
  useApp,
  type ChatCitation,
  type ChatMessage,
} from "../context/AppContext";
import { askQuestion } from "../services/api";
import ReadAloud from "./ReadAloud";
import { useVoiceTranscriber } from "../hooks/useVoiceTranscriber";

function makeMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

function officialCitationUrl(value?: string): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);

    // Only allow HTTPS links to the official Bangladesh Laws site.
    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== "bdlaws.minlaw.gov.bd"
    ) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

function CitationCard({
  citation,
  index,
  bn,
  onOpen,
}: {
  citation: ChatCitation;
  index: number;
  bn: boolean;
  onOpen: (citation: ChatCitation) => void;
}) {
  const section = citation.sectionNumber?.trim();
  const provision = citation.content?.trim();
  const sourceUrl = officialCitationUrl(citation.sourceUrl);

  return (
    <article className="rounded-xl border border-border bg-white p-3">
      <div className="flex items-start gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-tealSoft text-teal">
          <BookOpen className="size-4" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold leading-5 text-navy">
            {citation.title || `Legal reference ${index + 1}`}
          </p>

          {section && (
            <p className="pt-0.5 text-[9px] font-semibold text-teal">
              {bn ? "ধারা" : "Section"} {section}
            </p>
          )}

          {citation.actFile && (
            <p className="break-words pt-1 text-[8px] text-muted">
              {citation.actFile}
            </p>
          )}
        </div>
      </div>

      {provision && (
        <p className="mt-2 whitespace-pre-wrap break-words border-t border-border pt-2 text-[10px] leading-5 text-[#475569]">
          {provision.length > 700
            ? `${provision.slice(0, 700).trim()}…`
            : provision}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[9px] text-muted">
          {citation.sourceName ||
            (bn ? "আইনি রেফারেন্স" : "Legal reference")}
        </span>

        {sourceUrl ? (
          <button
            type="button"
            onClick={() => onOpen(citation)}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[9px] font-semibold text-teal transition hover:border-teal hover:bg-tealSoft"
          >
            {bn ? "মূল আইন দেখুন" : "Official source"}
            <ExternalLink className="size-3" />
          </button>
        ) : (
          <span className="shrink-0 text-[8px] text-muted">
            {bn ? "লিংক নেই" : "Link unavailable"}
          </span>
        )}
      </div>
    </article>
  );
}

/** Message text with **bold**, bullets, and clickable [C1] citation markers. */
function renderMessageText(
  rawText: string,
  citations: ChatCitation[] | undefined,
  onCitation: (citation: ChatCitation) => void,
): ReactNode[] {
  const text = rawText
    .replace(/^#{1,6}\s+(.+)$/gm, "**$1**")
    .replace(/^\s*[-*]\s+/gm, "• ");

  return text.split(/(\[C\d+\]|\*\*[^*\n]+\*\*)/g).filter(Boolean).map((part, index) => {
    if (/^\*\*[^*\n]+\*\*$/.test(part)) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }

    const match = part.match(/^\[(C\d+)\]$/);
    if (!match) return <span key={index}>{part}</span>;

    const citation = citations?.find((item) => item.id === match[1]);
    if (!citation) return null;

    return (
      <button
        key={index}
        type="button"
        onClick={() => onCitation(citation)}
        className="mx-0.5 inline-flex items-center rounded-md border border-teal/25 bg-teal/5 px-1.5 py-0.5 text-[10px] font-bold text-teal transition hover:bg-teal/10"
        title={citation.title}
      >
        {match[1]}
      </button>
    );
  });
}

export default function ChatPanel({
  compact = false,
  documentContext,
}: {
  compact?: boolean;
  /** The document this chat is about, so answers can quote it. */
  documentContext?: { name?: string; text?: string };
}) {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  const {
    chatMessages,
    addMessage,
    addMessageToChat,
    selectedDocument,
    notify,
  } = useApp();

  /*
   * `draft` is only the unsent textarea text.
   * A sent message is snapshotted into a separate ChatMessage object
   * and stored by AppContext. Nothing rendered from `chatMessages`
   * reads from this draft state.
   */
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const sendLockRef = useRef(false);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const ignoreLateTranscriptRef = useRef(false);

  const {
    recording: voiceRecording,
    supported: voiceSupported,
    error: voiceError,
    start: startVoice,
    stop: stopVoice,
  } = useVoiceTranscriber({
    language: bn ? "bn" : "en",
    onTranscript: (transcript: string) => {
      // If the user submitted while recording, a late final transcript
      // must not repopulate the just-cleared draft.
      if (ignoreLateTranscriptRef.current) {
        ignoreLateTranscriptRef.current = false;
        return;
      }
      setDraft(transcript);
    },
  });

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [chatMessages, loading]);

  /* =========================================================
     SEND MESSAGE
  ========================================================= */

  async function sendMessage() {
    const question = draft.trim();

    // The ref closes the small window before React has rendered loading=true.
    if (!question || sendLockRef.current) return;

    sendLockRef.current = true;

    const wasRecording = voiceRecording;
    if (wasRecording) {
      ignoreLateTranscriptRef.current = true;
      stopVoice();
    }

    // Snapshot only the current conversation's existing messages for context.
    const history = chatMessages.map((message) => ({
      role: message.role,
      content: message.text,
      text: message.text,
    }));

    // This is an immutable snapshot; later edits to the draft cannot change it.
    const userMessage: ChatMessage = {
      id: makeMessageId("user"),
      role: "user",
      text: question,
      createdAt: Date.now(),
    };

    /*
     * Store the user message first and capture the exact chat ID returned.
     * The answer is appended to this same chat even if another chat becomes
     * active before the API request finishes.
     */
    const chatId = addMessage(userMessage);

    // Clear only the textarea draft. Do not clear, edit, or rebuild history.
    setDraft("");
    setLoading(true);

    try {
      const response = await askQuestion(
        question,
        selectedDocument?.id,
        history,
        lang,
        documentContext,
      );

      const assistantMessage: ChatMessage = {
        id: makeMessageId("assistant"),
        role: "assistant",
        text: response.answer,
        citations: response.citations ?? [],
        createdAt: Date.now(),
      };

      addMessageToChat(chatId, assistantMessage);
    } catch (error) {
      console.error("AinBodh chat request failed:", error);

      const errorMessage =
        error instanceof Error
          ? error.message
          : bn
            ? "উত্তর পেতে সমস্যা হয়েছে। আবার চেষ্টা করুন।"
            : "Something went wrong while getting the answer. Please try again.";

      addMessageToChat(chatId, {
        id: makeMessageId("assistant-error"),
        role: "assistant",
        text: errorMessage,
        createdAt: Date.now(),
      });
    } finally {
      sendLockRef.current = false;
      setLoading(false);
    }
  }

  /* =========================================================
     ENTER KEY
  ========================================================= */

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void sendMessage();
    }
  }

  /* =========================================================
     VOICE
  ========================================================= */

  function handleVoice() {
    if (voiceRecording) {
      stopVoice();
      return;
    }

    ignoreLateTranscriptRef.current = false;
    startVoice(draft);
  }

  /* =========================================================
     OPEN OFFICIAL CITATION
  ========================================================= */

  function openCitation(citation: ChatCitation) {
    const url = officialCitationUrl(citation.sourceUrl);

    if (!url) {
      notify(
        bn
          ? "এই রেফারেন্সের যাচাইকৃত সরকারি লিংক পাওয়া যায়নি।"
          : "No verified official source link is available for this reference.",
      );
      return;
    }

    const opened = window.open(url, "_blank", "noopener,noreferrer");

    if (!opened) {
      notify(
        bn
          ? "লিংকটি খোলা যায়নি। ব্রাউজারের পপ-আপ সেটিংস পরীক্ষা করুন।"
          : "The link could not be opened. Check your browser's pop-up settings.",
      );
    }
  }

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <section
      className={[
        "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-white",
        compact ? "max-h-[620px]" : "min-h-[540px]",
      ].join(" ")}
    >
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className={`text-[12px] font-bold text-navy ${bn ? "bn" : ""}`}>
            {bn ? "আইনি সহায়ক" : "Legal assistant"}
          </p>
          <p className={`truncate pt-0.5 text-[9px] text-muted ${bn ? "bn" : ""}`}>
            {selectedDocument
              ? selectedDocument.name
              : bn
                ? "আপনার প্রশ্ন লিখুন"
                : "Ask a legal question"}
          </p>
        </div>
      </div>

      {/* MESSAGES */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {chatMessages.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="max-w-[420px] text-center">
              <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-tealSoft text-teal">
                <Volume2 className="size-5" />
              </div>
              <h3 className={`pt-4 text-[14px] font-bold text-navy ${bn ? "bn" : ""}`}>
                {bn ? "আপনার আইনি প্রশ্ন করুন" : "Ask your legal question"}
              </h3>
              <p className={`mx-auto max-w-[360px] pt-2 text-[10px] leading-5 text-muted ${bn ? "bn" : ""}`}>
                {bn
                  ? "আপনার পরিস্থিতি স্পষ্টভাবে লিখুন। প্রাসঙ্গিক আইনি প্রমাণ পাওয়া গেলে উত্তরের সঙ্গে রেফারেন্স দেখানো হবে।"
                  : "Describe your situation clearly. Relevant legal references will appear with the answer when available."}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {chatMessages.map((message) => {
              const isUser = message.role === "user";

              return (
                <div
                  key={message.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={
                      isUser
                        ? "max-w-[88%] rounded-2xl rounded-br-md bg-navy px-4 py-3 text-white"
                        : "w-full max-w-[720px]"
                    }
                  >
                    <div
                      className={`whitespace-pre-wrap break-words text-[11px] leading-6 ${
                        isUser
                          ? "text-white"
                          : `text-[#334155] ${bn ? "bn" : ""}`
                      }`}
                    >
                      {isUser
                        ? message.text
                        : renderMessageText(message.text, message.citations, openCitation)}
                    </div>

                    {!isUser && Boolean(message.citations?.length) && (
                      <div className="mt-4 space-y-2">
                        <div className={`text-[9px] font-bold uppercase tracking-[0.08em] text-muted ${bn ? "bn" : ""}`}>
                          {bn ? "আইনি সূত্র" : "Legal sources"}
                        </div>
                        {message.citations!.map((citation, index) => (
                          <CitationCard
                            key={`${message.id}-${citation.id || "citation"}-${index}`}
                            citation={citation}
                            index={index}
                            bn={bn}
                            onOpen={openCitation}
                          />
                        ))}
                      </div>
                    )}

                    {!isUser && message.text && (
                      <div className="flex items-center gap-2 pt-2">
                        <ReadAloud text={message.text} />
                        {message.citations?.length ? (
                          <span className="text-[8px] text-muted">
                            {message.citations.length} {bn ? "টি সূত্র" : "source(s)"}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl border border-border bg-[#f8fafc] px-4 py-3 text-[10px] text-muted">
                  <Loader2 className="size-3.5 animate-spin" />
                  <span className={bn ? "bn" : ""}>
                    {bn
                      ? "আইনি তথ্য যাচাই করা হচ্ছে..."
                      : "Checking the legal information..."}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={messageEndRef} aria-hidden="true" />
      </div>

      {/* INPUT */}
      <div className="border-t border-border bg-[#fafbfc] p-3">
        {voiceRecording && (
          <div className={`flex items-center gap-2 px-1 pb-2 text-[9px] text-red-600 ${bn ? "bn" : ""}`}>
            <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
            {bn ? "আপনার কথা লেখা হচ্ছে..." : "Listening and transcribing..."}
          </div>
        )}

        {!voiceRecording && voiceError && (
          <div className={`px-1 pb-2 text-[9px] text-red-600 ${bn ? "bn" : ""}`}>
            {voiceError}
          </div>
        )}

        <div className="flex items-end gap-2 rounded-xl border border-border bg-white p-2">
          <button
            type="button"
            onClick={handleVoice}
            disabled={!voiceSupported || loading}
            className={`flex size-9 shrink-0 items-center justify-center rounded-lg transition ${
              voiceRecording
                ? "bg-red-50 text-red-600"
                : "text-muted hover:bg-[#f1f5f9] hover:text-teal"
            } disabled:cursor-not-allowed disabled:opacity-40`}
            aria-label={
              voiceRecording
                ? bn
                  ? "রেকর্ডিং বন্ধ করুন"
                  : "Stop recording"
                : bn
                  ? "ভয়েস ইনপুট"
                  : "Voice input"
            }
            title={
              voiceRecording
                ? bn
                  ? "রেকর্ডিং বন্ধ করুন"
                  : "Stop recording"
                : bn
                  ? "ভয়েসে বলুন"
                  : "Speak"
            }
          >
            <Mic className={`size-4 ${voiceRecording ? "animate-pulse" : ""}`} />
          </button>

          {/* This textarea is a draft only. It remains editable while the AI responds. */}
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={bn ? "আপনার আইনি প্রশ্ন লিখুন..." : "Type your legal question..."}
            aria-label={bn ? "আপনার আইনি প্রশ্ন" : "Your legal question"}
            className={`max-h-28 min-h-9 flex-1 resize-y border-0 bg-transparent px-1 py-2 text-[11px] text-navy outline-none placeholder:text-muted ${bn ? "bn" : ""}`}
          />

          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={!draft.trim() || loading}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={bn ? "পাঠান" : "Send"}
            title={bn ? "পাঠান" : "Send message"}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </button>
        </div>

        <p className={`px-1 pt-1.5 text-[8px] text-muted ${bn ? "bn" : ""}`}>
          {bn
            ? "AI-এর উত্তর সাধারণ তথ্যের জন্য। প্রাসঙ্গিক সরকারি আইনি সূত্র যাচাই করুন।"
            : "AI responses are informational. Check the cited official sources where relevant."}
        </p>
      </div>
    </section>
  );
}
