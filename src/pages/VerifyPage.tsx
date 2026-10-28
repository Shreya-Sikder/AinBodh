
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Edit3,
  FileCheck2,
  RotateCcw,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  FileText,
  Eye,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useApp } from "../context/AppContext";

export default function VerifyPage() {
  const { lang } = useLanguage();

  const {
    verifiedText,
    setVerifiedText,
    notify,
    selectedDocument,
    pendingFile,
    setPendingInput,
    activeDocument,
    updateActiveDocument,
  } = useApp();

  const navigate = useNavigate();
  const bn = lang === "bn";

  const [editing, setEditing] = useState(true);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);

  const text = verifiedText ?? "";
  const hasText = text.trim().length > 0;

  // The original lives in activeDocument (kept after reloads); pendingFile is the fallback.
  const originalFile: Blob | null = activeDocument?.file ?? pendingFile ?? null;
  const originalType = activeDocument?.mimeType ?? pendingFile?.type ?? "";

  const documentName =
    activeDocument?.name ??
    selectedDocument?.name ??
    pendingFile?.name ??
    (bn ? "নথি" : "Document");

  const documentType =
    selectedDocument?.type ??
    (originalType || (bn ? "নথি" : "Document"));

  const documentBytes = activeDocument?.size ?? selectedDocument?.size ?? pendingFile?.size ?? null;
  const documentSize =
    documentBytes != null ? `${Math.max(1, Math.round(documentBytes / 1024))} KB` : null;

  const documentPages = activeDocument?.pages ?? selectedDocument?.pages ?? null;

  const isImage = originalType.startsWith("image/");
  const isPdf = originalType === "application/pdf";

  // What the OCR clean-up found: quality warnings and words read with low confidence.
  const ocrWarnings = (() => {
    const pages = activeDocument?.pageData ?? [];
    const scanned = pages.filter((page) => page.quality);
    if (scanned.length === 0) return activeDocument?.warnings ?? [];

    const issues = new Set(scanned.flatMap((page) => page.quality?.issues ?? []));
    const unsure = scanned.filter((page) => (page.confidence ?? 100) < 60).map((page) => page.pageNumber);
    const text: Record<string, [string, string]> = {
      blurry: ["ছবিটি ঝাপসা। পড়ার আগে AinBodh ছবিটি পরিষ্কার করেছে, তবুও নাম, তারিখ, টাকার অঙ্ক ও ধারা নম্বর ভালোভাবে মিলিয়ে নিন।", "The image looks blurry. AinBodh cleaned it up before reading, but check names, dates, amounts and section numbers carefully."],
      noisy: ["ছবিতে দানা/নয়েজ আছে। নয়েজ কমিয়ে পড়া হয়েছে; ছোট অক্ষর বা যতিচিহ্ন ভুল হতে পারে।", "The image is grainy. Noise was reduced before reading; small letters and punctuation may still be wrong."],
      dark: ["ছবিটি অন্ধকার। পড়ার আগে উজ্জ্বলতা ঠিক করা হয়েছে।", "The image is dark. Brightness was corrected before reading."],
      overexposed: ["ছবিটি খুব উজ্জ্বল; হালকা লেখা বাদ পড়ে থাকতে পারে।", "The image is very bright; faint text may be missing."],
      low_contrast: ["লেখা অস্পষ্ট (কন্ট্রাস্ট কম)। পড়ার আগে কন্ট্রাস্ট বাড়ানো হয়েছে।", "The text is faint. Contrast was boosted before reading."],
      low_resolution: ["ছবির রেজোলিউশন কম। আরও কাছ থেকে বা উচ্চ রেজোলিউশনে স্ক্যান করলে ফল ভালো হবে।", "The image resolution is low. A closer photo or higher-resolution scan will read better."],
    };
    const lines = Array.from(issues).flatMap((issue) => (text[issue] ? [text[issue][bn ? 0 : 1]] : []));
    if (unsure.length) {
      lines.push(
        bn
          ? `পৃষ্ঠা ${unsure.join(", ")}-এর কিছু অংশ নিশ্চিতভাবে পড়া যায়নি। সম্ভব হলে ভালো আলোতে, সোজা করে ছবি তুলুন।`
          : `Parts of page ${unsure.join(", ")} could not be read with confidence. If possible, retake the photo flat, in focus and in good light.`,
      );
    }
    return lines;
  })();
  const uncertainWords = Array.from(
    new Set((activeDocument?.pageData ?? []).flatMap((page) => page.uncertainWords ?? [])),
  ).slice(0, 20);

  useEffect(() => {
    if (!originalFile) {
      setOriginalUrl(null);
      return;
    }

    const url = URL.createObjectURL(originalFile);
    setOriginalUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [originalFile]);

  const confirm = () => {
    const finalText = verifiedText.trim();

    if (!finalText) {
      notify(
        bn
          ? "বিশ্লেষণের জন্য নথির লেখা প্রয়োজন।"
          : "Document text is required before analysis.",
      );
      return;
    }

    setVerifiedText(finalText);
    // The verified text replaces any earlier analysis of this document.
    updateActiveDocument({ verifiedText: finalText, analysis: null });
    setPendingInput(null, "");
    navigate("/analysis");
  };

  return (
    <div className="mx-auto max-w-[1440px] pb-8">
      {/* Header */}
      <section className="hero-gradient px-6 py-6 text-white md:px-[52px]">
        <p
          className={`text-[10px] font-bold uppercase tracking-[0.7px] text-white/55 ${
            bn ? "bn" : ""
          }`}
        >
          {bn ? "নথি পর্যালোচনা" : "DOCUMENT REVIEW"}
        </p>

        <h1
          className={`pt-2 text-xl font-bold md:text-2xl ${
            bn ? "bn" : ""
          }`}
        >
          {bn
            ? "AinBodh কী বুঝেছে যাচাই করুন"
            : "Review what AinBodh understood"}
        </h1>

        <p
          className={`max-w-2xl pt-2 text-xs leading-6 text-white/70 ${
            bn ? "bn" : ""
          }`}
        >
          {bn
            ? "মূল নথির সঙ্গে বের করা লেখা মিলিয়ে দেখুন। বিশ্লেষণের আগে ভুল সংশোধন করুন।"
            : "Compare the original document with its extracted text. Correct any errors before continuing to analysis."}
        </p>
      </section>

      {/* Authenticity disclaimer */}
      <section className="mx-4 mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 md:mx-[52px]">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber-700" />

        <div>
          <h2
            className={`text-xs font-bold text-amber-950 ${
              bn ? "bn" : ""
            }`}
          >
            {bn
              ? "গুরুত্বপূর্ণ: AinBodh নথির সত্যতা যাচাই করে না"
              : "Important: AinBodh does not verify document authenticity"}
          </h2>

          <p
            className={`mt-1 text-[11px] leading-5 text-amber-900 ${
              bn ? "bn" : ""
            }`}
          >
            {bn
              ? "AinBodh নথির লেখা বের করে, ব্যাখ্যা করে এবং বিশ্লেষণ করে। এটি নথিটি আসল, জাল, আইনগতভাবে বৈধ, অথবা উল্লিখিত কর্তৃপক্ষ কর্তৃক ইস্যু করা হয়েছে কি না তা যাচাই করে না। প্রয়োজনে সংশ্লিষ্ট কর্তৃপক্ষের মাধ্যমে নথির সত্যতা ও বৈধতা যাচাই করুন।"
              : "AinBodh extracts, explains, and analyzes document content. It does not verify whether a document is genuine, forged, legally valid, or issued by the stated authority. Verify authenticity and legal validity with the relevant authority when necessary."}
          </p>
        </div>
      </section>

      {/* Main layout */}
      <div className="grid gap-5 px-4 py-5 md:px-[52px] lg:grid-cols-[minmax(0,1fr)_290px]">
        <main className="min-w-0 space-y-5">
          {/* Original document */}
          <section className="card overflow-hidden">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-tealSoft text-teal">
                <Eye className="size-4" />
              </div>

              <div className="min-w-0 flex-1">
                <h2
                  className={`text-xs font-bold text-navy ${
                    bn ? "bn" : ""
                  }`}
                >
                  {bn ? "মূল নথি" : "Original document"}
                </h2>

                <p className="mt-1 truncate text-[10px] text-muted">
                  {documentName}
                </p>
              </div>

              {originalUrl && (
                <a
                  href={originalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-[10px] font-semibold text-teal underline underline-offset-2"
                >
                  {bn ? "আলাদা করে খুলুন" : "Open separately"}
                </a>
              )}
            </div>

            <div className="flex min-h-[180px] max-h-[560px] items-center justify-center overflow-auto bg-[#f6f7f8] p-3 md:p-5">
              {originalUrl && isImage ? (
                <img
                  src={originalUrl}
                  alt={
                    bn
                      ? "আপলোড করা মূল নথি"
                      : "Uploaded original document"
                  }
                  className="h-auto max-h-[520px] max-w-full rounded-md object-contain shadow-sm"
                />
              ) : originalUrl && isPdf ? (
                <iframe
                  src={originalUrl}
                  title={
                    bn ? "মূল PDF নথি" : "Original PDF document"
                  }
                  className="h-[480px] w-full rounded-md border-0 bg-white"
                />
              ) : (
                <div className="max-w-md px-4 py-8 text-center">
                  <FileText className="mx-auto size-8 text-muted" />

                  <p
                    className={`mt-3 text-xs font-semibold text-navy ${
                      bn ? "bn" : ""
                    }`}
                  >
                    {originalFile
                      ? bn
                        ? "এই ফাইলের সরাসরি প্রিভিউ নেই"
                        : "Preview unavailable for this file type"
                      : bn
                        ? "মূল ফাইলটি এই সেশনে উপলভ্য নয়"
                        : "The original file is not available in this session"}
                  </p>

                  <p
                    className={`mt-2 text-[10px] leading-5 text-muted ${
                      bn ? "bn" : ""
                    }`}
                  >
                    {originalFile
                      ? bn
                        ? "মূল ফাইলটি আলাদা করে খুলে বের করা লেখার সঙ্গে মিলিয়ে নিন।"
                        : "Open the original file separately and compare it with the extracted text."
                      : bn
                        ? "নথির লেখা নিচে পর্যালোচনা করতে পারবেন। মূল নথির সঙ্গে তুলনা করতে হলে সেটি আবার আপলোড করতে হবে।"
                        : "You can review the extracted text below. To compare it with the original, upload the source file again."}
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-border px-5 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted">
                <span>{documentType}</span>

                {documentSize && (
                  <>
                    <span>·</span>
                    <span>{documentSize}</span>
                  </>
                )}

                {documentPages != null && (
                  <>
                    <span>·</span>
                    <span>
                      {documentPages} {bn ? "পৃষ্ঠা" : "pages"}
                    </span>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* Extracted text */}
          <section className="card overflow-hidden">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-tealSoft text-teal">
                <FileCheck2 className="size-4" />
              </div>

              <div className="min-w-0 flex-1">
                <h2
                  className={`text-xs font-bold text-navy ${
                    bn ? "bn" : ""
                  }`}
                >
                  {bn ? "বের করা লেখা" : "Extracted text"}
                </h2>

                <p
                  className={`mt-1 text-[10px] leading-4 text-muted ${
                    bn ? "bn" : ""
                  }`}
                >
                  {bn
                    ? "মূল নথির সঙ্গে মিলিয়ে দেখুন এবং প্রয়োজনে সংশোধন করুন।"
                    : "Compare with the original document and correct any extraction errors."}
                </p>
              </div>

              {hasText ? (
                <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-semibold text-emerald-700">
                  {bn ? "লেখা পাওয়া গেছে" : "Text available"}
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[9px] font-semibold text-amber-700">
                  {bn ? "লেখা নেই" : "No text"}
                </span>
              )}
            </div>

            <div className="p-5">
              {!hasText ? (
                <div className="flex min-h-[250px] items-center justify-center rounded-lg border border-dashed border-amber-200 bg-amber-50/50 p-6 text-center">
                  <div className="max-w-sm">
                    <AlertCircle className="mx-auto size-8 text-amber-600" />

                    <h3
                      className={`mt-3 text-sm font-bold text-[#57471f] ${
                        bn ? "bn" : ""
                      }`}
                    >
                      {bn
                        ? "পাঠযোগ্য লেখা পাওয়া যায়নি"
                        : "No readable text was extracted"}
                    </h3>

                    <p
                      className={`mt-2 text-[11px] leading-5 text-[#7d6d43] ${
                        bn ? "bn" : ""
                      }`}
                    >
                      {bn
                        ? "পরিষ্কার ছবি বা ভালো মানের ফাইল দিয়ে আবার চেষ্টা করুন। AinBodh অনুপস্থিত লেখা নিজে থেকে তৈরি করবে না।"
                        : "Try a clearer image or a better-quality file. AinBodh will not invent missing text."}
                    </p>

                    <button
                      type="button"
                      onClick={() => navigate("/upload")}
                      className="primary-btn mt-4 !px-4 !py-2.5"
                    >
                      {bn ? "আবার আপলোড করুন" : "Upload again"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {(ocrWarnings.length > 0 || uncertainWords.length > 0) && (
                    <div className="mb-4 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
                      <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-700" />
                      <div className="min-w-0">
                        <p className={`text-[11px] font-bold text-amber-950 ${bn ? "bn" : ""}`}>
                          {bn ? "এই অংশগুলো বিশেষভাবে যাচাই করুন" : "Please check these carefully"}
                        </p>
                        {ocrWarnings.length > 0 && (
                          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] leading-5 text-amber-900">
                            {ocrWarnings.slice(0, 6).map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        )}
                        {uncertainWords.length > 0 && (
                          <p className={`mt-1.5 text-[10px] leading-5 text-amber-900 ${bn ? "bn" : ""}`}>
                            {bn ? "অস্পষ্টভাবে পড়া শব্দ: " : "Words read with low confidence: "}
                            <span className="font-semibold">{uncertainWords.join(", ")}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p
                      className={`text-[10px] text-muted ${
                        bn ? "bn" : ""
                      }`}
                    >
                      {bn
                        ? "ভুল থাকলে নিচে সংশোধন করুন"
                        : "Correct any errors in the text below"}
                    </p>

                    <button
                      type="button"
                      onClick={() => setEditing((current) => !current)}
                      className="secondary-btn !px-3 !py-1.5 text-[10px]"
                    >
                      <Edit3 className="mr-1 size-3" />

                      {editing
                        ? bn
                          ? "সম্পাদনা বন্ধ"
                          : "Finish editing"
                        : bn
                          ? "সম্পাদনা"
                          : "Edit text"}
                    </button>
                  </div>

                  <textarea
                    value={verifiedText ?? ""}
                    onChange={(event) =>
                      setVerifiedText(event.target.value)
                    }
                    disabled={!editing}
                    spellCheck
                    aria-label={
                      bn ? "নথির বের করা লেখা" : "Extracted document text"
                    }
                    className={`min-h-[360px] w-full resize-y rounded-lg border border-border bg-[#f8fafc] p-4 text-xs leading-6 text-[#334155] outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/10 disabled:cursor-default disabled:bg-white md:min-h-[430px] ${
                      bn ? "bn" : ""
                    }`}
                  />

                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-teal/15 bg-teal/5 px-3 py-3">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-teal" />

                    <p
                      className={`text-[10px] leading-5 text-muted ${
                        bn ? "bn" : ""
                      }`}
                    >
                      {bn
                        ? "আপনার সংশোধিত লেখাটি পরবর্তী বিশ্লেষণে ব্যবহার করা হবে। গুরুত্বপূর্ণ নাম, তারিখ, টাকা, ধারা ও শর্ত মূল নথির সঙ্গে মিলিয়ে নিন।"
                        : "Your corrected text will be used for the next analysis step. Double-check names, dates, amounts, legal sections, and terms against the original."}
                    </p>
                  </div>
                </>
              )}
            </div>
          </section>
        </main>

        {/* Sidebar */}
        <aside className="space-y-4">
          <section className="card p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="size-5 shrink-0 text-teal" />

              <div>
                <h2
                  className={`text-xs font-bold text-navy ${
                    bn ? "bn" : ""
                  }`}
                >
                  {bn
                    ? "আপনার যাচাই গুরুত্বপূর্ণ"
                    : "Your review matters"}
                </h2>

                <p
                  className={`mt-2 text-[11px] leading-5 text-muted ${
                    bn ? "bn" : ""
                  }`}
                >
                  {bn
                    ? "OCR-এ ভুল হতে পারে। বিশেষ করে নাম, তারিখ, টাকার অঙ্ক, পরিচয় নম্বর এবং আইনের ধারা যাচাই করুন।"
                    : "Text extraction can contain errors. Carefully check names, dates, monetary amounts, identification numbers, and legal sections."}
                </p>
              </div>
            </div>
          </section>

          <section className="card p-5">
            <h2
              className={`text-xs font-bold text-navy ${
                bn ? "bn" : ""
              }`}
            >
              {bn ? "পর্যালোচনার অগ্রগতি" : "Review progress"}
            </h2>

            <div className="mt-4 space-y-4">
              {[
                {
                  done: Boolean(selectedDocument || originalFile),
                  label: bn ? "নথি নির্বাচন" : "Document selected",
                },
                {
                  done: hasText,
                  label: bn ? "লেখা বের করা" : "Text extracted",
                },
                {
                  done: hasText,
                  label: bn ? "লেখা পর্যালোচনা" : "Text reviewed",
                },
              ].map((step) => (
                <div key={step.label} className="flex items-center gap-2.5">
                  {step.done ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                  ) : (
                    <RotateCcw className="size-4 shrink-0 text-muted" />
                  )}

                  <span
                    className={`text-[10px] ${
                      step.done
                        ? "text-muted"
                        : "font-medium text-navy"
                    } ${bn ? "bn" : ""}`}
                  >
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-white p-5">
            <h2
              className={`text-xs font-bold text-navy ${
                bn ? "bn" : ""
              }`}
            >
              {bn ? "পরবর্তী ধাপ" : "Next step"}
            </h2>

            <p
              className={`mt-2 text-[11px] leading-5 text-muted ${
                bn ? "bn" : ""
              }`}
            >
              {bn
                ? "আপনার সংশোধিত লেখা বিশ্লেষণের জন্য পাঠানো হবে। বিশ্লেষণ নথির সত্যতা নিশ্চিত করে না।"
                : "Your corrected text will be sent for analysis. Analysis does not establish that the document is authentic."}
            </p>
          </section>

          <button
            type="button"
            onClick={confirm}
            disabled={!hasText}
            className="primary-btn flex w-full items-center justify-center !py-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 className="mr-2 size-4" />

            <span className={bn ? "bn" : ""}>
              {bn ? "যাচাই করে বিশ্লেষণ করুন" : "Confirm & Analyze"}
            </span>

            <ArrowRight className="ml-2 size-3.5" />
          </button>

          <button
            type="button"
            onClick={() => navigate("/upload")}
            className="secondary-btn flex w-full items-center justify-center"
          >
            {bn ? "আপলোডে ফিরে যান" : "Back to Upload"}
          </button>
        </aside>
      </div>
    </div>
  );
}
