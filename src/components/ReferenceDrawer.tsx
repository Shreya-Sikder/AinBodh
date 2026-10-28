import { ExternalLink, FileText, X } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { documentFixture } from "../data/documentFixture";

export default function ReferenceDrawer({ reference, onClose }: { reference: string; onClose: () => void }) {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const match = documentFixture.references.find((item) => item.label === reference);
  const section = match ? documentFixture.sections.find((item) => item.page === match.page) : undefined;
  return (
    <div className="fixed inset-y-0 right-0 z-[75] w-[min(440px,94vw)] border-l border-border bg-white shadow-2xl">
      <div className="flex h-14 items-center gap-2 border-b border-border bg-navy px-4 text-white"><FileText className="size-4" /><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-bold">{bn ? "উৎস রেফারেন্স" : "Source reference"}</p><p className="truncate pt-0.5 text-[9px] text-white/45">{reference}</p></div><button type="button" onClick={onClose} className="icon-button-dark"><X className="size-4" /></button></div>
      <div className="space-y-4 p-5">
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4"><p className="text-[9px] font-bold uppercase tracking-wider text-sky-700">{bn ? "নথির অবস্থান" : "Document location"}</p><p className={`pt-1.5 text-[12px] font-bold text-navy ${bn ? "bn" : ""}`}>{section ? `${bn ? "পৃষ্ঠা" : "Page"} ${section.page} · ${bn ? "ধারা" : "Section"} ${section.section}` : reference}</p></div>
        <div className="rounded-lg border border-border bg-[#f8fafc] p-4"><p className={`text-[10px] font-bold uppercase tracking-wider text-muted ${bn ? "bn" : ""}`}>{bn ? "মূল অংশ" : "Relevant excerpt"}</p><p className={`pt-2 text-[12px] leading-6 text-[#334155] ${bn ? "bn" : ""}`}>{section?.text ?? (bn ? "প্রদত্ত নথিতে এই রেফারেন্সের জন্য বিস্তারিত অংশ পাওয়া যায়নি।" : "No detailed excerpt was found for this reference in the provided document.")}</p></div>
        <button type="button" onClick={() => onClose()} className="secondary-btn w-full"><ExternalLink className="mr-1.5 size-3.5" />{bn ? "মূল নথি দেখুন" : "Open original document"}</button>
        <p className={`text-[9px] leading-4 text-muted ${bn ? "bn" : ""}`}>{bn ? "প্রোডাকশনে এই প্যানেলটি OCR/PDF viewer-এর নির্দিষ্ট পৃষ্ঠা ও হাইলাইটে নেভিগেট করবে।" : "In production, this panel should navigate to the exact PDF page and highlight the supporting excerpt."}</p>
      </div>
    </div>
  );
}

