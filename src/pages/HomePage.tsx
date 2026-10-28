import { useEffect, useState } from "react";
import {
  ArrowRight,
  AudioLines,
  ChevronDown,
  FileSearch,
  FileText,
  FileWarning,
  Languages,
  MessageCircleQuestion,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import LanguageToggle from "../components/LanguageToggle";

const faq = {
  en: [
    [
      "What is AinBodh?",
      "AinBodh is an AI-powered Bangla-English assistant that helps you understand and review legal documents in simpler language.",
    ],
    [
      "Can AinBodh provide legal advice?",
      "No. It helps explain information from your document and highlights things worth reviewing. It does not replace a qualified legal professional.",
    ],
    [
      "What document types are supported?",
      "AinBodh is designed to work with documents, images, pasted text, and voice input.",
    ],
    [
      "Can I use AinBodh in Bangla?",
      "Yes. AinBodh is designed for both Bangla and English, making legal information easier to access for a wider range of users.",
    ],
    [
      "Can I ask questions about my document?",
      "Yes. You can ask questions about the document and use the answers to better understand the information it contains.",
    ],
    [
      "Can AinBodh tell me whether I should sign?",
      "No. AinBodh helps you understand and review the document, but the final decision remains yours.",
    ],
  ],

  bn: [
    [
      "AinBodh কী?",
      "AinBodh একটি AI-চালিত বাংলা-ইংরেজি সহায়ক, যা আইনি নথি সহজ ভাষায় বুঝতে ও পর্যালোচনা করতে সাহায্য করে।",
    ],
    [
      "AinBodh কি আইনি পরামর্শ দিতে পারে?",
      "না। এটি আপনার নথির তথ্য বুঝতে এবং পর্যালোচনার বিষয়গুলো চিহ্নিত করতে সাহায্য করে। এটি যোগ্য আইনজীবীর বিকল্প নয়।",
    ],
    [
      "কোন ধরনের নথি ব্যবহার করা যাবে?",
      "AinBodh নথি, ছবি, লেখা এবং ভয়েস ইনপুট নিয়ে কাজ করার জন্য তৈরি করা হয়েছে।",
    ],
    [
      "আমি কি বাংলায় AinBodh ব্যবহার করতে পারি?",
      "হ্যাঁ। AinBodh বাংলা ও ইংরেজি উভয় ভাষার জন্য তৈরি করা হয়েছে।",
    ],
    [
      "আমি কি আমার নথি সম্পর্কে প্রশ্ন করতে পারি?",
      "হ্যাঁ। নথি সম্পর্কে প্রশ্ন করে সেটির তথ্য আরও ভালোভাবে বুঝতে পারবেন।",
    ],
    [
      "AinBodh কি আমাকে স্বাক্ষর করতে বলবে?",
      "না। AinBodh আপনাকে নথি বুঝতে ও পর্যালোচনা করতে সাহায্য করে। চূড়ান্ত সিদ্ধান্ত আপনার।",
    ],
  ],
} as const;

const documents = {
  en: [
    {
      title: "Employment Agreement",
      type: "Employment document",
      pages: "8 pages",
      image: "/documents/employment-agreement.jpg",
      summary: "Your notice period is 60 days.",
      attention: "Non-compete clause · Section 8",
      keyOne: "Salary",
      valueOne: "BDT 45,000",
      keyTwo: "Notice",
      valueTwo: "60 days",
    },
    {
      title: "Rental Agreement",
      type: "Tenancy document",
      pages: "6 pages",
      image: "/documents/rental-agreement.jpg",
      summary: "The agreement requires a two-month security deposit.",
      attention: "Early termination clause · Section 11",
      keyOne: "Deposit",
      valueOne: "2 months",
      keyTwo: "Term",
      valueTwo: "1 year",
    },
    {
      title: "Legal Notice",
      type: "Legal notice",
      pages: "3 pages",
      image: "/documents/legal-notice.jpg",
      summary: "A response is requested within 15 days.",
      attention: "Response deadline · Paragraph 4",
      keyOne: "Deadline",
      valueOne: "15 days",
      keyTwo: "Notice",
      valueTwo: "Formal",
    },
    {
      title: "Service Agreement",
      type: "Service contract",
      pages: "7 pages",
      image: "/documents/service-agreement.jpg",
      summary: "The agreement contains an automatic renewal provision.",
      attention: "Renewal clause · Section 12",
      keyOne: "Renewal",
      valueOne: "Automatic",
      keyTwo: "Term",
      valueTwo: "12 months",
    },
  ],

  bn: [
    {
      title: "চাকরির চুক্তিপত্র",
      type: "চাকরির নথি",
      pages: "৮ পৃষ্ঠা",
      image: "/documents/employment-agreement.jpg",
      summary: "আপনার নোটিশ পিরিয়ড ৬০ দিন।",
      attention: "Non-compete clause · Section 8",
      keyOne: "বেতন",
      valueOne: "BDT 45,000",
      keyTwo: "নোটিশ",
      valueTwo: "৬০ দিন",
    },
    {
      title: "ভাড়ার চুক্তিপত্র",
      type: "ভাড়ার নথি",
      pages: "৬ পৃষ্ঠা",
      image: "/documents/rental-agreement.jpg",
      summary: "চুক্তিতে দুই মাসের নিরাপত্তা জামানতের কথা বলা হয়েছে।",
      attention: "Early termination clause · Section 11",
      keyOne: "জামানত",
      valueOne: "২ মাস",
      keyTwo: "মেয়াদ",
      valueTwo: "১ বছর",
    },
    {
      title: "আইনি নোটিশ",
      type: "আইনি নোটিশ",
      pages: "৩ পৃষ্ঠা",
      image: "/documents/legal-notice.jpg",
      summary: "১৫ দিনের মধ্যে উত্তর দেওয়ার অনুরোধ করা হয়েছে।",
      attention: "Response deadline · Paragraph 4",
      keyOne: "সময়সীমা",
      valueOne: "১৫ দিন",
      keyTwo: "নোটিশ",
      valueTwo: "আনুষ্ঠানিক",
    },
    {
      title: "সেবা চুক্তিপত্র",
      type: "সেবা চুক্তি",
      pages: "৭ পৃষ্ঠা",
      image: "/documents/service-agreement.jpg",
      summary: "চুক্তিতে স্বয়ংক্রিয় নবায়নের একটি ধারা রয়েছে।",
      attention: "Renewal clause · Section 12",
      keyOne: "নবায়ন",
      valueOne: "স্বয়ংক্রিয়",
      keyTwo: "মেয়াদ",
      valueTwo: "১২ মাস",
    },
  ],
} as const;

export default function HomePage() {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [activeDocument, setActiveDocument] = useState(0);

  const currentDocuments = bn ? documents.bn : documents.en;
  const currentDocument = currentDocuments[activeDocument];

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveDocument(
        (current) => (current + 1) % currentDocuments.length
      );
    }, 4000);

    return () => window.clearInterval(interval);
  }, [currentDocuments.length]);

  const features = bn
    ? [
        {
          icon: FileText,
          title: "সহজ ভাষায় বুঝুন",
          desc: "জটিল আইনি ভাষাকে সহজ ও বোধগম্য ব্যাখ্যায় রূপান্তর করুন।",
        },
        {
          icon: FileSearch,
          title: "মনোযোগের বিষয় চিহ্নিত করুন",
          desc: "গুরুত্বপূর্ণ ধারা, তারিখ ও বিষয়গুলো খুঁজে বের করুন।",
        },
        {
          icon: MessageCircleQuestion,
          title: "প্রশ্ন করুন",
          desc: "আপনার নথি সম্পর্কে বাংলা বা ইংরেজিতে প্রশ্ন করুন।",
        },
        {
          icon: FileWarning,
          title: "অনুপস্থিত ও অসংগত তথ্য দেখুন",
          desc: "নথির গুরুত্বপূর্ণ ফাঁক বা সম্ভাব্য অসংগতি শনাক্ত করুন।",
        },
        {
          icon: AudioLines,
          title: "বাংলা বা ইংরেজিতে শুনুন",
          desc: "নথির ব্যাখ্যা পড়ার পাশাপাশি শুনতেও পারবেন।",
        },
      ]
    : [
        {
          icon: FileText,
          title: "Understand in Simple Language",
          desc: "Turn complex legal language into clear, easier-to-understand explanations.",
        },
        {
          icon: FileSearch,
          title: "Identify Areas Requiring Attention",
          desc: "Find important clauses, dates, and areas worth reviewing carefully.",
        },
        {
          icon: MessageCircleQuestion,
          title: "Ask Questions",
          desc: "Ask questions about your document in Bangla or English.",
        },
        {
          icon: FileWarning,
          title: "Check Missing & Contradictory Information",
          desc: "Spot gaps, inconsistencies, and information that may deserve another look.",
        },
        {
          icon: AudioLines,
          title: "Listen in Bangla or English",
          desc: "Listen to explanations instead of relying only on reading.",
        },
      ];

  return (
    <div className="min-h-screen bg-[#f5f7f9] text-[#172033]">

      {/* =========================================================
          HEADER
      ========================================================= */}
      <header className="sticky top-0 z-50 flex h-16 items-center border-b border-[#ffffff14] bg-[#101d31]/95 px-5 backdrop-blur-md md:px-10">
        <Link
          to="/"
          className="flex items-center gap-3"
          aria-label="AinBodh Home"
        >
          <div className="flex size-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/10">
            <Scale
              className="size-[17px] text-white"
              strokeWidth={1.8}
            />
          </div>

          <div className="leading-none">
            <p className="text-[14px] font-bold tracking-[-0.2px] text-white">
              AinBodh
            </p>

            <p className="mt-1 text-[9px] tracking-wide text-white/45">
              {bn ? "এআই আইনি সহায়ক" : "AI LEGAL ASSISTANT"}
            </p>
          </div>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <Link
            to="/login"
            className="hidden text-[12px] font-medium text-white/65 transition-colors hover:text-white sm:block"
          >
            {bn ? "লগ ইন" : "Log in"}
          </Link>

          <Link
            to="/signup"
            className="hidden rounded-lg border border-white/10 bg-white/[0.07] px-3.5 py-2 text-[11px] font-semibold text-white transition-all hover:border-white/20 hover:bg-white/10 sm:block"
          >
            {bn ? "সাইন আপ" : "Sign up"}
          </Link>

          <LanguageToggle compact />
        </div>
      </header>

      {/* =========================================================
          HERO
      ========================================================= */}
      <section className="relative overflow-hidden bg-[#101d31] text-white">

        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-40 top-0 size-[500px] rounded-full bg-[#0d829f]/10 blur-3xl" />
          <div className="absolute -left-48 bottom-0 size-[430px] rounded-full bg-[#31506e]/15 blur-3xl" />
        </div>

        <div className="relative mx-auto grid min-h-[calc(100vh-64px)] w-full max-w-[1180px] gap-12 px-6 py-16 md:grid-cols-[0.88fr_1.12fr] md:px-12 md:py-20 lg:gap-16">

          {/* HERO COPY */}
          <div className="flex flex-col justify-center">

            <div className="mb-5 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3.5 py-2">
              <span className="size-1.5 rounded-full bg-[#42b7a9]" />

              <span
                className={`text-[10px] font-medium tracking-wide text-white/65 ${
                  bn ? "bn" : ""
                }`}
              >
                {bn
                  ? "বাংলাদেশের জন্য তৈরি"
                  : "BUILT FOR BANGLADESH"}
              </span>
            </div>

            <h1
              className={`max-w-[570px] text-[38px] font-bold leading-[1.08] tracking-[-1.3px] md:text-[50px] ${
                bn ? "bn" : ""
              }`}
            >
              {bn
                ? "কাজ করার আগে আপনার আইনি নথি বুঝুন।"
                : "Understand your legal documents before you act."}
            </h1>

            <p
              className={`mt-5 max-w-[530px] text-[13px] leading-6 text-white/58 md:text-[14px] ${
                bn ? "bn" : ""
              }`}
            >
              {bn
                ? "জটিল আইনি ভাষাকে সহজভাবে বুঝুন, গুরুত্বপূর্ণ ধারা শনাক্ত করুন এবং বাংলা বা ইংরেজিতে আপনার নথি সম্পর্কে প্রশ্ন করুন।"
                : "Understand complex legal language, identify important clauses, and ask questions about your document in Bangla or English."}
            </p>

            {/* Bangladesh-specific positioning */}
            <div className="mt-6 max-w-[500px] border-l border-[#42b7a9]/35 pl-4">
              <p
                className={`text-[11px] leading-5 text-white/45 ${
                  bn ? "bn" : ""
                }`}
              >
                {bn
                  ? "বাংলাদেশের ব্যবহারকারীদের কথা মাথায় রেখে তৈরি — বাংলা ও ইংরেজি ভাষা, নথি-কেন্দ্রিক বিশ্লেষণ এবং সহজ ব্যাখ্যার সমন্বয়ে।"
                  : "Designed with Bangladeshi users in mind — combining Bangla and English support with document-focused analysis and simpler explanations."}
              </p>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-3">

              <Link
                to="/upload"
                className="group inline-flex items-center gap-2 rounded-lg bg-[#0d829f] px-5 py-3 text-[12px] font-semibold text-white shadow-[0_8px_25px_rgba(13,130,159,0.18)] transition-all hover:-translate-y-0.5 hover:bg-[#1191ad]"
              >
                {bn ? "নথি বিশ্লেষণ করুন" : "Analyze a Document"}

                <ArrowRight
                  className="size-3.5 transition-transform group-hover:translate-x-0.5"
                  strokeWidth={2}
                />
              </Link>

              <Link
                to="/how-it-works"
                className="inline-flex items-center rounded-lg border border-white/10 bg-white/[0.035] px-5 py-3 text-[12px] font-medium text-white/75 transition-all hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
              >
                {bn ? "কীভাবে কাজ করে" : "How It Works"}
              </Link>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] text-white/40">
              <span className="flex items-center gap-1.5">
                <ShieldCheck
                  className="size-3.5"
                  strokeWidth={1.7}
                />
                {bn ? "গোপনীয়তা-কেন্দ্রিক" : "Privacy-conscious"}
              </span>

              <span className="h-3 w-px bg-white/10" />

              <span className="flex items-center gap-1.5">
                <Languages
                  className="size-3.5"
                  strokeWidth={1.7}
                />
                {bn ? "বাংলা + ইংরেজি" : "Bangla + English"}
              </span>
            </div>
          </div>

          {/* =====================================================
              ROTATING DOCUMENT ANALYSIS
          ===================================================== */}
          <div className="relative flex items-center justify-center">

            {/* Floating analysis status */}
            <div className="absolute -left-1 top-4 z-30 hidden rounded-xl border border-white/10 bg-[#1b2b40]/95 px-3.5 py-3 shadow-xl backdrop-blur-md sm:block md:-left-4 md:top-8">
              <div className="flex items-center gap-2.5">
                <div className="flex size-7 items-center justify-center rounded-lg bg-[#0d829f]/15">
                  <FileSearch
                    className="size-3.5 text-[#54bdc1]"
                    strokeWidth={1.8}
                  />
                </div>

                <div>
                  <p className="text-[9px] font-semibold text-white/75">
                    {bn ? "নথি বিশ্লেষণ" : "DOCUMENT ANALYSIS"}
                  </p>

                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="size-1.5 animate-pulse rounded-full bg-[#42b7a9]" />

                    <p className="text-[8px] text-white/35">
                      {bn ? "চলছে" : "Reviewing"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Main application frame */}
            <div className="relative w-full max-w-[570px] rounded-2xl border border-white/10 bg-[#fdfdfc] p-2 shadow-[0_30px_90px_rgba(0,0,0,0.30)]">

              {/* Browser bar */}
              <div className="flex h-9 items-center border-b border-[#e7ebef] px-3">
                <div className="flex gap-1.5">
                  <span className="size-1.5 rounded-full bg-[#d8dde2]" />
                  <span className="size-1.5 rounded-full bg-[#d8dde2]" />
                  <span className="size-1.5 rounded-full bg-[#d8dde2]" />
                </div>

                <div className="mx-auto rounded-md bg-[#f1f3f5] px-8 py-1 text-[8px] text-[#9aa3ad]">
                  legalease.app
                </div>
              </div>

              {/* Application content */}
              <div className="grid min-h-[405px] grid-cols-[0.96fr_0.9fr] gap-3 p-4">

                {/* -------------------------------------------------
                    DOCUMENT IMAGE
                ------------------------------------------------- */}
                <div className="relative overflow-hidden rounded-xl border border-[#e4e8eb] bg-[#f5f5f3]">

                  {/* Rotating image */}
                  <div className="absolute inset-0">
                    {currentDocuments.map((document, index) => (
                      <img
                        key={document.title}
                        src={document.image}
                        alt={document.title}
                        className={`absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-700 ${
                          index === activeDocument
                            ? "opacity-100"
                            : "opacity-0"
                        }`}
                      />
                    ))}
                  </div>

                  {/* Fallback document presentation if images aren't
                      available yet */}
                  <div className="pointer-events-none absolute inset-0 bg-white/10" />

                  {/* Document header */}
                  <div className="absolute left-3 right-3 top-3 rounded-lg border border-white/70 bg-white/90 px-3 py-2 shadow-sm backdrop-blur-sm">
                    <div className="flex items-center gap-2">

                      <div className="flex size-7 items-center justify-center rounded-md bg-[#edf6f7]">
                        <FileText
                          className="size-3.5 text-[#157f94]"
                          strokeWidth={1.8}
                        />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-[9px] font-semibold text-[#253043]">
                          {currentDocument.title}
                        </p>

                        <p className="mt-0.5 text-[7px] text-[#9ca5ae]">
                          {currentDocument.type} · {currentDocument.pages}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Highlighted clause */}
                  <div className="absolute bottom-12 left-3 right-3 rounded-lg border border-[#b7dfe0] bg-[#eff9f8]/95 px-3 py-2 shadow-sm backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-[#15929a]" />

                      <p className="text-[8px] font-semibold text-[#167583]">
                        {bn
                          ? "গুরুত্বপূর্ণ বিষয় শনাক্ত হয়েছে"
                          : "Important area identified"}
                      </p>
                    </div>
                  </div>

                  {/* Document page indicator */}
                  <div className="absolute bottom-3 right-3 rounded-md bg-[#172033]/80 px-2 py-1 text-[7px] font-medium text-white/75 backdrop-blur-sm">
                    {activeDocument + 1} / {currentDocuments.length}
                  </div>
                </div>

                {/* -------------------------------------------------
                    AI ANALYSIS PANEL
                ------------------------------------------------- */}
                <div className="rounded-xl border border-[#e5e9ec] bg-[#f7f9fa] p-4">

                  <div className="flex items-center justify-between">
                    <p className="text-[8px] font-bold uppercase tracking-[0.8px] text-[#8b949e]">
                      AI SUMMARY
                    </p>

                    <div className="flex size-5 items-center justify-center rounded-full bg-[#e9f6f5]">
                      <span className="size-1.5 rounded-full bg-[#36a99d]" />
                    </div>
                  </div>

                  <p className="pt-4 text-[12px] font-semibold leading-5 text-[#1e2938]">
                    {currentDocument.summary}
                  </p>

                  {/* Attention */}
                  <div className="mt-4 rounded-lg border border-[#ecdcae] bg-[#fffaf0] p-3">
                    <div className="flex items-start gap-2">

                      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#f4e7bf]">
                        <span className="text-[9px] font-bold text-[#9b7620]">
                          !
                        </span>
                      </div>

                      <div>
                        <p className="text-[9px] font-bold text-[#69531e]">
                          {bn
                            ? "মনোযোগের বিষয়"
                            : "Needs attention"}
                        </p>

                        <p className="mt-1 text-[8px] leading-4 text-[#8a7745]">
                          {currentDocument.attention}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Key information */}
                  <div className="mt-3 rounded-lg border border-[#dfe5e8] bg-white p-3">

                    <div className="flex items-center justify-between">
                      <p className="text-[8px] font-semibold text-[#68727d]">
                        {bn ? "মূল তথ্য" : "Key information"}
                      </p>

                      <FileSearch
                        className="size-3 text-[#7d8994]"
                        strokeWidth={1.7}
                      />
                    </div>

                    <div className="mt-3 space-y-2">

                      <div className="flex justify-between text-[8px]">
                        <span className="text-[#9aa3ac]">
                          {currentDocument.keyOne}
                        </span>

                        <span className="font-semibold text-[#303b49]">
                          {currentDocument.valueOne}
                        </span>
                      </div>

                      <div className="h-px bg-[#eef0f2]" />

                      <div className="flex justify-between text-[8px]">
                        <span className="text-[#9aa3ac]">
                          {currentDocument.keyTwo}
                        </span>

                        <span className="font-semibold text-[#303b49]">
                          {currentDocument.valueTwo}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Question prompt */}
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#dfe5e8] bg-white px-3 py-2.5">

                    <MessageCircleQuestion
                      className="size-3.5 text-[#148196]"
                      strokeWidth={1.7}
                    />

                    <span className="truncate text-[8px] text-[#9aa3ac]">
                      {bn
                        ? "এই নথি সম্পর্কে প্রশ্ন করুন..."
                        : "Ask about this document..."}
                    </span>

                    <AudioLines
                      className="ml-auto size-3 shrink-0 text-[#9aa3ac]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Document selector */}
            <div className="absolute -bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/10 bg-[#18283d]/90 px-3 py-2 shadow-lg backdrop-blur-md">
              {currentDocuments.map((document, index) => (
                <button
                  key={document.title}
                  type="button"
                  aria-label={`Show ${document.title}`}
                  onClick={() => setActiveDocument(index)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index === activeDocument
                      ? "w-5 bg-[#42b7a9]"
                      : "w-1.5 bg-white/25 hover:bg-white/45"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          FEATURES
      ========================================================= */}
      <section className="bg-[#f5f7f9]">

        <div className="mx-auto w-full max-w-[1180px] px-6 py-16 md:px-12 md:py-20">

          <div className="mx-auto max-w-[650px] text-center">

            <div className="mx-auto flex size-9 items-center justify-center rounded-xl border border-[#dfe8ea] bg-white shadow-sm">
              <FileSearch
                className="size-4 text-[#13849b]"
                strokeWidth={1.7}
              />
            </div>

            <p
              className={`mt-4 text-[10px] font-bold uppercase tracking-[1.5px] text-[#83909c] ${
                bn ? "bn" : ""
              }`}
            >
              {bn ? "LEGALEASE কী করতে পারে" : "WHAT LEGALEASE CAN DO"}
            </p>

            <h2
              className={`mt-3 text-[27px] font-bold leading-tight tracking-[-0.5px] text-[#152238] md:text-[34px] ${
                bn ? "bn" : ""
              }`}
            >
              {bn
                ? "আইনি নথি বোঝা আরও সহজ করুন"
                : "Make Legal Documents Easier to Understand"}
            </h2>

            <p
              className={`mx-auto mt-3 max-w-[570px] text-[12px] leading-5 text-[#7d8995] md:text-[13px] ${
                bn ? "bn" : ""
              }`}
            >
              {bn
                ? "আপনার নথির গুরুত্বপূর্ণ বিষয়গুলো বুঝুন, প্রশ্ন করুন এবং সিদ্ধান্ত নেওয়ার আগে কী পর্যালোচনা করা দরকার তা পরিষ্কারভাবে দেখুন।"
                : "Understand what's important, ask questions, and see what deserves your attention before making a decision."}
            </p>
          </div>

          {/* Five cards */}
          <div className="mx-auto mt-10 grid max-w-[1080px] gap-4 md:grid-cols-2 lg:grid-cols-3">

            {features.map((feature, index) => {
              const Icon = feature.icon;

              return (
                <div
                  key={feature.title}
                  className={`group relative flex min-h-[205px] flex-col overflow-hidden rounded-2xl border border-[#e2e7eb] bg-white p-6 shadow-[0_4px_18px_rgba(24,42,61,0.035)] transition-all duration-300 hover:-translate-y-1 hover:border-[#c9dfe3] hover:shadow-[0_14px_35px_rgba(24,42,61,0.08)] ${
                    index === 3
                      ? "lg:col-start-1"
                      : ""
                  }`}
                >

                  <div className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-[#edf7f7] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                  <div className="relative flex size-11 items-center justify-center rounded-xl border border-[#dceced] bg-[#f0f8f8]">
                    <Icon
                      className="size-[21px] text-[#148399]"
                      strokeWidth={1.65}
                    />
                  </div>

                  <div className="relative mt-6">
                    <p
                      className={`max-w-[270px] text-[14px] font-bold leading-5 tracking-[-0.1px] text-[#18263a] ${
                        bn ? "bn" : ""
                      }`}
                    >
                      {feature.title}
                    </p>

                    <p
                      className={`mt-2.5 max-w-[285px] text-[11px] leading-5 text-[#7e8994] ${
                        bn ? "bn" : ""
                      }`}
                    >
                      {feature.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* =========================================================
          TRUST + FAQ
      ========================================================= */}
      <section className="bg-white">

        <div className="mx-auto w-full max-w-[1080px] px-6 py-16 md:px-12 md:py-20">

          {/* Trust */}
          <div className="mx-auto max-w-[800px] text-center">

            <p
              className={`text-[10px] font-bold uppercase tracking-[1.5px] text-[#89949e] ${
                bn ? "bn" : ""
              }`}
            >
              {bn ? "কেন LEGALEASE" : "BUILT WITH PURPOSE"}
            </p>

            <h2
              className={`mt-3 text-[27px] font-bold tracking-[-0.5px] text-[#152238] md:text-[34px] ${
                bn ? "bn" : ""
              }`}
            >
              {bn
                ? "আপনার নথি। আপনার বোঝাপড়া। আপনার সিদ্ধান্ত।"
                : "Your document. Your understanding. Your decision."}
            </h2>

            <p
              className={`mx-auto mt-3 max-w-[620px] text-[12px] leading-5 text-[#7d8995] ${
                bn ? "bn" : ""
              }`}
            >
              {bn
                ? "AinBodh আপনাকে তথ্য বুঝতে সাহায্য করে — সিদ্ধান্ত আপনার।"
                : "AinBodh helps you understand the information. The decision remains yours."}
            </p>
          </div>

          {/* Trust pillars */}
          <div className="mx-auto mt-9 grid max-w-[900px] gap-4 sm:grid-cols-2 lg:grid-cols-4">

            {[
              {
                icon: ShieldCheck,
                title: bn ? "গোপনীয়তা-কেন্দ্রিক" : "Privacy-conscious",
                desc: bn
                  ? "আপনার নথির তথ্যকে গুরুত্ব দিয়ে ডিজাইন করা।"
                  : "Designed with the sensitivity of legal documents in mind.",
              },
              {
                icon: Languages,
                title: bn ? "বাংলা + ইংরেজি" : "Bangla + English",
                desc: bn
                  ? "আপনার জন্য যে ভাষা স্বাভাবিক, সেটিতেই ব্যবহার করুন।"
                  : "Use the language that feels most natural to you.",
              },
              {
                icon: FileSearch,
                title: bn ? "নথি-ভিত্তিক" : "Document-based",
                desc: bn
                  ? "আপনার দেওয়া তথ্যের ওপর ভিত্তি করে বুঝতে সাহায্য করে।"
                  : "Designed around the information in the document you provide.",
              },
              {
                icon: Scale,
                title: bn ? "সিদ্ধান্ত আপনার" : "Your decision",
                desc: bn
                  ? "AinBodh সিদ্ধান্ত নেয় না — আপনাকে বুঝতে সাহায্য করে।"
                  : "AinBodh informs your decision rather than making it for you.",
              },
            ].map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.title}
                  className="rounded-xl border border-[#e6eaed] bg-[#fafbfb] p-5"
                >
                  <div className="flex size-9 items-center justify-center rounded-lg bg-[#edf7f7]">
                    <Icon
                      className="size-[17px] text-[#168298]"
                      strokeWidth={1.65}
                    />
                  </div>

                  <p
                    className={`mt-4 text-[12px] font-bold text-[#1b293b] ${
                      bn ? "bn" : ""
                    }`}
                  >
                    {item.title}
                  </p>

                  <p
                    className={`mt-2 text-[10px] leading-5 text-[#818c97] ${
                      bn ? "bn" : ""
                    }`}
                  >
                    {item.desc}
                  </p>
                </div>
              );
            })}
          </div>

          {/* FAQ */}
          <div className="mx-auto mt-16 max-w-[820px]">

            <div className="text-center">

              <p
                className={`text-[10px] font-bold uppercase tracking-[1.5px] text-[#89949e] ${
                  bn ? "bn" : ""
                }`}
              >
                {bn ? "সাধারণ প্রশ্ন" : "FREQUENTLY ASKED QUESTIONS"}
              </p>

              <h3
                className={`mt-3 text-[23px] font-bold tracking-[-0.3px] text-[#17253a] ${
                  bn ? "bn" : ""
                }`}
              >
                {bn
                  ? "AinBodh সম্পর্কে"
                  : "A few things you may want to know"}
              </h3>
            </div>

            <div className="mt-7 space-y-2.5">

              {faq[lang].map(([question, answer], index) => {
                const isOpen = openFaq === index;

                return (
                  <div
                    key={question}
                    className={`overflow-hidden rounded-xl border transition-colors ${
                      isOpen
                        ? "border-[#cfe3e5] bg-[#f8fbfb]"
                        : "border-[#e6eaed] bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenFaq(isOpen ? null : index)
                      }
                      className="flex w-full items-center justify-between px-5 py-4 text-left"
                    >
                      <span
                        className={`pr-5 text-[12px] font-semibold text-[#243246] ${
                          bn ? "bn" : ""
                        }`}
                      >
                        {question}
                      </span>

                      <ChevronDown
                        className={`size-4 shrink-0 text-[#87929d] transition-transform duration-200 ${
                          isOpen ? "rotate-180" : ""
                        }`}
                        strokeWidth={1.7}
                      />
                    </button>

                    {isOpen && (
                      <div
                        className={`px-5 pb-5 text-[11px] leading-5 text-[#7c8792] ${
                          bn ? "bn" : ""
                        }`}
                      >
                        {answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Final CTA */}
          <div className="mx-auto mt-14 max-w-[820px] rounded-2xl border border-[#dce7e8] bg-[#f4f9f9] px-6 py-9 text-center md:px-12">

            <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-[#dce7e8]">
              <Scale
                className="size-[18px] text-[#168298]"
                strokeWidth={1.6}
              />
            </div>

            <h3
              className={`mt-5 text-[21px] font-bold tracking-[-0.3px] text-[#17253a] ${
                bn ? "bn" : ""
              }`}
            >
              {bn
                ? "আপনার নথি বুঝতে প্রস্তুত?"
                : "Ready to understand your document?"}
            </h3>

            <p
              className={`mx-auto mt-2.5 max-w-[500px] text-[11px] leading-5 text-[#7e8993] ${
                bn ? "bn" : ""
              }`}
            >
              {bn
                ? "আপনার নথি দিয়ে শুরু করুন এবং গুরুত্বপূর্ণ বিষয়গুলো আরও পরিষ্কারভাবে বুঝুন।"
                : "Start with your document and get a clearer view of the information that matters."}
            </p>

            <div className="mt-5">
              <Link
                to="/upload"
                className="group inline-flex items-center gap-2 rounded-lg bg-[#13233a] px-5 py-3 text-[11px] font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#1b304b]"
              >
                {bn
                  ? "নথি বিশ্লেষণ শুরু করুন"
                  : "Start Document Analysis"}

                <ArrowRight
                  className="size-3.5 transition-transform group-hover:translate-x-0.5"
                  strokeWidth={1.8}
                />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          FOOTER
      ========================================================= */}
      <footer className="border-t border-[#e4e8eb] bg-[#f3f5f7] px-6 py-5 md:px-12">

        <div className="mx-auto flex max-w-[1180px] flex-col gap-2 text-[10px] text-[#87919b] sm:flex-row sm:items-center sm:justify-between">

          <div className="flex items-center gap-1.5">
            <Scale
              className="size-3.5"
              strokeWidth={1.6}
            />

            <span className={bn ? "bn" : ""}>
              {bn
                ? "AinBodh — আপনার নথি বুঝতে সাহায্য করে।"
                : "AinBodh — helping you understand your documents."}
            </span>
          </div>

          <span className={bn ? "bn" : ""}>
            {bn
              ? "আইনি পরামর্শের বিকল্প নয়।"
              : "Not a substitute for qualified legal advice."}
          </span>
        </div>
      </footer>
    </div>
  );
}
