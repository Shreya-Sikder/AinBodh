import { useCallback, useEffect, useState } from "react";

export function useSpeech(rate = 1) {
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback(
    (text: string, language?: string) => {
      if (!supported) return false;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      utterance.lang = language ?? (/[\u0980-\u09ff]/.test(text) ? "bn-BD" : "en-US");
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
      return true;
    },
    [rate, supported]
  );

  useEffect(() => stop, [stop]);

  return { supported, speaking, speak, stop };
}

