import express from "express";
import "dotenv/config";
import Groq from "groq-sdk";
import { pipeline } from "@xenova/transformers";
import { supabase } from "./supabase";
import multer from "multer";
import { DocumentError, extractDocument } from "./documentExtractor";
import { attachOfficialSources, resolveOfficialSource } from "./bdlaws";
import {
  currentLawFor,
  findActsByName,
  getLawStatus,
  isRepealedSectionText,
  loadLegalCorpus,
  questionNamesAct,
  questionReferencesActYear,
  searchByConcepts,
  splitSections,
} from "./legalCorpus";
import {
  planRetrieval,
  rerankEvidence,
  type Candidate,
  type RetrievalPlan,
  type RiskFlags,
} from "./legalReasoning";
import { supportResources } from "./legalReasoning";
import { applyHttpGuards, errorHandler } from "./httpGuards";
import { checkActsLive, initLiveLaws, lawNotesText, type LawNote } from "./liveLaws";
import {
  classifyTurn,
  detectEmotionalWeight,
  resolveAnswerLanguage,
  socialReply,
  writtenLanguage,
  type AnswerLanguage,
} from "./conversation";
import { NO_RISK, mergeRisk, supportSection } from "./legalReasoning";
import { registerVoiceRoutes, ttsProvider } from "./voice";
import { registerCompareRoute } from "./compare";
import { extractMainText } from "./mainText";

const app = express();

applyHttpGuards(app);
app.use(express.json({ limit: "2mb" }));

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 1,
  },
});

const PORT = Number(process.env.PORT || 5000);

if (!process.env.GROQ_API_KEY) {
  throw new Error("Missing GROQ_API_KEY in backend/.env");
}

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
  timeout: Number(process.env.GROQ_TIMEOUT_MS || 60_000),
  maxRetries: 2,
});

const EMBEDDING_MODEL = "Xenova/bge-m3";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

let embedder: any = null;

/* =========================================================
   BASIC
========================================================= */

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "AinBodh Legal API",
  });
});

app.get("/test-supabase", async (_req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ ok: false, error: "Not found." });
  }

  try {
    const { data, error } = await supabase
      .from("legal_metadata")
      .select("*")
      .limit(1);

    if (error) {
      return res.status(500).json({
        ok: false,
        error: error.message,
      });
    }

    return res.json({
      ok: true,
      sample: data,
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Unknown error",
    });
  }
});

/* =========================================================
   DOCUMENT EXTRACTION
========================================================= */

app.post(
  "/api/legal/extract",
  documentUpload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: "No document file was uploaded.",
        });
      }

      debugLog("");
      debugLog("========================================");
      debugLog("DOCUMENT EXTRACTION");
      debugLog("========================================");
      debugLog("File:", req.file.originalname);
      debugLog("MIME:", req.file.mimetype);
      debugLog("Size:", req.file.size);

      const extracted = await extractDocument(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
      );

      return res.json({
        ok: true,
        ...extracted,
      });
    } catch (error) {
      console.error(
        "DOCUMENT EXTRACTION ERROR:",
        error instanceof Error ? error.message : error,
      );

      // Problems with the file itself (wrong type, empty, unreadable) are explained;
      // anything else gets a generic message.
      if (error instanceof DocumentError) {
        return res.status(error.status).json({ ok: false, error: error.message });
      }

      return res.status(500).json({
        ok: false,
        error: "The document could not be processed. Please try again, or upload a clearer copy.",
      });
    }
  },
);

/* =========================================================
   EMBEDDING
========================================================= */

async function getEmbedder() {
  if (!embedder) {
    console.log(`Loading embedding model: ${EMBEDDING_MODEL}`);

    embedder = await pipeline(
      "feature-extraction",
      EMBEDDING_MODEL,
    );

    console.log("Embedding model loaded.");
  }

  return embedder;
}

async function embedQuery(text: string): Promise<number[]> {
  const model = await getEmbedder();

  const output = await model(text, {
    pooling: "cls",
    normalize: true,
  });

  return Array.from(output.data);
}

/* =========================================================
   NORMALIZATION
========================================================= */

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”‘’"']/g, " ")
    .replace(/[।,!?;:()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBangla(text: string): string {
  return normalizeText(text)
    .replace(/ভাড়া/g, "ভাড়া")
    .replace(/বাড়িওয়ালা/g, "বাড়িওয়ালা")
    .replace(/বাড়িওয়ালা/g, "বাড়িওয়ালা")
    .replace(/ভাড়াটিয়া/g, "ভাড়াটিয়া")
    .replace(/ভাড়াটী/g, "ভাড়াটিয়া")
    .replace(/বাড়ীর/g, "বাড়ির")
    .replace(/বাড়ি/g, "বাড়ি")
    .replace(/বাড়ী/g, "বাড়ি");
}

function normalizeLegalText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value.toLowerCase().trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).toLowerCase().trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeLegalText(item))
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value).toLowerCase().trim();
    } catch {
      return "";
    }
  }

  return "";
}

function normalizeActName(value: string): string {
  return normalizeLegalText(value)
    .replace(/\bthe\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================================================
   COMMUNICATION STYLE
========================================================= */

type CommunicationStyle =
  | "english"
  | "bangla"
  | "banglish";

function detectCommunicationStyle(
  question: string,
): CommunicationStyle {
  const text = question.trim();

  const banglaChars =
    text.match(/[\u0980-\u09FF]/g)?.length ?? 0;

  const latinChars =
    text.match(/[A-Za-z]/g)?.length ?? 0;

  if (banglaChars > 0) {
    return "bangla";
  }

  const lower = text.toLowerCase();

  const banglishMarkers = [
    "ami",
    "amar",
    "amake",
    "amra",
    "amader",
    "apni",
    "apnar",
    "apnake",
    "bariwala",
    "barir malik",
    "barivara",
    "vara",
    "bhara",
    "nibe",
    "nite",
    "chay",
    "chai",
    "chacche",
    "korbo",
    "korben",
    "ki korbo",
    "parbo",
    "parben",
    "hobe",
    "ache",
    "nei",
    "den",
    "diben",
    "bolen",
    "kivabe",
    "keno",
    "jodi",
    "tahole",
    "korte",
    "korar",
    "niye",
    "dite",
  ];

  const looksBanglish = banglishMarkers.some(
    (marker) => lower.includes(marker),
  );

  if (looksBanglish) {
    return "banglish";
  }

  return latinChars > 0
    ? "english"
    : "bangla";
}

/* =========================================================
   LEGAL INTENT
========================================================= */

type LegalIntent =
  | "rent_refusal"
  | "rent_receipt"
  | "eviction"
  | "unknown";

function detectLegalIntent(
  question: string,
): LegalIntent {
  const text = normalizeBangla(question);

  const hasRent =
    text.includes("ভাড়া") ||
    text.includes("ভাড়া") ||
    text.includes("rent");

  const hasLandlordTenant =
    text.includes("বাড়িওয়ালা") ||
    text.includes("বাড়ির মালিক") ||
    text.includes("বাড়িওয়ালা") ||
    text.includes("landlord") ||
    text.includes("tenant") ||
    text.includes("ভাড়াটিয়া") ||
    text.includes("ভাড়াটিয়া");

  const rentRefusalTerms = [
    "ভাড়া গ্রহণ করতে অস্বীকার",
    "গ্রহণ করতে অস্বীকার",
    "ভাড়া গ্রহণ করতে চাইছে না",
    "ভাড়া গ্রহণ করতে চাচ্ছে না",
    "ভাড়া নিতে অস্বীকার",
    "ভাড়া নিতে অস্বীকার করছে",
    "ভাড়া নিতে চাইছে না",
    "ভাড়া নিতে চাচ্ছে না",
    "ভাড়া নিচ্ছে না",
    "ভাড়া নিচ্ছেন না",
    "ভাড়া নেয় না",
    "ভাড়া নেয় না",
    "ভাড়া গ্রহণ করতে অস্বীকার",
    "ভাড়া গ্রহণ করতে চাইছে না",
    "ভাড়া গ্রহণ করতে চাচ্ছে না",
    "ভাড়া নিতে অস্বীকার",
    "ভাড়া নিতে অস্বীকার করছে",
    "ভাড়া নিতে চাইছে না",
    "ভাড়া নিতে চাচ্ছে না",
    "ভাড়া নিচ্ছে না",
    "ভাড়া নিচ্ছেন না",
    "ভাড়া নেয় না",
    "rent refused",
    "refused to accept rent",
    "refuses to accept rent",
    "won't accept rent",
    "will not accept rent",
    "not accepting rent",
  ];

  const receiptTerms = [
    "ভাড়ার রশিদ",
    "ভাড়ার রশিদ",
    "রশিদ প্রদান",
    "ভাড়া পরিশোধের রশিদ",
    "ভাড়া পরিশোধের রশিদ",
    "ভাড়ার receipt",
    "rent receipt",
    "receipt for rent",
  ];

  const evictionTerms = [
    "উচ্ছেদ",
    "উচ্ছেদের নোটিশ",
    "উচ্ছেদ নোটিশ",
    "বাড়ি থেকে বের করে",
    "বাড়ি থেকে বের করে",
    "বের করে দিতে",
    "বের করে দেব",
    "eviction",
    "eviction notice",
    "evict",
  ];

  if (
    hasRent &&
    rentRefusalTerms.some((term) =>
      text.includes(term),
    ) &&
    (hasLandlordTenant ||
      rentRefusalTerms.some((term) =>
        text.includes(term),
      ))
  ) {
    return "rent_refusal";
  }

  if (
    hasRent &&
    receiptTerms.some((term) =>
      text.includes(term),
    ) &&
    (hasLandlordTenant ||
      receiptTerms.some((term) =>
        text.includes(term),
      ))
  ) {
    return "rent_receipt";
  }

  if (
    evictionTerms.some((term) =>
      text.includes(term),
    ) &&
    (hasLandlordTenant || hasRent)
  ) {
    return "eviction";
  }

  const landlordRefusingRent =
    hasRent &&
    hasLandlordTenant &&
    (
      text.includes("নিতে চাচ্ছে না") ||
      text.includes("নিতে চাইছে না") ||
      text.includes("নিচ্ছে না") ||
      text.includes("নিচ্ছেন না") ||
      text.includes("গ্রহণ করছে না") ||
      text.includes("গ্রহণ করছেন না") ||
      text.includes("গ্রহণ করতে চাচ্ছে না") ||
      text.includes("গ্রহণ করতে চাইছে না") ||
      text.includes("accept করছে না") ||
      text.includes("accept করতে চাচ্ছে না") ||
      text.includes("accept করতে চাইছে না") ||
      text.includes("refused") ||
      text.includes("refuse") ||
      text.includes("not accepting")
    );

  if (landlordRefusingRent) {
    return "rent_refusal";
  }

  return "unknown";
}

/* =========================================================
   SITUATION ANALYSIS
========================================================= */

type SituationAnalysis = {
  queryType:
    | "direct"
    | "situational";
  legalIssue: string;
  facts: string[];
  timePeriod: string | null;
  requestedHelp: string;
  missingFacts: string[];
  retrievalQuery: string;
};

function fallbackSituationAnalysis(
  question: string,
  intent: LegalIntent,
): SituationAnalysis {
  let legalIssue = "Unknown legal issue";

  if (intent === "rent_refusal") {
    legalIssue =
      "landlord refusing to accept rent";
  } else if (intent === "rent_receipt") {
    legalIssue =
      "rent receipt";
  } else if (intent === "eviction") {
    legalIssue =
      "eviction";
  }

  const lowerQuestion =
    question.toLowerCase();

  const looksLikeQuestion =
    /\b(what|why|how|can|could|would|should)\b/i.test(
      question,
    ) ||
    question.includes("কি") ||
    question.includes("কী") ||
    question.includes("কেন") ||
    question.includes("কিভাবে") ||
    question.includes("কীভাবে") ||
    lowerQuestion.includes("korbo") ||
    lowerQuestion.includes("kivabe") ||
    lowerQuestion.includes("keno");

  /*
   * --------------------------------------------------------
   * INHERITANCE / ESTATE / WILL
   * --------------------------------------------------------
   */

  const inheritanceSignals = [
    "inheritance",
    "inherit",
    "inherited",
    "estate",
    "will",
    "willed",
    "testament",
    "grandfather",
    "grandmother",
    "father's assets",
    "father's property",
    "father property",
    "uncle",
    "uncles",
    "cousin",
    "heir",
    "heirs",
    "succession",
    "share",
    "property transfer",
    "transfer the property",
    "assets",
    "সম্পত্তি",
    "সম্পত্তির",
    "উত্তরাধিকার",
    "ওয়ারিশ",
    "ওয়ারিশ",
    "উইল",
    "দাদা",
    "নানা",
    "চাচা",
    "মামা",
    "কাকা",
    "চাচাতো ভাই",
    "সম্পত্তি নেওয়া",
    "সম্পত্তি নিতে",
  ];

  const isInheritanceCase =
    inheritanceSignals.some(
      (term) =>
        lowerQuestion.includes(
          term.toLowerCase(),
        ),
    );

  if (isInheritanceCase) {
    return {
      queryType: "situational",

      legalIssue:
        "inheritance, will, estate ownership, and attempted property transfer",

      facts: [
        question.trim(),
      ],

      timePeriod: null,

      requestedHelp:
        question.trim(),

      missingFacts: [
        "applicable personal-law or succession regime",
        "whether the father is currently alive",
        "exact wording and legal status of the grandfather's will",
        "whether the property was transferred or registered in the father's name",
        "whether an actual transfer to the cousin has been attempted or completed",
        "location and type of the disputed property",
      ],

      retrievalQuery:
        "Bangladesh law inheritance succession will estate property ownership transfer family dispute attempted transfer of inherited property",
    };
  }

  /*
   * --------------------------------------------------------
   * BLACKMAIL / THREATS
   * --------------------------------------------------------
   */

  const blackmailSignals = [
    "blackmail",
    "blackmailing",
    "threatened",
    "threaten",
    "threat",
    "coerce",
    "coercion",
    "send the photos",
    "share the photos",
    "post the photos",
    "leak the photos",
    "intimate image",
    "private image",
    "private photos",
    "ai-generated",
    "ai generated",
    "deepfake",
  ];

  const isBlackmailCase =
    blackmailSignals.some(
      (term) =>
        lowerQuestion.includes(term),
    );

  if (isBlackmailCase) {
    return {
      queryType: "situational",
      legalIssue:
        "blackmail, threats, coercion, and threatened distribution of private or AI-generated images",
      facts: [
        question.trim(),
      ],
      timePeriod: null,
      requestedHelp:
        question.trim(),
      missingFacts: [
        "whether an actual threat or demand was made",
        "whether any private material has already been distributed",
        "whether the person making the threat is known to the user",
      ],
      retrievalQuery:
        "Bangladesh law blackmail threats coercion intimidation AI-generated images deepfake private intimate images threatened distribution sharing online cybercrime",
    };
  }

  /*
   * --------------------------------------------------------
   * GENERAL FALLBACK
   * --------------------------------------------------------
   */

  return {
    queryType: looksLikeQuestion
      ? "situational"
      : "direct",

    legalIssue,

    facts: [
      question.trim(),
    ],

    timePeriod: null,

    requestedHelp:
      question.trim(),

    missingFacts: [],

    retrievalQuery:
      `${question} ${legalIssue}`.trim(),
  };
}

async function analyzeSituation(
  question: string,
  intent: LegalIntent,
): Promise<SituationAnalysis> {
  const prompt = `
Analyze the user's input ONLY for legal-information retrieval.

Do NOT answer the legal question.
Do NOT give legal advice.
Do NOT determine legal rights.
Do NOT assume facts.
Do NOT assume which law applies.

Extract:
- the type of query
- the main legal issue(s)
- explicitly stated facts
- explicitly stated time period
- what the user wants help with
- important missing facts
- a short neutral retrieval query

For inheritance, succession, family-property, marriage, divorce,
maintenance, guardianship, or similar personal-law matters:

- Do NOT assume a religion or personal-law regime.
- If the applicable legal/personal-law regime is not stated,
  include that as a missing fact.
- Do NOT determine inheritance shares.

Return ONLY valid JSON.
Keep every string SHORT.
Do not repeat the user's entire question.

Required JSON structure:

{
  "queryType": "direct" | "situational",
  "legalIssue": "short issue",
  "facts": ["short explicit facts"],
  "timePeriod": "short explicit time period or null",
  "requestedHelp": "short description",
  "missingFacts": ["important missing facts"],
  "retrievalQuery": "short neutral retrieval query"
}

USER INPUT:
${question}

DETECTED INTENT:
${intent}
`;

  try {
    const completion =
      await groq.chat.completions.create({
        model: GROQ_MODEL,
        temperature: 0,
        max_tokens: 1600,
        response_format: {
          type: "json_object",
        },
        messages: [
          {
            role: "system",
            content:
              "You analyze legal queries for retrieval. Return only compact valid JSON. Never provide legal advice.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      });

    const raw =
      completion.choices?.[0]?.message?.content?.trim();

    if (!raw) {
      console.warn(
        "Situation analysis returned empty output. Using fallback.",
      );

      return fallbackSituationAnalysis(
        question,
        intent,
      );
    }

    const cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed: Partial<SituationAnalysis>;

    try {
      parsed =
        JSON.parse(cleaned) as Partial<SituationAnalysis>;
    } catch (parseError) {
      console.error(
        "SITUATION JSON PARSE FAILED:",
        parseError,
      );

      return fallbackSituationAnalysis(
        question,
        intent,
      );
    }

    const analysis: SituationAnalysis = {
      queryType:
        parsed.queryType === "situational"
          ? "situational"
          : "direct",

      legalIssue:
        typeof parsed.legalIssue === "string" &&
        parsed.legalIssue.trim()
          ? parsed.legalIssue.trim()
          : "Unknown legal issue",

      facts:
        Array.isArray(parsed.facts)
          ? parsed.facts
              .filter(
                (item): item is string =>
                  typeof item === "string" &&
                  item.trim().length > 0,
              )
              .map((item) => item.trim())
              .slice(0, 12)
          : [],

      timePeriod:
        typeof parsed.timePeriod === "string" &&
        parsed.timePeriod.trim()
          ? parsed.timePeriod.trim()
          : null,

      requestedHelp:
        typeof parsed.requestedHelp === "string" &&
        parsed.requestedHelp.trim()
          ? parsed.requestedHelp.trim()
          : question,

      missingFacts:
        Array.isArray(parsed.missingFacts)
          ? parsed.missingFacts
              .filter(
                (item): item is string =>
                  typeof item === "string" &&
                  item.trim().length > 0,
              )
              .map((item) => item.trim())
              .slice(0, 10)
          : [],

      retrievalQuery:
        typeof parsed.retrievalQuery === "string" &&
        parsed.retrievalQuery.trim()
          ? parsed.retrievalQuery.trim()
          : question,
    };

    /*
     * Deterministic applicability protection.
     */

    const normalizedQuestion =
      normalizeLegalText(question);

    const inheritanceTerms = [
      "inheritance",
      "inherit",
      "heir",
      "heirs",
      "will",
      "testator",
      "estate",
      "succession",
      "grandfather",
      "grandmother",
      "uncle",
      "uncles",
      "cousin",
      "father's assets",
      "father assets",
      "property share",
      "family property",
    ];

    const isInheritanceSituation =
      inheritanceTerms.some((term) =>
        normalizedQuestion.includes(term),
      );

    if (isInheritanceSituation) {
      const missing = [
        ...analysis.missingFacts,
      ];

      const addMissing = (fact: string) => {
        if (!missing.includes(fact)) {
          missing.push(fact);
        }
      };

      const regimeTerms = [
        "muslim",
        "islamic",
        "hindu",
        "christian",
        "buddhist",
        "personal law",
        "succession law",
      ];

      if (
        !regimeTerms.some((term) =>
          normalizedQuestion.includes(term),
        )
      ) {
        addMissing(
          "The applicable personal-law or inheritance regime.",
        );
      }

      const fatherAliveTerms = [
        "father is alive",
        "father alive",
        "father is dead",
        "father died",
        "father has died",
      ];

      if (
        !fatherAliveTerms.some((term) =>
          normalizedQuestion.includes(term),
        )
      ) {
        addMissing(
          "Whether the father is currently alive.",
        );
      }

      const willDetailTerms = [
        "will says",
        "will states",
        "wording of the will",
        "copy of the will",
        "registered will",
        "probated will",
        "probate",
      ];

      if (
        normalizedQuestion.includes("will") &&
        !willDetailTerms.some((term) =>
          normalizedQuestion.includes(term),
        )
      ) {
        addMissing(
          "The exact wording and relevant status of the grandfather's will.",
        );
      }

      const ownershipTerms = [
        "registered in my father's name",
        "registered in father's name",
        "registered in my father name",
        "deed in my father's name",
        "deed in father's name",
        "transferred to my father",
        "transferred to father",
      ];

      if (
        !ownershipTerms.some((term) =>
          normalizedQuestion.includes(term),
        )
      ) {
        addMissing(
          "Whether the disputed property or share was actually transferred or registered in the father's name.",
        );
      }

      analysis.missingFacts =
        missing.slice(0, 10);

      if (
        !analysis.retrievalQuery ||
        normalizeLegalText(
          analysis.retrievalQuery,
        ).includes("unknown legal issue")
      ) {
        analysis.retrievalQuery =
          question;
      }
    }

    return analysis;
  } catch (error) {
    console.error(
      "SITUATION ANALYSIS FAILED:",
      error,
    );

    const fallback =
      fallbackSituationAnalysis(
        question,
        intent,
      );

    const normalizedQuestion =
      normalizeLegalText(question);

    const inheritanceTerms = [
      "inheritance",
      "inherit",
      "heir",
      "heirs",
      "will",
      "testator",
      "estate",
      "succession",
      "grandfather",
      "grandmother",
      "uncle",
      "uncles",
      "cousin",
      "father's assets",
      "father assets",
      "property share",
      "family property",
    ];

    const isInheritanceSituation =
      inheritanceTerms.some((term) =>
        normalizedQuestion.includes(term),
      );

    if (isInheritanceSituation) {
      fallback.queryType =
        "situational";

      fallback.legalIssue =
        "inheritance or family-property dispute";

      fallback.retrievalQuery =
        question;

      const missing = [
        ...fallback.missingFacts,
      ];

      const addMissing = (fact: string) => {
        if (!missing.includes(fact)) {
          missing.push(fact);
        }
      };

      addMissing(
        "The applicable personal-law or inheritance regime.",
      );

      addMissing(
        "Whether the father is currently alive.",
      );

      addMissing(
        "The exact wording and relevant status of the grandfather's will.",
      );

      addMissing(
        "Whether the disputed property or share was actually transferred or registered in the father's name.",
      );

      fallback.missingFacts =
        missing.slice(0, 10);
    }

    return fallback;
  }
}

/* =========================================================
   SEARCH TERMS
========================================================= */

const INTENT_TERMS: Record<
  LegalIntent,
  string[]
> = {
  rent_refusal: [
    "ভাড়া গ্রহণ করতে অস্বীকার",
    "গ্রহণ করতে অস্বীকার",
    "ভাড়া জমা",
    "ডাক মনি অর্ডার",
    "মনি অর্ডার",
    "বাড়িওয়ালা",
    "ভাড়াটিয়া",
  ],

  rent_receipt: [
    "ভাড়ার রশিদ",
    "রশিদ প্রদান",
    "ভাড়া পরিশোধ",
    "বাড়িওয়ালা",
    "ভাড়াটিয়া",
  ],

  eviction: [
    "উচ্ছেদ",
    "উচ্ছেদের নোটিশ",
    "ভাড়া বকেয়া",
    "বাড়িওয়ালা",
    "ভাড়াটিয়া",
  ],

  unknown: [],
};

const STOP_WORDS = new Set([
  "আমি",
  "আমার",
  "আমাকে",
  "আমরা",
  "আমাদের",
  "আপনি",
  "আপনার",
  "এই",
  "ওই",
  "একটি",
  "একজন",
  "কি",
  "কী",
  "কেন",
  "কিভাবে",
  "কীভাবে",
  "কোন",
  "কোনো",
  "যদি",
  "তাহলে",
  "যে",
  "যা",
  "তা",
  "এবং",
  "বা",
  "কিন্তু",
  "থেকে",
  "জন্য",
  "সাথে",
  "করে",
  "করতে",
  "করব",
  "করবো",
  "হয়",
  "হয়",
  "হবে",
  "ছিল",
  "আছে",
  "আছি",
  "চাই",
  "চায়",
  "চায়",
  "পারি",
  "পারব",
  "পারবো",
  "দিয়ে",
  "দিয়ে",
  "নিতে",
  "নিয়ে",
  "নিয়ে",
  "দিতে",
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "am",
  "my",
  "me",
  "i",
  "we",
  "our",
  "you",
  "your",
  "they",
  "their",
  "what",
  "why",
  "how",
  "can",
  "could",
  "would",
  "should",
  "do",
  "does",
  "did",
  "to",
  "for",
  "from",
  "with",
  "and",
  "or",
  "but",
  "if",
  "then",
  "in",
  "on",
  "of",
  "this",
  "that",
]);

function extractLegalSearchTerms(
  question: string,
  intent: LegalIntent,
  retrievalQuery?: string,
): string[] {
  const terms = new Set<string>();

  for (const term of INTENT_TERMS[intent]) {
    if (term.trim()) {
      terms.add(term);
    }
  }

  const searchText = [
    question,
    retrievalQuery || "",
  ].join(" ");

  const normalized =
    normalizeBangla(searchText);

  const phrases = normalized
    .split(/[.!?,;:()\n]+/)
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length >= 4);

  for (const phrase of phrases) {
    terms.add(phrase);
  }

  const words = normalized
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !STOP_WORDS.has(word))
    .filter((word) => word.length >= 3);

  for (const word of words) {
    terms.add(word);
  }

  return Array.from(terms)
    .filter((term) => term.trim().length >= 3)
    .slice(0, 30);
}

/* =========================================================
   RESULT TYPE
========================================================= */

type LegalResult = {
  id: string;
  title: string;
  act_file: string;
  start: number;
  end: number;
  text: string;

  sectionNumber?: string | null;

  sourceName?: string | null;
  sourceUrl?: string | null;

  rank?: number;
  similarity?: number;
  lexicalScore?: number;
  exactScore?: number;
  actBoost?: number;
  combinedScore?: number;
  matchedTerms?: string[];
};

/* =========================================================
   LEXICAL SEARCH
========================================================= */

async function lexicalSearch(
  terms: string[],
): Promise<LegalResult[]> {
  const results: LegalResult[] = [];

  for (const term of terms) {
    try {
      const { data, error } =
        await supabase.rpc("search_legal", {
          search_text: term,
          match_count: 12,
        });

      if (error) {
        console.error(
          "Lexical search failed:",
          error.message,
        );
        continue;
      }

      if (Array.isArray(data)) {
        for (const row of data) {
          results.push({
            ...row,
            rank: Number(row.rank || 0),
          });
        }
      }
    } catch (error: any) {
      console.error(
        "Lexical search exception:",
        error?.message || error,
      );
    }
  }

  return results;
}

/* =========================================================
   SEMANTIC SEARCH
========================================================= */

async function semanticSearch(
  question: string,
): Promise<LegalResult[]> {
  const embedding =
    await embedQuery(question);

  const { data, error } =
    await supabase.rpc(
      "match_legal_chunks",
      {
        query_embedding: embedding,
        match_threshold: 0.30,
        match_count: 12,
      },
    );

  if (error) {
    console.error(
      "Semantic search failed:",
      error.message,
    );

    return [];
  }

  return Array.isArray(data)
    ? data.map((row: any) => ({
        ...row,
        similarity: Number(
          row.similarity || 0,
        ),
      }))
    : [];
}

/* =========================================================
   ACT RELEVANCE
========================================================= */

function isHouseRentAct(
  result: LegalResult,
): boolean {
  const title = normalizeBangla(
    result.title || "",
  );

  return (
    result.act_file === "748.json" ||
    title.includes(
      "বাড়ি ভাড়া নিয়ন্ত্রণ আইন",
    ) ||
    title.includes(
      "বাড়ি ভাড়া নিয়ন্ত্রণ আইন",
    )
  );
}

/* =========================================================
   EXACT SCORE
========================================================= */

function calculateExactScore(
  result: LegalResult,
  intent: LegalIntent,
): number {
  const text = normalizeBangla(
    result.text || "",
  );

  if (intent === "rent_refusal") {
    let score = 0;

    if (
      text.includes(
        "গ্রহণ করতে অস্বীকার",
      )
    ) {
      score += 1;
    }

    if (
      text.includes(
        "ডাক মনি অর্ডার",
      )
    ) {
      score += 1;
    }

    if (
      text.includes(
        "ভাড়া জমা",
      )
    ) {
      score += 1;
    }

    if (
      text.includes(
        "বাড়িওয়ালা",
      )
    ) {
      score += 0.5;
    }

    if (
      text.includes(
        "ভাড়াটিয়া",
      )
    ) {
      score += 0.5;
    }

    return Math.min(score / 3, 1);
  }

  if (intent === "rent_receipt") {
    let score = 0;

    if (text.includes("রশিদ")) {
      score += 1;
    }

    if (text.includes("ভাড়া")) {
      score += 1;
    }

    if (
      text.includes("ভাড়াটিয়া")
    ) {
      score += 0.5;
    }

    if (
      text.includes("বাড়িওয়ালা")
    ) {
      score += 0.5;
    }

    return Math.min(score / 2.5, 1);
  }

  return 0;
}

/* =========================================================
   RANK
========================================================= */

function mergeResults(
  _question: string,
  intent: LegalIntent,
  lexical: LegalResult[],
  semantic: LegalResult[],
  terms: string[],
): LegalResult[] {
  const map = new Map<
    string,
    LegalResult
  >();

  function add(
    result: LegalResult,
    source:
      | "lexical"
      | "semantic",
  ) {
    const key =
      result.id ||
      `${result.act_file}:${result.start}:${result.end}`;

    const old = map.get(key);

    const lexicalScore =
      source === "lexical"
        ? Math.max(
            Number(result.rank || 0),
            Number(
              old?.lexicalScore || 0,
            ),
          )
        : Number(
            old?.lexicalScore || 0,
          );

    const similarity =
      source === "semantic"
        ? Math.max(
            Number(
              result.similarity || 0,
            ),
            Number(
              old?.similarity || 0,
            ),
          )
        : Number(
            old?.similarity || 0,
          );

    const actBoost =
      intent === "rent_refusal" ||
      intent === "rent_receipt"
        ? isHouseRentAct(result)
          ? 1
          : 0
        : 0;

    const exactScore =
      calculateExactScore(
        result,
        intent,
      );

    const normalizedResultText =
      normalizeBangla(
        result.text || "",
      );

    const matchedTerms =
      Array.from(
        new Set([
          ...(old?.matchedTerms || []),
          ...terms.filter((term) =>
            normalizedResultText.includes(
              normalizeBangla(term),
            ),
          ),
        ]),
      );

    const combinedScore =
      exactScore * 0.35 +
      (Math.min(lexicalScore, 1.5) / 1.5) *
        0.25 +
      actBoost * 0.10 +
      Math.min(similarity, 1) * 0.30;

    map.set(key, {
      ...(old || result),
      lexicalScore,
      similarity,
      exactScore,
      actBoost,
      combinedScore,
      matchedTerms,
    });
  }

  for (const item of lexical) {
    add(item, "lexical");
  }

  for (const item of semantic) {
    add(item, "semantic");
  }

  let ranked =
    Array.from(map.values());

  if (
    intent === "rent_refusal" ||
    intent === "rent_receipt"
  ) {
    ranked = ranked.filter(
      (item) =>
        isHouseRentAct(item),
    );
  }

  return ranked
    .sort(
      (a, b) =>
        Number(
          b.combinedScore || 0,
        ) -
        Number(
          a.combinedScore || 0,
        ),
    )
    .slice(0, 10);
}

/* =========================================================
   SECTION EXTRACTION
========================================================= */

const BANGLA_DIGITS =
  "০১২৩৪৫৬৭৮৯";

function banglaDigitsToArabic(
  value: string,
): string {
  return value
    .split("")
    .map((char) => {
      const index =
        BANGLA_DIGITS.indexOf(char);

      return index >= 0
        ? String(index)
        : char;
    })
    .join("");
}

type SectionEvidence = {
  sectionNumber: string;
  text: string;
};

function extractSections(
  text: string,
): SectionEvidence[] {
  if (!text) {
    return [];
  }

  /*
   * A section number starts a new section only when it stands on its
   * own (not part of a year, date, amount or footnote marker such as
   * "2[***]") and is followed by a delimiter and whitespace:
   *   "... registration 1. Any seven ..."   "... ১৯। (১) ..."
   * The old pattern also matched "860." inside "1860." and "31." in dates.
   */
  const regex =
    /(?<![0-9০-৯\[\(./-])([০-৯]{1,3}|[0-9]{1,3})\s?[।৷.](?=\s)/g;

  const matches: {
    number: string;
    index: number;
  }[] = [];

  let match: RegExpExecArray | null;

  while (
    (match = regex.exec(text)) !== null
  ) {
    const raw = match[1];

    const number =
      /[০-৯]/.test(raw)
        ? banglaDigitsToArabic(raw)
        : raw;

    const n = Number(number);

    if (
      Number.isInteger(n) &&
      n >= 1 &&
      n <= 999
    ) {
      matches.push({
        number,
        index: match.index,
      });
    }
  }

  const sections: SectionEvidence[] =
    [];

  for (
    let i = 0;
    i < matches.length;
    i++
  ) {
    const current = matches[i];
    const next = matches[i + 1];

    const start = current.index;

    const end = next
      ? next.index
      : text.length;

    /*
     * Many corpus passages were chunked mid-character, leaving U+FFFD
     * at the edges. Strip it so cited text and model evidence stay clean.
     */
    const sectionText = text
      .slice(start, end)
      .replace(/\uFFFD+/g, "")
      .trim()
      .slice(0, 6500);

    sections.push({
      sectionNumber:
        current.number,
      text: sectionText,
    });
  }

  return sections;
}

/* =========================================================
   CHOOSE SECTION
========================================================= */

function chooseBestSection(
  result: LegalResult,
  intent: LegalIntent,
): SectionEvidence | null {
  const sections =
    extractSections(
      result.text || "",
    );

  if (sections.length === 0) {
    return null;
  }

  if (
    intent === "rent_refusal" &&
    isHouseRentAct(result)
  ) {
    const section19 =
      sections.find(
        (section) =>
          section.sectionNumber === "19",
      );

    if (section19) {
      return section19;
    }
  }

  if (
    intent === "rent_receipt" &&
    isHouseRentAct(result)
  ) {
    const section13 =
      sections.find(
        (section) =>
          section.sectionNumber === "13",
      );

    if (section13) {
      return section13;
    }
  }

  const canonicalTerms =
    INTENT_TERMS[intent].map(
      normalizeBangla,
    );

  let best:
    | SectionEvidence
    | null = null;

  let bestScore = -1;

  for (const section of sections) {
    const t =
      normalizeBangla(
        section.text,
      );

    let score = 0;

    for (const term of canonicalTerms) {
      if (t.includes(term)) {
        score++;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = section;
    }
  }

  return best;
}

/* =========================================================
   EXPLICIT DOCUMENT LEGAL REFERENCES
========================================================= */

type ExplicitLegalReference = {
  actName: string;
  sections: string[];
};

function extractSectionNumbers(
  value: string,
): string[] {
  return Array.from(
    value.matchAll(
      /\d+[A-Za-z]?(?:\(\d+[A-Za-z]?\))?/g,
    ),
  ).map((match) => match[0]);
}

function cleanExplicitActName(
  value: string,
): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:()-]+/, "")
    .replace(/[\s,.;:()-]+$/, "")
    .trim();
}

function extractExplicitLegalReferences(
  text: string,
): ExplicitLegalReference[] {
  const references: ExplicitLegalReference[] = [];

  const normalized = text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  const sectionActRegex =
    /\bsections?\s+(.{1,120}?)\s+of\s+(?:the\s+)?([A-Za-z][A-Za-z0-9&.'()\- ]*?\bAct\b(?:\s*,?\s*\d{4})?)/gi;

  let match: RegExpExecArray | null;

  while (
    (match =
      sectionActRegex.exec(
        normalized,
      )) !== null
  ) {
    const rawSections = match[1];
    const rawAct = match[2];

    const sections =
      extractSectionNumbers(
        rawSections,
      );

    const actName =
      cleanExplicitActName(
        rawAct,
      );

    if (
      actName &&
      sections.length > 0
    ) {
      references.push({
        actName,
        sections: [
          ...new Set(sections),
        ],
      });
    }
  }

  const standaloneActRegex =
    /\b((?:[A-Z][A-Za-z0-9&.'()\-]*|of|the|and|for|on|in|to)\s+){1,10}Act\b(?:\s*,?\s*\d{4})?/g;

  while (
    (match =
      standaloneActRegex.exec(
        normalized,
      )) !== null
  ) {
    const actName =
      cleanExplicitActName(
        match[0],
      );

    if (
      actName.length < 8
    ) {
      continue;
    }

    if (
      !/\bAct\b(?:\s*,?\s*\d{4})?$/i.test(
        actName,
      )
    ) {
      continue;
    }

    const normalizedAct =
      normalizeActName(
        actName,
      );

    const existing =
      references.find(
        (reference) =>
          normalizeActName(
            reference.actName,
          ) === normalizedAct,
      );

    if (!existing) {
      references.push({
        actName,
        sections: [],
      });
    }
  }

  const deduped = new Map<
    string,
    ExplicitLegalReference
  >();

  for (
    const reference of references
  ) {
    const key =
      normalizeActName(
        reference.actName,
      );

    if (!key) {
      continue;
    }

    const previous =
      deduped.get(key);

    if (!previous) {
      deduped.set(key, {
        actName:
          reference.actName,
        sections: [
          ...new Set(
            reference.sections,
          ),
        ],
      });
    } else {
      previous.sections = [
        ...new Set([
          ...previous.sections,
          ...reference.sections,
        ]),
      ];
    }
  }

  return Array.from(
    deduped.values(),
  );
}

/* =========================================================
   DOCUMENT LEGAL REFERENCE SCORING
========================================================= */

function scoreDocumentLegalReference(
  result: LegalResult,
  reference: ExplicitLegalReference,
): number {
  const title =
    normalizeActName(
      result.title || "",
    );

  const actFile =
    normalizeActName(
      result.act_file || "",
    );

  const resultText =
    normalizeLegalText(
      result.text || "",
    );

  const resultSection =
    normalizeLegalText(
      result.sectionNumber || "",
    );

  const actName =
    normalizeActName(
      reference.actName,
    );

  if (!actName) {
    return 0;
  }

  const titleExact =
    title === actName;

  const titleContains =
    title.includes(actName);

  const actNameContainsTitle =
    title.length > 0 &&
    actName.includes(title);

  const actFileLooksLikeActName =
    actFile.length > 8 &&
    /[a-z]/i.test(actFile);

  const actFileMatches =
    actFileLooksLikeActName &&
    (
      actFile === actName ||
      actFile.includes(actName) ||
      actName.includes(actFile)
    );

  const textContainsAct =
    resultText.includes(
      actName,
    );

  const actMatches =
    titleExact ||
    titleContains ||
    actNameContainsTitle ||
    actFileMatches ||
    textContainsAct;

  if (!actMatches) {
    return 0;
  }

  let score = 100;

  if (titleExact) {
    score += 150;
  } else if (
    titleContains ||
    actNameContainsTitle
  ) {
    score += 120;
  } else if (
    actFileMatches
  ) {
    score += 80;
  } else if (
    textContainsAct
  ) {
    score += 60;
  }

  let sectionMatched = false;

  for (
    const requestedSection of
      reference.sections
  ) {
    const normalizedSection =
      normalizeLegalText(
        requestedSection,
      );

    if (
      resultSection ===
      normalizedSection
    ) {
      score += 200;
      sectionMatched = true;
      continue;
    }

    const escapedSection =
      requestedSection.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );

    const exactSectionPattern =
      new RegExp(
        `\\bsections?\\s+${escapedSection}(?=\\s|[.,;:)\\]])`,
        "i",
      );

    if (
      exactSectionPattern.test(
        result.text || "",
      )
    ) {
      score += 150;
      sectionMatched = true;
      continue;
    }

    const headingPattern =
      new RegExp(
        `(?:^|\\n|\\s)${escapedSection}\\s*\\.`,
        "i",
      );

    if (
      headingPattern.test(
        result.text || "",
      )
    ) {
      score += 120;
      sectionMatched = true;
    }
  }

  if (
    reference.sections.length > 0 &&
    !sectionMatched
  ) {
    return 200;
  }

  return score;
}

/* =========================================================
   STRICT DOCUMENT LEGAL RESULT FILTER
========================================================= */

function filterDocumentLegalResults(
  results: LegalResult[],
  references: ExplicitLegalReference[],
): LegalResult[] {
  if (
    references.length === 0
  ) {
    return results;
  }

  const scored =
    results.map((result) => {
      let bestScore = 0;

      for (
        const reference of
          references
      ) {
        bestScore =
          Math.max(
            bestScore,
            scoreDocumentLegalReference(
              result,
              reference,
            ),
          );
      }

      return {
        result,
        explicitScore:
          bestScore,
      };
    });

  return scored
    .filter(
      ({
        explicitScore,
      }) =>
        explicitScore >= 200,
    )
    .sort(
      (a, b) =>
        b.explicitScore -
        a.explicitScore,
    )
    .map(
      ({ result }) =>
        result,
    );
}

/* =========================================================
   OFFICIAL SOURCE URLS
========================================================= */

type SourceInfo = {
  sourceName: string;
  sourceUrl: string;
};

function getOfficialSource(
  actFile: string,
  sectionNumber: string | null,
): SourceInfo | null {
  if (
    actFile !== "748.json"
  ) {
    return null;
  }

  const actUrl =
    "https://bdlaws.minlaw.gov.bd/act-print-748.html";

  if (
    sectionNumber === "19"
  ) {
    return {
      sourceName:
        "Laws of Bangladesh — বাড়ী ভাড়া নিয়ন্ত্রণ আইন, ১৯৯১, ধারা ১৯",
      sourceUrl:
        "https://bdlaws.minlaw.gov.bd/act-print-748/section-print-30649.html",
    };
  }

  if (
    sectionNumber === "13"
  ) {
    return {
      sourceName:
        "Laws of Bangladesh — বাড়ী ভাড়া নিয়ন্ত্রণ আইন, ১৯৯১, ধারা ১৩",
      sourceUrl:
        "https://bdlaws.minlaw.gov.bd/act-print-748/section-print-30643.html",
    };
  }

  return {
    sourceName:
      "Laws of Bangladesh — বাড়ী ভাড়া নিয়ন্ত্রণ আইন, ১৯৯১",
    sourceUrl: actUrl,
  };
}

/* =========================================================
   EVIDENCE
========================================================= */

type EvidenceItem = {
  id: string;
  title: string;
  actFile: string;
  sectionNumber: string | null;
  text: string;
  sourceName?: string;
  sourceUrl?: string;
  sourceKind?: "section" | "act";
  /** Only true when the person explicitly asked about a repealed law. */
  repealed?: boolean;
  repealedBy?: string;
};

function buildEvidence(
  results: LegalResult[],
  intent: LegalIntent,
): EvidenceItem[] {
  const output: EvidenceItem[] = [];

  if (
    intent === "rent_refusal"
  ) {
    for (
      const result of results
    ) {
      if (
        !isHouseRentAct(result)
      ) {
        continue;
      }

      const section =
        chooseBestSection(
          result,
          intent,
        );

      if (!section) {
        continue;
      }

      if (
        section.sectionNumber !==
        "19"
      ) {
        continue;
      }

      const source =
        getOfficialSource(
          result.act_file,
          "19",
        );

      output.push({
        id: "C1",
        title: result.title,
        actFile: result.act_file,
        sectionNumber: "19",
        text: section.text,
        sourceName:
          source?.sourceName,
        sourceUrl:
          source?.sourceUrl,
      });

      break;
    }

    return output;
  }

  if (
    intent === "rent_receipt"
  ) {
    for (
      const result of results
    ) {
      if (
        !isHouseRentAct(result)
      ) {
        continue;
      }

      const section =
        chooseBestSection(
          result,
          intent,
        );

      if (!section) {
        continue;
      }

      if (
        section.sectionNumber !==
        "13"
      ) {
        continue;
      }

      const source =
        getOfficialSource(
          result.act_file,
          "13",
        );

      output.push({
        id: "C1",
        title: result.title,
        actFile: result.act_file,
        sectionNumber: "13",
        text: section.text,
        sourceName:
          source?.sourceName,
        sourceUrl:
          source?.sourceUrl,
      });

      break;
    }

    return output;
  }

  const filteredResults =
    results.filter(
      (result) => {
        const similarity =
          Number(
            result.similarity ??
              0,
          );

        const combinedScore =
          Number(
            result.combinedScore ??
              0,
          );

        const matchedTerms =
          Array.isArray(
            result.matchedTerms,
          )
            ? result.matchedTerms
                .length
            : 0;

        const strongSemantic =
          similarity >= 0.42;

        const strongCombined =
          combinedScore >= 0.25 &&
          matchedTerms >= 2;

        return (
          strongSemantic ||
          strongCombined
        );
      },
    );

  debugLog(
    "Evidence candidate gate:",
    results.length,
    "retrieved ->",
    filteredResults.length,
    "eligible",
  );

  for (
    const result of filteredResults
  ) {
    const section =
      chooseBestSection(
        result,
        intent,
      );

    if (!section) {
      continue;
    }

    const duplicate =
      output.some(
        (item) =>
          item.actFile ===
            result.act_file &&
          item.sectionNumber ===
            section.sectionNumber,
      );

    if (duplicate) {
      continue;
    }

    const source =
      getOfficialSource(
        result.act_file,
        section.sectionNumber,
      );

    output.push({
      id: `C${output.length + 1}`,
      title: result.title,
      actFile: result.act_file,
      sectionNumber:
        section.sectionNumber,
      text: section.text,
      sourceName:
        source?.sourceName,
      sourceUrl:
        source?.sourceUrl,
    });

    if (
      output.length >= 4
    ) {
      break;
    }
  }

  return output;
}

/* =========================================================
   LOGGING

   User questions and documents are personal and often sensitive.
   They are only logged when LOG_USER_CONTENT=true (local debugging).
========================================================= */

const LOG_USER_CONTENT = process.env.LOG_USER_CONTENT === "true";

function debugLog(...parts: unknown[]) {
  if (LOG_USER_CONTENT) console.log(...parts);
}

/* =========================================================
   GENERAL EVIDENCE RETRIEVAL

   1. Concept search over the local corpus (statute vocabulary).
   2. Supabase lexical search on the same concepts + semantic search.
   3. Drop repealed laws (unless the person named that law) and
      sections printed as repealed/omitted.
   4. Ask the model which candidates genuinely govern the issue.
========================================================= */

const MAX_CANDIDATES = 16;
const MAX_PER_ACT = 4;

async function retrieveEvidence(
  question: string,
  contextualQuestion: string,
  situation: SituationAnalysis,
  plan: RetrievalPlan,
): Promise<{ evidence: EvidenceItem[]; notes: LawNote[] }> {
  await initLiveLaws();

  const concepts = dedupeStrings([...plan.conceptsBn, ...plan.conceptsEn]);

  // Laws the planner suggested, mapped to their current versions.
  const suggested = findActsByName(plan.laws);
  const boost = new Set<string>();
  for (const actFile of suggested) {
    boost.add(currentLawFor(actFile) ?? actFile);
  }

  // A repealed law may be discussed only when the person named it.
  const allowRepealed = new Set<string>();
  const refreshAllowRepealed = () => {
    for (const actFile of suggested) {
      if (
        getLawStatus(actFile)?.repealed &&
        (questionNamesAct(question, actFile) || questionReferencesActYear(question, actFile))
      ) {
        allowRepealed.add(actFile);
        boost.add(actFile);
      }
    }
  };
  for (const actFile of suggested) {
    if (
      getLawStatus(actFile)?.repealed &&
      (questionNamesAct(question, actFile) || questionReferencesActYear(question, actFile))
    ) {
      allowRepealed.add(actFile);
      boost.add(actFile);
    }
  }

  const isUsable = (actFile: string, text: string) => {
    if (isRepealedSectionText(text)) return false;
    const lawStatus = getLawStatus(actFile);
    return !lawStatus?.repealed || allowRepealed.has(actFile);
  };

  // Supabase retrieval (concept terms + semantic on the neutral issue) — fetched once.
  const lexicalTerms = concepts.length > 0 ? concepts.slice(0, 12) : extractLegalSearchTerms(contextualQuestion, "unknown", situation.retrievalQuery);
  const [lexical, semantic] = await Promise.all([
    lexicalSearch(lexicalTerms),
    semanticSearch(plan.topic || situation.retrievalQuery || contextualQuestion).catch((error) => {
      console.error("Optional semantic retrieval failed:", (error as Error).message);
      return [] as LegalResult[];
    }),
  ]);

  const buildShortlist = (): Candidate[] => {
  const candidates = new Map<string, Candidate & { score: number }>();
  const add = (candidate: Candidate, score: number) => {
    if (!isUsable(candidate.actFile, candidate.text)) return;
    const existing = candidates.get(candidate.key);
    if (!existing || existing.score < score) candidates.set(candidate.key, { ...candidate, score });
  };

  // 1. Local concept search (snapshot + laws loaded live from bdlaws).
  for (const hit of searchByConcepts(concepts, { limit: 24, boostActFiles: boost, allowActFiles: allowRepealed })) {
    add(
      {
        key: `${hit.actFile}:${hit.sectionNumber ?? hit.passageId}`,
        actFile: hit.actFile,
        title: hit.title,
        sectionNumber: hit.sectionNumber,
        text: hit.text,
      },
      hit.score,
    );
  }

  // 2. Supabase results.
  const normalizedConcepts = concepts.map((term) => normalizeBangla(term).toLowerCase());
  for (const result of [...lexical, ...semantic]) {
    const sections = splitSections(result.text || "");
    for (const section of sections) {
      const text = normalizeBangla(section.text).toLowerCase();
      const matches = normalizedConcepts.filter((term) => term.length >= 3 && text.includes(term)).length;
      const semanticScore = Number(result.similarity || 0) * 10;
      if (matches === 0 && semanticScore < 4.5) continue;
      add(
        {
          key: `${result.act_file}:${section.sectionNumber ?? result.id}`,
          actFile: result.act_file,
          title: result.title,
          sectionNumber: section.sectionNumber,
          text: section.text,
        },
        matches * 3 + semanticScore + (boost.has(result.act_file) ? 3 : 0),
      );
    }
  }

  // Keep the strongest candidates, at most a few per act, for the relevance check.
  const perAct = new Map<string, number>();
  const shortlist: Candidate[] = [];
  const ordered = Array.from(candidates.values()).sort((a, b) => b.score - a.score);
  // Unnumbered passages (preambles, definition lead-ins) are only used when no numbered section qualifies.
  const numbered = ordered.filter((candidate) => candidate.sectionNumber);
  for (const candidate of numbered.length > 0 ? numbered : ordered) {
    const count = perAct.get(candidate.actFile) ?? 0;
    if (count >= MAX_PER_ACT) continue;
    perAct.set(candidate.actFile, count + 1);
    shortlist.push(candidate);
    if (shortlist.length >= MAX_CANDIDATES) break;
  }
  return shortlist;
  };

  /*
   * 3. Live status check. The corpus is a snapshot; before anything is cited,
   * each act on the shortlist is checked against its live bdlaws page. A law
   * repealed since the snapshot is dropped, its replacement is loaded from
   * bdlaws, and the shortlist is rebuilt so the current law is considered.
   */
  let shortlist = buildShortlist();
  const notes: LawNote[] = [];
  for (let round = 0; round < 3; round++) {
    const live = await checkActsLive(shortlist.map((candidate) => candidate.actFile));
    for (const note of live.notes) if (!notes.some((item) => item.actFile === note.actFile)) notes.push(note);
    if (!live.changed) break;
    for (const actFile of live.replacements) boost.add(actFile);
    refreshAllowRepealed();
    shortlist = buildShortlist();
  }

  debugLog("Candidates:", shortlist.map((c) => `${c.title} §${c.sectionNumber}`));

  const relevant = await rerankEvidence(groq, GROQ_MODEL, plan.canonicalQuestion || question, plan.topic || situation.legalIssue, shortlist, 5);

  const evidence = relevant.map((candidate, index) => ({
    id: `C${index + 1}`,
    title: candidate.title,
    actFile: candidate.actFile,
    sectionNumber: candidate.sectionNumber,
    text: candidate.text,
    repealed: getLawStatus(candidate.actFile)?.repealed === true,
    repealedBy: getLawStatus(candidate.actFile)?.repealedBy,
  }));

  // Notes matter only for laws that were actually in play for this question.
  return { evidence, notes };
}

/* =========================================================
   EVIDENCE FOR SECTIONS THE DOCUMENT ITSELF CITES
========================================================= */

function buildExplicitEvidence(
  results: LegalResult[],
  references: ExplicitLegalReference[],
): EvidenceItem[] {
  const output: EvidenceItem[] = [];

  for (const reference of references) {
    const wanted = reference.sections
      .map((section) => banglaDigitsToArabic(section).match(/^\d+/)?.[0])
      .filter((section): section is string => Boolean(section));

    if (wanted.length === 0) continue;

    for (const result of results) {
      if (scoreDocumentLegalReference(result, reference) <= 0) continue;

      const sections = extractSections(result.text || "");

      for (const number of wanted) {
        const section = sections.find((item) => item.sectionNumber === number);
        if (!section) continue;

        const duplicate = output.some(
          (item) => item.actFile === result.act_file && item.sectionNumber === number,
        );
        if (duplicate) continue;

        output.push({
          id: `C${output.length + 1}`,
          title: result.title,
          actFile: result.act_file,
          sectionNumber: number,
          text: section.text,
        });

        if (output.length >= 6) return output;
      }
    }
  }

  return output;
}

/* =========================================================
   RESPONSES — plain JSON, or a stream of progress steps

   With { stream: true } in the body (or multipart field), the route sends
   NDJSON lines: {"type":"status","step":"…"} while it works, then
   {"type":"result","status":200,...body}. Without it, plain JSON as before.
========================================================= */

type RouteResult = { status: number; body: any };
type StatusFn = (step: string) => void;
const routeResult = (status: number, body: any): RouteResult => ({ status, body });

async function respond(
  req: express.Request,
  res: express.Response,
  run: (body: any, onStatus: StatusFn) => Promise<RouteResult>,
) {
  const body = req.body ?? {};
  const streaming = body.stream === true || body.stream === "true";

  if (!streaming) {
    const result = await run(body, () => {});
    return res.status(result.status).json(result.body);
  }

  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const write = (event: Record<string, unknown>) => {
    if (!res.writableEnded) res.write(`${JSON.stringify(event)}\n`);
  };

  try {
    const result = await run(body, (step) => write({ type: "status", step }));
    write({ type: "result", status: result.status, ...result.body });
  } catch (error) {
    console.error("Streaming route failed:", error instanceof Error ? error.message : error);
    write({ type: "result", status: 500, ok: false, error: publicError(error, body.language !== "en").message });
  }
  res.end();
}

/* =========================================================
   DOCUMENT ANALYSIS SCHEMA

   Every list item has a fixed shape so the analysis page can show
   it — in particular each legal term carries a plain meaning and an
   everyday example, not just the word.
========================================================= */

const ANALYSIS_SCHEMA = `{
  "documentType": "short type, e.g. House rent agreement",
  "overview": "2-4 plain sentences written to the person: what this document is and what it means for them",
  "keyPoints": [{ "label": "short name, e.g. Monthly rent", "value": "what the document says about it", "citation": "" }],
  "attention": [{ "level": "high|review|info", "title": "short", "body": "why it matters, in plain words", "citation": "" }],
  "contradictions": [{ "title": "short", "body": "the two statements that conflict, quoted briefly" }],
  "missing": [{ "title": "short", "body": "what is not stated and why someone might want it" }],
  "terms": [{
    "term": "the legal word or phrase exactly as written in the document",
    "meaning": "what it means, in one or two plain sentences an ordinary person understands",
    "example": "a short everyday example of the term in use",
    "inDocument": "what this document says about it (brief quote or paraphrase)"
  }]
}`;

function analysisRules(bn: boolean): string {
  return `- keyPoints: at most 8; attention: at most 6; contradictions: at most 5;
  missing: at most 6; terms: 4-8 legal or technical words actually used in the document.
- keyPoints are only LEGALLY SIGNIFICANT information: what the document is for, the parties and
  their roles, rights, obligations and promises, amounts, dates, deadlines and durations,
  conditions and penalties, what is being declared, and whether it is signed/attested.
  Do NOT list personal details that don't change the legal meaning — parents' names, religion,
  phone numbers, NID/passport/serial numbers, or addresses (unless the address is itself the
  subject, e.g. the rented premises).
- Every term MUST have a non-empty "meaning" and "example". The example is general
  ("For example, if a tenant pays a security deposit of 2 months' rent, ...") and must
  not invent facts about this document.
- Write all values in ${bn ? "proper Bengali script (no Banglish); keep the term itself as written in the document" : "clear, plain English"}.
- Never invent facts, dates, amounts or clauses.`;
}

type AnyRecord = Record<string, unknown>;

const textOf = (value: unknown): string => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");

function pick(item: AnyRecord, ...keys: string[]): string {
  for (const key of keys) {
    const value = textOf(item[key]);
    if (value) return value;
  }
  return "";
}

function listOf(value: unknown): AnyRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? { title: item, label: item, term: item } : item))
    .filter((item): item is AnyRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

/** Coerce whatever the model returned into the fixed analysis shape. */
function normalizeAnalysis(final: AnyRecord, extracted: AnyRecord) {
  const source = (key: string) => (Array.isArray(final?.[key]) && (final[key] as unknown[]).length ? final[key] : extracted?.[key]);
  const level = (value: string): "high" | "review" | "info" =>
    /high|critical|urgent/i.test(value) ? "high" : /info|low/i.test(value) ? "info" : "review";

  return {
    type: pick(final, "documentType") || pick(extracted, "documentType") || "Uploaded document",
    overview: pick(final, "overview") || pick(extracted, "overview"),
    keyPoints: listOf(source("keyPoints"))
      .map((item) => ({
        icon: "file",
        label: pick(item, "label", "title", "name"),
        value: pick(item, "value", "description", "body", "detail"),
        citation: pick(item, "citation", "source"),
      }))
      .filter((item) => item.label || item.value)
      .slice(0, 8),
    attention: listOf(source("attention"))
      .map((item) => ({
        level: level(pick(item, "level", "severity")),
        title: pick(item, "title", "label"),
        body: pick(item, "body", "description", "detail", "reason"),
        citation: pick(item, "citation", "source"),
      }))
      .filter((item) => item.title || item.body)
      .slice(0, 6),
    contradictions: listOf(source("contradictions"))
      .map((item) => ({
        title: pick(item, "title", "label"),
        body: pick(item, "body", "description", "detail"),
        citations: Array.isArray(item.citations) ? (item.citations as unknown[]).map(textOf).filter(Boolean) : [],
      }))
      .filter((item) => item.title || item.body)
      .slice(0, 5),
    missing: listOf(source("missing"))
      .map((item) => ({ title: pick(item, "title", "label"), body: pick(item, "body", "description", "detail") }))
      .filter((item) => item.title || item.body)
      .slice(0, 6),
    terms: listOf(source("terms"))
      .map((item) => ({
        term: pick(item, "term", "name", "title", "label"),
        meaning: pick(item, "meaning", "simple", "definition", "explanation", "description"),
        example: pick(item, "example", "examples", "usage"),
        inDocument: pick(item, "inDocument", "in_document", "context"),
        citation: pick(item, "citation"),
      }))
      .filter((item) => item.term)
      .slice(0, 8),
  };
}

type TermExplanation = { term: string; meaning: string; example: string; inDocument: string; citation: string };

/** Any term the model listed without a meaning or example gets one in a small second call. */
async function fillTermExplanations(terms: TermExplanation[], documentText: string, bn: boolean): Promise<TermExplanation[]> {
  const missing = terms.filter((item) => !item.meaning || !item.example);
  if (missing.length === 0) return terms;

  const prompt = `Explain these legal terms from a Bangladeshi document for an ordinary person.

Terms: ${missing.map((item) => item.term).join(" | ")}

Document excerpt (for context only):
${documentText.slice(0, 4000)}

Return ONLY JSON: {"terms":[{"term":"exactly as given","meaning":"1-2 plain sentences","example":"a short everyday example"}]}
Language: ${bn ? "proper Bengali script (no Banglish)" : "plain English"}. Do not invent facts about the document.`;

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0,
      max_tokens: 1500,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });
    const parsed = JSON.parse(completion.choices?.[0]?.message?.content || "{}") as { terms?: Array<Record<string, unknown>> };
    const byTerm = new Map(
      (parsed.terms ?? []).map((item) => [textOf(item.term).toLowerCase(), item] as const),
    );
    return terms.map((item) => {
      const filled = byTerm.get(item.term.toLowerCase());
      return filled
        ? { ...item, meaning: item.meaning || textOf(filled.meaning), example: item.example || textOf(filled.example) }
        : item;
    });
  } catch (error) {
    console.error("Term explanations failed:", (error as Error).message);
    return terms;
  }
}

/* =========================================================
   DOCUMENT LEGAL ANALYSIS
========================================================= */

async function runDocumentAnalysis(
  reqBody: any,
  onStatus: StatusFn = () => {},
): Promise<RouteResult> {
    try {
      const {
        text,
        language = "bn",
        documentName =
          "Uploaded document",
        documentType = "",
        pages: requestedPages,
      } = reqBody;

      const outputBn = language !== "en";
      const pageCount =
        Number.isInteger(requestedPages) && requestedPages > 0 && requestedPages < 5000 ? requestedPages : 1;

      if (
        !text ||
        typeof text !== "string"
      ) {
        return routeResult(400, {
          ok: false,
          error:
            "Document text is required.",
        });
      }

      const documentText =
        text.slice(0, 120000);

      debugLog("");
      debugLog(
        "========================================",
      );
      debugLog(
        "DOCUMENT LEGAL ANALYSIS",
      );
      debugLog(
        "========================================",
      );

      /* =====================================================
         STEP 1 — DOCUMENT FACT EXTRACTION
      ===================================================== */

      onStatus("understand_document");

      const extractionPrompt = `
You are analyzing an uploaded legal or official document.

Your job is to extract ONLY information actually present
in the document.

Do NOT invent:
- dates
- amounts
- parties
- clauses
- obligations
- penalties
- deadlines
- legal requirements
- missing information
- contradictions

If something is not present, say so.

IMPORTANT:

Preserve explicit legal references exactly as they appear,
including:

- Act names
- section numbers
- subsection numbers
- dates
- issuing authorities

For legal references, do not replace the wording with another
law or another section.

Return ONLY valid JSON.

Required JSON structure:

${ANALYSIS_SCHEMA}
  plus "legalSearchQuery": ""

Rules:

${analysisRules(outputBn)}
- legalSearchQuery should contain the legal Act names,
  section numbers, and important legal concepts explicitly
  appearing in the document.
- Do not invent legal references.
- Do not substitute one Act for another.

DOCUMENT:

${documentText}
`;

      const extractionCompletion =
        await groq.chat.completions.create({
          model: GROQ_MODEL,
          temperature: 0,
          max_tokens: 3000,
          response_format: {
            type: "json_object",
          },
          messages: [
            {
              role: "system",
              content:
                "You extract facts from documents. Never invent information. Return JSON only.",
            },
            {
              role: "user",
              content:
                extractionPrompt,
            },
          ],
        });

      const extractionRaw =
        extractionCompletion
          .choices[0]
          ?.message?.content ||
        "{}";

      let extracted: any;

      try {
        extracted = JSON.parse(
          extractionRaw
            .replace(
              /^```json\s*/i,
              "",
            )
            .replace(
              /^```\s*/i,
              "",
            )
            .replace(
              /\s*```$/i,
              "",
            )
            .trim(),
        );
      } catch {
        console.error(
          "DOCUMENT EXTRACTION JSON ERROR (enable LOG_USER_CONTENT to see output)",
        );
        debugLog(extractionRaw);

        return routeResult(502, {
          ok: false,
          error: outputBn
            ? "নথি বিশ্লেষণ সম্পূর্ণ হয়নি। অনুগ্রহ করে আবার চেষ্টা করুন।"
            : "The document analysis did not complete. Please try again.",
        });
      }

      const legalQuery =
        typeof extracted.legalSearchQuery ===
        "string"
          ? extracted.legalSearchQuery
          : "";

      /* =====================================================
         STEP 2 — EXPLICIT ACT / SECTION EXTRACTION
      ===================================================== */

      const explicitReferences =
        extractExplicitLegalReferences(
          documentText,
        );

      debugLog("");
      debugLog(
        "EXPLICIT LEGAL REFERENCES:",
      );

      if (
        explicitReferences.length ===
        0
      ) {
        debugLog(
          "None detected.",
        );
      } else {
        for (
          const reference of
            explicitReferences
        ) {
          debugLog(
            `- ${reference.actName}` +
              (
                reference.sections
                  .length
                  ? ` | Sections: ${reference.sections.join(", ")}`
                  : ""
              ),
          );
        }
      }

      /* =====================================================
         STEP 3 — EXACT / LEXICAL SEARCH
      ===================================================== */

      onStatus("find_laws");

      let lexicalResults: LegalResult[] =
        [];

      let semanticResults: LegalResult[] =
        [];

      for (
        const reference of
          explicitReferences
      ) {
        const exactTerms = [
          reference.actName,

          ...reference.sections.map(
            (section) =>
              `${reference.actName} section ${section}`,
          ),

          ...reference.sections.map(
            (section) =>
              `section ${section}`,
          ),
        ];

        debugLog(
          "Exact document search terms:",
          exactTerms,
        );

        const results =
          await lexicalSearch(
            exactTerms,
          );

        lexicalResults.push(
          ...results,
        );
      }

      if (
        legalQuery.trim()
      ) {
        const searchTerms =
          extractLegalSearchTerms(
            legalQuery,
            "unknown",
            legalQuery,
          );

        const broadLexicalResults =
          await lexicalSearch(
            searchTerms,
          );

        lexicalResults.push(
          ...broadLexicalResults,
        );
      }

      const lexicalMap =
        new Map<
          string,
          LegalResult
        >();

      for (
        const result of
          lexicalResults
      ) {
        const key =
          result.id ||
          `${result.act_file}-${result.start}-${result.end}`;

        if (
          !lexicalMap.has(key)
        ) {
          lexicalMap.set(
            key,
            result,
          );
        }
      }

      lexicalResults =
        Array.from(
          lexicalMap.values(),
        );

      /* =====================================================
         STEP 4 — SEMANTIC SEARCH
      ===================================================== */

      if (
        legalQuery.trim()
      ) {
        try {
          semanticResults =
            await semanticSearch(
              legalQuery,
            );
        } catch (error) {
          console.error(
            "Document semantic retrieval failed:",
            error,
          );
        }
      }

      debugLog(
        "Lexical results:",
        lexicalResults.length,
      );

      debugLog(
        "Semantic results:",
        semanticResults.length,
      );

      /* =====================================================
         STEP 5 — MERGE / RANK
      ===================================================== */

      const searchTerms =
        extractLegalSearchTerms(
          legalQuery,
          "unknown",
          legalQuery,
        );

      const mergedResults =
        mergeResults(
          legalQuery,
          "unknown",
          lexicalResults,
          semanticResults,
          searchTerms,
        );

      debugLog("");
      debugLog(
        "Retrieved legal results:",
        mergedResults.length,
      );

      /* =====================================================
         STEP 6 — STRICT EXPLICIT REFERENCE VERIFICATION
      ===================================================== */

      let verifiedResults:
        LegalResult[];

      if (
        explicitReferences.length >
        0
      ) {
        verifiedResults =
          filterDocumentLegalResults(
            mergedResults,
            explicitReferences,
          );

        debugLog(
          "Verified explicit-reference results:",
          verifiedResults.length,
        );
      } else {
        verifiedResults =
          mergedResults;

        debugLog(
          "No explicit Act reference detected; using normal evidence gate.",
        );
      }

      /* =====================================================
         STEP 7 — BUILD EVIDENCE
      ===================================================== */

      /*
       * When the document names a law and section, cite exactly that
       * section. The generic path (semantic-score gate + keyword-based
       * section choice) is only used when no cited section can be found
       * in the retrieved text.
       */
      const explicitEvidence =
        explicitReferences.length > 0
          ? buildExplicitEvidence(
              verifiedResults,
              explicitReferences,
            )
          : [];

      onStatus("check_current");
      await initLiveLaws();
      await checkActsLive(
        (explicitEvidence.length > 0 ? explicitEvidence : buildEvidence(verifiedResults, "unknown")).map(
          (item) => item.actFile,
        ),
      );

      // Repealed laws are dropped unless the document itself names them;
      // then they are kept and marked, so the analysis can say so.
      const statusChecked = (
        explicitEvidence.length > 0
          ? explicitEvidence
          : buildEvidence(verifiedResults, "unknown")
      )
        .filter((item) => !isRepealedSectionText(item.text))
        .flatMap((item) => {
          const lawStatus = getLawStatus(item.actFile);
          if (!lawStatus?.repealed) return [item];
          if (!questionNamesAct(documentText, item.actFile)) return [];
          return [{ ...item, repealed: true, repealedBy: lawStatus.repealedBy }];
        })
        .map((item, index) => ({ ...item, id: `C${index + 1}` }));

      // Every citation gets its official bdlaws link (exact section when it can be matched).
      const evidence =
        await attachOfficialSources(statusChecked);

      debugLog(
        "Evidence items:",
        evidence.length,
      );

      if (
        evidence.length > 0
      ) {
        debugLog(
          "Evidence:",
        );

        evidence.forEach(
          (item) => {
            debugLog(
              `${item.id}: ${item.title} | ${
                item.sectionNumber ||
                "No section"
              }`,
            );
          },
        );
      } else {
        debugLog(
          "NO VERIFIED LEGAL EVIDENCE FOUND.",
        );
      }

      /* =====================================================
         STEP 8 — FINAL DOCUMENT ANALYSIS
      ===================================================== */

      onStatus("write_summary");

      const evidenceText =
        evidence.length > 0
          ? evidence
              .map(
                (item) =>
                  `[${item.id}]
Title: ${item.title}
Act file: ${item.actFile}
Section: ${
                    item.sectionNumber ||
                    "Not specified"
                  }
Source: ${
                    item.sourceName ||
                    "Not specified"
                  }
Text:
${item.text}`,
              )
              .join(
                "\n\n-------------------------\n\n",
              )
          : "NO VERIFIED LEGAL EVIDENCE WAS FOUND.";

      const finalPrompt = `
Analyze the uploaded document using ONLY:

1. The document itself.
2. The verified legal evidence supplied below.

Do NOT use your general legal knowledge to fill gaps.

CRITICAL LEGAL REFERENCE RULE:

If the document explicitly mentions an Act or section:

- preserve that Act and section;
- do not replace it with another Act;
- do not cite a semantically similar Act;
- do not infer that another section applies.

If an explicit legal reference could not be verified
in the supplied legal evidence, state that it could not
be verified from the available legal evidence.

Never invent:

- legal rights
- duties
- penalties
- deadlines
- procedures
- remedies
- fees
- renewal requirements
- authorities
- sections
- case law

Only identify missing information when it is genuinely
absent from the uploaded document.

Return ONLY valid JSON:

${ANALYSIS_SCHEMA}

${analysisRules(outputBn)}
- In keyPoints/attention, put the citation "[C1]" etc. in "citation" only when the
  point relies on that VERIFIED LEGAL EVIDENCE item.

DOCUMENT ANALYSIS:

${JSON.stringify(
  extracted,
  null,
  2,
)}

DOCUMENT TEXT:

${documentText}

VERIFIED LEGAL EVIDENCE:

${evidenceText}
`;

      const finalCompletion =
        await groq.chat.completions.create({
          model: GROQ_MODEL,
          temperature: 0,
          max_tokens: 3500,
          response_format: {
            type: "json_object",
          },
          messages: [
            {
              role: "system",
              content:
                "You are a conservative legal-document analysis assistant. Use only supplied evidence and the document. Return JSON only.",
            },
            {
              role: "user",
              content:
                finalPrompt,
            },
          ],
        });

      const finalRaw =
        finalCompletion
          .choices[0]
          ?.message?.content ||
        "{}";

      let finalAnalysis: any;

      try {
        finalAnalysis =
          JSON.parse(
            finalRaw
              .replace(
                /^```json\s*/i,
                "",
              )
              .replace(
                /^```\s*/i,
                "",
              )
              .replace(
                /\s*```$/i,
                "",
              )
              .trim(),
          );
      } catch {
        console.error("FINAL DOCUMENT ANALYSIS JSON ERROR (enable LOG_USER_CONTENT to see output)");
        debugLog(finalRaw);

        return routeResult(502, {
          ok: false,
          error: outputBn
            ? "নথি বিশ্লেষণ সম্পূর্ণ হয়নি। অনুগ্রহ করে আবার চেষ্টা করুন।"
            : "The document analysis did not complete. Please try again.",
        });
      }

      /* =====================================================
         STEP 9 — SAFE CITATIONS
      ===================================================== */

      const citations =
        evidence.map(
          (item) => ({
            id: item.id,
            title: item.title,
            actFile: item.actFile,
            sectionNumber:
              item.sectionNumber ||
              "",
            text: item.text,
            sourceName:
              item.sourceName ||
              "",
            sourceUrl:
              item.sourceUrl ||
              "",
          }),
        );

      /* =====================================================
         FINAL RESPONSE
      ===================================================== */

      const normalized = normalizeAnalysis(finalAnalysis, extracted);
      normalized.terms = await fillTermExplanations(normalized.terms, documentText, outputBn);

      const analysis = {
        id: `analysis-${Date.now()}`,

        name:
          documentName,

        pages: pageCount,

        status: "Reviewed",

        ...normalized,

        type: normalized.type,

        citations,
      };

      debugLog("");
      debugLog(
        "DOCUMENT ANALYSIS COMPLETE",
      );
      debugLog(
        "========================================",
      );

      return routeResult(200, {
        ok: true,
        analysis,
      });
    } catch (error) {
      console.error(
        "DOCUMENT LEGAL ANALYSIS ERROR:",
        error instanceof Error ? error.message : error,
      );

      const { status, message } = publicError(error, reqBody?.language !== "en");
      return routeResult(status, { ok: false, error: message });
    }
}

app.post("/api/legal/analyze-document", async (req, res) => {
  await respond(req, res, runDocumentAnalysis);
});

/* =========================================================
   DOCUMENT IN CHAT — POST /api/legal/document (multipart)

   One request does everything the chat needs for an uploaded file:
     read the file (PDF text / OCR with image clean-up)
     -> keep only the main passage (no stamps, signatures, page numbers…)
     -> analyse it (summary, key points, points to check, terms, laws)
   Fields: file, language ("bn" | "en"), stream ("true" for progress steps).
========================================================= */

async function runDocumentUpload(file: Express.Multer.File | undefined, body: any, onStatus: StatusFn): Promise<RouteResult> {
  const bn = body?.language !== "en";
  if (!file) return routeResult(400, { ok: false, error: bn ? "কোনো নথি পাওয়া যায়নি।" : "No document was uploaded." });

  try {
    onStatus(file.mimetype.startsWith("image/") ? "clean_image" : "read_document");
    const extracted = await extractDocument(file.buffer, file.originalname, file.mimetype);

    onStatus("main_text");
    const main = await extractMainText(groq, GROQ_MODEL, extracted.text);

    const analysis = await runDocumentAnalysis(
      {
        text: main.mainText,
        language: bn ? "bn" : "en",
        documentName: extracted.name,
        pages: extracted.pages,
      },
      onStatus,
    );
    if (analysis.status !== 200) return analysis;

    const uncertainWords = Array.from(new Set(extracted.pageData.flatMap((page) => page.uncertainWords ?? []))).slice(0, 20);

    return routeResult(200, {
      ok: true,
      document: {
        id: extracted.id,
        name: extracted.name,
        type: extracted.type,
        mimeType: file.mimetype,
        size: extracted.size,
        pages: extracted.pages,
        extractionMethod: extracted.extractionMethod,
      },
      mainText: main.mainText,
      mainTextVerified: main.verified,
      excluded: main.excluded,
      hasUnclear: main.hasUnclear,
      pageData: extracted.pageData.map((page) => ({
        pageNumber: page.pageNumber,
        text: page.text,
        method: page.method,
        confidence: page.confidence,
        quality: page.quality,
      })),
      warnings: extracted.warnings,
      uncertainWords,
      analysis: analysis.body.analysis,
    });
  } catch (error) {
    if (error instanceof DocumentError) return routeResult(error.status, { ok: false, error: error.message });
    console.error("DOCUMENT UPLOAD ERROR:", error instanceof Error ? error.message : error);
    return routeResult(500, {
      ok: false,
      error: bn
        ? "নথিটি প্রক্রিয়া করা যায়নি। আবার চেষ্টা করুন বা আরও পরিষ্কার কপি দিন।"
        : "The document could not be processed. Please try again, or upload a clearer copy.",
    });
  }
}

app.post("/api/legal/document", documentUpload.single("file"), async (req, res) => {
  await respond(req, res, (body, onStatus) => runDocumentUpload(req.file, body, onStatus));
});

/* =========================================================
   TRANSLATE A MESSAGE — POST /api/legal/translate

   { payload: <string | object with string values>, target: "bn" | "en" }
   Translates the answer itself (no new search), so the meaning and the
   laws cited stay exactly the same in both languages.
========================================================= */

app.post("/api/legal/translate", async (req, res) => {
  const target = req.body?.target === "en" ? "en" : "bn";
  const payload = req.body?.payload;
  const serialized = JSON.stringify(payload ?? "");
  if (payload == null || serialized.length > 40000) {
    return res.status(400).json({ ok: false, error: "Nothing to translate, or the text is too long." });
  }

  const prompt = `Translate every string value in this JSON into ${target === "en" ? "clear, plain English" : "proper Bengali script (no Banglish)"}.

Rules:
- Return the SAME JSON structure with the same keys; translate values only.
- Keep citation markers like [C1] exactly where they are.
- Keep numbers, dates, amounts, section numbers and phone numbers exactly.
- Keep the names of laws exactly as written${target === "en" ? "; when a law's name is in Bangla, keep it and add its English meaning in brackets the first time" : ""}.
- Keep markdown (###, **, numbered lists) as it is.
- Keep the meaning exactly: do not add, drop, soften or strengthen anything.

Return ONLY JSON: {"translation": <the translated JSON>}

JSON:
${serialized}`;

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0,
      max_tokens: Math.min(8000, Math.ceil(serialized.length / 1.5) + 800),
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });
    const parsed = JSON.parse(completion.choices?.[0]?.message?.content || "{}") as { translation?: unknown };
    const translation = parsed.translation;
    const sameShape =
      typeof payload === "string"
        ? typeof translation === "string"
        : Boolean(translation) && typeof translation === "object" &&
          Object.keys(payload).every((key) => key in (translation as Record<string, unknown>));
    if (!sameShape) throw new Error("translation lost the structure");
    return res.json({ ok: true, translation });
  } catch (error) {
    console.error("Translation failed:", (error as Error).message);
    const { status, message } = publicError(error, target === "bn");
    return res.status(status === 503 ? 503 : 502).json({
      ok: false,
      error: status === 503 ? message : target === "bn" ? "অনুবাদ করা যায়নি। আবার চেষ্টা করুন।" : "The translation could not be made. Please try again.",
    });
  }
});

/* =========================================================
   GROQ SYSTEM PROMPT
========================================================= */

function systemPrompt(): string {
  return `
You are AinBodh, a Bangladesh-law information assistant.

You MUST answer only from the supplied legal evidence.

========================================================
STRICT LEGAL RULES
========================================================

1. NEVER invent a section number.

2. NEVER mention a section number unless that exact section
   number appears in the supplied evidence.

3. If the evidence says Section 19, say Section 19.

4. If another section is mentioned INSIDE the legal text but
   that other section is not supplied as separate evidence,
   DO NOT explain or rely on that other section.

5. NEVER turn permissive language into mandatory language.

"পারিবেন" means may/can.

"করিতে পারিবেন" means may/can.

"করিতে হইবে" means must/shall.

"বাধ্য" means required/obliged.

Preserve the legal force exactly.

6. NEVER invent:

- procedures
- complaint routes
- regulator instructions
- court procedures
- penalties
- deadlines
- rights
- duties
- remedies
- case law

7. A LEGAL step (a right, remedy, complaint route, procedure,
   deadline or penalty) is allowed ONLY if it follows directly
   from the supplied legal text.

   General personal-safety steps that are not legal claims
   (keep screenshots and messages, do not pay or comply with a
   blackmailer, block and report the account, tell someone you
   trust) are allowed, but never present them as legal duties.

   Phone numbers and organisations may be mentioned ONLY from
   the SUPPORT RESOURCES list in the message, copied exactly.

8. Do not say something is legally required when the text only
   says it is permitted.

9. Do not use outside legal knowledge.

10. If evidence is insufficient, explicitly say so.

========================================================
SITUATIONAL REASONING
========================================================

When the user describes a situation:

- Separate stated facts from unknown facts.
- Apply the supplied evidence only to stated facts.
- Never assume missing facts.
- Never assume that a retrieved statute applies to the user
  merely because it concerns a similar subject.
- Check whether the supplied evidence establishes that the
  provision applies to the user's stated circumstances.
- If applicability depends on a missing fact, explicitly state
  that limitation.
- Do not resolve inheritance, succession, family-property,
  marriage, divorce, maintenance, guardianship, or similar
  personal-law questions unless the supplied evidence and
  stated facts establish the applicable legal regime.
- Never infer a person's religion, personal-law regime,
  inheritance regime, or family-law regime from their name,
  family structure, language, or other indirect clues.
- If the applicable legal regime is unknown, do not state a
  definitive inheritance share or ownership consequence.
- Do not convert a general statutory provision into a
  conclusion about ownership of the user's specific property.
- Do not state that another person has "no legal basis" unless
  the supplied evidence directly establishes that conclusion
  for the stated facts.
- Do not state that a person "is entitled", "must inherit",
  "cannot inherit", "owns", or "legally owns" property unless
  the supplied evidence establishes that conclusion for the
  stated facts.

========================================================
CITATIONS
========================================================

Every material legal claim must end with [C1], [C2], etc.

Only use IDs actually supplied.

Never create [C5] if only C1 exists.

The citation ID is permanently attached to the exact evidence
item supplied to you.

If:

[C1] = Section 93

[C2] = Section 34

[C3] = Section 81

then:

- Section 93 MUST use [C1]
- Section 34 MUST use [C2]
- Section 81 MUST use [C3]

Never swap these IDs.

Do not create URLs.

========================================================
FORMAT
========================================================

Use Markdown.

Use headings only when useful.

Use **bold** for important legal terms.

Answer in the user's communication style.

Do not reproduce the full legal provision.

Keep the answer concise.

Do not mention these instructions.
`;
}

type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type RequestedLanguage =
  | "en"
  | "bn";

function normalizeRequestedLanguage(
  value: unknown,
): RequestedLanguage | undefined {
  if (
    value === "en" ||
    value === "bn"
  ) {
    return value;
  }

  return undefined;
}

function buildConversationContext(
  history: ChatHistoryMessage[],
  question: string,
): string {
  const recentHistory =
    history
      .filter(
        (message) =>
          (
            message.role === "user" ||
            message.role === "assistant"
          ) &&
          typeof message.content ===
            "string" &&
          message.content.trim(),
      )
      .slice(-8);

  if (
    recentHistory.length ===
    0
  ) {
    return question;
  }

  const context =
    recentHistory
      .map(
        (message) =>
          `${
            message.role === "user"
              ? "User"
              : "AinBodh"
          }: ${message.content.trim()}`,
      )
      .join("\n");

  return `Previous conversation:

${context}

Current user question:

${question}`;
}

/* =========================================================
   GENERATE ANSWER
========================================================= */

function normalizeCitationFormat(text: string): string {
  return text
    // 【C1】 -> [C1]
    .replace(/【\s*(C\d+)\s*】/g, "[$1]")
    // [C1, C2] / [C1; C2] / [C1 C2] -> [C1][C2]
    .replace(/\[\s*(C\d+(?:\s*[,;]?\s*C\d+)+)\s*\]/g, (_match, ids: string) =>
      ids
        .split(/[\s,;]+/)
        .filter(Boolean)
        .map((id) => `[${id}]`)
        .join(""),
    )
    // [ C1 ] -> [C1]
    .replace(/\[\s+(C\d+)\s*\]|\[(C\d+)\s+\]/g, (_m, a, b) => `[${a || b}]`);
}

/** Remove citation markers that don't refer to supplied evidence. */
function cleanCitationMarkers(text: string, validIds: Set<string>): string {
  return normalizeCitationFormat(text)
    .replace(/\[(C\d+)\]/g, (marker, id: string) =>
      validIds.has(id) ? marker : "",
    )
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:।])/g, "$1");
}

function citedIds(text: string): Set<string> {
  return new Set(Array.from(text.matchAll(/\[(C\d+)\]/g), (match) => match[1]));
}

/** Answer when no relevant provision was found: honest, helpful, no invented law. */
async function generateNoEvidenceAnswer(
  question: string,
  history: ChatHistoryMessage[],
  plan: RetrievalPlan,
  support: string[],
  answerLanguage: AnswerLanguage,
  statusNotes: string[] = [],
  documentText = "",
): Promise<string> {
  const bn = answerLanguage === "bn";

  const fallback = [
    bn
      ? "আমি AinBodh-এর আইন ডেটাবেসে এই বিষয়ে নির্দিষ্ট কোনো বিধান খুঁজে পাইনি, তাই আইনের কোনো ধারা উল্লেখ করছি না।"
      : "I couldn't find a specific provision in AinBodh's database of Bangladesh laws for this, so I won't quote a law I can't show you.",
    statusNotes.length ? statusNotes.join("\n") : "",
    bn
      ? "আপনার পরিস্থিতি আরেকটু বিস্তারিত লিখলে আমি আবার খুঁজে দেখতে পারি।"
      : "If you can tell me a little more about what happened, I can search again.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const conversation = history
    .slice(-6)
    .map((message) => `${message.role === "user" ? "User" : "AinBodh"}: ${message.content}`)
    .join("\n\n");

  const prompt = `
A member of the public asked AinBodh, a Bangladesh legal-information assistant:

${question}

${conversation ? `Earlier conversation:\n${conversation}\n` : ""}
${documentText ? `The person's uploaded document (excerpt):\n${documentText.slice(0, 6000)}\n` : ""}
AinBodh searched its database of Bangladesh laws and found NO provision
that clearly governs this.

${supportBlock(support)}
${statusBlock(statusNotes)}
${crisisBlock(plan.risk)}

Write a short, warm, helpful reply:
- If the question is about the uploaded document, answer from the document's own
  words (quote briefly), and say that no specific law was found to add.
- Otherwise say plainly that you couldn't find a specific provision to rely on.
- Do NOT name any law, act, section, penalty, deadline or court procedure.
- You may give general, safe, non-legal steps that clearly fit the situation.
- Do NOT write any phone numbers or organisation names.
- ${plan.missingFacts.length ? `End by asking for these details, as 1-3 short questions: ${plan.missingFacts.join("; ")}` : "If one missing detail would help you search again, ask for it in one sentence."}
- Language: ${bn ? "proper Bengali script only" : "clear English only"}. No Banglish.
- Under 200 words. Return only the reply.
`;

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.2,
      max_tokens: 700,
      messages: [{ role: "user", content: prompt }],
    });
    const answer = completion.choices?.[0]?.message?.content?.trim();
    return answer ? answer.replace(/\[C\d+\]/g, "") : fallback;
  } catch (error) {
    console.error("No-evidence answer failed:", (error as Error).message);
    return fallback;
  }
}

type AnswerContext = {
  risk: RiskFlags;
  support: string[];
  topic: string;
  /** Laws found repealed on bdlaws whose replacement text could not be loaded. */
  statusNotes?: string[];
  /** Facts that would change the answer; asked as follow-up questions. */
  missingFacts?: string[];
  /** The person's uploaded document, when they ask about it. */
  documentText?: string;
  documentName?: string;
};

/**
 * The same question asked in Bangla and in English must lead to the same law.
 * Search planning and relevance ranking therefore work on one faithful English
 * restatement of the question, whatever language it was asked in.
 */
async function canonicalQuestion(question: string): Promise<string> {
  if (writtenLanguage(question) === "english") return question;
  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Translate this message (Bangla, or Bangla written in English letters) into clear, faithful English.
Keep every fact, number, date and name. Keep names of laws exactly as written. Do not answer it.
Return only the translation.

${question}`,
        },
      ],
    });
    const text = completion.choices?.[0]?.message?.content?.trim();
    return text && text.length > 1 ? text.slice(0, 4000) : question;
  } catch (error) {
    console.error("Question restatement failed:", (error as Error).message);
    return question;
  }
}

/** Ask a few short questions when the request is too vague, or explain AinBodh's scope. */
async function generateClarifyingReply(
  question: string,
  history: ChatHistoryMessage[],
  plan: RetrievalPlan,
  answerLanguage: AnswerLanguage,
): Promise<string> {
  const bn = answerLanguage === "bn";
  const vague = plan.messageType === "vague";

  const fallback = vague
    ? bn
      ? "আমি সাহায্য করতে চাই। আপনার পরিস্থিতিটা একটু খুলে বলবেন? কী ঘটেছে, কবে থেকে, এবং কার সঙ্গে সমস্যা — এগুলো জানালে আমি সংশ্লিষ্ট আইন খুঁজে সঠিকভাবে বুঝিয়ে বলতে পারব।"
      : "I'd like to help. Could you tell me a little more about what happened — what the problem is, since when, and who it's with? With those details I can find the relevant law and explain it properly."
    : bn
      ? "আমি AinBodh — বাংলাদেশের আইন ও আইনি নথি সহজ ভাষায় বুঝতে সাহায্য করি। এই বিষয়ে আমি সাহায্য করতে পারব না, তবে কোনো আইনি প্রশ্ন বা নথি থাকলে জিজ্ঞেস করুন।"
      : "I'm AinBodh — I help people understand Bangladesh law and legal documents in plain language. I can't help with this one, but if you have a legal question or a document, I'm happy to help.";

  const conversation = history
    .slice(-6)
    .map((message) => `${message.role === "user" ? "User" : "AinBodh"}: ${message.content}`)
    .join("\n\n");

  const prompt = `
You are AinBodh, a friendly Bangladesh legal-information assistant, in a normal chat.

${conversation ? `Earlier conversation:\n${conversation}\n` : ""}
Latest message:
${question}

${
  vague
    ? `The person wants legal help but has not said enough to know the legal issue.
Reply warmly in 2-4 sentences, then ask 2-3 short, specific questions that would let you
identify the legal issue${plan.missingFacts.length ? ` (for example: ${plan.missingFacts.join("; ")})` : ""}.
Do not name any law or give legal conclusions yet.`
    : `The message is not a legal question. In 1-3 friendly sentences, respond briefly and say
that AinBodh helps with Bangladesh legal questions and documents, inviting them to ask one.`
}
${plan.risk.selfHarm || plan.risk.emotionalDistress ? "The person sounds distressed: acknowledge their feelings kindly first. Support contacts are added after your reply automatically." : ""}
- Do NOT write phone numbers or organisation names.
- Language: ${bn ? "proper Bengali script only (no Banglish)" : "clear English only"}.
Return only the reply.
`;

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.3,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    return completion.choices?.[0]?.message?.content?.trim() || fallback;
  } catch (error) {
    console.error("Clarifying reply failed:", (error as Error).message);
    return fallback;
  }
}

/** A message that is safe to show the public (no internals), with a fitting status. */
function publicError(error: unknown, bn: boolean): { status: number; message: string } {
  const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
  if (status === 429) {
    return {
      status: 503,
      message: bn
        ? "AinBodh এই মুহূর্তে অনেক অনুরোধ পাচ্ছে। এক মিনিট পরে আবার চেষ্টা করুন।"
        : "AinBodh is very busy right now. Please try again in a minute.",
    };
  }
  return {
    status: 500,
    message: bn
      ? "দুঃখিত, উত্তর তৈরি করতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।"
      : "Sorry, something went wrong while preparing the answer. Please try again.",
  };
}

function statusBlock(notes: string[]): string {
  if (notes.length === 0) return "";
  return `LAW STATUS (checked on the official Laws of Bangladesh site today):
${notes.map((line) => `- ${line}`).join("\n")}
If this law is relevant, say that it is no longer in force and name the law that
replaced it exactly as written here, with the link. Do NOT describe what the new
law says — its text was not available. Never cite the repealed law as current.`;
}

function supportBlock(support: string[]): string {
  return support.length > 0
    ? `SUPPORT CONTACTS: a section with verified helplines (${support.length}) is added automatically
right after your answer. Do NOT write any phone numbers or helpline names yourself;
you may say "the support contacts below".`
    : "SUPPORT CONTACTS: none for this question. Do not mention any phone numbers or organisations.";
}

function crisisBlock(risk: RiskFlags): string {
  if (!risk.selfHarm && !risk.immediateDanger) return "";
  return `
========================================================
SAFETY FIRST
========================================================

The person may be at risk of harming themselves or in danger.
Begin the answer with 2-3 warm, calm sentences: acknowledge how
frightening this is, say they are not alone and that this can be
dealt with, and ask them to talk to someone they trust and to use the
support contacts below right away if they feel unsafe. Do not lecture.
Then continue with the legal information.
`;
}

async function generateAnswer(
  question: string,
  evidence: EvidenceItem[],
  situation: SituationAnalysis,
  requestedLanguage: AnswerLanguage,
  history: ChatHistoryMessage[] = [],
  context: AnswerContext = { risk: NO_RISK, support: [], topic: "" },
) {
  const communicationStyle = requestedLanguage === "en" ? "English" : "Bangla";

  /*
   * Keep the evidence IDs exactly as assigned by buildEvidence().
   */
  const evidenceText =
    evidence
      .map(
        (item) => `
[CITATION ${item.id}]

Act:
${item.title}

Act file:
${item.actFile}

Section:
${item.sectionNumber}

Status:
${item.repealed ? `REPEALED${item.repealedBy ? ` by ${item.repealedBy}` : ""}. Say clearly that this law is no longer in force.` : "In force"}

Legal text:
${item.text}

Authoritative source:
${item.sourceName || "Not mapped"}

Source URL:
${item.sourceUrl || "Not mapped"}
`,
      )
      .join("\n-------------------------\n");

  const situationText = `
SITUATION ANALYSIS:

Query type:
${situation.queryType}

Legal issue:
${situation.legalIssue}

Facts explicitly stated by the user:

${
  situation.facts.length > 0
    ? situation.facts
        .map(
          (fact) =>
            `- ${fact}`,
        )
        .join("\n")
    : "- None extracted"
}

Time period:
${situation.timePeriod || "Not stated"}

What the user is asking:
${situation.requestedHelp}

Potentially relevant missing facts:

${
  situation.missingFacts.length > 0
    ? situation.missingFacts
        .map(
          (fact) =>
            `- ${fact}`,
        )
        .join("\n")
    : "- None identified"
}
`;

  const conversationText =
    history.length > 0
      ? `
PREVIOUS CONVERSATION:

${history
  .slice(-8)
  .map(
    (message) =>
      `${
        message.role === "user"
          ? "User"
          : "AinBodh"
      }: ${message.content}`,
  )
  .join("\n\n")}
`
      : "";

  /*
   * Deterministic inheritance detection is deliberately repeated
   * here. The final answer must not rely only on the LLM situation
   * classifier to recognize a family-property case.
   */
  const normalizedQuestion =
    normalizeLegalText(
      `${question} ${situation.legalIssue}`,
    );

  const inheritanceTerms = [
    "inheritance",
    "inherit",
    "heir",
    "heirs",
    "will",
    "testator",
    "estate",
    "succession",
    "grandfather",
    "grandmother",
    "uncle",
    "uncles",
    "cousin",
    "father's assets",
    "father assets",
    "property share",
    "family property",
  ];

  const inheritanceSituation =
    inheritanceTerms.some((term) =>
      normalizedQuestion.includes(term),
    );

  const applicabilityInstruction =
    inheritanceSituation
      ? `
========================================================
CRITICAL INHERITANCE / FAMILY-PROPERTY SAFETY RULE
========================================================

This is an inheritance/family-property situation.

The applicable personal-law or inheritance regime is currently
not established unless the user's explicitly stated facts establish it.

Therefore:

- DO NOT determine inheritance shares.
- DO NOT state who legally inherits the property.
- DO NOT state that the daughters legally own or inherit the
  disputed property.
- DO NOT state that the uncles legally have or do not have
  authority over the property.
- DO NOT state that the cousin can or cannot legally receive
  the property.
- DO NOT state that a transfer, deed, gift, sale, mutation,
  registration, or other transaction is valid or invalid unless
  the supplied evidence establishes that conclusion.
- DO NOT assume that the supplied Succession Act provisions
  govern this user's particular situation.
- DO NOT infer the applicable personal-law regime from the
  family structure.
- DO NOT infer religion or personal-law regime from names,
  relationships, language, or other indirect clues.

You MAY explain what a supplied provision literally establishes,
but only to the extent supported by the supplied text.

If applicability is uncertain, use conditional wording such as:

"The supplied provision addresses this subject, but the supplied
evidence does not establish whether it governs your particular
situation."

Do NOT write:

"Under this law, you are entitled to..."

unless the supplied evidence actually establishes that conclusion
for the user's stated facts.
`
      : "";

  const prompt = `
USER QUESTION:

${question}

${conversationText}

${situationText}

LEGAL EVIDENCE (retrieved by AinBodh from its database of Bangladesh
laws; the user did NOT provide these texts):

${evidenceText}

${context.documentText ? `THE PERSON'S UPLOADED DOCUMENT${context.documentName ? ` (${context.documentName})` : ""} — excerpt.
When they ask about it, explain what the document itself says (quote short phrases),
and use the legal evidence only to explain the law that applies:

${context.documentText.slice(0, 9000)}
` : ""}
${supportBlock(context.support)}

${statusBlock(context.statusNotes ?? [])}

${applicabilityInstruction}

${crisisBlock(context.risk)}

========================================================
HOW TO ANSWER
========================================================

You are in a normal, ongoing conversation with a member of the
public. Answer their latest message directly, using the previous
conversation for context. Be warm, plain and practical.

- Never say "the texts you provided", "the supplied evidence",
  "the retrieved provisions" or describe how AinBodh searched.
  Say "Under <law name>, section <n> ..." instead.
- Use only provisions that genuinely concern the person's issue.
  If a supplied provision is unrelated, ignore it completely —
  never mention, list or explain it.
- When the person describes a situation, use this shape
  (short headings, plain language):
  1. A direct answer in one or two sentences.
  2. What the law says — each legal point with its citation.
  3. What you can do now — safe, practical steps; legal steps only
     when supported by the evidence.
  Support contacts, when relevant, are appended automatically after
  your answer — do not write them.
- FOLLOW-UP QUESTIONS: ${
    (context.missingFacts ?? []).length
      ? `these details are missing and would change the answer: ${(context.missingFacts ?? []).join("; ")}.
  Give the best answer you can now, then end with a short line such as
  "To give you a more specific answer, could you tell me:" followed by
  1-3 short questions (one line each).`
      : "if a missing fact would materially change the answer, end with 1-2 short questions asking for it; otherwise ask nothing."
  }
- For a short follow-up message, reply briefly and naturally, like a chat;
  do not repeat the whole earlier answer.
- FORMAT like a well-written chat message: short paragraphs; section headings as "### "
  each starting with one fitting emoji (for example "### 📌 …", "### ⚖️ …", "### ✅ …");
  numbered lists (1. 2. 3.) for steps and for separate legal points; **bold** for the
  key words. No tables. Citations stay as [C1] right after the claim they support.
- If the person asks how to stay anonymous or protect their
  identity, answer only what the evidence supports, and otherwise
  suggest they ask the listed support service how their identity
  will be protected. Do not promise confidentiality.

========================================================
CORE GROUNDING RULE
========================================================

Answer the user's question using ONLY:

1. The user's explicitly stated facts.
2. The supplied legal evidence.

Do NOT use outside legal knowledge.

Missing facts are UNKNOWN.

Never turn an unknown fact into an assumed fact.

Retrieval relevance is NOT proof of legal applicability.

========================================================
CITATION ID LOCK
========================================================

The following citation IDs are supplied:

${evidence
  .map(
    (item) =>
      `[${item.id}] = ${item.title} — Section ${item.sectionNumber}`,
  )
  .join("\n")}

These IDs are LOCKED.

You MUST use the ID attached to the evidence item that actually
supports the statement.

NEVER renumber the citations.

NEVER swap the citations.

NEVER infer a different mapping.

NEVER create a new citation ID.

Example:

If:

[C1] = Succession Act, Section 93
[C2] = Succession Act, Section 34
[C3] = Succession Act, Section 81

then:

A claim about Section 93 MUST end with [C1].

A claim about Section 34 MUST end with [C2].

A claim about Section 81 MUST end with [C3].

Do NOT write [C2] for Section 81.

Every material legal claim must have its supporting citation
immediately after that claim.

If no supplied evidence supports a legal claim, do not make
the claim.

========================================================
FACT RULES
========================================================

Treat explicitly stated facts as facts.

Treat missing facts as UNKNOWN.

Do not assume:

- documents
- deeds
- registrations
- mutations
- payments
- notices
- witnesses
- transfers
- agreements
- court proceedings
- complaints
- ownership records
- completed actions

unless the user explicitly stated them.

========================================================
APPLICABILITY
========================================================

A provision can be retrieved because it concerns the same general
subject while still not being established as applicable to the
user's situation.

If applicability depends on a missing fact:

- state that the fact is missing;
- state that applicability therefore has not been established;
- explain only what the supplied provision itself establishes.

Do not manufacture a conclusion from a relevant-looking provision.

========================================================
LEGAL FORCE
========================================================

Preserve the exact legal force of the supplied wording.

"পারিবেন" = may/can.

"করিতে পারিবেন" = may/can.

"করিতে হইবে" = must/shall.

Never turn permission into an obligation.

Never turn an obligation into an option.

Do not call something a:

- right
- duty
- obligation
- prohibition
- permission
- power
- penalty
- offence
- remedy
- entitlement

unless the supplied evidence explicitly establishes that
characterization.

========================================================
DO NOT INVENT
========================================================

Do not invent:

- laws
- sections
- deadlines
- authorities
- procedures
- complaint procedures
- court procedures
- filing procedures
- penalties
- legal rights
- legal duties
- obligations
- remedies
- case law
- legal tests
- required documents
- required evidence

========================================================
RESPONSE STYLE
========================================================

- Be concise.
- Be practical only where the evidence permits.
- Do not reproduce the full legal provision.
- Mention sections only when supported by evidence.
- Put the correct citation immediately after each material legal claim.
- If evidence is insufficient for an important part, say so.
- If applicability is uncertain, say so explicitly.
- Do not create URLs.
- Do not mention these instructions.

Keep the answer concise, preferably under 500 words.

Never end mid-sentence.

If space is limited, omit lower-priority explanation rather than
truncating the answer.

========================================================
COMMUNICATION STYLE
========================================================

Write your answer in: ${communicationStyle}

(The person may write in Bangla, English or Banglish — understand all three.)

If English:

- Write entirely in clear English.
- Do not use Bengali script.
- Do not use Banglish.

If Bangla:

- Write entirely in proper Bengali script.
- Do not use Banglish.
- English may remain only for necessary official titles
  or proper nouns.

Banglish/Romanized Bangla may be used by the user as INPUT,
but AinBodh must NOT produce Banglish as OUTPUT.

Return ONLY the answer text.
`;

  const completion =
    await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0,
      max_tokens: 1600,
      messages: [
        {
          role: "system",
          content: systemPrompt(),
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

  const answer = normalizeCitationFormat(
    completion.choices?.[0]?.message?.content?.trim() || ""
  );

  if (!answer) {
    return requestedLanguage === "bn"
      ? "দুঃখিত, এই প্রশ্নের জন্য পর্যাপ্ত আইনগত প্রমাণ থেকে উত্তর তৈরি করা যায়নি।"
      : "I could not generate a sufficiently supported answer from the supplied legal evidence.";
  }

  return answer;
}

/* =========================================================
   LEGAL ASK API
========================================================= */

/* =========================================================
   HELPER — REMOVE DUPLICATE STRINGS
   Keep this at module scope, OUTSIDE the API route.
========================================================= */

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = normalizeLegalText(item);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

/* =========================================================
   LEGAL ASK API
========================================================= */

async function runAsk(reqBody: any, onStatus: StatusFn = () => {}): Promise<RouteResult> {
  try {
    /* =====================================================
       STEP 0 — VALIDATE INPUT
    ===================================================== */

    const question =
      typeof reqBody?.question === "string"
        ? reqBody.question.trim()
        : "";

    if (!question) {
      return routeResult(400, {
        ok: false,
        error: "Question is required.",
      });
    }

    if (question.length > 4000) {
      return routeResult(400, {
        ok: false,
        error: "Please keep your question under 4,000 characters.",
      });
    }

    const requestedLanguage = normalizeRequestedLanguage(
      reqBody?.language,
    );

    /* =====================================================
       STEP 0.1 — NORMALIZE CONVERSATION HISTORY

       Accept both:
       { role: "user", content: "..." }
       { role: "user", text: "..." }

       This prevents valid previous messages from being
       silently discarded when the frontend sends `text`.
    ===================================================== */

    const history: ChatHistoryMessage[] = Array.isArray(
      reqBody?.history,
    )
      ? reqBody.history.flatMap(
          (message: unknown): ChatHistoryMessage[] => {
            if (
              typeof message !== "object" ||
              message === null ||
              Array.isArray(message)
            ) {
              return [];
            }

            const item = message as Record<string, unknown>;

            if (
              item.role !== "user" &&
              item.role !== "assistant"
            ) {
              return [];
            }

            const content =
              typeof item.content === "string"
                ? item.content
                : typeof item.text === "string"
                  ? item.text
                  : "";

            if (!content.trim()) {
              return [];
            }

            return [
              {
                role: item.role,
                content: content.trim().slice(0, 6000),
              },
            ];
          },
        ).slice(-20)
      : [];

    // Optional: the document the person is asking about (analysis-page chat).
    const documentText =
      typeof reqBody?.documentText === "string" ? reqBody.documentText.slice(0, 15000) : "";
    const documentName =
      typeof reqBody?.documentName === "string" ? reqBody.documentName.slice(0, 200) : "";

    /* =====================================================
       STEP 0.2 — LANGUAGE AND SOCIAL MESSAGES

       Bangla by default; English when the person asks for it or
       writes English with the app set to English. Never Banglish.
       Greetings, thanks and goodbyes are answered immediately,
       like a normal chat — no legal search.
    ===================================================== */

    const answerLanguage: AnswerLanguage = resolveAnswerLanguage(question, requestedLanguage, history);
    const bnAnswer = answerLanguage === "bn";
    const weight = detectEmotionalWeight(question, history);
    const turnKind = classifyTurn(question);

    if (turnKind !== "legal") {
      let reply = socialReply(turnKind, question, answerLanguage, history.length > 0);

      // Closing a heavy conversation: gently leave the support contacts again.
      if ((turnKind === "thanks" || turnKind === "goodbye") && weight.signals > 0) {
        const risk = mergeRisk(NO_RISK, { emotionalDistress: true });
        reply = `${reply}\n\n${supportSection(risk, supportResources(risk, bnAnswer), bnAnswer)}`;
      }

      return routeResult(200, {
        ok: true,
        grounded: false,
        kind: turnKind,
        answer: reply,
        citations: [],
        support: [],
      });
    }

    const contextualQuestion = buildConversationContext(
      history,
      question,
    );

    debugLog("Requested language:", requestedLanguage || "auto", "-> answer in", answerLanguage);
    debugLog("Conversation history messages:", history.length);

    debugLog("");
    debugLog("========================================");
    debugLog("LEGAL QUESTION");
    debugLog("========================================");
    debugLog("Question:", question);

    /* =====================================================
       STEP 1 — DETECT INTENT
    ===================================================== */

    const intent = detectLegalIntent(contextualQuestion);

    debugLog("Intent:", intent);

    /* =====================================================
       STEP 2 — ANALYZE THE SITUATION
    ===================================================== */

    onStatus("understand");
    const englishQuestion = await canonicalQuestion(question);

    // The situation analysis and the search plan don't depend on each other: run both at once.
    const [situation, plan] = await Promise.all([
      analyzeSituation(contextualQuestion, intent),
      planRetrieval(groq, GROQ_MODEL, englishQuestion, contextualQuestion, documentText),
    ]);
    plan.canonicalQuestion = englishQuestion;

    debugLog("Query type:", situation.queryType);
    debugLog("Legal issue:", situation.legalIssue);
    debugLog("Retrieval query:", situation.retrievalQuery);
    debugLog("Missing facts:", situation.missingFacts);

    // The conversation as a whole, not just this message, decides whether it has become heavy.
    plan.risk = mergeRisk(plan.risk, { emotionalDistress: weight.heavy });

    const support = supportResources(plan.risk, bnAnswer);
    const supportText = supportSection(plan.risk, support, bnAnswer);
    const withSupport = (text: string) => (supportText ? `${text.trim()}\n\n${supportText}` : text.trim());

    /* =====================================================
       STEP 3.1 — TOO LITTLE DETAIL, OR NOT A LEGAL QUESTION

       Ask a few short questions first instead of guessing.
    ===================================================== */

    if (!documentText && (plan.messageType === "vague" || plan.messageType === "not_legal")) {
      onStatus("write");
      const answer = await generateClarifyingReply(question, history, plan, answerLanguage);
      return routeResult(200, {
        ok: true,
        grounded: false,
        kind: plan.messageType === "vague" ? "clarify" : "out_of_scope",
        answer: withSupport(answer),
        citations: [],
        support,
        intent,
      });
    }

    debugLog("Plan:", {
      topic: plan.topic,
      conceptsBn: plan.conceptsBn,
      conceptsEn: plan.conceptsEn,
      laws: plan.laws,
      risk: plan.risk,
    });

    /* =====================================================
       STEP 4 — RETRIEVE CANDIDATE PROVISIONS
    ===================================================== */

    onStatus("search");
    let evidenceDraft: EvidenceItem[] = [];
    let lawNotes: LawNote[] = [];

    // Rent refusal / receipt keep their exact-section path (s.19 / s.13).
    if (intent === "rent_refusal" || intent === "rent_receipt") {
      const searchTerms = dedupeStrings(
        extractLegalSearchTerms(contextualQuestion, intent, situation.retrievalQuery),
      );
      const lexicalResults = await lexicalSearch(searchTerms);
      const rankedResults = mergeResults(contextualQuestion, intent, lexicalResults, [], searchTerms);
      evidenceDraft = buildEvidence(rankedResults, intent);

      // Same rule as everywhere else: never cite a law bdlaws now shows as repealed.
      const live = await checkActsLive(evidenceDraft.map((item) => item.actFile));
      if (evidenceDraft.some((item) => getLawStatus(item.actFile)?.repealed)) {
        lawNotes = live.notes;
        evidenceDraft = [];
      }
    }

    if (evidenceDraft.length === 0) {
      const retrieved = await retrieveEvidence(
        question,
        contextualQuestion,
        situation,
        plan,
      );
      evidenceDraft = retrieved.evidence;
      lawNotes = [...lawNotes, ...retrieved.notes.filter((note) => !lawNotes.some((item) => item.actFile === note.actFile))];
    }

    const statusNotes = lawNotesText(lawNotes);
    onStatus("check_current");

    // Every citation gets its official bdlaws link (exact section when it can be matched).
    const evidence = await attachOfficialSources(evidenceDraft);

    debugLog(
      "Evidence:",
      evidence.map((item) => `${item.id}: ${item.title} Section ${item.sectionNumber}`),
    );

    /* =====================================================
       STEP 5 — NO RELEVANT LAW FOUND

       Still answer like a helpful person: say plainly that no
       specific provision was found, give safe general steps and
       verified support lines — but never name a law from memory.
    ===================================================== */

    onStatus("write");
    if (evidence.length === 0) {
      const answer = await generateNoEvidenceAnswer(
        question,
        history,
        plan,
        support,
        answerLanguage,
        statusNotes,
        documentText,
      );

      return routeResult(200, {
        ok: true,
        grounded: false,
        applicabilityConfirmed: false,
        answer: withSupport(answer),
        citations: [],
        support,
        intent,
      });
    }

    /* =====================================================
       STEP 6 — GENERATE AN EVIDENCE-BASED ANSWER
    ===================================================== */

    const answer = await generateAnswer(
      question,
      evidence,
      situation,
      answerLanguage,
      history,
      {
        risk: plan.risk,
        support,
        topic: plan.topic,
        statusNotes,
        missingFacts: plan.missingFacts,
        documentText,
        documentName,
      },
    );

    /* =====================================================
       STEP 9 — CHECK APPLICABILITY

       Citations alone do not prove that a provision applies
       to the user's exact circumstances. Family-property and
       inheritance questions may require additional facts.
    ===================================================== */

    const normalizedApplicabilityText = normalizeLegalText(
      `${question} ${situation.legalIssue}`,
    );

    const inheritanceTerms = [
      "inheritance",
      "inherit",
      "heir",
      "heirs",
      "will",
      "testator",
      "estate",
      "succession",
      "grandfather",
      "grandmother",
      "uncle",
      "uncles",
      "cousin",
      "father's assets",
      "father assets",
      "property share",
      "family property",
    ];

    const inheritanceSituation = inheritanceTerms.some(
      (term) => normalizedApplicabilityText.includes(term),
    );

    const applicabilityNeedsClarification =
      inheritanceSituation &&
      situation.missingFacts.length > 0;

    debugLog(
      "Inheritance/family-property situation:",
      inheritanceSituation,
    );

    debugLog(
      "Applicability needs clarification:",
      applicabilityNeedsClarification,
    );

    /* =====================================================
       STEP 10 — NORMALIZE CITATIONS FOR THE FRONTEND

       The frontend's LegalCitation type expects:
       id, title, actFile, sectionNumber, content,
       sourceName and sourceUrl.

       The route's original response only supplied `section`,
       so sectionNumber was not available under the expected
       property name. Keep `section` as a compatibility alias.

       actFile/content are read defensively because their
       availability depends on your existing evidence type.
    ===================================================== */

    /*
     * The answer may cite only IDs that exist in `evidence`.
     * Unknown IDs are removed from the text, and the citation list
     * contains only the sources the answer actually relies on, so
     * every [Cn] in the answer opens the matching law.
     */
    const evidenceIds = new Set(evidence.map((item) => item.id));
    const cleanedAnswer = cleanCitationMarkers(answer, evidenceIds);
    const usedIds = citedIds(cleanedAnswer);
    const citedEvidence =
      usedIds.size > 0
        ? evidence.filter((item) => usedIds.has(item.id))
        : evidence;

    const citations = citedEvidence.map((item) => ({
      id: item.id,
      title: item.title,
      actFile: item.actFile,

      // `section` kept as a compatibility alias for older clients.
      section: item.sectionNumber ?? null,
      sectionNumber: item.sectionNumber ?? null,

      // The provision text. (Previously read from a non-existent
      // `content` field, so citations reached the UI empty.)
      content: item.text,
      text: item.text,

      sourceName: item.repealed
        ? `${item.sourceName ?? item.title} — repealed${item.repealedBy ? ` by ${item.repealedBy}` : ""} (no longer in force)`
        : item.sourceName ?? undefined,
      sourceUrl: item.sourceUrl ?? undefined,
      sourceKind: item.sourceKind ?? undefined,
      inForce: !item.repealed,
      repealedBy: item.repealedBy ?? undefined,
    }));

    debugLog("Citation count:", citations.length);
    debugLog("========================================");

    /* =====================================================
       STEP 11 — SEND RESPONSE
    ===================================================== */

    return routeResult(200, {
      ok: true,

      // Evidence was retrieved, but case-specific applicability
      // may still require additional facts.
      grounded: !applicabilityNeedsClarification,

      applicabilityConfirmed: !applicabilityNeedsClarification,

      answer: withSupport(cleanedAnswer),
      citations,
      support,
      intent,
    });
  } catch (error) {
    console.error("LEGAL ASK ERROR:", error instanceof Error ? error.message : error);
    const { status, message } = publicError(error, reqBody?.language === "bn");
    return routeResult(status, { ok: false, error: message });
  }
}

app.post("/api/legal/ask", async (req, res) => {
  await respond(req, res, runAsk);
});

/* =========================================================
   OFFICIAL SOURCE LOOKUP (diagnostic)

   GET /api/legal/official-source?act=11.json&section=4
   Returns the bdlaws link AinBodh would attach for that act/section.
========================================================= */

app.get("/api/legal/official-source", async (req, res) => {
  const act = typeof req.query.act === "string" ? req.query.act : "";
  const section = typeof req.query.section === "string" ? req.query.section : null;
  const title = typeof req.query.title === "string" ? req.query.title : `Act ${act}`;

  const source = await resolveOfficialSource(act, section, title);

  if (!source) {
    return res.status(400).json({
      ok: false,
      error: "`act` must be a bdlaws act ID such as 11 or 11.json.",
    });
  }

  return res.json({ ok: true, act, section, ...source });
});

/* =========================================================
   START SERVER
========================================================= */

registerVoiceRoutes(app, groq);
registerCompareRoute(app, groq, GROQ_MODEL);

console.log(
  "Registered routes: /api/legal/ask, /api/legal/extract, /api/legal/analyze-document, /api/legal/compare, /api/legal/official-source, /api/voice/tts, /api/voice/transcribe",
);
console.log(`Read-aloud provider: ${ttsProvider() ?? "off"}${ttsProvider() === "edge" ? " (unofficial; set AZURE_SPEECH_KEY/REGION for production)" : ""}`);

app.use(errorHandler);

// Load the corpus in the background so the first question isn't slowed down.
void initLiveLaws();

app.listen(PORT, () => {
  console.log(
    `AinBodh backend running at http://127.0.0.1:${PORT}`,
  );
});
