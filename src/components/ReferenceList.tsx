import { ExternalLink, FileText } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

export default function ReferenceList({ references, onOpen }: { references: string[]; onOpen?: (reference: string) => void }) {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  return (
    <div className="border-t border-border pt-3">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.6px] text-muted"><FileText className="size-3.5" />{bn ? "উৎস / রেফারেন্স" : "Sources / References"}</div>
      <div className="flex flex-wrap gap-2 pt-2">
        {references.map((reference, index) => (
          <button type="button" key={`${reference}-${index}`} onClick={() => onOpen?.(reference)} className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[9px] font-semibold text-sky-700 hover:bg-sky-100">
            [{index + 1}] {reference}<ExternalLink className="size-2.5" />
          </button>
        ))}
      </div>
    </div>
  );
}

