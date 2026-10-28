/* =========================================================
   OFFICIAL SOURCE LINKS — Laws of Bangladesh (bdlaws.minlaw.gov.bd)

   The corpus `act_file` value ("11.json") is the bdlaws act ID:
     11.json  -> https://bdlaws.minlaw.gov.bd/act-11.html  (The Penal Code, 1860)
     26.json  -> https://bdlaws.minlaw.gov.bd/act-26.html  (The Contract Act, 1872)
     748.json -> https://bdlaws.minlaw.gov.bd/act-748.html (বাড়ী ভাড়া নিয়ন্ত্রণ আইন, ১৯৯১)

   Section pages use site-wide IDs that are NOT the section number
   (Penal Code s.1 = section-1944, s.4 = section-19904). So the only
   reliable way to link a specific section is to read the act's own
   contents page, where every section is listed as
     <a href=".../act-11/section-1944.html">1. Title ...</a>
   and map "section number -> section page".

   Rules:
   - Never construct a section URL from a guess. A section link is
     returned only when the act's contents page lists that number.
   - If the section can't be matched (site unreachable, unusual
     numbering), return the act page — still the correct law.
   - Results are cached in memory and on disk (cache/bdlaws-sections.json)
     so each act page is fetched at most once.
========================================================= */

import fs from "node:fs";
import path from "node:path";
import { detectRepealBanner, type RepealBanner } from "./legalCorpus";

export const BDLAWS_ORIGIN = "https://bdlaws.minlaw.gov.bd";

/*
 * Where act pages are fetched from. Always the official site in normal use;
 * the override exists only so automated tests can serve saved pages locally.
 * Links returned to users always use BDLAWS_ORIGIN.
 */
const FETCH_ORIGIN = (process.env.BDLAWS_FETCH_ORIGIN || BDLAWS_ORIGIN).replace(/\/+$/, "");

const CACHE_DIR = process.env.BDLAWS_CACHE_DIR || path.resolve(__dirname, "..", "cache");
const CACHE_FILE = path.join(CACHE_DIR, "bdlaws-sections.json");
const FETCH_TIMEOUT_MS = Number(process.env.BDLAWS_TIMEOUT_MS || 6000);
const RETRY_FAILED_AFTER_MS = 6 * 60 * 60 * 1000;
/** Act pages are re-read after this long so a repeal published on bdlaws is noticed. */
const REFRESH_AFTER_MS = Number(process.env.BDLAWS_STATUS_TTL_HOURS || 24) * 60 * 60 * 1000;

export type SectionEntry = {
  /** Normalized section label, e.g. "19", "4A", "৪ক" -> "4ক" */
  number: string;
  /** Site-wide section page ID used in the URL */
  sectionId: string;
  /** Link text as shown on bdlaws, e.g. "19. Title" */
  label: string;
};

/** Repeal status as printed on the live bdlaws act page. */
export type LiveActStatus = RepealBanner & {
  /** bdlaws act ID of the repealing law, when the page links to it. */
  replacementActId?: string;
};

export type ActIndex = {
  actId: string;
  fetchedAt: number;
  ok: boolean;
  title?: string;
  sections: SectionEntry[];
  /** Present only when the live page was fetched and read successfully. */
  status?: LiveActStatus;
};

export type OfficialSource = {
  sourceName: string;
  sourceUrl: string;
  /** "section" when the URL opens the exact section, "act" when it opens the act page */
  sourceKind: "section" | "act";
};

/* ---------------------------------------------------------
   Small helpers
--------------------------------------------------------- */

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";

export function toAsciiDigits(value: string): string {
  return value.replace(/[০-৯]/g, (digit) => String(BANGLA_DIGITS.indexOf(digit)));
}

/** "11.json" | "11" | "act-11" -> "11"; anything else -> null */
export function actIdFromFile(actFile: string | null | undefined): string | null {
  if (!actFile) return null;
  const match = String(actFile).trim().match(/^(?:act-)?(\d{1,5})(?:\.json)?$/i);
  return match ? match[1] : null;
}

export function actPageUrl(actId: string): string {
  return `${BDLAWS_ORIGIN}/act-${actId}.html`;
}

export function sectionPageUrl(actId: string, sectionId: string): string {
  return `${BDLAWS_ORIGIN}/act-${actId}/section-${sectionId}.html`;
}

/** Normalize a section label to a lookup key: ASCII digits, upper-case Latin suffix. */
export function normalizeSectionKey(value: string | null | undefined): string | null {
  if (value == null) return null;
  const cleaned = toAsciiDigits(String(value))
    .trim()
    .replace(/^(?:section|sec\.?|s\.|ধারা)\s*/i, "")
    .replace(/\s+/g, "");
  const match = cleaned.match(/^(\d{1,4})([A-Za-z]{1,3}|[ক-হ]{1,2})?/);
  if (!match) return null;
  return `${Number(match[1])}${(match[2] || "").toUpperCase()}`;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

export function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Readable page text: page chrome removed, block elements on their own lines. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|head|header|nav|footer|form|select)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?(?:p|div|tr|li|ul|ol|table|tbody|h[1-6]|section|article|blockquote)\b[^>]*>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/[ \t\u00A0]+/g, " ")
    .replace(/ *\n[ \n]*/g, "\n")
    .trim();
}

function titleWords(value: string): string[] {
  return toAsciiDigits(value.normalize("NFC").replace(/\u09AF\u09BC/g, "\u09DF"))
    .toLowerCase()
    .replace(/[(),.;:।৷'"“”‘’\-–]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 2);
}

/**
 * Read the repeal notice on a live act page, e.g.
 *   "এই অধ্যাদেশ সাইবার সুরক্ষা আইন, ২০২৬ (২০২৬ সনের ৮১ নং আইন) দ্বারা রহিত করা হইয়াছে।"
 * and, when the page links to the repealing law, its act ID.
 */
export function parseLiveStatus(html: string, actId: string): LiveActStatus {
  const banner = detectRepealBanner(htmlToText(html));
  if (!banner.repealed) return banner;

  let replacementActId: string | undefined;
  const wanted = titleWords(banner.repealedBy || "");
  const anchor = /<a\b[^>]*?href\s*=\s*["']([^"']*?)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  let best = 0;

  while ((match = anchor.exec(html)) !== null) {
    const id = match[1].match(/act-(?:details-|print-)?(\d{1,5})(?:\.html|\/)/i)?.[1];
    if (!id || id === actId) continue;
    const words = titleWords(stripTags(match[2]));
    if (words.length === 0 || wanted.length === 0) continue;
    const overlap = words.filter((word) => wanted.includes(word)).length / words.length;
    if (overlap > best && overlap >= 0.75) {
      best = overlap;
      replacementActId = id;
    }
  }

  return { ...banner, replacementActId };
}

/* ---------------------------------------------------------
   Parsing an act's contents page
--------------------------------------------------------- */

/**
 * Extract every section link of `actId` from the act page HTML.
 * Link text starts with the section number followed by a delimiter:
 * "1. Title", "4.Extension…", "১৯। শিরোনাম", "১৯৷ শিরোনাম", "4A. …", "৪ক। …".
 */
export function parseActSections(html: string, actId: string): { title?: string; sections: SectionEntry[] } {
  const sections: SectionEntry[] = [];
  const seen = new Set<string>();

  const anchor = /<a\b[^>]*?href\s*=\s*["']([^"']*?)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const hrefPattern = new RegExp(`act-(?:print-)?${actId}/section-(?:print-)?(\\d+)\\.html`, "i");
  const leading = /^\s*(?:section\s+|ধারা\s+)?([0-9০-৯]{1,4})\s*([A-Za-z]{1,3}|[ক-হ]{1,2})?\s*[.।৷:)\-–]/i;

  let match: RegExpExecArray | null;
  while ((match = anchor.exec(html)) !== null) {
    const href = match[1];
    const hrefMatch = href.match(hrefPattern);
    if (!hrefMatch) continue;

    const label = stripTags(match[2]);
    const numberMatch = label.match(leading);
    if (!numberMatch) continue;

    const key = normalizeSectionKey(`${numberMatch[1]}${numberMatch[2] || ""}`);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    sections.push({ number: key, sectionId: hrefMatch[1], label });
  }

  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]) : undefined;

  return { title, sections };
}

/* ---------------------------------------------------------
   Cache
--------------------------------------------------------- */

const memory = new Map<string, ActIndex>();
const inFlight = new Map<string, Promise<ActIndex>>();
let diskLoaded = false;

/*
 * Verified seeds from the existing code: Premises Rent Control Act 1991
 * s.13 = 30643 (bdlaws page titled "ভাড়া আদায়ের রশিদ প্রদান") and s.19 = 30649.
 * Used only when the act page itself can't be fetched.
 */
const SEED_SECTIONS: Record<string, SectionEntry[]> = {
  "748": [
    { number: "13", sectionId: "30643", label: "১৩। ভাড়া আদায়ের রশিদ প্রদান" },
    { number: "19", sectionId: "30649", label: "১৯।" },
  ],
};

function loadDisk() {
  if (diskLoaded) return;
  diskLoaded = true;
  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf8");
    const data = JSON.parse(raw) as Record<string, ActIndex>;
    for (const [actId, index] of Object.entries(data)) {
      if (index && Array.isArray(index.sections)) memory.set(actId, index);
    }
    console.log(`bdlaws: loaded ${memory.size} cached act indexes`);
  } catch {
    // No cache yet — it is created on first successful lookup.
  }
}

let saveTimer: NodeJS.Timeout | null = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      const data = Object.fromEntries(memory.entries());
      fs.writeFileSync(CACHE_FILE, JSON.stringify(data));
    } catch (error) {
      console.error("bdlaws: could not save cache:", (error as Error).message);
    }
  }, 500);
}

/** Fetch one bdlaws page, e.g. "act-11.html". Throws on failure. */
export async function fetchBdlawsPage(pagePath: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // bdlaws sometimes redirects https -> http; fetch follows redirects.
    const response = await fetch(`${FETCH_ORIGIN}/${pagePath.replace(/^\/+/, "")}`, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "AinBodh/1.0 (+legal-information assistant; citation linking)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function fetchActPage(actId: string): Promise<string> {
  return fetchBdlawsPage(`act-${actId}.html`);
}

/** Section index for one act. Never throws. */
export async function getActIndex(actId: string): Promise<ActIndex> {
  loadDisk();

  const cached = memory.get(actId);
  const age = cached ? Date.now() - cached.fetchedAt : Infinity;
  if (cached && (cached.ok ? age < REFRESH_AFTER_MS : age < RETRY_FAILED_AFTER_MS)) {
    return cached;
  }

  const pending = inFlight.get(actId);
  if (pending) return pending;

  const task = (async (): Promise<ActIndex> => {
    try {
      const html = await fetchActPage(actId);
      const parsed = parseActSections(html, actId);
      const index: ActIndex = {
        actId,
        fetchedAt: Date.now(),
        ok: parsed.sections.length > 0,
        title: parsed.title,
        sections: parsed.sections,
        status: parseLiveStatus(html, actId),
      };

      if (!index.ok) {
        console.warn(`bdlaws: act-${actId} page fetched but no section links were recognised`);
      }

      memory.set(actId, index);
      scheduleSave();
      return index;
    } catch (error) {
      console.warn(`bdlaws: could not fetch act-${actId}:`, (error as Error).message);
      // Keep an older good copy (stale links/status beat none); retry later.
      if (cached?.ok) {
        const stale = { ...cached, fetchedAt: Date.now() - REFRESH_AFTER_MS + RETRY_FAILED_AFTER_MS };
        memory.set(actId, stale);
        return stale;
      }
      const index: ActIndex = { actId, fetchedAt: Date.now(), ok: false, sections: [] };
      memory.set(actId, index);
      return index;
    } finally {
      inFlight.delete(actId);
    }
  })();

  inFlight.set(actId, task);
  return task;
}

/* ---------------------------------------------------------
   Public API
--------------------------------------------------------- */

/**
 * Resolve the official bdlaws link for an act (and section, when it can be matched).
 * Returns null only when the act file is not a bdlaws act ID.
 */
export async function resolveOfficialSource(
  actFile: string,
  sectionNumber: string | null | undefined,
  actTitle: string,
): Promise<OfficialSource | null> {
  const actId = actIdFromFile(actFile);
  if (!actId) return null;

  const key = normalizeSectionKey(sectionNumber);
  const isBangla = /[ঀ-৿]/.test(actTitle);
  const sectionLabel = key ? (isBangla ? `ধারা ${key.replace(/\d/g, (d) => BANGLA_DIGITS[Number(d)])}` : `Section ${key}`) : "";

  if (key) {
    const index = await getActIndex(actId);
    const entries = index.sections.length ? index.sections : SEED_SECTIONS[actId] || [];
    const entry = entries.find((item) => item.number === key);

    if (entry) {
      return {
        sourceName: `Laws of Bangladesh — ${actTitle}, ${sectionLabel}`,
        sourceUrl: sectionPageUrl(actId, entry.sectionId),
        sourceKind: "section",
      };
    }
  }

  return {
    sourceName: `Laws of Bangladesh — ${actTitle}`,
    sourceUrl: actPageUrl(actId),
    sourceKind: "act",
  };
}

/** Attach official links to evidence items in place-safe fashion (returns new objects). */
export async function attachOfficialSources<
  T extends { actFile: string; sectionNumber: string | null; title: string; sourceName?: string; sourceUrl?: string },
>(items: T[]): Promise<Array<T & { sourceKind?: "section" | "act" }>> {
  return Promise.all(
    items.map(async (item) => {
      const source = await resolveOfficialSource(item.actFile, item.sectionNumber, item.title);
      if (!source) return item;
      return { ...item, ...source };
    }),
  );
}
