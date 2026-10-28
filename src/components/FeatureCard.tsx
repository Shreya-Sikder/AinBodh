import type { LucideIcon } from "lucide-react";

export default function FeatureCard({ icon: Icon, title, description, active = false, onClick }: { icon: LucideIcon; title: string; description: string; active?: boolean; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} className={`card block w-full p-4 text-left transition ${active ? "border-teal bg-tealSoft" : "hover:border-slate-300"}`}>
      <div className="flex size-9 items-center justify-center rounded-lg bg-[#f0f4f8] text-teal"><Icon className="size-4" strokeWidth={1.8} /></div>
      <p className="pt-3 text-[12px] font-bold text-navy">{title}</p>
      <p className="pt-1.5 text-[10px] leading-4 text-muted">{description}</p>
    </Tag>
  );
}

