import { Mic, Square } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "../context/LanguageContext";

export default function VoiceInput({ onTranscript }: { onTranscript?: (text: string) => void }) {
  const { lang } = useLanguage();
  const [active, setActive] = useState(false);
  const bn = lang === "bn";
  const toggle = () => {
    setActive((value) => !value);
    if (!active) onTranscript?.(bn ? "আমি এই নথির প্রধান দায়িত্বগুলো জানতে চাই।" : "What are the main obligations in this document?");
  };
  return (
    <div className={`rounded-lg border p-3 ${active ? "border-red-200 bg-red-50" : "border-border bg-white"}`}>
      <div className="flex items-center gap-3"><button type="button" onClick={toggle} className={`flex size-9 shrink-0 items-center justify-center rounded-full ${active ? "bg-red-700 text-white" : "bg-tealSoft text-teal"}`}>{active ? <Square className="size-3.5" /> : <Mic className="size-4" />}</button><div><p className={`text-[11px] font-semibold text-navy ${bn ? "bn" : ""}`}>{active ? (bn ? "শুনছি…" : "Listening…") : (bn ? "ভয়েস প্রশ্ন" : "Voice question")}</p><p className={`pt-0.5 text-[9px] text-muted ${bn ? "bn" : ""}`}>{active ? (bn ? "কথা বলা শেষ হলে বোতাম চাপুন।" : "Press the button again when finished.") : (bn ? "বাংলা বা ইংরেজিতে কথা বলুন।" : "Speak in Bangla or English.")}</p></div></div>
    </div>
  );
}

