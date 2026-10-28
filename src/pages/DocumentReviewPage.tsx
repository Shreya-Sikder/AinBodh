import { useState } from "react";
import { CheckCircle2, ChevronRight, FileText, Pencil, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useApp } from "../context/AppContext";
import DocumentMeta from "../components/DocumentMeta";
import StatusStepper from "../components/StatusStepper";
import DocumentViewer from "../components/DocumentViewer";
import PageFooter from "../components/PageFooter";
export default function DocumentReviewPage() {
  const { lang } = useLanguage();
  const { selectedDocument, activeDocument, verifiedText } = useApp();
  const navigate = useNavigate();
  const [page, setPage] = useState<number | null>(null);
  const [checked, setChecked] = useState([true, true, false, false]);
  const bn = lang === "bn";
  const checks = bn ? ["নথির নাম ও ধরন সঠিক", "তারিখ ও পক্ষগুলোর তথ্য সঠিক", "টাকা ও পেমেন্টের তথ্য যাচাই করেছি", "আমি অস্পষ্ট অংশগুলো চিহ্নিত করেছি"] : ["Document name and type are correct", "Dates and party information are correct", "I checked money and payment details", "I identified anything that looks unclear"];
  return (
    <div className="mx-auto max-w-[1144px] px-6 py-6 md:px-[52px]">
      <div className="pb-5"><p className="label">{bn ? "REVIEW" : "REVIEW"}</p><h1 className={`pt-1.5 text-[22px] font-bold text-navy ${bn ? "bn" : ""}`}>{bn ? "বিশ্লেষণের আগে শেষবার যাচাই" : "Final review before analysis"}</h1><p className={`pt-1 text-[11px] text-muted ${bn ? "bn" : ""}`}>{bn ? "এই ধাপটি দেখায় আপনি কী যাচাই করেছেন।" : "This review step helps you confirm the information you want AinBodh to analyze."}</p></div>
      <StatusStepper current={2} steps={bn ? ["প্রদান", "যাচাই", "পর্যালোচনা", "বিশ্লেষণ", "প্রশ্ন"] : ["Provide", "Verify", "Review", "Analyze", "Ask"]} bn={bn} />
      {selectedDocument ? <div className="pt-5"><DocumentMeta document={selectedDocument} /></div> : null}
      <div className="grid gap-5 pt-5 lg:grid-cols-[1fr_360px]">
        <div className="card p-5"><div className="flex items-center gap-2"><FileText className="size-4 text-teal" /><h2 className={`text-[13px] font-bold text-navy ${bn ? "bn" : ""}`}>{bn ? "আপনার যাচাই তালিকা" : "Your verification checklist"}</h2></div><div className="space-y-2.5 pt-4">{checks.map((item,index) => <button key={item} type="button" onClick={() => setChecked((current) => current.map((value,i) => i === index ? !value : value))} className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left ${checked[index] ? "border-emerald-200 bg-emerald-50" : "border-border bg-white"}`}><span className={`flex size-5 items-center justify-center rounded-full border ${checked[index] ? "border-emerald-400 bg-white text-emerald-600" : "border-slate-300 text-transparent"}`}><CheckCircle2 className="size-3.5" /></span><span className={`text-[11px] text-navy ${bn ? "bn" : ""}`}>{item}</span></button>)}</div><div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-[10px] leading-4 text-sky-800"><ShieldCheck className="mr-1 inline size-3.5" />{bn ? "বিশ্লেষণের প্রতিটি আইনি তথ্য সংশ্লিষ্ট আইনের ধারার লিংকসহ দেখানো হয়।" : "Every legal point in the analysis links to the section of law it relies on."}</div></div>
        <div className="space-y-3"><div className="card p-5"><h2 className={`text-[12px] font-bold text-navy ${bn ? "bn" : ""}`}>{bn ? "দ্রুত নথি দেখুন" : "Quick document view"}</h2><p className={`pt-1 text-[10px] text-muted ${bn ? "bn" : ""}`}>{bn ? "মূল নথির পৃষ্ঠা দেখতে খুলুন।" : "Open the original-document viewer to inspect a page."}</p><button type="button" onClick={() => setPage(1)} className="secondary-btn mt-3 w-full"><FileText className="mr-1.5 size-3.5" />{bn ? "নথি খুলুন" : "Open document"}</button></div><button type="button" disabled={!checked.every(Boolean)} onClick={() => navigate("/analysis")} className="primary-btn w-full disabled:opacity-50">{bn ? "বিশ্লেষণে যান" : "Continue to Analysis"}<ChevronRight className="ml-1.5 size-4" /></button><button type="button" onClick={() => navigate("/verify")} className="secondary-btn w-full"><Pencil className="mr-1.5 size-3.5" />{bn ? "নথি সংশোধন" : "Edit document"}</button></div>
      </div>
      {page ? <DocumentViewer page={page} onClose={() => setPage(null)} document={activeDocument} verifiedText={verifiedText} /> : null}
    </div>
  );
}

