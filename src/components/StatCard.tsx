import type { LucideIcon } from "lucide-react";

export default function StatCard({ icon: Icon, value, label, detail }: { icon: LucideIcon; value: string; label: string; detail?: string }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-tealSoft text-teal"><Icon className="size-4" /></div>
      <div className="min-w-0"><p className="text-[20px] font-bold text-navy">{value}</p><p className="truncate text-[10px] text-muted">{label}</p>{detail ? <p className="pt-0.5 text-[9px] text-emerald-700">{detail}</p> : null}</div>
    </div>
  );
}

