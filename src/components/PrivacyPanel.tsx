import { Database, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

export default function PrivacyPanel() {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const items = [
    [LockKeyhole, bn ? "নথি-ভিত্তিক প্রক্রিয়া" : "Document-scoped processing", bn ? "বিশ্লেষণ UI নির্বাচিত নথির প্রেক্ষাপট দেখায়।" : "The analysis UI is scoped to the selected document."],
    [Database, bn ? "সংরক্ষণ নীতি ব্যাকএন্ডে" : "Retention belongs in backend", bn ? "চূড়ান্ত ডেটা retention ও deletion policy সার্ভারে প্রয়োগ করুন।" : "Implement the final retention and deletion policy on the server."],
    [KeyRound, bn ? "অ্যাক্সেস নিয়ন্ত্রণ" : "Access control", bn ? "ব্যবহারকারীর নথি ও চ্যাট কেবল অনুমোদিত সেশনে দেখান।" : "Only authorized sessions should access a user's documents and chats."],
    [ShieldCheck, bn ? "প্রমাণযোগ্য ফলাফল" : "Verifiable findings", bn ? "ফলাফলের সঙ্গে পৃষ্ঠা ও ধারা-ভিত্তিক উৎস রাখুন।" : "Keep page and section evidence attached to findings."],
  ];
  return (
    <div className="card p-5"><h2 className={`text-[12px] font-bold text-navy ${bn ? "bn" : ""}`}>{bn ? "গোপনীয়তা ও প্রমাণ নীতি" : "Privacy & Evidence Principles"}</h2><div className="grid gap-3 pt-4 sm:grid-cols-2">{items.map(([Icon,title,description]) => { const I = Icon as typeof ShieldCheck; return <div key={title as string} className="flex gap-2.5"><div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#f0f4f8] text-teal"><I className="size-4" /></div><div><p className={`text-[10px] font-bold text-navy ${bn ? "bn" : ""}`}>{title as string}</p><p className={`pt-1 text-[9px] leading-4 text-muted ${bn ? "bn" : ""}`}>{description as string}</p></div></div>})}</div></div>
  );
}

