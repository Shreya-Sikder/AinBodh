import { AlertTriangle, X } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

export default function ConfirmDialog({ title, description, confirmLabel, cancelLabel, onConfirm, onCancel }: { title: string; description: string; confirmLabel: string; cancelLabel: string; onConfirm: () => void; onCancel: () => void }) {
  const { lang } = useLanguage();
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#08101c]/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-[420px] rounded-xl border border-border bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700"><AlertTriangle className="size-4" /></div><div className="min-w-0 flex-1"><h2 className={`text-[14px] font-bold text-navy ${lang === "bn" ? "bn" : ""}`}>{title}</h2><p className={`pt-1.5 text-[11px] leading-5 text-muted ${lang === "bn" ? "bn" : ""}`}>{description}</p></div><button type="button" onClick={onCancel} className="text-muted"><X className="size-4" /></button></div>
        <div className="flex justify-end gap-2 pt-5"><button type="button" onClick={onCancel} className="secondary-btn !px-4 !py-2 text-[11px]">{cancelLabel}</button><button type="button" onClick={onConfirm} className="primary-btn !bg-red-700 !px-4 !py-2 text-[11px]">{confirmLabel}</button></div>
      </div>
    </div>
  );
}

