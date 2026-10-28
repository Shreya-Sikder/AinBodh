import { FileSearch } from "lucide-react";
import { Link } from "react-router-dom";

export default function EmptyState({ title, description, action }: { title: string; description: string; action?: string }) {
  return (
    <div className="card flex flex-col items-center justify-center p-12 text-center"><div className="flex size-12 items-center justify-center rounded-full bg-[#f0f4f8] text-slate-400"><FileSearch className="size-6" /></div><h2 className="pt-4 text-[14px] font-bold text-navy">{title}</h2><p className="max-w-md pt-1.5 text-[11px] leading-5 text-muted">{description}</p>{action ? <Link to="/upload" className="primary-btn mt-4">{action}</Link> : null}</div>
  );
}

