import { FileText, Scale } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

export default function Logo({ dark = true, small = false }: { dark?: boolean; small?: boolean }) {
  const { lang } = useLanguage();
  return (
    <div className="flex items-center gap-2.5">
      <div className={`brand-icon ${small ? "brand-icon-small" : ""}`}>
        <Scale className="size-4 text-white" strokeWidth={2} />
      </div>
      <div className="leading-none">
        <div className={`font-bold ${small ? "text-[13px]" : "text-[14px]"} ${dark ? "text-white" : "text-navy"}`}>
          AinBodh
        </div>
        <div className={`pt-1 text-[10px] ${dark ? "text-white/50" : "text-muted"} ${lang === "bn" ? "bn" : ""}`}>
          {lang === "bn" ? "এআই আইনি সহায়ক" : "AI Legal Assistant"}
        </div>
      </div>
    </div>
  );
}

