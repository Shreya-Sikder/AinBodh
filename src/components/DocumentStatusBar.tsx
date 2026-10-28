import { CheckCircle2, FileText, LockKeyhole } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

export default function DocumentStatusBar({ name, pages = 8 }: { name: string; pages?: number }) {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-white px-4 py-3">
      <FileText className="size-4 text-teal" />
      <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold text-navy">{name}</p><p className="pt-0.5 text-[9px] text-muted">PDF · {pages} {bn ? "পৃষ্ঠা" : "pages"}</p></div>
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-semibold text-emerald-700"><CheckCircle2 className="size-3" />{bn ? "পর্যালোচিত" : "Reviewed"}</span>
      <span className="inline-flex items-center gap-1 text-[9px] text-muted"><LockKeyhole className="size-3" />{bn ? "গোপনীয়তা" : "Privacy-first"}</span>
    </div>
  );
}

