import { ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Maximize2, Minus, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import type { ActiveDocument } from "../services/documentStore";

type View = "original" | "text";

/** Split verified text that carries "[Page N]" markers back into pages. */
function pagesFromText(text: string): string[] {
  const parts = text.split(/^\s*\[Page\s+(\d+)\]\s*$/im);
  if (parts.length < 3) return text.trim() ? [text.trim()] : [];
  const pages: string[] = [];
  for (let index = 1; index < parts.length; index += 2) {
    pages[Number(parts[index]) - 1] = (parts[index + 1] || "").trim();
  }
  return Array.from(pages, (page) => page ?? "");
}

export default function DocumentViewer({
  page = 1,
  onClose,
  document,
  verifiedText = "",
}: {
  page?: number;
  onClose: () => void;
  /** The uploaded document; null when nothing is available in this browser. */
  document: ActiveDocument | null;
  /** The person's verified/edited text (preferred over raw extraction for the text view). */
  verifiedText?: string;
}) {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  const isPdf = Boolean(document?.mimeType.includes("pdf"));
  const isImage = Boolean(document?.mimeType.startsWith("image/"));
  // Phones (e.g. Chrome on Android) can't show a PDF inside the page; they open it separately.
  const inlinePdf = typeof navigator === "undefined" || (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled !== false;
  const hasOriginal = Boolean(document?.file) && (isImage || (isPdf && inlinePdf));

  const pageTexts = useMemo(() => {
    const fromVerified = verifiedText ? pagesFromText(verifiedText) : [];
    if (fromVerified.length > 1 || !document?.pageData.length) return fromVerified;
    return document.pageData.map((item) => item.text);
  }, [document, verifiedText]);

  const pageCount = Math.max(document?.pages || 0, pageTexts.length, 1);

  const [current, setCurrent] = useState(Math.min(Math.max(page, 1), pageCount));
  const [zoom, setZoom] = useState(100);
  const [view, setView] = useState<View>(hasOriginal ? "original" : "text");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!document?.file) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(document.file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [document?.file]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const name = document?.name || (bn ? "আপলোড করা নথি" : "Uploaded document");
  const kind = isPdf ? "PDF" : isImage ? (bn ? "ছবি" : "Image") : bn ? "নথি" : "Document";
  const pagesLabel = bn ? `${pageCount} পৃষ্ঠা` : `${pageCount} ${pageCount === 1 ? "page" : "pages"}`;

  const download = () => {
    const anchor = window.document.createElement("a");
    if (url) {
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      return;
    }
    const blob = new Blob([pageTexts.join("\n\n")], { type: "text/plain;charset=utf-8" });
    const textUrl = URL.createObjectURL(blob);
    anchor.href = textUrl;
    anchor.download = `${name.replace(/\.[^.]+$/, "")}-text.txt`;
    anchor.click();
    URL.revokeObjectURL(textUrl);
  };

  const toggleFullscreen = async () => {
    try {
      if (window.document.fullscreenElement) {
        await window.document.exitFullscreen();
      } else {
        await window.document.documentElement.requestFullscreen();
      }
    } catch {
      // Fullscreen is optional and can be blocked by the browser.
    }
  };

  const goTo = (next: number) => setCurrent(Math.min(Math.max(next, 1), pageCount));

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#08101c]/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={name}
    >
      <div className="flex h-[min(92vh,850px)] w-[min(1180px,96vw)] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#f4f6f9] shadow-2xl">
        <div className="flex h-14 items-center gap-3 border-b border-white/10 bg-navy px-4 text-white">
          <button type="button" onClick={onClose} className="icon-button-dark" aria-label={bn ? "বন্ধ করুন" : "Close document viewer"}>
            <X className="size-4" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">{name}</p>
            <p className="text-[10px] text-white/45">
              {kind} · {pagesLabel}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            {hasOriginal && (
              <div className="mr-2 hidden rounded-md bg-white/10 p-0.5 sm:flex">
                {(["original", "text"] as View[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setView(option)}
                    className={`rounded px-2.5 py-1 text-[10px] font-semibold ${view === option ? "bg-white text-navy" : "text-white/70 hover:text-white"}`}
                  >
                    {option === "original" ? (bn ? "মূল নথি" : "Original") : bn ? "বের করা লেখা" : "Extracted text"}
                  </button>
                ))}
              </div>
            )}
            {!(view === "original" && isPdf) && (
              <>
                <button type="button" className="viewer-control" onClick={() => setZoom(Math.max(70, zoom - 10))} aria-label="Zoom out">
                  <Minus className="size-3.5" />
                </button>
                <span className="min-w-[46px] text-center text-[10px] text-white/70">{zoom}%</span>
                <button type="button" className="viewer-control" onClick={() => setZoom(Math.min(200, zoom + 10))} aria-label="Zoom in">
                  <Plus className="size-3.5" />
                </button>
              </>
            )}
            <button type="button" onClick={() => void toggleFullscreen()} className="viewer-control ml-2" aria-label="Toggle fullscreen">
              <Maximize2 className="size-3.5" />
            </button>
            {url && isPdf && !inlinePdf && (
              <a
                href={`${url}#page=${current}`}
                target="_blank"
                rel="noreferrer"
                className="viewer-control"
                aria-label={bn ? "মূল নথি আলাদা করে খুলুন" : "Open the original PDF"}
                title={bn ? "মূল নথি খুলুন" : "Open original"}
              >
                <ExternalLink className="size-3.5" />
              </a>
            )}
            <button type="button" onClick={download} className="viewer-control" aria-label={bn ? "ডাউনলোড" : "Download"}>
              <Download className="size-3.5" />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {pageCount > 1 && !(view === "original" && isImage) && (
            <div className="hidden w-52 shrink-0 overflow-y-auto border-r border-border bg-white p-3 md:block">
              <p className="pb-2 text-[10px] font-bold uppercase tracking-wider text-muted">{bn ? "পৃষ্ঠা" : "Pages"}</p>
              <div className="space-y-2">
                {Array.from({ length: pageCount }, (_, index) => (
                  <button
                    type="button"
                    key={index}
                    onClick={() => goTo(index + 1)}
                    className={`flex w-full items-center gap-2 rounded-lg border p-2 text-left ${current === index + 1 ? "border-teal bg-tealSoft" : "border-border bg-white"}`}
                  >
                    <span className="flex size-7 items-center justify-center rounded bg-[#f0f4f8] text-[10px] font-bold text-navy">{index + 1}</span>
                    <span className="truncate text-[10px] text-muted">
                      {pageTexts[index]?.slice(0, 40) || (bn ? `পৃষ্ঠা ${index + 1}` : `Page ${index + 1}`)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col bg-[#e8edf2]">
            {view === "original" && hasOriginal && url ? (
              isPdf ? (
                // The browser's PDF viewer shows the real pages; #page jumps to the cited one.
                <iframe key={`${url}-${current}`} src={`${url}#page=${current}`} title={name} className="h-full w-full flex-1 border-0 bg-white" />
              ) : (
                <div className="flex-1 overflow-auto p-6">
                  <img
                    src={url}
                    alt={bn ? "আপলোড করা মূল নথি" : "Uploaded original document"}
                    className="mx-auto h-auto max-w-none rounded shadow-lg"
                    style={{ width: `${zoom}%` }}
                  />
                </div>
              )
            ) : (
              <div className="flex-1 overflow-auto p-6">
                <div
                  className="mx-auto min-h-[760px] w-[min(760px,90vw)] origin-top rounded border border-slate-200 bg-white p-10 shadow-lg transition-transform"
                  style={{ transform: `scale(${zoom / 100})`, marginBottom: `${(zoom - 100) * 6}px` }}
                >
                  <div className="mb-8 border-b-2 border-navy pb-4">
                    <p className="text-[9px] font-bold uppercase tracking-[2px] text-muted">{bn ? "বের করা লেখা" : "Extracted text"}</p>
                    <h1 className="pt-2 text-xl font-bold text-navy">{name}</h1>
                    <p className="pt-1 text-[10px] text-muted">{bn ? `পৃষ্ঠা ${current} / ${pageCount}` : `Page ${current} of ${pageCount}`}</p>
                  </div>
                  {pageTexts[current - 1] ? (
                    <div className={`whitespace-pre-line text-[12px] leading-7 text-[#334155] ${bn ? "bn" : ""}`}>{pageTexts[current - 1]}</div>
                  ) : (
                    <div className="flex flex-col items-center py-16 text-center text-muted">
                      <FileText className="size-8" />
                      <p className="mt-3 text-[12px]">
                        {document
                          ? bn
                            ? "এই পৃষ্ঠায় কোনো লেখা পাওয়া যায়নি।"
                            : "No text was found on this page."
                          : bn
                            ? "মূল নথিটি এই ব্রাউজারে পাওয়া যায়নি। নথিটি আবার আপলোড করুন।"
                            : "The original document isn't available in this browser. Please upload it again."}
                      </p>
                    </div>
                  )}
                  <div className="mt-14 border-t border-border pt-3 text-[9px] text-muted">
                    {bn
                      ? "এটি নথি থেকে বের করা লেখা। গুরুত্বপূর্ণ তথ্য মূল নথির সঙ্গে মিলিয়ে নিন।"
                      : "This is the text extracted from your document. Check important details against the original."}
                  </div>
                </div>
              </div>
            )}

            {pageCount > 1 && !(view === "original" && isImage) && (
              <div className="flex h-12 items-center justify-center gap-3 border-t border-border bg-white">
                <button type="button" disabled={current === 1} onClick={() => goTo(current - 1)} className="viewer-page-btn">
                  <ChevronLeft className="size-4" /> {bn ? "আগের" : "Previous"}
                </button>
                <span className="text-[11px] font-semibold text-navy">
                  {current} / {pageCount}
                </span>
                <button type="button" disabled={current === pageCount} onClick={() => goTo(current + 1)} className="viewer-page-btn">
                  {bn ? "পরের" : "Next"} <ChevronRight className="size-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
