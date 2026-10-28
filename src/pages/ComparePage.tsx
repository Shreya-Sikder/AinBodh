import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  FileText,
  GitCompare,
  Loader2,
  Plus,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { useRef, useState } from "react";

import { useLanguage } from "../context/LanguageContext";
import { useApp } from "../context/AppContext";
import { compareDocuments, extractDocument } from "../services/api";

type CompareDocument = {
  id: string;
  file: File;
};

type ComparisonStatus =
  | "consistent"
  | "difference"
  | "review";

type ComparisonFinding = {
  id: string;
  topic: string;
  explanation: string;
  excerpts: Array<{ name: string; excerpt: string }>;
  status: ComparisonStatus;
};

export default function ComparePage() {
  const { lang } = useLanguage();
  const { notify } = useApp();

  const bn = lang === "bn";

  const inputRef = useRef<HTMLInputElement | null>(null);

  const [documents, setDocuments] = useState<CompareDocument[]>([]);
  const [isComparing, setIsComparing] = useState(false);
  const [hasCompared, setHasCompared] = useState(false);
  const [findings, setFindings] = useState<ComparisonFinding[]>([]);
  const [progress, setProgress] = useState("");

  const addFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files);

    const supported = incoming.filter((file) => {
      const isPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");

      const isImage =
        file.type.startsWith("image/");

      const isDocx = file.name.toLowerCase().endsWith(".docx");

      return isPdf || isImage || isDocx;
    });

    if (supported.length !== incoming.length) {
      notify(
        bn
          ? "শুধু PDF বা image নথি যোগ করা যাবে।"
          : "Only PDF or image documents can be added."
      );
    }

    setDocuments((current) => {
      const available = 5 - current.length;

      const additions = supported
        .filter(
          (file) =>
            !current.some(
              (item) =>
                item.file.name === file.name &&
                item.file.size === file.size
            )
        )
        .slice(0, available)
        .map((file) => ({
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 7)}`,
          file,
        }));

      if (supported.length > available) {
        notify(
          bn
            ? "সর্বোচ্চ ৫টি নথি তুলনা করা যাবে।"
            : "You can compare up to 5 documents at a time."
        );
      }

      return [...current, ...additions];
    });

    setHasCompared(false);
    setFindings([]);
  };

  const removeDocument = (id: string) => {
    setDocuments((current) =>
      current.filter((document) => document.id !== id)
    );

    setHasCompared(false);
    setFindings([]);
  };

  const clearAll = () => {
    setDocuments([]);
    setHasCompared(false);
    setFindings([]);
  };

  const runComparison = async () => {
    if (documents.length < 2) {
      notify(
        bn
          ? "তুলনা করতে অন্তত ২টি নথি যোগ করুন।"
          : "Add at least 2 documents to compare."
      );
      return;
    }

    setIsComparing(true);
    setHasCompared(false);
    setFindings([]);

    try {
      // 1. Read each document (same extraction + OCR clean-up as the main upload).
      const texts: Array<{ name: string; text: string }> = [];
      for (const [index, item] of documents.entries()) {
        setProgress(
          bn
            ? `নথি ${index + 1}/${documents.length} পড়া হচ্ছে…`
            : `Reading document ${index + 1} of ${documents.length}…`
        );
        const extracted = await extractDocument(item.file);
        texts.push({ name: item.file.name, text: extracted.text });
      }

      // 2. Compare what they say.
      setProgress(bn ? "নথিগুলো তুলনা করা হচ্ছে…" : "Comparing the documents…");
      const result = await compareDocuments(texts, lang);

      const statusFor = (status: string): ComparisonStatus =>
        status === "consistent" ? "consistent" : status === "different" ? "difference" : "review";

      setFindings(
        result.findings.map((finding, index) => ({
          id: `finding-${index}`,
          topic: finding.topic,
          explanation: finding.explanation,
          status: statusFor(finding.status),
          excerpts: finding.documents.map((entry) => ({
            name: entry.documentName,
            excerpt: entry.excerpt,
          })),
        }))
      );
      setHasCompared(true);
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : bn
            ? "নথিগুলো তুলনা করা যায়নি। আবার চেষ্টা করুন।"
            : "The documents could not be compared. Please try again."
      );
    } finally {
      setIsComparing(false);
      setProgress("");
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(0)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileType = (file: File) => {
    if (
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf")
    ) {
      return "PDF";
    }

    return "IMAGE";
  };

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 md:px-8 md:py-8">
      {/* =====================================================
          HEADER
          ===================================================== */}

      <header className="relative overflow-hidden rounded-2xl border border-border bg-white">
        <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-tealSoft/70 blur-3xl" />

        <div className="relative px-5 py-6 md:px-7 md:py-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-[680px]">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-[#f8fafc] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-teal">
                <GitCompare className="size-3" />
                {bn
                  ? "নথি তুলনা"
                  : "Document comparison"}
              </div>

              <h1
                className={`text-[25px] font-bold tracking-[-0.02em] text-navy md:text-[29px] ${
                  bn ? "bn" : ""
                }`}
              >
                {bn
                  ? "নথির মধ্যে পার্থক্য খুঁজুন"
                  : "Compare documents with clarity"}
              </h1>

              <p
                className={`mt-2 max-w-[620px] text-[12px] leading-5 text-muted ${
                  bn ? "bn" : ""
                }`}
              >
                {bn
                  ? "দুই বা তার বেশি নথি পাশাপাশি বিশ্লেষণ করে পরিবর্তন, অসংগতি এবং পর্যালোচনার প্রয়োজনীয় বিষয়গুলো শনাক্ত করুন।"
                  : "Analyze two or more documents side by side to identify changes, inconsistencies, and areas that may need review."}
              </p>
            </div>

            {documents.length > 0 ? (
              <button
                type="button"
                onClick={clearAll}
                className="self-start rounded-lg px-3 py-2 text-[10px] font-semibold text-muted transition hover:bg-slate-50 hover:text-red-600 md:self-auto"
              >
                {bn ? "সব সরান" : "Clear all"}
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {/* =====================================================
          WORKSPACE
          ===================================================== */}

      <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h2
                  className={`text-[13px] font-bold text-navy ${
                    bn ? "bn" : ""
                  }`}
                >
                  {bn
                    ? "তুলনার জন্য নথি"
                    : "Documents to compare"}
                </h2>

                <p
                  className={`mt-1 text-[10px] text-muted ${
                    bn ? "bn" : ""
                  }`}
                >
                  {bn
                    ? `${documents.length}/৫টি নথি যোগ করা হয়েছে`
                    : `${documents.length}/5 documents added`}
                </p>
              </div>

              {documents.length > 0 ? (
                <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[9px] font-semibold text-muted">
                  {documents.length < 2
                    ? bn
                      ? "আরও ১টি প্রয়োজন"
                      : "1 more needed"
                    : bn
                      ? "তুলনার জন্য প্রস্তুত"
                      : "Ready to compare"}
                </span>
              ) : null}
            </div>

            <div className="p-4 md:p-5">
              {documents.length === 0 ? (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="group flex min-h-[270px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-[#fafcfd] px-6 text-center transition hover:border-teal hover:bg-tealSoft/20"
                >
                  <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-white text-teal shadow-sm transition group-hover:scale-105">
                    <Upload className="size-5" />
                  </div>

                  <h3
                    className={`mt-4 text-[13px] font-bold text-navy ${
                      bn ? "bn" : ""
                    }`}
                  >
                    {bn
                      ? "নথি যোগ করে শুরু করুন"
                      : "Add documents to begin"}
                  </h3>

                  <p
                    className={`mt-1.5 max-w-[390px] text-[10px] leading-5 text-muted ${
                      bn ? "bn" : ""
                    }`}
                  >
                    {bn
                      ? "PDF অথবা image নথি এখানে যোগ করুন। তুলনা করার জন্য অন্তত দুটি নথি প্রয়োজন।"
                      : "Upload PDF or image documents here. At least two documents are required for comparison."}
                  </p>

                  <span className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-navy px-3.5 py-2 text-[10px] font-semibold text-white transition group-hover:bg-[#24344f]">
                    <Plus className="size-3.5" />
                    {bn
                      ? "নথি নির্বাচন করুন"
                      : "Choose documents"}
                  </span>

                  <span className="mt-3 text-[9px] text-muted">
                    PDF · JPG · PNG · WEBP
                  </span>
                </button>
              ) : (
                <div className="space-y-3">
                  {documents.map((document, index) => (
                    <div
                      key={document.id}
                      className="group flex items-center gap-3 rounded-xl border border-border bg-white px-3.5 py-3 transition hover:border-slate-300 hover:shadow-sm"
                    >
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-tealSoft text-teal">
                        <FileText className="size-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold text-muted">
                            {index + 1}
                          </span>

                          <p className="truncate text-[11px] font-bold text-navy">
                            {document.file.name}
                          </p>
                        </div>

                        <div className="mt-1 flex items-center gap-2 text-[9px] text-muted">
                          <span>
                            {getFileType(document.file)}
                          </span>
                          <span>·</span>
                          <span>
                            {formatSize(document.file.size)}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          removeDocument(document.id)
                        }
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted opacity-70 transition hover:bg-red-50 hover:text-red-600 md:opacity-0 md:group-hover:opacity-100"
                        aria-label={
                          bn
                            ? "নথি সরান"
                            : "Remove document"
                        }
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}

                  {documents.length < 5 ? (
                    <button
                      type="button"
                      onClick={() =>
                        inputRef.current?.click()
                      }
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-[10px] font-semibold text-teal transition hover:border-teal hover:bg-tealSoft/20"
                    >
                      <Plus className="size-3.5" />
                      {bn
                        ? "আরও নথি যোগ করুন"
                        : "Add another document"}
                    </button>
                  ) : null}

                  <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p
                      className={`text-[9px] leading-4 text-muted ${
                        bn ? "bn" : ""
                      }`}
                    >
                      {documents.length < 2
                        ? bn
                          ? "তুলনা শুরু করতে অন্তত আরও একটি নথি যোগ করুন।"
                          : "Add at least one more document to start."
                        : bn
                          ? "AinBodh নথিগুলোর বিষয়বস্তু বিশ্লেষণ করবে।"
                          : "AinBodh will analyze the uploaded documents."}
                    </p>

                    <button
                      type="button"
                      disabled={
                        documents.length < 2 ||
                        isComparing
                      }
                      onClick={() =>
                        void runComparison()
                      }
                      className="primary-btn !h-10 !px-5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isComparing ? (
                        <>
                          <Loader2 className="mr-2 size-3.5 animate-spin" />
                          {progress ||
                            (bn
                              ? "তুলনা করা হচ্ছে…"
                              : "Comparing…")}
                        </>
                      ) : (
                        <>
                          <GitCompare className="mr-2 size-3.5" />
                          {bn
                            ? "তুলনা শুরু করুন"
                            : "Compare documents"}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* =================================================
              RESULTS
              ================================================= */}

          <div className="mt-5 card overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-navy">
                  <ShieldCheck className="size-4" />
                </div>

                <div>
                  <h2
                    className={`text-[13px] font-bold text-navy ${
                      bn ? "bn" : ""
                    }`}
                  >
                    {bn
                      ? "তুলনার ফলাফল"
                      : "Comparison results"}
                  </h2>

                  <p
                    className={`mt-0.5 text-[10px] text-muted ${
                      bn ? "bn" : ""
                    }`}
                  >
                    {bn
                      ? "নথিগুলোর মধ্যে গুরুত্বপূর্ণ মিল ও অমিল এখানে দেখা যাবে।"
                      : "Important similarities and differences will appear here."}
                  </p>
                </div>
              </div>
            </div>

            {!hasCompared ? (
              <div className="flex min-h-[240px] flex-col items-center justify-center px-6 py-10 text-center">
                <div className="flex size-11 items-center justify-center rounded-xl bg-[#f8fafc] text-muted">
                  <GitCompare className="size-5" />
                </div>

                <p
                  className={`mt-4 text-[11px] font-semibold text-navy ${
                    bn ? "bn" : ""
                  }`}
                >
                  {documents.length < 2
                    ? bn
                      ? "তুলনার ফলাফল এখানে দেখা যাবে"
                      : "Your comparison will appear here"
                    : bn
                      ? "তুলনা চালানোর জন্য প্রস্তুত"
                      : "Ready to analyze"}
                </p>

                <p
                  className={`mt-1.5 max-w-[420px] text-[10px] leading-5 text-muted ${
                    bn ? "bn" : ""
                  }`}
                >
                  {documents.length < 2
                    ? bn
                      ? "প্রথমে অন্তত দুটি নথি যোগ করুন।"
                      : "Add at least two documents first."
                    : bn
                      ? "তুলনা শুরু করুন এবং AinBodh-কে নথিগুলোর মধ্যে পার্থক্য খুঁজতে দিন।"
                      : "Start the comparison to identify differences between the documents."}
                </p>
              </div>
            ) : findings.length === 0 ? (
              <div className="flex min-h-[240px] flex-col items-center justify-center px-6 py-10 text-center">
                <div className="flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <AlertTriangle className="size-5" />
                </div>

                <p
                  className={`mt-4 text-[11px] font-semibold text-navy ${
                    bn ? "bn" : ""
                  }`}
                >
                  {bn
                    ? "তুলনা সম্পন্ন — উল্লেখযোগ্য কোনো বিষয় পাওয়া যায়নি"
                    : "Comparison complete — no notable points were found"}
                </p>

                <p
                  className={`mt-1.5 max-w-[450px] text-[10px] leading-5 text-muted ${
                    bn ? "bn" : ""
                  }`}
                >
                  {bn
                    ? "নথিগুলোর লেখা খুব ছোট বা অস্পষ্ট হলে এমন হতে পারে। প্রয়োজনে পরিষ্কার কপি দিয়ে আবার চেষ্টা করুন।"
                    : "This can happen when the documents are very short or hard to read. Try again with clearer copies if needed."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {findings.map((finding) => (
                  <div
                    key={finding.id}
                    className="p-4 md:p-5"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start">
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-[11px] font-bold text-navy ${
                            bn ? "bn" : ""
                          }`}
                        >
                          {finding.topic}
                        </p>

                        {finding.explanation && (
                          <p
                            className={`mt-1 text-[10px] leading-5 text-muted ${
                              bn ? "bn" : ""
                            }`}
                          >
                            {finding.explanation}
                          </p>
                        )}

                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {finding.excerpts.map((entry, entryIndex) => (
                            <div key={`${finding.id}-${entryIndex}`} className="rounded-lg bg-slate-50 px-3 py-2.5">
                              <p className="truncate text-[8px] font-bold uppercase tracking-[0.1em] text-muted" title={entry.name}>
                                {bn ? `নথি ${entryIndex + 1}` : `Document ${entryIndex + 1}`} · {entry.name}
                              </p>

                              <p
                                className={`mt-1 text-[10px] leading-5 text-[#475569] ${
                                  bn ? "bn" : ""
                                }`}
                              >
                                {entry.excerpt || (
                                  <span className="italic text-muted">
                                    {bn ? "এই নথিতে উল্লেখ নেই" : "Not stated in this document"}
                                  </span>
                                )}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <FindingBadge
                        status={finding.status}
                        bn={bn}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ===================================================
            SIDE INFORMATION
            =================================================== */}

        <aside className="space-y-4">
          <div className="card p-5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-tealSoft text-teal">
              <ShieldCheck className="size-4" />
            </div>

            <h2
              className={`mt-4 text-[12px] font-bold text-navy ${
                bn ? "bn" : ""
              }`}
            >
              {bn
                ? "কী কী খুঁজে দেখবে?"
                : "What will be checked?"}
            </h2>

            <div className="mt-4 space-y-3">
              <InfoRow
                icon={<CheckCircle2 className="size-3.5" />}
                title={
                  bn
                    ? "একই তথ্য"
                    : "Matching information"
                }
                text={
                  bn
                    ? "যে তথ্যগুলো নথিগুলোতে একই রয়েছে।"
                    : "Facts that remain consistent across documents."
                }
                bn={bn}
              />

              <InfoRow
                icon={<AlertTriangle className="size-3.5" />}
                title={
                  bn
                    ? "পার্থক্য"
                    : "Differences"
                }
                text={
                  bn
                    ? "একই বিষয়ে ভিন্ন তথ্য বা পরিবর্তন।"
                    : "Changed or conflicting information."
                }
                bn={bn}
              />

              <InfoRow
                icon={<FileText className="size-3.5" />}
                title={
                  bn
                    ? "পর্যালোচনা"
                    : "Needs review"
                }
                text={
                  bn
                    ? "যে বিষয়গুলো আরও যাচাই করা দরকার।"
                    : "Items that may require closer review."
                }
                bn={bn}
              />
            </div>
          </div>

          <div className="rounded-xl border border-teal/20 bg-tealSoft/40 p-4">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-teal" />

              <div>
                <p
                  className={`text-[10px] font-bold text-navy ${
                    bn ? "bn" : ""
                  }`}
                >
                  {bn
                    ? "নির্ভরযোগ্যতার নোট"
                    : "Reliability note"}
                </p>

                <p
                  className={`mt-1.5 text-[9px] leading-4 text-[#475569] ${
                    bn ? "bn" : ""
                  }`}
                >
                  {bn
                    ? "তুলনার ফলাফল সহায়ক বিশ্লেষণ হিসেবে ব্যবহার করুন এবং গুরুত্বপূর্ণ আইনি সিদ্ধান্তের আগে মূল নথি যাচাই করুন।"
                    : "Use comparison results as an analytical aid and verify the original documents before making important legal decisions."}
                </p>
              </div>
            </div>
          </div>

          {documents.length > 0 ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full items-center justify-between rounded-xl border border-border bg-white px-4 py-3 text-left transition hover:border-teal hover:shadow-sm"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-slate-50 text-teal">
                  <Upload className="size-3.5" />
                </div>

                <div>
                  <p
                    className={`text-[10px] font-bold text-navy ${
                      bn ? "bn" : ""
                    }`}
                  >
                    {bn
                      ? "নথি যোগ করুন"
                      : "Add another document"}
                  </p>

                  <p className="mt-0.5 text-[8px] text-muted">
                    {5 - documents.length}{" "}
                    {bn ? "টি slot বাকি" : "slots remaining"}
                  </p>
                </div>
              </div>

              <ChevronRight className="size-4 text-muted" />
            </button>
          ) : null}
        </aside>
      </section>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files) {
            addFiles(event.target.files);
          }

          event.target.value = "";
        }}
      />

      <p
        className={`mt-5 text-center text-[9px] leading-4 text-muted ${
          bn ? "bn" : ""
        }`}
      >
        {bn
          ? "আপলোড করা নথি এই তুলনা সেশনের জন্য ব্যবহার করা হবে।"
          : "Uploaded documents are used for this comparison session."}
      </p>
    </div>
  );
}

function FindingBadge({
  status,
  bn,
}: {
  status: ComparisonStatus;
  bn: boolean;
}) {
  if (status === "consistent") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1.5 text-[9px] font-semibold text-emerald-700">
        <CheckCircle2 className="size-3" />
        {bn ? "সামঞ্জস্যপূর্ণ" : "Consistent"}
      </span>
    );
  }

  if (status === "difference") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1.5 text-[9px] font-semibold text-red-700">
        <AlertTriangle className="size-3" />
        {bn ? "পার্থক্য" : "Difference"}
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1.5 text-[9px] font-semibold text-amber-700">
      <AlertTriangle className="size-3" />
      {bn ? "পর্যালোচনা" : "Needs review"}
    </span>
  );
}

function InfoRow({
  icon,
  title,
  text,
  bn,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  bn: boolean;
}) {
  return (
    <div className="flex gap-2.5">
      <div className="mt-0.5 shrink-0 text-teal">
        {icon}
      </div>

      <div>
        <p
          className={`text-[10px] font-semibold text-navy ${
            bn ? "bn" : ""
          }`}
        >
          {title}
        </p>

        <p
          className={`mt-0.5 text-[9px] leading-4 text-muted ${
            bn ? "bn" : ""
          }`}
        >
          {text}
        </p>
      </div>
    </div>
  );
}