import { CircleHelp, FileQuestion, ShieldAlert } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

export default function BeforeProceed() {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const items = bn
    ? [
        [ShieldAlert, "যা বুঝে নেওয়া দরকার", "আগাম সমাপ্তি, নোটিশ এবং নিরাপত্তা জমার শর্ত।"],
        [CircleHelp, "যা স্পষ্ট করা দরকার", "চুক্তির শুরুর তারিখ এবং আগাম সমাপ্তির আর্থিক পরিণতি।"],
        [FileQuestion, "যা নথিতে পাওয়া যায়নি", "স্পষ্ট বিরোধ নিষ্পত্তি প্রক্রিয়া এবং কিছু ফেরত-সংক্রান্ত বিবরণ।"],
      ]
    : [
        [ShieldAlert, "What to understand", "Early termination, notice, and security-deposit conditions."],
        [CircleHelp, "What to clarify", "The contract start date and financial consequences of early termination."],
        [FileQuestion, "What was not found", "A clear dispute-resolution process and some return-related details."],
      ];
  return (
    <div className="card p-5">
      <h2 className={`section-title ${bn ? "bn" : ""}`}>{bn ? "আপনি এগিয়ে যাওয়ার আগে" : "Before You Proceed"}</h2>
      <p className={`pt-1 text-[11px] text-muted ${bn ? "bn" : ""}`}>{bn ? "সিদ্ধান্ত নেওয়ার আগে কিছু বিষয় বুঝে ও স্পষ্ট করে নেওয়া উপকারী হতে পারে।" : "A short pre-action review of what to understand, clarify, and check."}</p>
      <div className="space-y-2.5 pt-4">
        {items.map(([Icon, title, description]) => {
          const I = Icon as typeof ShieldAlert;
          return <div key={title as string} className="flex gap-3 rounded-lg border border-border bg-[#f8fafc] p-3"><div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-teal shadow-sm"><I className="size-4" /></div><div><p className={`text-[11px] font-bold text-navy ${bn ? "bn" : ""}`}>{title as string}</p><p className={`pt-1 text-[10px] leading-4 text-muted ${bn ? "bn" : ""}`}>{description as string}</p></div></div>;
        })}
      </div>
    </div>
  );
}

