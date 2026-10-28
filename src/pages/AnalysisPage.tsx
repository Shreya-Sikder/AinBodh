
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  BookOpenText,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileSearch,
  FileText,
  Info,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Volume2,
  X,
} from "lucide-react";

import { useLanguage } from "../context/LanguageContext";
import { useApp } from "../context/AppContext";
import { analyzeDocument } from "../services/api";
import ReadAloud from "../components/ReadAloud";
import DocumentViewer from "../components/DocumentViewer";
import ChatPanel from "../components/ChatPanel";

type UnknownRecord = Record<string, unknown>;

type KeyPoint = {
  label?: string;
  title?: string;
  value?: string;
  description?: string;
  citation?: string;
  source?: string;
  icon?: string;
};

type AttentionItem = {
  title?: string;
  body?: string;
  description?: string;
  level?: string;
  severity?: string;
  citation?: string;
  source?: string;
};

type MissingItem = {
  title?: string;
  body?: string;
  description?: string;
};

type TermItem = {
  name?: string;
  term?: string;
  meaning?: string;
  simple?: string;
  definition?: string;
  explanation?: string;
  example?: string;
  inDocument?: string;
  citation?: string;
};

const asRecord = (value: unknown): UnknownRecord =>
  value && typeof value === "object"
    ? (value as UnknownRecord)
    : {};

const asString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const asArray = <T,>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const field = (
  item: UnknownRecord,
  ...keys: string[]
): string => {
  for (const key of keys) {
    const value = asString(item[key]);
    if (value) return value;
  }
  return "";
};

const normalizeKeyPoint = (value: unknown): KeyPoint => {
  if (typeof value === "string") {
    return { title: value, value: "" };
  }
  return asRecord(value) as KeyPoint;
};

const normalizeAttention = (
  value: unknown,
): AttentionItem => {
  if (typeof value === "string") {
    return { title: value, body: "" };
  }
  return asRecord(value) as AttentionItem;
};

const normalizeMissing = (
  value: unknown,
): MissingItem => {
  if (typeof value === "string") {
    return { title: value, body: "" };
  }
  return asRecord(value) as MissingItem;
};

const normalizeTerm = (value: unknown): TermItem => {
  if (typeof value === "string") {
    return { name: value, definition: "" };
  }
  return asRecord(value) as TermItem;
};

function getSeverity(item: AttentionItem): string {
  return (
    asString(item.level) ||
    asString(item.severity) ||
    "review"
  ).toLowerCase();
}

export default function AnalysisPage() {
  const { lang } = useLanguage();
  const {
    selectedDocument,
    verifiedText,
    setSelectedDocument,
    notify,
    activeDocument,
    updateActiveDocument,
  } = useApp();

  const bn = lang === "bn";

  const [viewerPage, setViewerPage] =
    useState<number | null>(null);

  const [activeTerm, setActiveTerm] = useState(0);
  const [showAllPoints, setShowAllPoints] =
    useState(false);
  const [rechecking, setRechecking] = useState(false);
  // The analysis is saved with the document, so it is still here after a reload.
  const [analysis, setAnalysis] =
    useState<UnknownRecord | null>(
      () => (activeDocument?.analysis as UnknownRecord | null | undefined) ?? null,
    );

  useEffect(() => {
    if (!analysis && activeDocument?.analysis) {
      setAnalysis(activeDocument.analysis as UnknownRecord);
    }
  }, [activeDocument?.analysis, analysis]);
  const [expandedAttention, setExpandedAttention] =
    useState<number | null>(0);
  const [error, setError] = useState("");

  // The chat is NOT reset when this page opens; a new chat is only
  // started when the person asks for one.

  const document = asRecord(selectedDocument);
  const currentAnalysis = analysis ?? document;

  const documentName =
    field(currentAnalysis, "name") ||
    activeDocument?.name ||
    field(document, "name") ||
    (bn ? "আপলোড করা নথি" : "Uploaded document");

  const documentType =
    field(currentAnalysis, "type") ||
    field(document, "type");

  const overview = field(currentAnalysis, "overview");

  const keyPoints = useMemo(
    () =>
      asArray<unknown>(currentAnalysis.keyPoints)
        .map(normalizeKeyPoint)
        .filter(
          (item) =>
            field(item as UnknownRecord, "title", "label") ||
            field(item as UnknownRecord, "value", "description"),
        ),
    [currentAnalysis.keyPoints],
  );

  const attention = useMemo(
    () =>
      asArray<unknown>(currentAnalysis.attention)
        .map(normalizeAttention)
        .filter(
          (item) =>
            field(item as UnknownRecord, "title") ||
            field(item as UnknownRecord, "body", "description"),
        ),
    [currentAnalysis.attention],
  );

  const missing = useMemo(
    () =>
      asArray<unknown>(currentAnalysis.missing)
        .map(normalizeMissing)
        .filter(
          (item) =>
            field(item as UnknownRecord, "title") ||
            field(item as UnknownRecord, "body", "description"),
        ),
    [currentAnalysis.missing],
  );

  const contradictions = useMemo(
    () =>
      asArray<unknown>(currentAnalysis.contradictions)
        .map(normalizeMissing)
        .filter(
          (item) =>
            field(item as UnknownRecord, "title") ||
            field(item as UnknownRecord, "body", "description"),
        ),
    [currentAnalysis.contradictions],
  );

  const terms = useMemo(
    () =>
      asArray<unknown>(currentAnalysis.terms)
        .map(normalizeTerm)
        .filter(
          (item) =>
            field(item as UnknownRecord, "name", "term"),
        ),
    [currentAnalysis.terms],
  );

  const citations = asArray<unknown>(
    currentAnalysis.citations,
  );

  const hasVerifiedText =
    typeof verifiedText === "string" &&
    verifiedText.trim().length > 0;

  const reviewed =
    asString(currentAnalysis.status) === "Reviewed" &&
    Boolean(overview || keyPoints.length || attention.length);

  const citationPage = (citation: string) => {
    const match = citation.match(
      /(?:page|পৃষ্ঠা)\s*([0-9০-৯]+)/i,
    );

    if (match) {
      setViewerPage(Number(match[1].replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)))));
      return;
    }

    // A law citation such as [C1] opens the official Laws of Bangladesh page.
    const lawId = citation.match(/C\d+/)?.[0];
    const law = lawId
      ? (citations as UnknownRecord[]).find((item) => asString(item?.id) === lawId)
      : undefined;
    const url = law ? asString(law.sourceUrl) : "";
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else if (citation) {
      notify(citation);
    }
  };

  const reanalyze = async () => {
    if (!hasVerifiedText) {
      notify(
        bn
          ? "বিশ্লেষণের জন্য যাচাইকৃত নথির লেখা পাওয়া যায়নি। অনুগ্রহ করে নথিটি আবার আপলোড করুন।"
          : "No verified document text is available. Please upload the document again.",
      );
      return;
    }

    setRechecking(true);
    setError("");

    try {
      const result = await analyzeDocument({
        text: verifiedText,
        language: lang,
        documentName: activeDocument?.name || field(document, "name") || undefined,
        pages: activeDocument?.pages,
      });

      const nextAnalysis = {
        ...asRecord(result),
        ...asRecord(result.document),
        overview: result.overview,
        keyPoints: result.keyPoints,
        attention: result.attention,
        missing: result.missing,
        contradictions: result.contradictions,
        terms: result.terms,
        citations: result.citations,
      };

      setAnalysis(nextAnalysis);
      setSelectedDocument(result.document);
      updateActiveDocument({ analysis: nextAnalysis });

      notify(
        bn
          ? "নথির বিশ্লেষণ হালনাগাদ হয়েছে।"
          : "Document analysis has been updated.",
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : bn
            ? "নথি বিশ্লেষণ করা যায়নি। আবার চেষ্টা করুন।"
            : "The document could not be analyzed. Please try again.";

      setError(message);
      notify(message);
    } finally {
      setRechecking(false);
    }
  };

  // "Confirm & Analyze" on the Verify page lands here: start the analysis automatically once.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || rechecking || analysis || activeDocument?.analysis) return;
    if (!hasVerifiedText || asString(document.status) === "Reviewed") return;
    autoStarted.current = true;
    void reanalyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasVerifiedText, analysis, activeDocument?.analysis]);

  const downloadSummary = () => {
    const lines: string[] = [
      "AinBodh — Document Analysis",
      `Document: ${documentName}`,
      "",
      "OVERVIEW",
      overview || "No overview available.",
      "",
      "KEY POINTS",
      ...keyPoints.map((point) => {
        const item = point as UnknownRecord;
        return `• ${field(item, "title", "label")}: ${field(item, "value", "description")}`;
      }),
      "",
      "AREAS REQUIRING ATTENTION",
      ...attention.map((item) => {
        const record = item as UnknownRecord;
        return `• ${field(record, "title")}: ${field(record, "body", "description")}`;
      }),
      "",
      "POSSIBLE INCONSISTENCIES",
      ...contradictions.map((item) => {
        const record = item as UnknownRecord;
        return `• ${field(record, "title")}: ${field(record, "body", "description")}`;
      }),
      "",
      "INFORMATION NOT FOUND",
      ...missing.map((item) => {
        const record = item as UnknownRecord;
        return `• ${field(record, "title")}: ${field(record, "body", "description")}`;
      }),
      "",
      "Note: This is an informational document summary, not legal advice.",
    ];

    const blob = new Blob(
      [lines.join("\n")],
      { type: "text/plain;charset=utf-8" },
    );

    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = "ainbodh-analysis.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="analysis-page">
      <style>{`
        .analysis-page {
          --ab-ink: #25372f;
          --ab-muted: #77817a;
          --ab-line: #e5e8df;
          --ab-paper: #fbfaf6;
          --ab-card: #fffefa;
          --ab-green: #466d5c;
          --ab-green-soft: #edf3ed;
          --ab-amber: #987442;
          --ab-amber-soft: #f8f2e7;
          color: var(--ab-ink);
          background: var(--ab-paper);
          min-height: 100%;
          padding: clamp(16px, 3vw, 34px);
          font-family: inherit;
        }

        .ab-shell {
          max-width: 1120px;
          margin: 0 auto;
        }

        .ab-enter {
          animation: ab-rise-in .48s ease both;
        }

        .ab-delay-1 { animation-delay: 50ms; }
        .ab-delay-2 { animation-delay: 100ms; }
        .ab-delay-3 { animation-delay: 150ms; }

        @keyframes ab-rise-in {
          from { opacity: 0; transform: translateY(9px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .ab-card {
          background: var(--ab-card);
          border: 1px solid var(--ab-line);
          border-radius: 16px;
          box-shadow: 0 3px 14px rgba(45, 58, 47, .025);
          transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
          min-width: 0;
        }

        .ab-card:hover {
          border-color: #d7dfd3;
          box-shadow: 0 7px 22px rgba(45, 58, 47, .045);
        }

        .ab-section {
          margin-top: 30px;
        }

        .ab-section-heading {
          margin-bottom: 13px;
        }

        .ab-eyebrow {
          color: var(--ab-green);
          font-size: 10px;
          font-weight: 750;
          letter-spacing: .14em;
          text-transform: uppercase;
        }

        .ab-heading {
          color: var(--ab-ink);
          font-size: clamp(17px, 2vw, 21px);
          font-weight: 700;
          letter-spacing: -.035em;
          line-height: 1.35;
        }

        .ab-subtitle {
          color: var(--ab-muted);
          font-size: 12px;
          line-height: 1.75;
          margin-top: 5px;
          max-width: 680px;
        }

        .ab-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 10px;
          padding: 9px 12px;
          font-size: 11px;
          font-weight: 650;
          border: 1px solid var(--ab-line);
          background: #fffefa;
          color: var(--ab-ink);
          cursor: pointer;
          transition: background .18s ease, border-color .18s ease, transform .18s ease;
        }

        .ab-button:hover {
          background: #f1f4ed;
          border-color: #d1dbcf;
        }

        .ab-button:active { transform: translateY(1px); }
        .ab-button:disabled { opacity: .55; cursor: not-allowed; }

        .ab-button-primary {
          background: var(--ab-green);
          color: white;
          border-color: var(--ab-green);
        }

        .ab-button-primary:hover {
          background: #385b4b;
          border-color: #385b4b;
        }

        .ab-text-button {
          color: var(--ab-green);
          background: transparent;
          border: 0;
          padding: 5px 0;
          font-size: 11px;
          font-weight: 650;
          cursor: pointer;
          text-align: left;
        }

        .ab-text-button:hover { text-decoration: underline; }

        .ab-overview {
          padding: clamp(17px, 2.6vw, 25px);
        }

        .ab-overview-text {
          color: #3f4d44;
          font-size: 13px;
          line-height: 1.95;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .ab-soft-note {
          border-radius: 10px;
          padding: 11px 13px;
          background: #f5f5ef;
          color: #727b72;
          font-size: 10px;
          line-height: 1.7;
          margin-top: 17px;
        }

        .ab-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .ab-point {
          padding: 16px;
          min-height: 126px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 9px;
        }

        .ab-point-label {
          color: #7a837a;
          font-size: 11px;
          line-height: 1.6;
          font-weight: 600;
        }

        .ab-point-value {
          color: var(--ab-ink);
          font-size: 13px;
          font-weight: 650;
          line-height: 1.7;
          overflow-wrap: anywhere;
        }

        .ab-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 999px;
          background: var(--ab-green-soft);
          color: var(--ab-green);
          padding: 5px 9px;
          font-size: 10px;
          font-weight: 650;
        }

        .ab-alert {
          display: grid;
          grid-template-columns: 28px minmax(0, 1fr);
          gap: 12px;
          padding: 16px;
        }

        .ab-alert-icon {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          background: var(--ab-amber-soft);
          color: var(--ab-amber);
        }

        .ab-alert-title {
          font-size: 12px;
          font-weight: 700;
          line-height: 1.65;
          color: var(--ab-ink);
        }

        .ab-body {
          color: #68736a;
          font-size: 12px;
          line-height: 1.8;
          margin-top: 5px;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .ab-citation {
          color: var(--ab-green);
          font-size: 10px;
          font-weight: 600;
          margin-top: 8px;
        }

        .ab-term-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .ab-term {
          border: 1px solid var(--ab-line);
          border-radius: 999px;
          background: #fffefa;
          padding: 8px 12px;
          color: #647067;
          font-size: 11px;
          cursor: pointer;
          transition: all .18s ease;
        }

        .ab-term:hover { border-color: #b7c9b8; }

        .ab-term-active {
          background: var(--ab-green-soft);
          color: var(--ab-green);
          border-color: #cfddcf;
          font-weight: 700;
        }

        .ab-empty {
          border: 1px dashed #d9dfd5;
          background: #f8f8f2;
          border-radius: 13px;
          padding: 20px;
          color: var(--ab-muted);
          font-size: 12px;
          line-height: 1.8;
        }

        .ab-doc-header {
          border: 1px solid var(--ab-line);
          border-radius: 19px;
          padding: clamp(19px, 3vw, 30px);
          background:
            radial-gradient(ellipse at top right, rgba(205, 220, 200, .30), transparent 55%),
            linear-gradient(135deg, #f5f5ec, #fbfaf6 66%);
        }

        .ab-doc-title {
          font-size: clamp(21px, 3vw, 29px);
          letter-spacing: -.045em;
          line-height: 1.3;
          font-weight: 750;
          color: var(--ab-ink);
          overflow-wrap: anywhere;
        }

        .ab-doc-meta {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 9px;
          margin-top: 13px;
        }

        .ab-doc-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
        }

        .ab-divider {
          height: 1px;
          background: var(--ab-line);
          margin: 18px 0;
        }

        .ab-legal-note {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          color: #778078;
          font-size: 10px;
          line-height: 1.8;
          padding: 14px 2px 0;
        }

        .ab-error {
          background: #faf0e9;
          border: 1px solid #ead4c7;
          color: #8b5139;
          padding: 12px 14px;
          border-radius: 11px;
          font-size: 12px;
          line-height: 1.7;
          margin-top: 14px;
        }

        .ab-empty-icon {
          width: 38px;
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #edf2eb;
          color: var(--ab-green);
          border-radius: 12px;
          margin-bottom: 12px;
        }

        .ab-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .ab-muted { color: var(--ab-muted); }

        @media (max-width: 760px) {
          .ab-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .ab-section { margin-top: 24px; }
        }

        @media (max-width: 480px) {
          .analysis-page { padding: 13px; }
          .ab-grid { grid-template-columns: 1fr; }
          .ab-point { min-height: auto; }
          .ab-row { align-items: flex-start; flex-direction: column; }
          .ab-doc-actions { width: 100%; }
          .ab-doc-actions .ab-button { flex: 1; }
        }

        @media (prefers-reduced-motion: reduce) {
          .ab-enter { animation: none; }
          .ab-card, .ab-button, .ab-term { transition: none; }
        }
      `}</style>

      <div className="ab-shell">
        <header className="ab-doc-header ab-enter">
          <div className="ab-row">
            <div style={{ minWidth: 0 }}>
              <div className="ab-eyebrow">
                {bn ? "নথি বিশ্লেষণ" : "DOCUMENT ANALYSIS"}
              </div>

              <h1 className="ab-doc-title" style={{ marginTop: 9 }}>
                {documentName}
              </h1>

              <div className="ab-doc-meta">
                <span className="ab-chip">
                  <FileText size={13} />
                  {documentType ||
                    (bn ? "আপলোড করা নথি" : "Uploaded document")}
                </span>

                {reviewed ? (
                  <span className="ab-chip">
                    <Check size={12} />
                    {bn ? "বিশ্লেষণ সম্পন্ন" : "Analysis available"}
                  </span>
                ) : (
                  <span className="ab-chip">
                    <Info size={12} />
                    {bn ? "বিশ্লেষণের তথ্য" : "Analysis details"}
                  </span>
                )}
              </div>
            </div>

            <div className="ab-doc-actions">
              {hasVerifiedText && (
                <button
                  type="button"
                  className="ab-button"
                  onClick={() => void reanalyze()}
                  disabled={rechecking}
                >
                  {rechecking ? (
                    <LoaderCircle size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  {bn ? "আবার বিশ্লেষণ" : "Re-analyze"}
                </button>
              )}

              {hasVerifiedText && (
                <button
                  type="button"
                  className="ab-button ab-button-primary"
                  onClick={downloadSummary}
                  disabled={!overview && keyPoints.length === 0}
                >
                  <ArrowDownToLine size={14} />
                  {bn ? "সারাংশ সংরক্ষণ" : "Save summary"}
                </button>
              )}
            </div>
          </div>

          <div className="ab-divider" />

          <div className="ab-row">
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 9,
                maxWidth: 680,
              }}
            >
              <ShieldCheck
                size={16}
                color="#547663"
                style={{ flexShrink: 0, marginTop: 2 }}
              />
              <p className="ab-muted" style={{ fontSize: 11, lineHeight: 1.8 }}>
                {bn
                  ? "বিশ্লেষণটি উপলব্ধ নথির লেখার ভিত্তিতে তৈরি। গুরুত্বপূর্ণ সিদ্ধান্তের আগে মূল নথি যাচাই করুন।"
                  : "This analysis is based on the document text available to AinBodh. Review the original document before making important decisions."}
              </p>
            </div>

            {hasVerifiedText && (
              <button
                type="button"
                className="ab-button"
                onClick={() => setViewerPage(1)}
              >
                <FileSearch size={14} />
                {bn ? "নথি দেখুন" : "View document"}
              </button>
            )}
          </div>
        </header>

        {error && (
          <div className="ab-error" role="alert">
            <div style={{ display: "flex", gap: 9 }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError("")}
                aria-label={bn ? "বন্ধ করুন" : "Dismiss"}
                style={{
                  marginLeft: "auto",
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  color: "inherit",
                }}
              >
                <X size={15} />
              </button>
            </div>
          </div>
        )}

        {!overview && keyPoints.length === 0 && attention.length === 0 ? (
          <section className="ab-card ab-enter" style={{ padding: 25, marginTop: 20 }}>
            <div className="ab-empty-icon">
              <FileSearch size={19} />
            </div>
            <h2 className="ab-heading">
              {bn ? "এখনও কোনো বিশ্লেষণ দেখানোর নেই" : "Your analysis will appear here"}
            </h2>
            <p className="ab-subtitle">
              {hasVerifiedText
                ? bn
                  ? "নথির লেখা প্রস্তুত আছে। বিশ্লেষণ শুরু করতে নিচের বোতামটি চাপুন।"
                  : "Verified document text is available. Start the analysis to see the overview, key points, and areas to review."
                : bn
                  ? "প্রথমে একটি নথি আপলোড করে তার লেখা যাচাই করুন।"
                  : "Upload a document and verify its extracted text before analyzing it."}
            </p>

            {hasVerifiedText && (
              <button
                type="button"
                className="ab-button ab-button-primary"
                style={{ marginTop: 17 }}
                onClick={() => void reanalyze()}
                disabled={rechecking}
              >
                {rechecking ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : (
                  <FileSearch size={14} />
                )}
                {rechecking
                  ? bn ? "বিশ্লেষণ হচ্ছে…" : "Analyzing…"
                  : bn ? "নথি বিশ্লেষণ করুন" : "Analyze document"}
              </button>
            )}
          </section>
        ) : (
          <>
            <section className="ab-section ab-enter ab-delay-1">
              <div className="ab-section-heading">
                <div className="ab-eyebrow">
                  {bn ? "প্রথমে এটি পড়ুন" : "START HERE"}
                </div>
                <h2 className="ab-heading" style={{ marginTop: 5 }}>
                  {bn ? "সংক্ষিপ্ত পরিচিতি" : "The short version"}
                </h2>
                <p className="ab-subtitle">
                  {bn
                    ? "নথিটির মূল বক্তব্য সহজ ভাষায় বুঝুন।"
                    : "A plain-language overview of what the available document text says."}
                </p>
              </div>

              <div className="ab-card ab-overview">
                {overview ? (
                  <>
                    <p className="ab-overview-text">{overview}</p>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        marginTop: 18,
                        paddingTop: 14,
                        borderTop: "1px solid var(--ab-line)",
                      }}
                    >
                      <span className="ab-muted" style={{ fontSize: 10 }}>
                        {bn
                          ? "প্রয়োজনে পুরো নথি দেখে নিন।"
                          : "Check the original text for important details."}
                      </span>
                      <ReadAloud
                        text={overview}
                        label={bn ? "পরিচিতি শুনুন" : "Listen to overview"}
                      />
                    </div>
                  </>
                ) : (
                  <p className="ab-body">
                    {bn
                      ? "সারসংক্ষেপ তৈরি করা যায়নি। মূল নথি এবং অন্যান্য বিশ্লেষণের অংশ দেখুন।"
                      : "No overview was returned. Review the available findings and original document."}
                  </p>
                )}
              </div>
            </section>

            <section className="ab-section ab-enter ab-delay-2">
              <div className="ab-section-heading">
                <div className="ab-eyebrow">
                  {bn ? "নথি থেকে শনাক্ত" : "IDENTIFIED IN THE TEXT"}
                </div>
                <h2 className="ab-heading" style={{ marginTop: 5 }}>
                  {bn ? "মূল বিষয়গুলো" : "Key points"}
                </h2>
              </div>

              {keyPoints.length ? (
                <>
                  <div className="ab-grid">
                    {(showAllPoints
                      ? keyPoints
                      : keyPoints.slice(0, 6)
                    ).map((point, index) => {
                      const item = point as UnknownRecord;
                      const title = field(item, "title", "label");
                      const value = field(item, "value", "description");
                      const citation = field(item, "citation", "source");

                      return (
                        <article
                          key={`${title}-${index}`}
                          className="ab-card ab-point"
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <span
                              style={{
                                width: 25,
                                height: 25,
                                borderRadius: 8,
                                background: "#edf2eb",
                                color: "#547663",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              <BookOpenText size={13} />
                            </span>
                            <span className="ab-point-label">{title}</span>
                          </div>

                          {value && (
                            <p className="ab-point-value">{value}</p>
                          )}

                          {citation && (
                            <button
                              type="button"
                              className="ab-text-button"
                              onClick={() => citationPage(citation)}
                            >
                              {citation}
                            </button>
                          )}

                          {value && (
                            <div style={{ marginTop: "auto", paddingTop: 5 }}>
                              <ReadAloud
                                text={`${title}. ${value}`}
                                label={bn ? "শুনুন" : "Listen"}
                              />
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>

                  {keyPoints.length > 6 && (
                    <button
                      type="button"
                      className="ab-button"
                      style={{ marginTop: 12 }}
                      onClick={() => setShowAllPoints((value) => !value)}
                    >
                      <ChevronDown
                        size={14}
                        style={{
                          transform: showAllPoints ? "rotate(180deg)" : "none",
                          transition: "transform .2s ease",
                        }}
                      />
                      {showAllPoints
                        ? bn ? "কম দেখুন" : "Show less"
                        : bn ? "সব বিষয় দেখুন" : `Show all ${keyPoints.length} points`}
                    </button>
                  )}
                </>
              ) : (
                <div className="ab-empty">
                  {bn
                    ? "বিশ্লেষণে আলাদা করে কোনো মূল বিষয় ফেরত আসেনি।"
                    : "No separate key points were returned by the analysis."}
                </div>
              )}
            </section>

            <section className="ab-section ab-enter ab-delay-3">
              <div className="ab-section-heading">
                <div className="ab-eyebrow">
                  {bn ? "আরও একবার দেখে নিন" : "TAKE A CLOSER LOOK"}
                </div>
                <h2 className="ab-heading" style={{ marginTop: 5 }}>
                  {bn ? "পর্যালোচনার বিষয়" : "Areas to review"}
                </h2>
                <p className="ab-subtitle">
                  {bn
                    ? "এগুলো আরও যাচাই করার মতো বিষয়—এগুলো নিজে থেকেই কোনো ধারাকে বেআইনি প্রমাণ করে না।"
                    : "These are points worth checking. A flagged issue does not, by itself, establish that a clause is unlawful."}
                </p>
              </div>

              {attention.length ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {attention.map((item, index) => {
                    const record = item as UnknownRecord;
                    const title = field(record, "title") ||
                      (bn ? "পর্যালোচনার বিষয়" : "Point to review");
                    const body = field(record, "body", "description");
                    const citation = field(record, "citation", "source");
                    const severity = getSeverity(item);
                    const isExpanded = expandedAttention === index;

                    return (
                      <article className="ab-card" key={`${title}-${index}`}>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedAttention(isExpanded ? null : index)
                          }
                          aria-expanded={isExpanded}
                          style={{
                            display: "flex",
                            width: "100%",
                            alignItems: "center",
                            gap: 12,
                            padding: 15,
                            textAlign: "left",
                            background: "transparent",
                            border: 0,
                            cursor: "pointer",
                          }}
                        >
                          <span className="ab-alert-icon">
                            {severity === "high" || severity === "critical" ? (
                              <AlertCircle size={15} />
                            ) : severity === "info" ? (
                              <Info size={15} />
                            ) : (
                              <CircleHelp size={15} />
                            )}
                          </span>

                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span className="ab-alert-title">{title}</span>
                            <span
                              style={{
                                display: "block",
                                color: "#8b927f",
                                fontSize: 10,
                                marginTop: 3,
                              }}
                            >
                              {severity === "high" || severity === "critical"
                                ? bn ? "বিশেষভাবে যাচাই করুন" : "Needs careful review"
                                : bn ? "আরও যাচাই করুন" : "Worth reviewing"}
                            </span>
                          </span>

                          <ChevronRight
                            size={16}
                            color="#8a9389"
                            style={{
                              flexShrink: 0,
                              transform: isExpanded ? "rotate(90deg)" : "none",
                              transition: "transform .18s ease",
                            }}
                          />
                        </button>

                        {isExpanded && (
                          <div
                            style={{
                              padding: "0 16px 16px 55px",
                              animation: "ab-rise-in .2s ease both",
                            }}
                          >
                            {body && <p className="ab-body">{body}</p>}
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 14,
                                alignItems: "center",
                                marginTop: 9,
                              }}
                            >
                              {citation && (
                                <button
                                  type="button"
                                  className="ab-text-button"
                                  onClick={() => citationPage(citation)}
                                >
                                  {citation}
                                </button>
                              )}
                              {body && (
                                <ReadAloud
                                  text={`${title}. ${body}`}
                                  label={bn ? "শুনুন" : "Listen"}
                                />
                              )}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="ab-empty">
                  {bn
                    ? "আলাদা কোনো সতর্কতার বিষয় ফেরত আসেনি। এর অর্থ এই নয় যে নথিটি ত্রুটিমুক্ত।"
                    : "No separate review flags were returned. This does not guarantee that the document is error-free."}
                </div>
              )}
            </section>

            {contradictions.length > 0 && (
              <section className="ab-section">
                <div className="ab-section-heading">
                  <h2 className="ab-heading">
                    {bn ? "সম্ভাব্য অসংগতি" : "Possible inconsistencies"}
                  </h2>
                  <p className="ab-subtitle">
                    {bn
                      ? "বিশ্লেষণে পাওয়া পরস্পরবিরোধী বা মিলিয়ে দেখার মতো তথ্য।"
                      : "Details the analysis identified as potentially conflicting or needing comparison."}
                  </p>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {contradictions.map((item, index) => {
                    const record = item as UnknownRecord;
                    const title = field(record, "title") ||
                      (bn ? "সম্ভাব্য অসংগতি" : "Possible inconsistency");
                    const body = field(record, "body", "description");
                    const citation = field(record, "citation");

                    return (
                      <article className="ab-card ab-alert" key={`${title}-${index}`}>
                        <div className="ab-alert-icon">
                          <RefreshCw size={15} />
                        </div>
                        <div>
                          <h3 className="ab-alert-title">{title}</h3>
                          <p className="ab-body">{body}</p>
                          {citation && (
                            <button
                              type="button"
                              className="ab-text-button"
                              onClick={() => citationPage(citation)}
                            >
                              {citation}
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="ab-section">
              <div className="ab-section-heading">
                <h2 className="ab-heading">
                  {bn ? "যে তথ্যগুলো পাওয়া যায়নি" : "Information not found"}
                </h2>
                <p className="ab-subtitle">
                  {bn
                    ? "কোনো তথ্য খুঁজে না পাওয়া মানেই সেটি আইনত বাধ্যতামূলক নয়।"
                    : "Not finding a detail does not automatically mean that it is legally required."}
                </p>
              </div>

              {missing.length ? (
                <div className="ab-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 245px), 1fr))" }}>
                  {missing.map((item, index) => {
                    const record = item as UnknownRecord;
                    const title = field(record, "title") ||
                      (bn ? "অনুপস্থিত তথ্য" : "Information not found");
                    const body = field(record, "body", "description");

                    return (
                      <article className="ab-card" style={{ padding: 16 }} key={`${title}-${index}`}>
                        <div style={{ display: "flex", gap: 10 }}>
                          <span className="ab-alert-icon">
                            <Info size={14} />
                          </span>
                          <div>
                            <h3 className="ab-alert-title">{title}</h3>
                            <p className="ab-body">{body}</p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="ab-empty">
                  {bn
                    ? "বিশ্লেষণে আলাদা অনুপস্থিত তথ্যের তালিকা ফেরত আসেনি।"
                    : "No separate list of missing information was returned."}
                </div>
              )}
            </section>

            <section className="ab-section">
              <div className="ab-section-heading">
                <h2 className="ab-heading">
                  {bn ? "আইনি শব্দ সহজ ভাষায়" : "Legal terms, explained simply"}
                </h2>
                <p className="ab-subtitle">
                  {bn
                    ? "বিশ্লেষণে শনাক্ত করা শব্দ নির্বাচন করে ব্যাখ্যা পড়ুন।"
                    : "Select a term identified by the analysis to see its explanation."}
                </p>
              </div>

              {terms.length ? (
                <>
                  <div className="ab-term-list">
                    {terms.map((item, index) => {
                      const record = item as UnknownRecord;
                      const name = field(record, "name", "term");
                      return (
                        <button
                          key={`${name}-${index}`}
                          type="button"
                          className={`ab-term ${activeTerm === index ? "ab-term-active" : ""}`}
                          onClick={() => setActiveTerm(index)}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>

                  {terms[activeTerm] && (
                    <article className="ab-card" style={{ padding: 20, marginTop: 12 }}>
                      <h3 className="ab-heading" style={{ fontSize: 16 }}>
                        {field(
                          terms[activeTerm] as UnknownRecord,
                          "name",
                          "term",
                        )}
                      </h3>

                      <p className="ab-eyebrow" style={{ marginTop: 17 }}>
                        {bn ? "সহজ ব্যাখ্যা" : "IN SIMPLE LANGUAGE"}
                      </p>

                      <p className="ab-body" style={{ fontSize: 13 }}>
                        {field(
                          terms[activeTerm] as UnknownRecord,
                          "meaning",
                          "simple",
                          "definition",
                          "explanation",
                        ) ||
                          (bn
                            ? "এই শব্দটির আলাদা ব্যাখ্যা ফেরত আসেনি। “আবার বিশ্লেষণ” চাপুন।"
                            : "No explanation was returned for this term. Try “Re-analyze”.")}
                      </p>

                      {field(terms[activeTerm] as UnknownRecord, "example") && (
                        <>
                          <p className="ab-eyebrow" style={{ marginTop: 15 }}>
                            {bn ? "উদাহরণ" : "EXAMPLE"}
                          </p>
                          <p className="ab-body" style={{ fontSize: 13 }}>
                            {field(terms[activeTerm] as UnknownRecord, "example")}
                          </p>
                        </>
                      )}

                      {field(terms[activeTerm] as UnknownRecord, "inDocument") && (
                        <>
                          <div className="ab-divider" />
                          <p className="ab-eyebrow">
                            {bn ? "এই নথিতে" : "IN THIS DOCUMENT"}
                          </p>
                          <p className="ab-body" style={{ fontSize: 13 }}>
                            {field(
                              terms[activeTerm] as UnknownRecord,
                              "inDocument",
                            )}
                          </p>
                        </>
                      )}

                      <div style={{ marginTop: 13 }}>
                        <ReadAloud
                          text={[
                            field(terms[activeTerm] as UnknownRecord, "name", "term"),
                            field(terms[activeTerm] as UnknownRecord, "meaning", "simple", "definition", "explanation"),
                            field(terms[activeTerm] as UnknownRecord, "example"),
                            field(terms[activeTerm] as UnknownRecord, "inDocument"),
                          ].filter(Boolean).join(". ")}
                          label={bn ? "ব্যাখ্যা শুনুন" : "Listen to explanation"}
                        />
                      </div>
                    </article>
                  )}
                </>
              ) : (
                <div className="ab-empty">
                  {bn
                    ? "বিশ্লেষণে আলাদা আইনি শব্দের তালিকা ফেরত আসেনি।"
                    : "No separate list of legal terms was returned."}
                </div>
              )}
            </section>

            <section className="ab-section">
              <div className="ab-section-heading">
                <div className="ab-eyebrow">
                  {bn ? "প্রশ্ন আছে?" : "HAVE A QUESTION?"}
                </div>
                <h2 className="ab-heading" style={{ marginTop: 5 }}>
                  {bn ? "নথি সম্পর্কে জিজ্ঞাসা করুন" : "Ask about your document"}
                </h2>
                <p className="ab-subtitle">
                  {bn
                    ? "কোনো ধারা, শব্দ বা পরিস্থিতি বুঝতে না পারলে এখানে প্রশ্ন করুন।"
                    : "Ask a follow-up about a clause, an unfamiliar term, or how the document relates to your situation."}
                </p>
              </div>

              <div className="ab-card" style={{ padding: 12 }}>
                <ChatPanel
                  documentContext={
                    hasVerifiedText
                      ? { name: documentName, text: verifiedText }
                      : undefined
                  }
                />
              </div>
            </section>
          </>
        )}

        <footer className="ab-legal-note">
          <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <p>
            {bn
              ? "AinBodh নথি ও আইনি তথ্য সহজভাবে বুঝতে সাহায্য করে। এটি নথির সত্যতা যাচাই করে না এবং যোগ্য আইনজীবীর পরামর্শের বিকল্প নয়।"
              : "AinBodh helps explain documents and legal information. It does not authenticate documents or replace advice from a qualified legal professional."}
          </p>
        </footer>
      </div>

      {viewerPage !== null && (
        <DocumentViewer
          page={viewerPage}
          onClose={() => setViewerPage(null)}
          document={activeDocument}
          verifiedText={verifiedText}
        />
      )}
    </main>
  );
}
