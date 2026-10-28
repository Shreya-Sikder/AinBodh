import { useEffect, useState } from "react";
import { CheckCircle2, FileText, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useApp } from "../context/AppContext";
import { analyzeDocument } from "../services/api";
import PageFooter from "../components/PageFooter";
export default function AnalyzingPage() {
  const { lang } = useLanguage();
  const { pendingFile, verifiedText, setSelectedDocument, addDocument } = useApp();
  const navigate = useNavigate();
  const bn = lang === "bn";
  const [step, setStep] = useState(0);

  const steps = bn ? ["নথি আপলোড করা হয়েছে", "টেক্সট বের করা হয়েছে", "মূল তথ্য চিহ্নিত করা হয়েছে", "ধারাগুলো পর্যালোচনা করা হচ্ছে", "অনুপস্থিত তথ্য যাচাই করা হচ্ছে", "অসংগতি যাচাই করা হচ্ছে"] : ["Document uploaded", "Text extracted", "Key information identified", "Clauses reviewed", "Missing information checked", "Inconsistencies checked"];

  useEffect(() => {
    let active = true;
    const run = async () => {
      for (let index = 0; index < steps.length; index += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 420));
        if (!active) return;
        setStep(index + 1);
      }
      const result = await analyzeDocument({ file: pendingFile, text: verifiedText, language: lang });
      if (!active) return;
      addDocument(result.document);
      setSelectedDocument(result.document);
      navigate("/analysis", { replace: true });
    };
    void run();
    return () => { active = false; };
  }, []);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-56px)] max-w-[1144px] items-center justify-center bg-[#f4f6f9] px-6 py-10">
      <div className="card w-full max-w-[520px] p-8">
        <div className="flex items-center gap-3"><div className="relative flex size-9 items-center justify-center"><div className="absolute inset-0 animate-spin rounded-full border-2 border-[#c0e8f5] border-t-teal" /><FileText className="relative size-4 text-teal" /></div><div><h1 className={`text-[16px] font-bold text-navy ${bn ? "bn" : ""}`}>{bn ? "আপনার নথি বিশ্লেষণ করা হচ্ছে…" : "Your document is being analyzed…"}</h1><p className={`pt-1 text-[11px] text-muted ${bn ? "bn" : ""}`}>{bn ? "AinBodh গুরুত্বপূর্ণ তথ্য, ধারা এবং অসংগতি পর্যালোচনা করছে।" : "AinBodh is reviewing key information, clauses, missing information, and inconsistencies."}</p></div></div>
        <div className="mt-6 h-1 overflow-hidden rounded-full bg-[#f0f4f8]"><div className="h-full rounded-full bg-teal transition-all duration-300" style={{ width: `${Math.min(100, (step / steps.length) * 100)}%` }} /></div>
        <div className="space-y-3 pt-5">{steps.map((label, index) => { const complete = index < step; const active = index === step; return <div key={label} className="flex items-center gap-2.5">{complete ? <div className="flex size-5 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50"><CheckCircle2 className="size-3.5 text-emerald-600" /></div> : active ? <Loader2 className="size-5 animate-spin text-teal" /> : <div className="size-5 rounded-full border border-slate-200" />}<span className={`text-[11px] ${complete ? "font-semibold text-navy" : "text-muted"} ${bn ? "bn" : ""}`}>{label}</span></div>; })}</div>
        <p className={`pt-6 text-center text-[9px] text-muted ${bn ? "bn" : ""}`}>🔒 {bn ? "বিশ্লেষণের পরে আপলোড করা নথি সংরক্ষণ না করার নকশা অনুসরণ করা হয়েছে।" : "The workflow is designed not to retain uploaded documents after analysis."}</p>
      </div>
    </div>
  );
}

