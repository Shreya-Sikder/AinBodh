import { CheckCircle2, X } from "lucide-react";
import { useApp } from "../context/AppContext";

export default function Toast() {
  const { toast, clearToast } = useApp();
  if (!toast) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[80] flex max-w-sm items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-4 py-3 text-[12px] text-navy shadow-xl">
      <CheckCircle2 className="size-4 text-teal" />
      <span className="flex-1">{toast}</span>
      <button type="button" onClick={clearToast} className="text-muted hover:text-navy" aria-label="Close notification">
        <X className="size-4" />
      </button>
    </div>
  );
}

