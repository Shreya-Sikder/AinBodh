import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

export default function AnalysisProgress({ current }: { current: number }) {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const steps = bn ? ["নথি পড়া", "মূল তথ্য", "মনোযোগের বিষয়", "অসংগতি", "রেফারেন্স"] : ["Read document", "Key information", "Attention areas", "Inconsistencies", "References"];
  return (
    <div className="card p-5"><div className="flex items-center justify-between pb-3"><h2 className={`text-[12px] font-bold text-navy ${bn ? "bn" : ""}`}>{bn ? "বিশ্লেষণের অগ্রগতি" : "Analysis progress"}</h2><span className="text-[10px] text-muted">{Math.round((current / steps.length) * 100)}%</span></div><div className="h-1 overflow-hidden rounded-full bg-[#eef2f6]"><div className="h-full rounded-full bg-teal transition-all" style={{ width: `${Math.min(100, (current / steps.length) * 100)}%` }} /></div><div className="space-y-2.5 pt-4">{steps.map((step,index) => <div key={step} className="flex items-center gap-2">{index < current ? <CheckCircle2 className="size-4 text-emerald-600" /> : index === current ? <Loader2 className="size-4 animate-spin text-teal" /> : <Circle className="size-4 text-slate-300" />}<span className={`text-[10px] ${index <= current ? "font-semibold text-navy" : "text-muted"} ${bn ? "bn" : ""}`}>{step}</span></div>)}</div></div>
  );
}

