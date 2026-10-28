import { CalendarDays, FileText, LockKeyhole, Tag } from "lucide-react";
import type { RecentDocument } from "../context/AppContext";
import { useLanguage } from "../context/LanguageContext";

export default function DocumentMeta({ document }: { document: RecentDocument }) {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const uploaded = new Date(document.uploadedAt).toLocaleDateString(bn ? "bn-BD" : "en-US", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-lg border border-border bg-white p-3"><FileText className="size-4 text-teal" /><p className="label pt-2">{bn ? "ফাইল" : "File"}</p><p className="truncate pt-1 text-[11px] font-semibold text-navy">{document.name}</p></div>
      <div className="rounded-lg border border-border bg-white p-3"><Tag className="size-4 text-teal" /><p className="label pt-2">{bn ? "ধরন" : "Type"}</p><p className={`pt-1 text-[11px] font-semibold text-navy ${bn ? "bn" : ""}`}>{document.type}</p></div>
      <div className="rounded-lg border border-border bg-white p-3"><CalendarDays className="size-4 text-teal" /><p className="label pt-2">{bn ? "আপলোড" : "Uploaded"}</p><p className="pt-1 text-[11px] font-semibold text-navy">{uploaded}</p></div>
      <div className="rounded-lg border border-border bg-white p-3"><LockKeyhole className="size-4 text-teal" /><p className="label pt-2">{bn ? "গোপনীয়তা" : "Privacy"}</p><p className={`pt-1 text-[11px] font-semibold text-emerald-700 ${bn ? "bn" : ""}`}>{bn ? "বিশ্লেষণের পরে নয়" : "Not retained after analysis"}</p></div>
    </div>
  );
}

