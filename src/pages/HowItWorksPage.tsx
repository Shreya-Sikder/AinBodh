import {
  ArrowRight,
  CheckCircle2,
  Columns3,
  FileText,
  Info,
  MessageSquare,
  Search,
  Star,
  Upload,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import LanguageToggle from "../components/LanguageToggle";

type Step = {
  number: string;
  title: string;
  description: string;
};

const copy = {
  en: {
    eyebrow: "HOW LEGAL EASE WORKS",
    title: "Understand your documents before they become a problem.",
    subtitle:
      "AinBodh helps you upload, verify, understand, and question legal documents in simple Bangla or English — while keeping the source visible.",
    introEyebrow: "A SIMPLE PROCESS",
    introTitle: "From document to understanding.",
    introText:
      "You do not need to understand legal language first. AinBodh breaks the process into clear steps so you can see what your document says, what may need attention, and why.",
    steps: [
      {
        number: "01",
        title: "Upload your document",
        description:
          "Upload a PDF, image, or document. You can also use your camera or voice to provide information.",
      },
      {
        number: "02",
        title: "Check what was read",
        description:
          "AinBodh processes the document and lets you verify the extracted text before relying on the result.",
      },
      {
        number: "03",
        title: "Understand it simply",
        description:
          "Get a plain-language explanation of important clauses, obligations, dates, and conditions.",
      },
      {
        number: "04",
        title: "Find what needs attention",
        description:
          "Potentially missing, unusual, unclear, or important provisions are highlighted for you.",
      },
      {
        number: "05",
        title: "Ask questions",
        description:
          "Ask about the document in natural language instead of trying to figure out legal terminology yourself.",
      },
      {
        number: "06",
        title: "See the source",
        description:
          "Where relevant, AinBodh connects explanations with the underlying legal source so you can review it.",
      },
      {
        number: "07",
        title: "Stay in control",
        description:
          "AinBodh helps you understand information. It does not make the final decision for you.",
      },
    ] as Step[],
    preview: {
      uploaded: "Document uploaded",
      verified: "Document verified",
      summary: "AI summary",
      summaryText:
        "This agreement sets out the rent, payment schedule, responsibilities of both parties, and conditions for ending the agreement.",
      attention: "Needs attention",
      attentionText:
        "The agreement may not clearly explain the process for returning the security deposit.",
      ask: "Ask about this document...",
      plain: "Plain language",
      control: "You stay in control",
      source: "Review source",
    },
    principleEyebrow: "IMPORTANT",
    principleTitle:
      "AI should help you understand — not replace your judgment.",
    principleText:
      "AinBodh is designed to make legal information easier to access and understand. When something matters, you should still review the source and seek qualified legal help when necessary.",
    ctaTitle: "Ready to understand your document?",
    ctaText:
      "Start with a document, a question, or a situation you want to understand.",
    ctaButton: "Start a new inquiry",
    back: "Back",
  },

  bn: {
    eyebrow: "LEGAL EASE কীভাবে কাজ করে",
    title: "সমস্যা হওয়ার আগেই আপনার নথি বুঝে নিন।",
    subtitle:
      "AinBodh আপনাকে সহজ বাংলায় বা ইংরেজিতে আইনি নথি আপলোড, যাচাই, বোঝা এবং প্রশ্ন করতে সাহায্য করে — একই সঙ্গে মূল উৎসও দেখায়।",
    introEyebrow: "সহজ একটি প্রক্রিয়া",
    introTitle: "নথি থেকে বোঝার পথে।",
    introText:
      "শুরুতেই আইনি ভাষা বোঝার প্রয়োজন নেই। AinBodh পুরো প্রক্রিয়াটিকে সহজ ধাপে ভাগ করে, যাতে আপনি নথিতে কী আছে, কোন বিষয়গুলো গুরুত্বপূর্ণ এবং কেন — তা বুঝতে পারেন।",
    steps: [
      {
        number: "০১",
        title: "আপনার নথি আপলোড করুন",
        description:
          "PDF, ছবি বা অন্য কোনো নথি আপলোড করুন। ক্যামেরা বা ভয়েস ব্যবহার করেও তথ্য দিতে পারেন।",
      },
      {
        number: "০২",
        title: "কী পড়া হয়েছে যাচাই করুন",
        description:
          "AinBodh নথিটি প্রক্রিয়া করে এবং ফলাফলের ওপর নির্ভর করার আগে বের করা তথ্য যাচাই করার সুযোগ দেয়।",
      },
      {
        number: "০৩",
        title: "সহজ ভাষায় বুঝুন",
        description:
          "গুরুত্বপূর্ণ ধারা, দায়িত্ব, তারিখ এবং শর্তগুলো সহজ ভাষায় ব্যাখ্যা পান।",
      },
      {
        number: "০৪",
        title: "কোন বিষয়গুলো গুরুত্বপূর্ণ দেখুন",
        description:
          "সম্ভাব্য অনুপস্থিত, অস্বাভাবিক, অস্পষ্ট বা গুরুত্বপূর্ণ বিষয়গুলো আপনার সামনে তুলে ধরা হয়।",
      },
      {
        number: "০৫",
        title: "প্রশ্ন করুন",
        description:
          "আইনি শব্দ বোঝার চেষ্টা না করে সরাসরি স্বাভাবিক ভাষায় নথি সম্পর্কে প্রশ্ন করুন।",
      },
      {
        number: "০৬",
        title: "মূল উৎস দেখুন",
        description:
          "প্রয়োজন অনুযায়ী AinBodh ব্যাখ্যার সঙ্গে সংশ্লিষ্ট আইনি উৎস দেখায়, যাতে আপনি নিজে যাচাই করতে পারেন।",
      },
      {
        number: "০৭",
        title: "সিদ্ধান্ত আপনার",
        description:
          "AinBodh আপনাকে তথ্য বুঝতে সাহায্য করে। চূড়ান্ত সিদ্ধান্ত আপনার।",
      },
    ] as Step[],
    preview: {
      uploaded: "নথি আপলোড হয়েছে",
      verified: "নথি যাচাই সম্পন্ন",
      summary: "AI সারাংশ",
      summaryText:
        "এই চুক্তিতে ভাড়া, অর্থ প্রদানের সময়সূচি, উভয় পক্ষের দায়িত্ব এবং চুক্তি শেষ করার শর্তগুলো উল্লেখ করা হয়েছে।",
      attention: "গুরুত্বপূর্ণ বিষয়",
      attentionText:
        "জামানতের টাকা ফেরত দেওয়ার প্রক্রিয়াটি চুক্তিতে পরিষ্কারভাবে উল্লেখ করা নাও থাকতে পারে।",
      ask: "এই নথি সম্পর্কে প্রশ্ন করুন...",
      plain: "সহজ ভাষায়",
      control: "সিদ্ধান্ত আপনার",
      source: "মূল উৎস দেখুন",
    },
    principleEyebrow: "গুরুত্বপূর্ণ",
    principleTitle:
      "AI আপনাকে বুঝতে সাহায্য করবে — আপনার সিদ্ধান্ত নেবে না।",
    principleText:
      "AinBodh আইনি তথ্যকে আরও সহজে বোঝার সুযোগ তৈরি করে। গুরুত্বপূর্ণ বিষয়ে মূল উৎস যাচাই করুন এবং প্রয়োজন হলে যোগ্য আইনজীবীর পরামর্শ নিন।",
    ctaTitle: "আপনার নথি বুঝতে প্রস্তুত?",
    ctaText:
      "একটি নথি, একটি প্রশ্ন অথবা যে পরিস্থিতিটি বুঝতে চান — সেখান থেকেই শুরু করুন।",
    ctaButton: "নতুন অনুসন্ধান শুরু করুন",
    back: "ফিরে যান",
  },
};

function StepCard({
  step,
  index,
  bn,
}: {
  step: Step;
  index: number;
  bn: boolean;
}) {
  const icons = [
    Upload,
    Search,
    FileText,
    Info,
    MessageSquare,
    Columns3,
    Star,
  ];

  const Icon = icons[index] || FileText;

  return (
    <div className="group relative flex gap-6 border-b border-white/[0.07] py-8 first:pt-0">
      <div className="flex shrink-0 flex-col items-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#42b7a9]/20 bg-[#42b7a9]/[0.07]">
          <Icon
            className="h-[17px] w-[17px] text-[#42b7a9]"
            strokeWidth={1.7}
          />
        </div>

        {index < 6 && (
          <div className="mt-3 h-full w-px bg-gradient-to-b from-[#42b7a9]/20 to-transparent" />
        )}
      </div>

      <div className="pt-0.5">
        <p className="text-[10px] font-bold tracking-[1.5px] text-[#42b7a9]/60">
          {step.number}
        </p>

        <h3
          className={`mt-1.5 text-[17px] font-semibold tracking-[-0.2px] text-white ${
            bn ? "bn" : ""
          }`}
        >
          {step.title}
        </h3>

        <p
          className={`mt-2 max-w-[600px] text-[13px] leading-6 text-white/45 ${
            bn ? "bn" : ""
          }`}
        >
          {step.description}
        </p>
      </div>
    </div>
  );
}

function AinBodhPreview({ bn }: { bn: boolean }) {
  const p = copy[bn ? "bn" : "en"].preview;

  return (
    <div className="overflow-hidden rounded-[24px] border border-white/[0.11] bg-[#101c2d] shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between border-b border-white/[0.07] bg-[#0c1727] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#42b7a9]/10">
            <span className="text-[13px] text-[#42b7a9]">⚖</span>
          </div>

          <span className="text-[12px] font-semibold tracking-[-0.1px] text-white">
            AinBodh
          </span>
        </div>

        <div className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[9px] text-white/45">
          {bn ? "বাংলা" : "English"}
        </div>
      </div>

      <div className="space-y-3.5 p-5">
        <div className="rounded-[15px] border border-white/[0.08] bg-white/[0.025] p-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#42b7a9]/10">
              <FileText
                className="h-[18px] w-[18px] text-[#42b7a9]"
                strokeWidth={1.7}
              />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium text-white/80">
                {bn ? "ভাড়ার চুক্তিপত্র.pdf" : "Rental Agreement.pdf"}
              </p>

              <p className="mt-1 text-[9px] text-white/35">
                {p.uploaded}
              </p>
            </div>

            <CheckCircle2
              className="h-[17px] w-[17px] shrink-0 text-[#42b7a9]"
              strokeWidth={1.8}
            />
          </div>
        </div>

        <div className="flex items-center gap-2.5 rounded-[13px] border border-[#42b7a9]/15 bg-[#42b7a9]/[0.045] px-3.5 py-3">
          <CheckCircle2
            className="h-[15px] w-[15px] shrink-0 text-[#42b7a9]"
            strokeWidth={1.8}
          />

          <span className="text-[10px] font-medium text-[#72c9bd]">
            {p.verified}
          </span>
        </div>

        <div className="rounded-[15px] border border-white/[0.08] bg-white/[0.025] p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-white/70">
              {p.summary}
            </p>

            <span className="rounded-full bg-[#42b7a9]/10 px-2 py-1 text-[8px] font-medium text-[#72c9bd]">
              {p.plain}
            </span>
          </div>

          <p className="mt-2.5 text-[10px] leading-[1.65] text-white/40">
            {p.summaryText}
          </p>
        </div>

        <div className="rounded-[15px] border border-amber-300/10 bg-amber-300/[0.035] p-3.5">
          <div className="flex items-center gap-2">
            <Info
              className="h-[14px] w-[14px] text-amber-200/70"
              strokeWidth={1.7}
            />

            <p className="text-[10px] font-semibold text-amber-100/75">
              {p.attention}
            </p>
          </div>

          <p className="mt-2 text-[9px] leading-[1.6] text-white/35">
            {p.attentionText}
          </p>
        </div>

        <div className="flex items-center gap-2.5 rounded-[14px] border border-white/[0.1] bg-[#0b1626] px-3.5 py-3">
          <MessageSquare
            className="h-[14px] w-[14px] shrink-0 text-white/30"
            strokeWidth={1.6}
          />

          <span className="flex-1 truncate text-[9px] text-white/25">
            {p.ask}
          </span>

          <ArrowRight
            className="h-[13px] w-[13px] text-[#42b7a9]/70"
            strokeWidth={1.7}
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.07] bg-[#0c1727] px-5 py-3.5">
        <span className="flex items-center gap-1.5 text-[8px] text-white/30">
          <CheckCircle2
            className="h-3 w-3 text-[#42b7a9]/70"
            strokeWidth={1.7}
          />
          {p.control}
        </span>

        <span className="text-[8px] text-[#42b7a9]/70">
          {p.source} →
        </span>
      </div>
    </div>
  );
}

export default function HowItWorksPage() {
  const {lang} = useLanguage();
  const bn = lang === "bn";
  const t = copy[bn ? "bn" : "en"];

  return (
    <div className="min-h-screen bg-[#08111f] text-white">
      {/* HERO */}
      <header className="border-b border-white/[0.06] bg-[radial-gradient(circle_at_70%_20%,rgba(20,131,153,0.13),transparent_32%),#08111f]">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-5 pt-6 md:px-10">
          <Link
            to="/"
            className="flex items-center gap-2 text-[11px] text-white/40 transition hover:text-white/70"
          >
            <ArrowRight className="h-3.5 w-3.5 rotate-180" />
            <span className={bn ? "bn" : ""}>{t.back}</span>
          </Link>

          <LanguageToggle />
        </div>

        <div className="mx-auto max-w-[1180px] px-5 pb-14 pt-10 md:px-10 md:pb-20 md:pt-14">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_430px] lg:gap-16">
            {/* HERO LEFT */}
            <div className="max-w-[650px]">
              <p
                className={`text-[10px] font-bold uppercase tracking-[1.5px] text-[#42b7a9] ${
                  bn ? "bn" : ""
                }`}
              >
                {t.eyebrow}
              </p>

              <h1
                className={`mt-4 text-[32px] font-bold leading-[1.08] tracking-[-1px] text-white md:text-[46px] ${
                  bn ? "bn" : ""
                }`}
              >
                {t.title}
              </h1>

              <p
                className={`mt-5 max-w-[600px] text-[13px] leading-6 text-white/55 md:text-[14px] md:leading-7 ${
                  bn ? "bn" : ""
                }`}
              >
                {t.subtitle}
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-4 text-[10px] text-white/40">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2
                    className="h-3.5 w-3.5 text-[#42b7a9]"
                    strokeWidth={1.8}
                  />
                  {bn ? "আপনার নিয়ন্ত্রণে" : "You stay in control"}
                </span>

                <span className="h-3 w-px bg-white/10" />

                <span>
                  {bn ? "বাংলা + ইংরেজি" : "Bangla + English"}
                </span>
              </div>
            </div>

            {/* HERO RIGHT */}
            <div className="relative">
              <div className="absolute -inset-6 rounded-[32px] bg-[#148399]/10 blur-3xl" />

              <div className="relative">
                <AinBodhPreview bn={bn} />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* INTRO */}
      <section className="border-b border-white/[0.06]">
        <div className="mx-auto max-w-[1180px] px-5 py-16 md:px-10 md:py-20">
          <div className="max-w-[700px]">
            <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#42b7a9]">
              {t.introEyebrow}
            </p>

            <h2
              className={`mt-3 text-[27px] font-semibold tracking-[-0.7px] text-white md:text-[34px] ${
                bn ? "bn" : ""
              }`}
            >
              {t.introTitle}
            </h2>

            <p
              className={`mt-4 text-[13px] leading-7 text-white/45 md:text-[14px] ${
                bn ? "bn" : ""
              }`}
            >
              {t.introText}
            </p>
          </div>
        </div>
      </section>

      {/* WORKFLOW */}
      <main>
        <div className="mx-auto max-w-[1180px] px-5 py-16 md:px-10 md:py-20">
          <div className="grid gap-12 lg:grid-cols-[1fr_330px] lg:gap-20">
            {/* STEPS */}
            <div>
              {t.steps.map((step, index) => (
                <StepCard
                  key={step.number}
                  step={step}
                  index={index}
                  bn={bn}
                />
              ))}
            </div>

            {/* SIDEBAR */}
            <aside className="lg:pt-4">
              <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.025] p-6">
                <p className="text-[9px] font-bold uppercase tracking-[1.4px] text-[#42b7a9]">
                  {t.principleEyebrow}
                </p>

                <h3
                  className={`mt-3 text-[18px] font-semibold leading-6 text-white ${
                    bn ? "bn" : ""
                  }`}
                >
                  {t.principleTitle}
                </h3>

                <p
                  className={`mt-3 text-[11px] leading-6 text-white/40 ${
                    bn ? "bn" : ""
                  }`}
                >
                  {t.principleText}
                </p>
              </div>

              {/* START INQUIRY → SIGN UP */}
              <div className="mt-5 rounded-[22px] border border-[#42b7a9]/15 bg-[#42b7a9]/[0.045] p-6">
                <h3
                  className={`text-[16px] font-semibold text-white ${
                    bn ? "bn" : ""
                  }`}
                >
                  {t.ctaTitle}
                </h3>

                <p
                  className={`mt-2 text-[11px] leading-5 text-white/40 ${
                    bn ? "bn" : ""
                  }`}
                >
                  {t.ctaText}
                </p>

                <Link
                  to="/signup"
                  className={`mt-5 flex items-center justify-between rounded-xl bg-[#42b7a9] px-4 py-3 text-[10px] font-semibold text-[#07131e] transition hover:bg-[#5bc8ba] ${
                    bn ? "bn" : ""
                  }`}
                >
                  <span>{t.ctaButton}</span>

                  <ArrowRight
                    className="h-3.5 w-3.5"
                    strokeWidth={2}
                  />
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </main>

      {/* FOOTER CTA */}
      <section className="border-t border-white/[0.06] bg-[#0a1525]">
        <div className="mx-auto max-w-[1180px] px-5 py-16 md:px-10 md:py-20">
          <div className="max-w-[700px]">
            <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#42b7a9]">
              AinBodh
            </p>

            <h2
              className={`mt-3 text-[27px] font-semibold tracking-[-0.7px] text-white md:text-[34px] ${
                bn ? "bn" : ""
              }`}
            >
              {t.ctaTitle}
            </h2>

            <p
              className={`mt-3 text-[13px] leading-6 text-white/40 ${
                bn ? "bn" : ""
              }`}
            >
              {t.ctaText}
            </p>

            <Link
              to="/signup"
              className={`mt-6 inline-flex items-center gap-3 rounded-xl bg-[#42b7a9] px-5 py-3.5 text-[11px] font-semibold text-[#07131e] transition hover:bg-[#5bc8ba] ${
                bn ? "bn" : ""
              }`}
            >
              {t.ctaButton}

              <ArrowRight
                className="h-3.5 w-3.5"
                strokeWidth={2}
              />
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-5 py-6 md:px-10">
          <span className="text-[10px] text-white/25">
            © AinBodh
          </span>

          <span className="text-[9px] text-white/20">
            {bn
              ? "সহজ ভাষায় আইনি তথ্য"
              : "Legal information, made clearer."}
          </span>
        </div>
      </footer>
    </div>
  );
}
