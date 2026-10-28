import { AlertTriangle, Info, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

export default function WarningBanner({ variant = "info", title, children }: { variant?: "info" | "warning" | "success"; title?: string; children: ReactNode }) {
  const styles = variant === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" : variant === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-sky-200 bg-sky-50 text-sky-900";
  const Icon = variant === "warning" ? AlertTriangle : variant === "success" ? ShieldCheck : Info;
  return <div className={`flex gap-2.5 rounded-lg border px-3.5 py-3 text-[10px] leading-4 ${styles}`}><Icon className="mt-0.5 size-4 shrink-0" /><div>{title ? <p className="font-bold">{title}</p> : null}<div className={title ? "pt-0.5" : ""}>{children}</div></div></div>;
}

