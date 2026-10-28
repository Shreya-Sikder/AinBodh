import { ExternalLink, Scale } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ChatCitation } from "../../context/AppContext";

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";
const toBanglaDigits = (value: string) => value.replace(/\d/g, (digit) => BANGLA_DIGITS[Number(digit)]);

/** "সাইবার সুরক্ষা আইন, ২০২৬" + 25 -> "সাইবার সুরক্ষা আইন · ধারা ২৫" */
export function citationLabel(citation: ChatCitation, bn: boolean): string {
  const name = citation.title.split(/[,(]/)[0].trim().replace(/^The\s+/i, "");
  const short = name.length > 30 ? `${name.slice(0, 28).trim()}…` : name;
  if (!citation.sectionNumber) return short;
  const isBanglaTitle = /[ঀ-৿]/.test(citation.title);
  const section = isBanglaTitle || bn ? `ধারা ${toBanglaDigits(citation.sectionNumber)}` : `§${citation.sectionNumber}`;
  return `${short} · ${section}`;
}

function SourceCard({ citation, bn, dark }: { citation: ChatCitation; bn: boolean; dark: boolean }) {
  const repealed = Boolean((citation as ChatCitation & { repealedBy?: string }).repealedBy);
  return (
    <div className="min-w-0">
      <div className={`flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide ${dark ? "text-[#8fa3b8]" : "text-[#7b818b]"}`}>
        <Scale className="size-3" />
        Laws of Bangladesh
      </div>
      <p className={`mt-1 text-[12px] font-semibold leading-5 ${dark ? "text-[#e8f0f7]" : "text-[#1f2a3c]"}`}>
        {citation.title}
        {citation.sectionNumber ? (
          <span className={dark ? "text-[#9aaabd]" : "text-[#6b7280]"}>
            {" "}
            · {bn ? `ধারা ${toBanglaDigits(citation.sectionNumber)}` : `Section ${citation.sectionNumber}`}
          </span>
        ) : null}
      </p>
      {repealed && (
        <p className="mt-1 text-[10px] font-semibold text-amber-600">
          {bn ? "রহিত — আর বলবৎ নেই" : "Repealed — no longer in force"}
        </p>
      )}
      {citation.content ? (
        <p className={`mt-1.5 line-clamp-3 text-[11px] leading-5 ${dark ? "text-[#b6c4d2]" : "text-[#4b5563]"}`}>{citation.content}</p>
      ) : null}
      {citation.sourceUrl ? (
        <a
          href={citation.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-teal hover:underline"
        >
          {bn ? "আইনটি খুলুন" : "Open the law"}
          <ExternalLink className="size-3" />
        </a>
      ) : null}
    </div>
  );
}

/** Inline source pill, like ChatGPT: short law name; click for the source card. */
export function CitationPill({ citations, bn, dark }: { citations: ChatCitation[]; bn: boolean; dark: boolean }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const toggle = () => {
    if (open) return setOpen(false);
    const rect = ref.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.min(300, window.innerWidth - 24);
      setPosition({ top: rect.bottom + 6, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)) });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !cardRef.current?.contains(target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const hide = () => setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [open]);

  if (citations.length === 0) return null;
  const first = citations[0];

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={`mx-0.5 inline-flex max-w-[220px] items-center gap-1 rounded-full px-2 py-[1px] align-middle text-[10.5px] font-medium leading-5 transition ${
          dark ? "bg-white/10 text-[#cfe0ee] hover:bg-white/20" : "bg-[#eef0f2] text-[#4b5563] hover:bg-[#e2e5e9] hover:text-[#1f2a3c]"
        }`}
        title={first.title}
      >
        <span className="truncate">{citationLabel(first, bn)}</span>
        {citations.length > 1 && <span className="shrink-0 opacity-70">+{citations.length - 1}</span>}
      </button>

      {open && position && createPortal(
        <div
          ref={cardRef}
          role="dialog"
          style={{ top: position.top, left: position.left }}
          className={`fixed z-[90] w-[300px] max-w-[calc(100vw-24px)] rounded-xl border p-3.5 text-left shadow-xl ${
            dark ? "border-white/10 bg-[#152238]" : "border-[#e5e7eb] bg-white"
          }`}
        >
          <SourceCard citation={citations[index] ?? first} bn={bn} dark={dark} />
          {citations.length > 1 && (
            <div className="mt-3 flex items-center justify-between border-t pt-2 text-[10px] text-muted">
              <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)} className="font-semibold disabled:opacity-40">
                ‹
              </button>
              <span>
                {index + 1} / {citations.length}
              </span>
              <button
                type="button"
                disabled={index === citations.length - 1}
                onClick={() => setIndex(index + 1)}
                className="font-semibold disabled:opacity-40"
              >
                ›
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

/** "Sources" button under a message, expanding to the full list. */
export function SourcesList({ citations, bn, dark }: { citations: ChatCitation[]; bn: boolean; dark: boolean }) {
  const [open, setOpen] = useState(false);
  if (citations.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
          dark ? "border-white/10 text-[#cfe0ee] hover:bg-white/10" : "border-[#e5e7eb] bg-white text-[#374151] hover:bg-[#f5f5f4]"
        }`}
      >
        <span className="flex -space-x-1.5">
          {citations.slice(0, 3).map((citation) => (
            <span
              key={citation.id}
              className={`flex size-4 items-center justify-center rounded-full border ${dark ? "border-[#111c2d] bg-teal/40" : "border-white bg-tealSoft"}`}
            >
              <Scale className="size-2.5 text-teal" />
            </span>
          ))}
        </span>
        {bn ? `উৎস (${toBanglaDigits(String(citations.length))})` : `Sources (${citations.length})`}
      </button>

      {open && (
        <div className={`mt-2 divide-y rounded-xl border ${dark ? "divide-white/10 border-white/10" : "divide-[#eee] border-[#e8e5de] bg-white"}`}>
          {citations.map((citation) => (
            <div key={citation.id} className="p-3">
              <SourceCard citation={citation} bn={bn} dark={dark} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
