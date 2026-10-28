import { Loader2, Pause, Volume2 } from "lucide-react";
import { useEffect } from "react";
import { useApp } from "../context/AppContext";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";

type ReadAloudProps = {
  text: string;
  label?: string;
};

export default function ReadAloud({ text, label }: ReadAloudProps) {
  const { voiceEnabled, notify, playbackSpeed } = useApp();
  const { speaking, loading, speak, stop } = useSpeechSynthesis();

  useEffect(() => () => stop(), [stop]);

  if (!voiceEnabled) {
    return null;
  }

  const handleClick = async () => {
    if (!text.trim()) return;

    if (speaking) {
      stop();
      return;
    }

    try {
      await speak(text, /[ঀ-৿]/.test(text) ? "bn" : "en", playbackSpeed);
    } catch (error) {
      notify((error as Error).message);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      className="read-btn inline-flex items-center gap-1.5"
      aria-pressed={speaking}
      aria-label={speaking ? "Stop reading" : "Read aloud"}
      title={speaking ? "Stop reading" : "Read aloud"}
    >
      {loading ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : speaking ? (
        <Pause className="size-3.5" />
      ) : (
        <Volume2 className="size-3.5" />
      )}

      {label ?? (speaking ? "Stop" : "Listen")}
    </button>
  );
}
