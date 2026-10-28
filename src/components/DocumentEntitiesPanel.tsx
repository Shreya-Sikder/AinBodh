import { CalendarDays, CircleDollarSign, FileText, UserRound } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { documentFixture } from "../data/documentFixture";

export default function DocumentEntitiesPanel() {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const groups = [
    { icon: UserRound, title: bn ? "পক্ষসমূহ" : "Parties", values: documentFixture.extractedEntities.parties },
    { icon: CalendarDays, title: bn ? "তারিখ" : "Dates", values: documentFixture.extractedEntities.dates },
    { icon: CircleDollarSign, title: bn ? "অর্থ" : "Money", values: documentFixture.extractedEntities.money },
    { icon: FileText, title: bn ? "দায়িত্ব" : "Obligations", values: documentFixture.extractedEntities.obligations },
  ];

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h2 className={`text-[12px] font-bold text-navy ${bn ? "bn" : ""}`}>{bn ? "চিহ্নিত গুরুত্বপূর্ণ তথ্য" : "Extracted Key Information"}</h2>
        <p className={`pt-1 text-[10px] text-muted ${bn ? "bn" : ""}`}>{bn ? "নথি থেকে শনাক্ত তথ্যগুলো পরে ব্যাকএন্ডের প্রমাণের সঙ্গে যুক্ত হবে।" : "Entities extracted from the document can be linked to backend evidence."}</p>
      </div>
      <div className="grid gap-2 p-4 sm:grid-cols-2">
        {groups.map(({ icon: Icon, title, values }) => (
          <div key={title} className="rounded-lg border border-border bg-[#f8fafc] p-3">
            <div className="flex items-center gap-2"><Icon className="size-4 text-teal" /><p className={`text-[10px] font-bold uppercase tracking-wide text-muted ${bn ? "bn" : ""}`}>{title}</p></div>
            <div className="space-y-1.5 pt-2">{values.map((value) => <div key={value} className={`rounded-md bg-white px-2.5 py-1.5 text-[10px] text-[#475569] ${bn ? "bn" : ""}`}>{value}</div>)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

