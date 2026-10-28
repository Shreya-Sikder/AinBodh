import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Languages,
  Loader2,
  Pencil,
  Scale,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useApp, type ChatMessage, type DocumentAnalysisMessage } from "../../context/AppContext";
import { translateContent } from "../../services/api";
import Markdown from "./Markdown";
import { SourcesList } from "./Citations";

/* =========================================================
   Progress steps ("Thought for 8 s")
========================================================= */

const STEP_LABELS: Record<string, [string, string]> = {
  understand: ["প্রশ্নটি বোঝা হচ্ছে", "Understanding your question"],
  search: ["বাংলাদেশের আইনে খোঁজা হচ্ছে", "Searching Bangladesh laws"],
  check_current: ["আইনগুলো এখনো বলবৎ কি না যাচাই", "Checking the laws are still in force"],
  write: ["উত্তর লেখা হচ্ছে", "Writing the answer"],
  read_document: ["নথি পড়া হচ্ছে", "Reading the document"],
  clean_image: ["ছবি পরিষ্কার করে পড়া হচ্ছে", "Cleaning up the image and reading it"],
  main_text: ["মূল লেখা আলাদা করা হচ্ছে", "Picking out the main text"],
  understand_document: ["নথিটি বোঝা হচ্ছে", "Understanding the document"],
  find_laws: ["সংশ্লিষ্ট আইন খোঁজা হচ্ছে", "Finding the relevant laws"],
  write_summary: ["সারসংক্ষেপ লেখা হচ্ছে", "Writing the summary"],
};

export const stepLabel = (step: string, bn: boolean) => STEP_LABELS[step]?.[bn ? 0 : 1] ?? step;

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";
const digits = (value: number, bn: boolean) => (bn ? String(value).replace(/\d/g, (d) => BANGLA_DIGITS[Number(d)]) : String(value));

export function ThinkingSteps({
  steps,
  live,
  ms,
  bn,
  dark,
}: {
  steps: string[];
  live?: boolean;
  ms?: number;
  bn: boolean;
  dark: boolean;
}) {
  const [open, setOpen] = useState(false);
  const muted = dark ? "text-[#8fa3b8]" : "text-[#7b818b]";

  if (live) {
    const current = steps[steps.length - 1];
    return (
      <div className={`text-[12px] ${muted}`} aria-live="polite">
        {steps.slice(0, -1).map((step) => (
          <div key={step} className="flex items-center gap-2 py-0.5">
            <Check className="size-3.5 text-teal" />
            <span>{stepLabel(step, bn)}</span>
          </div>
        ))}
        <div className={`flex items-center gap-2 py-0.5 font-semibold ${dark ? "text-[#d8e2ec]" : "text-[#263247]"}`}>
          <Loader2 className="size-3.5 animate-spin text-teal" />
          <span className="animate-pulse">{current ? stepLabel(current, bn) : bn ? "ভাবছি…" : "Thinking…"}</span>
        </div>
      </div>
    );
  }

  if (!steps.length) return null;
  const seconds = Math.max(1, Math.round((ms ?? 0) / 1000));

  return (
    <div className={`mb-2 text-[11px] ${muted}`}>
      <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-1 hover:underline" aria-expanded={open}>
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {bn ? `${digits(seconds, true)} সেকেন্ড ধরে ভেবেছে` : `Thought for ${seconds}s`}
      </button>
      {open && (
        <ol className="mt-1 space-y-0.5 border-l pl-3" style={{ borderColor: dark ? "rgba(255,255,255,.12)" : "#e5e7eb" }}>
          {steps.map((step) => (
            <li key={step} className="flex items-center gap-1.5">
              <Check className="size-3 text-teal" />
              {stepLabel(step, bn)}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* =========================================================
   Document analysis as a chat message
========================================================= */

const field = (item: Record<string, string>, ...keys: string[]) => {
  for (const key of keys) if (typeof item[key] === "string" && item[key].trim()) return item[key].trim();
  return "";
};

function Section({ title, children, dark }: { title: string; children: React.ReactNode; dark: boolean }) {
  return (
    <section className="mt-4">
      <h4 className={`mb-1.5 text-[14px] font-bold ${dark ? "text-white" : "text-[#172033]"}`}>{title}</h4>
      {children}
    </section>
  );
}

function Collapsible({ title, children, dark, defaultOpen = false }: { title: string; children: React.ReactNode; dark: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`mt-4 rounded-xl border ${dark ? "border-white/10" : "border-[#ece9e2]"}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={`flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[13px] font-bold ${dark ? "text-white" : "text-[#172033]"}`}
      >
        {title}
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-3.5 pb-3.5">{children}</div>}
    </section>
  );
}

function DocumentBody({
  doc,
  bn,
  dark,
  onView,
  onSaveText,
  busy,
}: {
  doc: DocumentAnalysisMessage;
  bn: boolean;
  dark: boolean;
  onView?: () => void;
  onSaveText?: (text: string) => void;
  busy?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(doc.mainText);
  const muted = dark ? "text-[#9aaabd]" : "text-[#6b7280]";
  const pages = bn ? `${digits(doc.pages, true)} পৃষ্ঠা` : `${doc.pages} ${doc.pages === 1 ? "page" : "pages"}`;

  return (
    <div>
      <div className={`mb-3 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${dark ? "border-white/10 bg-white/[0.03]" : "border-[#ece9e2] bg-[#faf9f5]"}`}>
        <FileText className="size-4 text-teal" />
        <span className={`min-w-0 flex-1 truncate text-[12px] font-semibold ${dark ? "text-[#e8f0f7]" : "text-[#263247]"}`}>{doc.name}</span>
        <span className={`text-[10px] ${muted}`}>
          {doc.type ? `${doc.type} · ` : ""}
          {pages}
        </span>
        {onView && (
          <button type="button" onClick={onView} className="text-[11px] font-semibold text-teal hover:underline">
            {bn ? "মূল নথি দেখুন" : "View original"}
          </button>
        )}
      </div>

      {doc.overview && <Markdown text={doc.overview} bn={bn} dark={dark} />}

      {doc.keyPoints.length > 0 && (
        <Section title={bn ? "📋 নথিতে যা বলা আছে" : "📋 What this document says"} dark={dark}>
          <ol className="list-decimal space-y-1.5 pl-6 marker:font-semibold marker:text-teal">
            {doc.keyPoints.map((item, index) => {
              const label = field(item, "label", "title");
              const value = field(item, "value", "description", "body");
              return (
                <li key={index} className="pl-1">
                  {label && value ? (
                    <>
                      <strong className={dark ? "text-white" : "text-[#172033]"}>{label}:</strong> {value}
                    </>
                  ) : (
                    label || value
                  )}
                </li>
              );
            })}
          </ol>
        </Section>
      )}

      {doc.attention.length > 0 && (
        <Section title={bn ? "⚠️ যেগুলো ভালোভাবে দেখে নিন" : "⚠️ Points to check"} dark={dark}>
          <ol className="list-decimal space-y-1.5 pl-6 marker:font-semibold marker:text-amber-600">
            {doc.attention.map((item, index) => (
              <li key={index} className="pl-1">
                <strong className={dark ? "text-white" : "text-[#172033]"}>{field(item, "title")}</strong>
                {field(item, "body", "description") ? ` — ${field(item, "body", "description")}` : ""}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {doc.missing.length > 0 && (
        <Section title={bn ? "❔ নথিতে যা উল্লেখ নেই" : "❔ Not stated in the document"} dark={dark}>
          <ul className="list-disc space-y-1 pl-6 marker:text-teal">
            {doc.missing.map((item, index) => (
              <li key={index}>
                {field(item, "title")}
                {field(item, "body", "description") ? ` — ${field(item, "body", "description")}` : ""}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {doc.terms.length > 0 && (
        <Collapsible title={bn ? `📘 আইনি শব্দ সহজ ভাষায় (${digits(doc.terms.length, true)})` : `📘 Legal terms, explained (${doc.terms.length})`} dark={dark}>
          <ul className="space-y-3">
            {doc.terms.map((item, index) => (
              <li key={index}>
                <p className={`font-semibold ${dark ? "text-white" : "text-[#172033]"}`}>{field(item, "term", "name")}</p>
                {field(item, "meaning", "simple", "definition") && <p className="mt-0.5">{field(item, "meaning", "simple", "definition")}</p>}
                {field(item, "example") && (
                  <p className={`mt-0.5 text-[12px] ${muted}`}>
                    <span className="font-semibold">{bn ? "উদাহরণ: " : "Example: "}</span>
                    {field(item, "example")}
                  </p>
                )}
                {field(item, "inDocument") && (
                  <p className={`mt-0.5 text-[12px] ${muted}`}>
                    <span className="font-semibold">{bn ? "এই নথিতে: " : "In this document: "}</span>
                    {field(item, "inDocument")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Collapsible>
      )}

      {onSaveText && (
        <Collapsible title={bn ? "✏️ নথির মূল লেখা (সম্পাদনযোগ্য)" : "✏️ Document text (editable)"} dark={dark}>
          <p className={`mb-2 text-[11px] leading-5 ${muted}`}>
            {bn
              ? "শুধু মূল লেখা দেখানো হয়েছে — সিল, স্বাক্ষর, পৃষ্ঠা নম্বর ও অন্যান্য অপ্রয়োজনীয় অংশ বাদ দেওয়া হয়েছে। ভুল থাকলে সংশোধন করে আবার বিশ্লেষণ করুন।"
              : "Only the main text is shown — stamps, signatures, page numbers and other page clutter are left out. Correct anything that was misread and update the analysis."}
          </p>
          {editing ? (
            <>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className={`min-h-[220px] w-full resize-y rounded-lg border p-3 text-[12.5px] leading-6 outline-none focus:border-teal ${
                  dark ? "border-white/15 bg-[#0b1728] text-[#e8f0f7]" : "border-[#e5e7eb] bg-[#fbfbfa] text-[#263247]"
                } ${bn ? "bn" : ""}`}
                aria-label={bn ? "নথির লেখা" : "Document text"}
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(doc.mainText);
                    setEditing(false);
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold ${dark ? "border-white/15 text-[#cfe0ee]" : "border-[#e5e7eb] text-[#4b5563]"}`}
                >
                  {bn ? "বাতিল" : "Cancel"}
                </button>
                <button
                  type="button"
                  disabled={busy || !draft.trim() || draft.trim() === doc.mainText.trim()}
                  onClick={() => {
                    onSaveText(draft.trim());
                    setEditing(false);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                >
                  {busy && <Loader2 className="size-3 animate-spin" />}
                  {bn ? "সংরক্ষণ করে আবার বিশ্লেষণ" : "Save & update analysis"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={`max-h-[360px] overflow-auto whitespace-pre-wrap rounded-lg border p-3 text-[12.5px] leading-6 ${dark ? "border-white/10 bg-[#0b1728]" : "border-[#eee] bg-[#fbfbfa]"} ${bn ? "bn" : ""}`}>
                {doc.mainText}
              </div>
              <button type="button" onClick={() => setEditing(true)} className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-teal hover:underline">
                <Pencil className="size-3" />
                {bn ? "লেখা সংশোধন করুন" : "Edit text"}
              </button>
            </>
          )}
        </Collapsible>
      )}

      {(doc.warnings.length > 0 || doc.hasUnclear || doc.uncertainWords.length > 0) && (
        <div className={`mt-4 flex gap-2.5 rounded-xl border px-3.5 py-3 text-[12px] leading-5 ${dark ? "border-amber-400/30 bg-amber-400/10 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">{bn ? "গুরুত্বপূর্ণ" : "Important"}</p>
            <p>
              {bn
                ? "ছবির কিছু অংশ অস্পষ্ট বা সিলের নিচে ঢাকা থাকতে পারে। উপরের লেখা একটি প্রতিলিপি, যাচাই করা আইনি নথি নয়। নাম, তারিখ ও ঠিকানা ব্যবহারের আগে মূল নথির সঙ্গে মিলিয়ে নিন।"
                : "Parts of the page may be blurred or covered by stamps. The text above is a transcription, not a verified legal document. Check names, dates and addresses against the original before using them."}
            </p>
            {doc.uncertainWords.length > 0 && (
              <p className="mt-1">
                {bn ? "অস্পষ্টভাবে পড়া শব্দ: " : "Words read with low confidence: "}
                <span className="font-semibold">{doc.uncertainWords.slice(0, 12).join(", ")}</span>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   One assistant message with its actions
========================================================= */

const isBangla = (text: string) => {
  const bangla = (text.match(/[ঀ-৿]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return bangla > latin;
};

const plainDocument = (doc: DocumentAnalysisMessage) =>
  [
    doc.overview,
    ...doc.keyPoints.map((item) => `${field(item, "label", "title")}: ${field(item, "value", "description", "body")}`),
    ...doc.attention.map((item) => `${field(item, "title")} — ${field(item, "body", "description")}`),
  ]
    .filter(Boolean)
    .join("\n");

export default function AssistantMessage({
  message,
  chatId,
  bn,
  dark,
  speaking,
  onToggleSpeak,
  onViewDocument,
  onReanalyze,
  reanalyzing,
}: {
  message: ChatMessage;
  chatId: string | null;
  bn: boolean;
  dark: boolean;
  speaking: boolean;
  onToggleSpeak: (id: string, text: string) => void;
  onViewDocument?: (doc: DocumentAnalysisMessage) => void;
  onReanalyze?: (message: ChatMessage, text: string) => void;
  reanalyzing?: boolean;
}) {
  const { updateMessage, notify } = useApp();
  const [showTranslation, setShowTranslation] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [copied, setCopied] = useState(false);

  const doc = message.document;
  const sourceText = doc ? doc.overview || plainDocument(doc) : message.text;
  const ownLanguage: "bn" | "en" = isBangla(sourceText) ? "bn" : "en";
  const target: "bn" | "en" = ownLanguage === "bn" ? "en" : "bn";
  const saved = message.translation?.language === target ? message.translation : undefined;

  const shownText = showTranslation && saved?.text ? saved.text : message.text;
  const shownDoc: DocumentAnalysisMessage | undefined =
    doc && showTranslation && saved?.document ? { ...doc, ...saved.document } : doc;
  const shownBn = showTranslation ? target === "bn" : ownLanguage === "bn";

  const translate = async () => {
    if (showTranslation) return setShowTranslation(false);
    if (saved) return setShowTranslation(true);
    setTranslating(true);
    try {
      if (doc) {
        const payload = {
          overview: doc.overview,
          type: doc.type,
          keyPoints: doc.keyPoints,
          attention: doc.attention,
          missing: doc.missing,
          terms: doc.terms,
        };
        const translated = await translateContent(payload, target);
        updateMessage(chatId ?? "", message.id, { translation: { language: target, document: translated } });
      } else {
        const translated = await translateContent(message.text, target);
        updateMessage(chatId ?? "", message.id, { translation: { language: target, text: translated } });
      }
      setShowTranslation(true);
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setTranslating(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shownDoc ? plainDocument(shownDoc) : shownText.replace(/\s?\[C\d+\]/g, ""));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      notify(bn ? "কপি করা যায়নি।" : "Could not copy.");
    }
  };

  const actionClass = `inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] transition ${
    dark ? "text-[#91a4b8] hover:bg-white/10 hover:text-[#5ee0d0]" : "text-[#69717c] hover:bg-[#f3f2ee] hover:text-teal"
  }`;

  return (
    <div className="mt-6 flex items-start gap-3 sm:gap-4">
      <div className="brand-icon flex size-10 shrink-0 items-center justify-center rounded-full sm:size-11">
        <Scale className="size-[18px] text-white sm:size-5" strokeWidth={2} />
      </div>

      <div className="min-w-0 max-w-[720px] flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className={`text-[14px] font-bold sm:text-[15px] ${dark ? "text-[#f1f5f9]" : "text-[#172033]"}`}>AinBodh</span>
        </div>

        {message.steps?.length ? <ThinkingSteps steps={message.steps} ms={message.thinkingMs} bn={bn} dark={dark} /> : null}

        <div
          className={`rounded-2xl rounded-tl-md border px-4 py-4 text-[13px] leading-6 shadow-[0_2px_12px_rgba(20,30,45,0.04)] sm:px-5 sm:text-[14px] ${
            dark ? "border-teal/35 bg-[#111c2d] text-[#d8e2ec]" : "border-[#e7e4dc] bg-white text-[#263247]"
          } ${shownBn ? "bn" : ""}`}
        >
          {shownDoc ? (
            <DocumentBody
              doc={shownDoc}
              bn={shownBn}
              dark={dark}
              onView={onViewDocument ? () => onViewDocument(doc!) : undefined}
              onSaveText={onReanalyze ? (text) => onReanalyze(message, text) : undefined}
              busy={reanalyzing}
            />
          ) : (
            <Markdown text={shownText} citations={message.citations ?? []} bn={shownBn} dark={dark} />
          )}

          <SourcesList citations={message.citations ?? []} bn={shownBn} dark={dark} />
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-0.5">
          <button
            type="button"
            onClick={() => onToggleSpeak(message.id, shownDoc ? plainDocument(shownDoc) : shownText)}
            className={actionClass}
            aria-label={speaking ? (bn ? "পড়া বন্ধ করুন" : "Stop reading") : bn ? "উত্তর পড়ে শুনুন" : "Read answer aloud"}
            title={speaking ? (bn ? "পড়া বন্ধ করুন" : "Stop reading") : bn ? "উত্তর পড়ে শুনুন" : "Read answer aloud"}
          >
            {speaking ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
          </button>
          <button type="button" onClick={() => void copy()} className={actionClass} aria-label={bn ? "কপি করুন" : "Copy"} title={bn ? "কপি করুন" : "Copy"}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
          <button type="button" onClick={() => void translate()} disabled={translating} className={actionClass}>
            {translating ? <Loader2 className="size-3.5 animate-spin" /> : <Languages className="size-3.5" />}
            <span>
              {showTranslation
                ? ownLanguage === "bn"
                  ? "মূল উত্তর দেখুন"
                  : "See original"
                : target === "en"
                  ? "Translate to English"
                  : "বাংলায় অনুবাদ করুন"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
