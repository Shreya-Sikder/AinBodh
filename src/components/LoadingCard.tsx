import { Loader2 } from "lucide-react";

export default function LoadingCard({ title, description, progress = 50 }: { title: string; description: string; progress?: number }) {
  return (
    <div className="card p-7">
      <div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-full bg-tealSoft text-teal"><Loader2 className="size-5 animate-spin" /></div><div><h2 className="text-[14px] font-bold text-navy">{title}</h2><p className="pt-1 text-[10px] text-muted">{description}</p></div></div>
      <div className="mt-5 h-1 overflow-hidden rounded-full bg-[#f0f4f8]"><div className="h-full rounded-full bg-teal transition-all" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div>
      <div className="grid grid-cols-3 gap-2 pt-4 text-center text-[9px] text-muted"><span>Extract</span><span>Analyze</span><span>Review</span></div>
    </div>
  );
}

