import { Sparkles } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

export default function QuestionSuggestions({ onSelect }: { onSelect: (question: string) => void }) {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const questions = bn
    ? ["চুক্তির প্রধান দায়িত্বগুলো কী?", "কোন ধারাগুলো মনোযোগ দিয়ে পড়ব?", "স্বাক্ষরের আগে কী স্পষ্ট করব?", "নথিতে কোন তথ্য অনুপস্থিত?"]
    : ["What are the main obligations?", "Which clauses need attention?", "What should I clarify before signing?", "What information is missing?"];
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted"><Sparkles className="size-3.5 text-teal" />{bn ? "প্রস্তাবিত প্রশ্ন" : "Suggested questions"}</div>
      <div className="flex flex-wrap gap-1.5 pt-2">{questions.map((question) => <button type="button" key={question} onClick={() => onSelect(question)} className={`pill ${bn ? "bn" : ""}`}>{question}</button>)}</div>
    </div>
  );
}

