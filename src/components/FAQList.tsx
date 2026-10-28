import { ChevronDown } from "lucide-react";
import { useState } from "react";

export type FAQItem = { question: string; answer: string };

export default function FAQList({ items, bn = false }: { items: FAQItem[]; bn?: boolean }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {items.map((item, index) => {
        const expanded = open === index;
        return (
          <div key={item.question} className={`overflow-hidden rounded-lg border ${expanded ? "border-teal bg-[#e7f7fb]" : "border-border bg-white"}`}>
            <button type="button" onClick={() => setOpen(expanded ? null : index)} className="flex w-full items-center justify-between px-3 py-3 text-left">
              <span className={`text-[11px] font-semibold text-navy ${bn ? "bn" : ""}`}>{item.question}</span>
              <ChevronDown className={`size-3.5 text-muted transition ${expanded ? "rotate-180" : ""}`} />
            </button>
            {expanded ? <div className={`px-3 pb-3 text-[10px] leading-4 text-muted ${bn ? "bn" : ""}`}>{item.answer}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

