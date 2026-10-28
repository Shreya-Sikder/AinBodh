import { AlertTriangle, Info, Volume2 } from "lucide-react";
import ReadAloud from "./ReadAloud";
import { useLanguage } from "../context/LanguageContext";

export type AttentionItem = {
  level: "high" | "review" | "info";
  title: string;
  body: string;
  citation?: string;
};

export function AttentionCard({ item, onCitation }: { item: AttentionItem; onCitation?: (citation: string) => void }) {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const palette = item.level === "high" ? "attention-high" : item.level === "review" ? "attention-review" : "attention-info";
  const citation = item.citation;
  return (
    <div className={`attention-card ${palette}`}>
      <div className="pt-0.5">
        {item.level === "high" ? <span className="text-base">🔴</span> : item.level === "review" ? <span className="text-base">🟡</span> : <Info className="size-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={`text-[12px] font-bold ${bn ? "bn" : ""}`}>{item.title}</h3>
          <span className="attention-badge">{item.level === "high" ? (bn ? "উচ্চ মনোযোগ" : "High Attention") : item.level === "review" ? (bn ? "পর্যালোচনা করুন" : "Review") : (bn ? "তথ্য অনুপস্থিত" : "Information Missing")}</span>
        </div>
        <p className={`pt-1 text-[12px] leading-5 text-[#475569] ${bn ? "bn" : ""}`}>{item.body} {citation ? <button type="button" className="citation-inline" onClick={() => onCitation?.(citation)}>[{citation.split(" ")[1] ?? "1"}]</button> : null}</p>
        <div className="pt-2 flex items-center gap-2">
          <ReadAloud text={item.body} label={bn ? "শুনুন" : "Listen"} />
          {citation ? <button type="button" className="text-[10px] text-teal hover:underline" onClick={() => onCitation?.(citation)}>{citation}</button> : null}
        </div>
      </div>
    </div>
  );
}

export function MissingCard({ title, body }: { title: string; body: string }) {
  const { lang } = useLanguage();
  return (
    <div className="missing-card">
      <span className="text-base">⚠️</span>
      <div>
        <h3 className={`text-[12px] font-bold text-sky-800 ${lang === "bn" ? "bn" : ""}`}>{title}</h3>
        <p className={`pt-1 text-[12px] leading-5 text-muted ${lang === "bn" ? "bn" : ""}`}>{body}</p>
      </div>
    </div>
  );
}

