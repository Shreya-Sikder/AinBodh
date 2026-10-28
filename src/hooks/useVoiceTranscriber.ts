import { useCallback, useEffect, useRef, useState } from "react";
import { transcribeAudio } from "../services/api";

/*
 * Live voice input in Bangla, English or Banglish.
 *
 * 1. Browser speech recognition (Chrome, Edge, Safari): words appear live
 *    while the person speaks — `interim` (still changing) and `finalText`
 *    (settled). Bangla and Banglish use bn-BD, so Banglish comes out in
 *    Bengali script; English uses en-US.
 * 2. Fallback (Firefox, browsers without recognition, or when the browser's
 *    speech service fails): the microphone is recorded and sent to the
 *    AinBodh server (Whisper) every few seconds, so the text still updates
 *    while speaking, and once more when recording stops.
 */

export type VoiceLanguage = "en" | "bn" | "banglish";
export type VoiceMode = "browser" | "server" | "unsupported";

type RecognitionResult = { isFinal: boolean; 0?: { transcript: string } };
type RecognitionEvent = Event & { resultIndex: number; results: ArrayLike<RecognitionResult> };
type RecognitionErrorEvent = Event & { error: string };

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type RecognitionConstructor = new () => Recognition;

export type TranscriptUpdate = {
  /** Everything so far: base text + settled words + words still being recognised. */
  text: string;
  finalText: string;
  interim: string;
  isFinal: boolean;
};

type Options = {
  language: VoiceLanguage;
  onTranscript: (text: string, update: TranscriptUpdate) => void;
};

const SERVER_INTERVAL_MS = 4000;
const MAX_RECORDING_MS = 3 * 60 * 1000;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function canRecord(): boolean {
  return typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

function recorderMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((type) => {
    try {
      return MediaRecorder.isTypeSupported(type);
    } catch {
      return false;
    }
  });
}

const join = (...parts: string[]) => parts.map((part) => part.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ");

export function useVoiceTranscriber({ language, onTranscript }: Options) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interim, setInterim] = useState("");
  const [finalText, setFinalText] = useState("");
  const [mode, setMode] = useState<VoiceMode>(() =>
    recognitionConstructor() ? "browser" : canRecord() ? "server" : "unsupported",
  );

  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const languageRef = useRef(language);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  const bn = language !== "en";
  const message = useCallback(
    (bnText: string, enText: string) => (languageRef.current === "en" ? enText : bnText),
    [],
  );

  /* ---------------- shared state for one recording ---------------- */

  const baseRef = useRef("");
  const settledRef = useRef(""); // finals from earlier recognition sessions (after auto-restart)
  const keepGoingRef = useRef(false);
  const stopTimerRef = useRef<number | null>(null);

  const emit = useCallback((settled: string, live: string, isFinal: boolean) => {
    setFinalText(settled);
    setInterim(live);
    onTranscriptRef.current(join(baseRef.current, settled, live), {
      text: join(baseRef.current, settled, live),
      finalText: settled,
      interim: live,
      isFinal,
    });
  }, []);

  /* ---------------- 1. browser recognition ---------------- */

  const recognitionRef = useRef<Recognition | null>(null);
  const sessionFinalRef = useRef("");
  const watchdogRef = useRef<number | null>(null);

  const startBrowser = useCallback((): boolean => {
    const Constructor = recognitionConstructor();
    if (!Constructor) return false;

    const recognition = new Constructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = languageRef.current === "en" ? "en-US" : "bn-BD";
    sessionFinalRef.current = "";

    recognition.onstart = () => {
      if (watchdogRef.current !== null) window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
      setRecording(true);
      setError(null);
    };

    recognition.onresult = (event) => {
      // Rebuild this session's text from all results every time — avoids the
      // duplicated words some Android builds produce with continuous mode.
      let sessionFinal = "";
      let live = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) sessionFinal = join(sessionFinal, transcript);
        else live = join(live, transcript);
      }
      sessionFinalRef.current = sessionFinal;
      emit(join(settledRef.current, sessionFinal), live, false);
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted") return;

      if (event.error === "no-speech") {
        // Keep listening; Chrome ends the session, onend restarts it.
        return;
      }

      if (event.error === "not-allowed" || event.error === "audio-capture") {
        keepGoingRef.current = false;
        setError(
          message(
            "মাইক্রোফোন ব্যবহারের অনুমতি দিন (ব্রাউজারের ঠিকানার পাশে লক আইকনে ক্লিক করুন)।",
            "Please allow microphone access (click the lock icon next to the address bar).",
          ),
        );
        return;
      }

      // The browser's speech service is unavailable (offline, blocked, unsupported language):
      // switch to recording + server transcription and carry on.
      if (canRecord()) {
        recognition.onend = null;
        recognitionRef.current = null;
        settledRef.current = join(settledRef.current, sessionFinalRef.current);
        setMode("server");
        void startServer();
        return;
      }

      keepGoingRef.current = false;
      setError(message("ভয়েস ইনপুটে সমস্যা হয়েছে। আবার চেষ্টা করুন।", "There was a problem with voice input. Please try again."));
    };

    recognition.onend = () => {
      settledRef.current = join(settledRef.current, sessionFinalRef.current);
      sessionFinalRef.current = "";

      if (keepGoingRef.current) {
        // Browsers end recognition after silence or ~60 s; continue seamlessly.
        try {
          recognition.start();
          return;
        } catch {
          // fall through
        }
      }

      recognitionRef.current = null;
      setRecording(false);
      emit(settledRef.current, "", true);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      // Show "Listening…" right away.
      setRecording(true);
      // Some browsers expose recognition but never start it (no event at all, e.g. Brave,
      // embedded browsers). If nothing has started after 3 s, switch to server transcription.
      if (watchdogRef.current !== null) window.clearTimeout(watchdogRef.current);
      watchdogRef.current = window.setTimeout(() => {
        watchdogRef.current = null;
        if (recognitionRef.current !== recognition || !keepGoingRef.current) return;
        recognition.onend = null;
        recognition.onerror = null;
        try {
          recognition.abort();
        } catch {
          // ignore
        }
        recognitionRef.current = null;
        if (canRecord()) {
          setMode("server");
          void startServer();
        } else {
          setRecording(false);
          setError(message("এই ব্রাউজারে ভয়েস ইনপুট কাজ করছে না।", "Voice input is not working in this browser."));
        }
      }, 3000);
      return true;
    } catch {
      recognitionRef.current = null;
      return false;
    }
    // startServer is defined below and stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emit, message]);

  /* ---------------- 2. server transcription ---------------- */

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const sentChunksRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const transcribeSoFar = useCallback(
    async (isFinal: boolean) => {
      const chunks = chunksRef.current;
      if (chunks.length === 0) return;
      if (!isFinal && (inFlightRef.current || chunks.length === sentChunksRef.current)) return;

      inFlightRef.current = true;
      sentChunksRef.current = chunks.length;
      if (isFinal) setTranscribing(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const blob = new Blob(chunks, { type: recorderRef.current?.mimeType || chunks[0].type || "audio/webm" });
        const text = await transcribeAudio(blob, languageRef.current, controller.signal);
        // The whole recording is transcribed each time, so the result replaces the live part.
        emit(join(settledRef.current, isFinal ? text : ""), isFinal ? "" : text, isFinal);
        if (isFinal) settledRef.current = join(settledRef.current, text);
      } catch (cause) {
        if ((cause as Error).name !== "AbortError" && isFinal) {
          setError((cause as Error).message || message("রেকর্ডিং লেখায় রূপান্তর করা যায়নি।", "The recording could not be transcribed."));
        }
      } finally {
        inFlightRef.current = false;
        if (isFinal) setTranscribing(false);
      }
    },
    [emit, message],
  );

  const releaseMicrophone = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const startServer = useCallback(async () => {
    if (!canRecord()) {
      setError(message("এই ব্রাউজারে ভয়েস ইনপুট সমর্থিত নয়।", "Voice input is not supported in this browser."));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      streamRef.current = stream;

      const mimeType = recorderMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      sentChunksRef.current = 0;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
        intervalRef.current = null;
        releaseMicrophone();
        setRecording(false);
        void transcribeSoFar(true);
      };

      recorder.start(1000);
      setRecording(true);
      setError(null);
      intervalRef.current = window.setInterval(() => void transcribeSoFar(false), SERVER_INTERVAL_MS);
    } catch {
      setRecording(false);
      setError(
        message(
          "মাইক্রোফোন চালু করা যায়নি। মাইক্রোফোনের অনুমতি দিন।",
          "The microphone could not be started. Please allow microphone access.",
        ),
      );
    }
  }, [message, transcribeSoFar]);

  /* ---------------- controls ---------------- */

  const stop = useCallback(() => {
    keepGoingRef.current = false;
    if (watchdogRef.current !== null) window.clearTimeout(watchdogRef.current);
    watchdogRef.current = null;
    if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;

    if (recognitionRef.current) {
      const recognition = recognitionRef.current;
      try {
        recognition.stop();
      } catch {
        setRecording(false);
      }
      // If the browser never answers, don't leave the UI stuck on "Listening…".
      window.setTimeout(() => {
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
          setRecording(false);
          emit(settledRef.current, "", true);
        }
      }, 1500);
    }

    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    } else if (!recognitionRef.current) {
      setRecording(false);
    }
  }, [emit]);

  const start = useCallback(
    (currentText = "") => {
      baseRef.current = currentText.trim();
      settledRef.current = "";
      setInterim("");
      setFinalText("");
      setError(null);
      keepGoingRef.current = true;

      const started = mode === "browser" ? startBrowser() : false;
      if (!started) {
        if (mode === "unsupported") {
          setError(message("এই ব্রাউজারে ভয়েস ইনপুট সমর্থিত নয়।", "Voice input is not supported in this browser."));
          keepGoingRef.current = false;
          return;
        }
        setMode("server");
        void startServer();
      }

      stopTimerRef.current = window.setTimeout(stop, MAX_RECORDING_MS);
    },
    [message, mode, startBrowser, startServer, stop],
  );

  // Stop everything when the component using the hook goes away.
  useEffect(
    () => () => {
      keepGoingRef.current = false;
      if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
      abortRef.current?.abort();
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  return {
    recording,
    transcribing,
    supported: mode !== "unsupported",
    mode,
    error,
    interim,
    finalText,
    start,
    stop,
    bn,
  };
}
