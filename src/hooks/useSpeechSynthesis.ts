import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSpeech } from "../services/api";

/*
 * Read-aloud in Bangla and English.
 *
 * - English, and Bangla on devices that have a Bangla voice (Edge, Android,
 *   some macOS/iOS), use the browser's own voices.
 * - Bangla on devices without one (e.g. Chrome on Windows) uses audio from the
 *   AinBodh server (/api/voice/tts).
 * - Text is cleaned (no **, [C1], links) and read sentence by sentence:
 *   Chrome silently stops long utterances after ~15 seconds.
 */

export type SpeechLanguage = "en" | "bn";

const BENGALI = /[ঀ-৿]/;
const MAX_CHUNK = 220;
const SERVER_CHUNK = 600;

export function cleanForSpeech(text: string): string {
  return text
    .replace(/\[C\d+\]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\*\*|__|`|#{1,6}\s?/g, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\s*\n+\s*/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Split into sentence-sized pieces (Bangla "।" and English punctuation). */
export function chunkText(text: string, max = MAX_CHUNK): string[] {
  const sentences = text
    .split(/(?<=[।৷.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= max) {
      const last = chunks[chunks.length - 1];
      if (last && last.length + sentence.length + 1 <= max) chunks[chunks.length - 1] = `${last} ${sentence}`;
      else chunks.push(sentence);
      continue;
    }
    // Very long sentence: break at commas, then at spaces.
    let rest = sentence;
    while (rest.length > max) {
      const window = rest.slice(0, max);
      const cut = Math.max(window.lastIndexOf(","), window.lastIndexOf("،"), window.lastIndexOf(";"));
      const at = cut > max * 0.4 ? cut + 1 : Math.max(window.lastIndexOf(" "), Math.floor(max * 0.8));
      chunks.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) chunks.push(rest);
  }
  return chunks;
}

function voiceLanguage(voice: SpeechSynthesisVoice): string {
  // Android reports "bn_BD"; others "bn-BD".
  return (voice.lang || "").replace("_", "-").toLowerCase();
}

function findVoice(voices: SpeechSynthesisVoice[], language: SpeechLanguage): SpeechSynthesisVoice | null {
  const matches = voices.filter((voice) => {
    const code = voiceLanguage(voice);
    if (language === "bn") return code === "bn" || code.startsWith("bn-") || /bangla|bengali|বাংলা/i.test(voice.name);
    return code === "en" || code.startsWith("en-");
  });
  if (matches.length === 0) return null;

  const score = (voice: SpeechSynthesisVoice) => {
    const code = voiceLanguage(voice);
    let value = 0;
    if (language === "bn" && code === "bn-bd") value += 4;
    if (language === "en" && (code === "en-us" || code === "en-gb" || code === "en-in")) value += 2;
    if (/natural|neural|online|google|enhanced|premium/i.test(voice.name)) value += 3;
    if (voice.localService) value += 1;
    return value;
  };
  return [...matches].sort((a, b) => score(b) - score(a))[0];
}

function getVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve([]);
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", done);
      window.clearTimeout(timer);
      resolve(window.speechSynthesis.getVoices());
    };
    const timer = window.setTimeout(done, 1500);
    window.speechSynthesis.addEventListener("voiceschanged", done);
  });
}

export function useSpeechSynthesis() {
  const browserSupported = typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const requestRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (!browserSupported) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      mountedRef.current = false;
      window.speechSynthesis.removeEventListener("voiceschanged", load);
    };
  }, [browserSupported]);

  const stop = useCallback(() => {
    requestRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (browserSupported) window.speechSynthesis.cancel();
    if (mountedRef.current) {
      setSpeaking(false);
      setLoading(false);
    }
  }, [browserSupported]);

  useEffect(() => () => stop(), [stop]);

  /** Browser voices, one chunk at a time. */
  const speakWithBrowser = (chunks: string[], voice: SpeechSynthesisVoice | null, language: SpeechLanguage, rate: number, id: number) =>
    new Promise<boolean>((resolve) => {
      let index = 0;
      let started = false;
      const next = () => {
        if (id !== requestRef.current) return resolve(false);
        if (index >= chunks.length) return resolve(started);
        const utterance = new SpeechSynthesisUtterance(chunks[index++]);
        utterance.lang = voice?.lang.replace("_", "-") || (language === "bn" ? "bn-BD" : "en-US");
        if (voice) utterance.voice = voice;
        utterance.rate = rate;
        utterance.onstart = () => {
          started = true;
          if (mountedRef.current) {
            setLoading(false);
            setSpeaking(true);
          }
        };
        utterance.onend = next;
        utterance.onerror = (event) => resolve(started && (event.error === "interrupted" || event.error === "canceled") ? false : started);
        window.speechSynthesis.speak(utterance);
      };
      window.speechSynthesis.cancel();
      next();
    });

  /** Server audio, fetching the next chunk while the current one plays. */
  const speakWithServer = async (chunks: string[], language: SpeechLanguage, rate: number, id: number): Promise<boolean> => {
    const controller = new AbortController();
    abortRef.current = controller;
    const fetchChunk = (index: number) => (index < chunks.length ? fetchSpeech(chunks[index], language, controller.signal) : null);

    let pending = fetchChunk(0);
    let played = false;

    for (let index = 0; index < chunks.length && pending; index++) {
      const blob = await pending;
      if (id !== requestRef.current) return false;
      pending = fetchChunk(index + 1);
      pending?.catch(() => undefined);

      const url = URL.createObjectURL(blob);
      try {
        await new Promise<void>((resolve, reject) => {
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.playbackRate = rate;
          audio.onplaying = () => {
            if (mountedRef.current) {
              setLoading(false);
              setSpeaking(true);
            }
          };
          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error("audio playback failed"));
          audio.play().catch(reject);
        });
        played = true;
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    return played;
  };

  /**
   * Read text aloud. Resolves true when it played; throws an Error with a
   * person-readable message when it could not.
   */
  const speak = useCallback(
    async (text: string, language?: SpeechLanguage, rate = 1): Promise<boolean> => {
      const clean = cleanForSpeech(text);
      if (!clean) return false;

      stop();
      const id = ++requestRef.current;
      const lang: SpeechLanguage = language ?? (BENGALI.test(clean) ? "bn" : "en");
      setLoading(true);

      try {
        const available = browserSupported ? await getVoices() : [];
        const voice = findVoice(available, lang);

        // A Bangla answer needs a Bangla voice; English voices mangle Bengali script.
        const useBrowser = browserSupported && (lang === "en" ? true : Boolean(voice));
        let ok = useBrowser
          ? await speakWithBrowser(chunkText(clean), voice, lang, rate * 0.95, id)
          : await speakWithServer(chunkText(clean, SERVER_CHUNK), lang, rate, id);

        // A device Bangla voice that fails to start (some Android builds): use server audio.
        if (!ok && useBrowser && lang === "bn" && id === requestRef.current) {
          ok = await speakWithServer(chunkText(clean, SERVER_CHUNK), lang, rate, id);
        }
        return ok;
      } catch (error) {
        if ((error as Error).name === "AbortError" || id !== requestRef.current) return false;
        const status = (error as { status?: number }).status;
        throw new Error(
          lang === "bn"
            ? status === 501
              ? "এই ডিভাইসে বাংলা ভয়েস নেই, আর সার্ভারে বাংলা পড়ে শোনানো চালু করা হয়নি।"
              : "বাংলা পড়ে শোনানো এই মুহূর্তে চালু করা যাচ্ছে না। আবার চেষ্টা করুন।"
            : "Read-aloud could not be started. Please try again.",
        );
      } finally {
        if (id === requestRef.current && mountedRef.current) {
          setSpeaking(false);
          setLoading(false);
        }
      }
    },
    // speakWithBrowser/speakWithServer only use refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [browserSupported, stop],
  );

  return {
    /** Read-aloud is always possible: browser voices or server audio. */
    supported: true,
    speaking: speaking || loading,
    loading,
    speak,
    stop,
    hasBanglaVoice: Boolean(findVoice(voices, "bn")),
    hasEnglishVoice: Boolean(findVoice(voices, "en")),
  };
}
