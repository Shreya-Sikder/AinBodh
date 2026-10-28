import { ExternalLink } from "lucide-react";

export default function Citation({ index, label, onClick }: { index: number; label: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 align-baseline text-[10px] font-bold text-teal underline decoration-teal/40 underline-offset-2 hover:text-navy">
      [{index}] {label}<ExternalLink className="size-2.5" />
    </button>
  );
}

