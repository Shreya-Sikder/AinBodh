import { ArrowRight, Save, ShieldCheck } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

export default function ActionFooter({ onPrimary, primaryLabel, disabled = false }: { onPrimary: () => void; primaryLabel: string; disabled?: boolean }) {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  return (
    <div className="flex flex-col gap-3 border-t border-border bg-white px-5 py-4 md:flex-row md:items-center"><div className="flex flex-1 items-start gap-2 text-[9px] leading-4 text-muted"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-teal" /><span className={bn ? "bn" : ""}>{bn ? "প্রতিটি গুরুত্বপূর্ণ ফলাফলকে মূল নথির উৎসের সঙ্গে যুক্ত রাখুন।" : "Keep important findings connected to evidence in the original document."}</span></div><div className="flex gap-2"><button type="button" className="secondary-btn !px-4 !py-2 text-[10px]"><Save className="mr-1.5 size-3.5" />{bn ? "সংরক্ষণ" : "Save"}</button><button type="button" disabled={disabled} onClick={onPrimary} className="primary-btn !px-4 !py-2 text-[10px]">{primaryLabel}<ArrowRight className="ml-1.5 size-3.5" /></button></div></div>
  );
}

