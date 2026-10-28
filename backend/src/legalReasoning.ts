/* =========================================================
   RETRIEVAL PLANNING, RELEVANCE FILTERING, SAFETY

   planRetrieval()   turns a plain-language question into the legal
                     concepts statutes actually use (Bangla + English),
                     likely laws (hints only, verified against the corpus),
                     and risk signals.
   rerankEvidence()  asks the model which retrieved sections genuinely
                     govern the issue, so word-overlap matches (e.g.
                     "college" -> College Ordinance) are dropped.
   detectRisk()      deterministic crisis detection (does not rely on the LLM).
   supportResources() verified Bangladesh support lines for the answer.
========================================================= */

import type Groq from "groq-sdk";

export type RiskFlags = {
  selfHarm: boolean;
  immediateDanger: boolean;
  sexualExploitation: boolean;
  violenceAgainstWomenOrChildren: boolean;
  needsFreeLegalAid: boolean;
  /** The conversation has become emotionally heavy (fear, shame, hopelessness). */
  emotionalDistress: boolean;
  /** A child (under 18) is affected. */
  involvesChild: boolean;
};

export type MessageType = "legal_question" | "vague" | "not_legal";

export type RetrievalPlan = {
  topic: string;
  conceptsBn: string[];
  conceptsEn: string[];
  laws: string[];
  risk: RiskFlags;
  /** "vague": too little detail to identify the legal issue — ask first. */
  messageType: MessageType;
  /** Facts that would materially change the answer (English, for the answer writer). */
  missingFacts: string[];
  /** The question restated in English; planning and ranking use it so languages agree. */
  canonicalQuestion?: string;
};

export type Candidate = {
  key: string;
  actFile: string;
  title: string;
  sectionNumber: string | null;
  text: string;
};

export const NO_RISK: RiskFlags = {
  selfHarm: false,
  immediateDanger: false,
  sexualExploitation: false,
  violenceAgainstWomenOrChildren: false,
  needsFreeLegalAid: false,
  emotionalDistress: false,
  involvesChild: false,
};

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(cleaned.slice(start, end + 1));
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const strings = (value: unknown, max: number): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 1)
        .map((item) => item.trim().slice(0, 80))
        .slice(0, max)
    : [];

/* ---------------------------------------------------------
   Deterministic risk detection (English, Bangla, Banglish)
--------------------------------------------------------- */

const SELF_HARM = [
  /\b(kill|hurt|harm)\s+my\s*self\b/i,
  /\bsuicid/i,
  /\bend\s+(my|this)\s+life\b/i,
  /\b(i\s*('ll|will|would|might|am going to|want to|wanna)\s+die)\b/i,
  /\bwant\s+to\s+die\b/i,
  /\bno\s+reason\s+to\s+live\b/i,
  /\bdon'?t\s+want\s+to\s+live\b/i,
  /আত্মহত্যা/,
  /মরে\s*যা(ব|বো|ই)/,
  /মরে\s*যেতে\s*চাই/,
  /বাঁচতে\s*চাই\s*না/,
  /নিজেকে\s*শেষ/,
  /\b(atmohotta|attohotta|more\s*jabo|mor[e]?\s*jaite\s*chai|bachte\s*chai\s*na|nijeke\s*shesh)\b/i,
];

const DANGER = [/\b(right now|tonight|today)\b.*\b(kill|attack|hurt)\b/i, /\bin danger\b/i, /\bthreaten(ed|ing)? to kill\b/i, /খুন\s*করার\s*হুমকি/, /মেরে\s*ফেলার\s*হুমকি/];

const SEXUAL_EXPLOITATION = [
  /\bblackmail/i,
  /\bsextort/i,
  /\b(nude|intimate|private|naked|explicit)\s+(photo|picture|pic|image|video)s?\b/i,
  /\b(photos?|pictures?|images?|videos?)\b.*\b(leak|send|post|publish|spread|viral)\b/i,
  /\bdeep\s*fake|ai[-\s]?generated/i,
  /ব্ল্যাকমেইল|ব্ল‍্যাকমেইল|সেক্সটর্শন/,
  /(ছবি|ভিডিও).{0,40}(ছড়িয়ে|ভাইরাল|পাঠিয়ে|ফাঁস)/,
  /\b(blackmail|chobi|video)\b.*\b(viral|chhoriye|fash)\b/i,
];

const NO_MONEY = [/\b(no|not enough|don'?t have)\s+(enough\s+)?money\b/i, /\bcan'?t\s+afford\b/i, /\bno\s+access\s+to\s+(legal\s+help|a\s+lawyer)/i, /টাকা\s*নেই/, /আইনজীবী\s*(রাখার|নেওয়ার)\s*(সামর্থ্য|টাকা)/];

const CHILD = [
  /\b(my|our|a|the)\s+(child|children|son|daughter|kid|kids|baby|minor|nephew|niece|student)\b.{0,40}\b(\d{1,2}\s*(years?|yrs?)\s*old|under\s*18|minor)\b/i,
  /\b(child|minor)\s+(abuse|marriage|labou?r|marriage)\b|\bchild\b.{0,30}\b(abused|beaten|harass)/i,
  /\b(1[0-7]|[1-9])[\s-]*(years?|yrs?)[\s-]*old\b/i,
  /শিশু|নাবালক|বাল্যবিবাহ|শিশুশ্রম|(১[০-৭]|[১-৯])\s*বছর(ের)?\s*(বয়সী|বয়স)/,
];

export function detectRisk(text: string): RiskFlags {
  const any = (patterns: RegExp[]) => patterns.some((pattern) => pattern.test(text));
  return {
    selfHarm: any(SELF_HARM),
    immediateDanger: any(DANGER),
    sexualExploitation: any(SEXUAL_EXPLOITATION),
    violenceAgainstWomenOrChildren: /\b(rape|assault|domestic violence|beat(s|ing)? me|dowry)\b|ধর্ষণ|নির্যাতন|যৌতুক|মারধর/i.test(text),
    needsFreeLegalAid: any(NO_MONEY),
    emotionalDistress: false,
    involvesChild: any(CHILD),
  };
}

export function mergeRisk(a: RiskFlags, b: Partial<RiskFlags>): RiskFlags {
  return {
    selfHarm: a.selfHarm || b.selfHarm === true,
    immediateDanger: a.immediateDanger || b.immediateDanger === true,
    sexualExploitation: a.sexualExploitation || b.sexualExploitation === true,
    violenceAgainstWomenOrChildren: a.violenceAgainstWomenOrChildren || b.violenceAgainstWomenOrChildren === true,
    needsFreeLegalAid: a.needsFreeLegalAid || b.needsFreeLegalAid === true,
    emotionalDistress: a.emotionalDistress || b.emotionalDistress === true,
    involvesChild: a.involvesChild || b.involvesChild === true,
  };
}

/* ---------------------------------------------------------
   Planning
--------------------------------------------------------- */

export async function planRetrieval(
  groq: Groq,
  model: string,
  question: string,
  conversation: string,
  documentContext = "",
): Promise<RetrievalPlan> {
  const deterministicRisk = detectRisk(question);

  const prompt = `
You prepare a search of Bangladesh legislation for a legal-information assistant.
Do NOT answer the question. Return ONLY JSON.

Conversation so far (may be empty):
${conversation.slice(-2500) || "(none)"}

${documentContext ? `The person is asking about this document they uploaded (excerpt):\n${documentContext.slice(0, 3000)}\n` : ""}
Latest user message:
${question}

Return:
{
  "message_type": "legal_question" | "vague" | "not_legal",
  "missing_facts": ["up to 3 short facts the person has NOT given that would materially change the legal answer"],
  "topic": "short neutral description of the legal issue",
  "concepts_bn": ["6-12 Bangla legal terms as they appear in Bangladeshi statutes, e.g. ব্ল্যাকমেইলিং, সেক্সটর্শন, ভীতি প্রদর্শন, চাঁদাবাজি, মানহানি, যৌন হয়রানি, ভাড়াটিয়া, উচ্ছেদ"],
  "concepts_en": ["6-12 English statutory terms, e.g. extortion, criminal intimidation, defamation, sexual harassment, eviction"],
  "laws": ["up to 6 Bangladeshi laws that most likely govern this, by official title (Bangla title for laws made after 1987), current versions only"],
  "risk": {
    "selfHarm": true|false,
    "immediateDanger": true|false,
    "sexualExploitation": true|false,
    "violenceAgainstWomenOrChildren": true|false,
    "needsFreeLegalAid": true|false,
    "emotionalDistress": true|false,
    "involvesChild": true|false
  }
}

Rules:
- Use the legal CONCEPTS behind the facts, not incidental words. A student being blackmailed is about blackmail/extortion/cyber crime, not about colleges.
- Do not include place names, institutions or personal details as concepts.
- Prefer laws currently in force; if a law was replaced, give the replacement.
- Choose laws from the legal issue itself — the same issue must get the same laws whether it
  was asked in Bangla or English. Give the official title of each law.
- message_type "vague": the person wants legal help but gives too little to know the legal issue
  (e.g. "I have a problem with my landlord", "I need legal help"). "not_legal": not about law,
  rights, documents or a legal situation at all. Otherwise "legal_question".
- missing_facts: only facts that would change the answer (dates, amounts, whether a written
  agreement exists, who did what, the person's age if relevant). [] if none.
- emotionalDistress: true when the person sounds frightened, ashamed, hopeless or overwhelmed.
- The person may write in Bangla, English or Banglish (Bangla in Latin letters); understand all three.
`;

  try {
    const completion = await groq.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 700,
      messages: [{ role: "user", content: prompt }],
    });

    const parsed = parseJsonObject(completion.choices?.[0]?.message?.content ?? "");
    if (!parsed) throw new Error("planner returned no JSON");

    const risk = (parsed.risk && typeof parsed.risk === "object" ? parsed.risk : {}) as Partial<RiskFlags>;
    const messageType: MessageType =
      parsed.message_type === "vague" || parsed.message_type === "not_legal" ? parsed.message_type : "legal_question";

    return {
      topic: typeof parsed.topic === "string" ? parsed.topic.slice(0, 160) : "",
      conceptsBn: strings(parsed.concepts_bn, 12),
      conceptsEn: strings(parsed.concepts_en, 12),
      laws: strings(parsed.laws, 6),
      risk: mergeRisk(deterministicRisk, risk),
      messageType,
      missingFacts: Array.isArray(parsed.missing_facts)
        ? parsed.missing_facts
            .filter((item): item is string => typeof item === "string" && item.trim().length > 2)
            .map((item) => item.trim().slice(0, 160))
            .slice(0, 3)
        : [],
    };
  } catch (error) {
    console.error("Retrieval planning failed:", (error as Error).message);
    return {
      topic: "",
      conceptsBn: [],
      conceptsEn: [],
      laws: [],
      risk: mergeRisk(deterministicRisk, NO_RISK),
      messageType: "legal_question",
      missingFacts: [],
    };
  }
}

/* ---------------------------------------------------------
   Relevance filtering
--------------------------------------------------------- */

export async function rerankEvidence(
  groq: Groq,
  model: string,
  question: string,
  topic: string,
  candidates: Candidate[],
  maxKeep = 5,
): Promise<Candidate[]> {
  if (candidates.length === 0) return [];

  const list = candidates
    .map(
      (candidate, index) =>
        `[R${index + 1}] ${candidate.title}${candidate.sectionNumber ? ` — section ${candidate.sectionNumber}` : ""}\n${candidate.text
          .replace(/\s+/g, " ")
          .slice(0, 900)}`,
    )
    .join("\n\n");

  const prompt = `
You check which provisions of Bangladesh law are relevant to a person's question.

Question:
${question}

Legal issue: ${topic || "(not stated)"}

Candidate provisions:
${list}

Score each candidate:
3 = directly governs the conduct or issue the person describes (an offence, right, duty or procedure that applies)
2 = closely related and useful to explain the person's position
1 = only tangentially related
0 = irrelevant (shares a word but is about something else, e.g. an act about colleges for a question that merely mentions being a student)

Return ONLY JSON: {"scores":[{"id":"R1","score":0}, ...]}
`;

  try {
    const completion = await groq.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });

    const parsed = parseJsonObject(completion.choices?.[0]?.message?.content ?? "");
    const scores = Array.isArray(parsed?.scores) ? (parsed!.scores as Array<{ id?: unknown; score?: unknown }>) : null;
    if (!scores) throw new Error("reranker returned no scores");

    const ranked = scores
      .map((item) => ({
        index: typeof item.id === "string" ? Number(item.id.replace(/\D/g, "")) - 1 : -1,
        score: Number(item.score),
      }))
      .filter((item) => item.index >= 0 && item.index < candidates.length && item.score >= 2)
      .sort((a, b) => b.score - a.score || a.index - b.index);

    const kept: Candidate[] = [];
    for (const item of ranked) {
      if (!kept.includes(candidates[item.index])) kept.push(candidates[item.index]);
      if (kept.length >= maxKeep) break;
    }
    return kept;
  } catch (error) {
    // Without a relevance check, keep only the strongest few rather than everything.
    console.error("Relevance check failed:", (error as Error).message);
    return candidates.slice(0, Math.min(3, maxKeep));
  }
}

/* ---------------------------------------------------------
   Verified support resources
--------------------------------------------------------- */

/*
 * Sources (checked Oct 2026):
 * - 999 National Emergency Service (police, fire, ambulance).
 * - 109 National Helpline Centre for Violence Against Women and Children,
 *   Ministry of Women and Children Affairs; toll-free (Prothom Alo, 5 Mar 2023;
 *   The Daily Star, 16 Days of Activism 2025).
 * - 1098 Child Helpline, Department of Social Services (Ministry of Social Welfare),
 *   toll-free, answered around the clock (Prothom Alo, 10 May 2024; Child Helpline International).
 * - Kaan Pete Roi emotional support: +880 9612-119911, every day 3 PM–3 AM (kaanpeteroi.org).
 * - Police Cyber Support for Women (PCSW): 01320-000888 (UNB, Police HQ announcement, 2020).
 * - National Legal Aid helpline 16430 (toll-free, government legal aid).
 * Review these periodically; numbers can change.
 */
export function supportResources(risk: RiskFlags, bn: boolean): string[] {
  const lines: string[] = [];
  const add = (line: string) => {
    if (!lines.includes(line)) lines.push(line);
  };

  const heavy = risk.selfHarm || risk.emotionalDistress;

  if (heavy) {
    add(
      bn
        ? "কান পেতে রই (মানসিক সহায়তা, বিনামূল্যে ও গোপনীয়): +৮৮০ ৯৬১২-১১৯৯১১ — প্রতিদিন বিকাল ৩টা থেকে রাত ৩টা"
        : "Kaan Pete Roi (free, confidential emotional support): +880 9612-119911 — every day, 3 PM to 3 AM",
    );
  }

  if (risk.sexualExploitation) {
    add(
      bn
        ? "পুলিশ সাইবার সাপোর্ট ফর উইমেন (PCSW): হটলাইন ০১৩২০-০০০৮৮৮, ফেসবুক পেজ “Police Cyber Support for Women PCSW”"
        : "Police Cyber Support for Women (PCSW): hotline 01320-000888, Facebook page “Police Cyber Support for Women PCSW”",
    );
  }

  if (heavy || risk.sexualExploitation || risk.violenceAgainstWomenOrChildren || risk.involvesChild) {
    add(
      bn
        ? "নারী ও শিশু নির্যাতন প্রতিরোধে জাতীয় হেল্পলাইন (মহিলা ও শিশু বিষয়ক মন্ত্রণালয়): ১০৯ — টোল-ফ্রি"
        : "National Helpline for Violence Against Women and Children (Ministry of Women and Children Affairs): 109 — toll-free",
    );
  }

  if (risk.involvesChild || (heavy && risk.violenceAgainstWomenOrChildren)) {
    add(bn ? "চাইল্ড হেল্পলাইন: ১০৯৮ — বিনামূল্যে, ২৪ ঘণ্টা" : "Child Helpline: 1098 — free, 24 hours");
  }

  if (risk.needsFreeLegalAid || risk.sexualExploitation || risk.violenceAgainstWomenOrChildren) {
    add(
      bn
        ? "জাতীয় আইনগত সহায়তা হেল্পলাইন (বিনামূল্যে সরকারি আইনি সহায়তা): ১৬৪৩০"
        : "National Legal Aid helpline (free government legal aid): 16430",
    );
  }

  if (heavy || risk.immediateDanger || risk.sexualExploitation || risk.violenceAgainstWomenOrChildren) {
    add(bn ? "তাৎক্ষণিক বিপদে: ৯৯৯ (জাতীয় জরুরি সেবা, বিনামূল্যে)" : "If you are in immediate danger: 999 (National Emergency Service, free)");
  }

  return lines;
}

/**
 * The support section appended to an answer by the server (not written by the
 * model), so the numbers are always exactly the verified ones.
 */
export function supportSection(risk: RiskFlags, lines: string[], bn: boolean): string {
  if (lines.length === 0) return "";
  const heavy = risk.selfHarm || risk.emotionalDistress;

  const heading = heavy
    ? bn
      ? "### 💙 আপনি একা নন"
      : "### 💙 You don't have to go through this alone"
    : bn
      ? "### ☎️ যেখানে সাহায্য পাবেন"
      : "### ☎️ Where to get help";

  const lovedOnes = heavy
    ? bn
      ? "আপনার বিশ্বাসের কোনো মানুষ — পরিবারের কেউ বা কাছের বন্ধুর সঙ্গে কথা বলুন। মন খুলে কথা বললে অনেক সময় ভার কিছুটা হালকা হয়।"
      : "Please consider talking to someone you trust — a family member or a close friend. Sharing what you're going through can make it lighter."
    : "";

  return [heading, lovedOnes, lines.map((line) => `- ${line}`).join("\n")].filter(Boolean).join("\n\n");
}
