import { useLanguage } from "../context/LanguageContext";

export default function AnalysisLegend() {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-white px-3 py-2.5 text-[9px] text-muted">
      <span className={`font-semibold text-navy ${bn ? "bn" : ""}`}>{bn ? "চিহ্নের অর্থ:" : "Legend:"}</span>
      <span><i className="mr-1 inline-block size-2 rounded-full bg-red-500" />{bn ? "উচ্চ মনোযোগ" : "High attention"}</span>
      <span><i className="mr-1 inline-block size-2 rounded-full bg-amber-400" />{bn ? "পর্যালোচনা" : "Review"}</span>
      <span><i className="mr-1 inline-block size-2 rounded-full bg-sky-400" />{bn ? "তথ্য অনুপস্থিত" : "Information missing"}</span>
      <span className="ml-auto text-teal">[1] = evidence reference</span>
    </div>
  );
}

