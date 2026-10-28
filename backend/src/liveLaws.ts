/* =========================================================
   LIVE LAW STATUS — keeping answers on the law in force today

   The corpus (data/rag_passages.jsonl) is a snapshot. Laws keep being
   repealed and replaced after it was taken, e.g.
     সাইবার সুরক্ষা অধ্যাদেশ, ২০২৫ (act 1538, in the snapshot)
       -> repealed by সাইবার সুরক্ষা আইন, ২০২৬ (act 1710, not in the snapshot)

   So before an answer is written, every act about to be cited is checked
   against its live bdlaws page (the same page already read for section
   links, refreshed daily). If the page says the act was repealed:
     1. the act is marked repealed and dropped from the evidence;
     2. the repealing act's text is fetched from bdlaws and added to the
        searchable corpus (one passage per section);
     3. retrieval runs again, so the answer cites the current law.
   If the new law's text can't be loaded, the answer says the old law was
   repealed and by what, and links the new law — it never cites the old one.

   Persistence:
     data/live-updates.json   written by `npx tsx src/syncBdlaws.ts`
     cache/live-laws.json     written at runtime as acts are discovered
   Both are loaded at startup.
========================================================= */

import fs from "node:fs";
import path from "node:path";
import {
  actIdFromFile,
  actPageUrl,
  fetchBdlawsPage,
  getActIndex,
  htmlToText,
  parseActSections,
  stripTags,
  type SectionEntry,
} from "./bdlaws";
import {
  addLiveAct,
  applyLiveStatus,
  detectRepealBanner,
  findActByTitle,
  getLawStatus,
  hasActText,
  loadLegalCorpus,
  splitSections,
  type RepealBanner,
} from "./legalCorpus";

const CACHE_DIR = process.env.BDLAWS_CACHE_DIR || path.resolve(__dirname, "..", "cache");
const RUNTIME_FILE = path.join(CACHE_DIR, "live-laws.json");
export const SYNC_FILE = process.env.LIVE_UPDATES_PATH || path.resolve(__dirname, "..", "data", "live-updates.json");
const LIVE_CHECK_BUDGET_MS = Number(process.env.BDLAWS_LIVE_BUDGET_MS || 12000);
const LIVE_CHECKS_ENABLED = process.env.BDLAWS_LIVE_CHECK !== "false";

export type LiveAct = {
  actFile: string;
  title: string;
  fetchedAt: number;
  repeal: RepealBanner;
  sections: Array<{ sectionNumber: string | null; text: string }>;
};

export type LiveStatusRecord = {
  repealed: boolean;
  repealedBy?: string;
  replacementActFile?: string;
  title?: string;
  checkedAt: number;
};

export type LiveUpdates = {
  generatedAt?: string;
  statuses: Record<string, LiveStatusRecord>;
  acts: Record<string, LiveAct>;
};

/** A law that was found repealed but whose replacement text couldn't be loaded. */
export type LawNote = {
  actFile: string;
  title: string;
  repealedBy?: string;
  replacementUrl?: string;
};

/* ---------------------------------------------------------
   Persistence
--------------------------------------------------------- */

const runtime: LiveUpdates = { statuses: {}, acts: {} };
let initialised: Promise<void> | null = null;

function readUpdates(file: string): LiveUpdates | null {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as LiveUpdates;
    return { generatedAt: data.generatedAt, statuses: data.statuses || {}, acts: data.acts || {} };
  } catch {
    return null;
  }
}

function applyUpdates(updates: LiveUpdates) {
  for (const act of Object.values(updates.acts)) {
    if (act?.sections?.length) addLiveAct(act.actFile, act.title, act.sections, act.repeal);
  }
  for (const [actFile, record] of Object.entries(updates.statuses)) {
    applyLiveStatus(actFile, record);
  }
}

let saveTimer: NodeJS.Timeout | null = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(RUNTIME_FILE, JSON.stringify(runtime));
    } catch (error) {
      console.error("live laws: could not save cache:", (error as Error).message);
    }
  }, 500);
}

/** Load the corpus, then synced and runtime-discovered updates. Safe to call repeatedly. */
export function initLiveLaws(): Promise<void> {
  if (initialised) return initialised;
  initialised = (async () => {
    await loadLegalCorpus();

    const synced = readUpdates(SYNC_FILE);
    if (synced) {
      applyUpdates(synced);
      console.log(
        `Live law updates: ${Object.keys(synced.acts).length} newer acts, ${
          Object.values(synced.statuses).filter((item) => item.repealed).length
        } repeals (synced ${synced.generatedAt ?? "unknown"})`,
      );
    }

    const saved = readUpdates(RUNTIME_FILE);
    if (saved) {
      Object.assign(runtime.statuses, saved.statuses);
      Object.assign(runtime.acts, saved.acts);
      applyUpdates(saved);
    }
  })();
  return initialised;
}

/* ---------------------------------------------------------
   Fetching an act's full text from bdlaws
--------------------------------------------------------- */

function cleanTitle(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const title = stripTags(value)
    .replace(/\s*[-|–]\s*Laws of Bangladesh\s*$/i, "")
    .replace(/^\s*Laws of Bangladesh\s*[-|–]?\s*/i, "")
    .trim();
  if (!title || /^laws of bangladesh$/i.test(title)) return undefined;
  // "২০২৬ সনের ৮১ নং আইন" alone is the act number, not a title.
  if (/^[০-৯0-9]{4}\s*(?:সনের|সালের)\s*[০-৯0-9]+\s*নং/.test(title)) return undefined;
  return title;
}

/** Keep the fullest text per section number; sections must be in a sensible order. */
function collectSections(text: string): Array<{ sectionNumber: string | null; text: string }> {
  const byNumber = new Map<string, string>();
  const order: string[] = [];
  let lead: string | null = null;

  for (const section of splitSections(text)) {
    if (!section.sectionNumber) {
      if (!lead) lead = section.text;
      continue;
    }
    const previous = byNumber.get(section.sectionNumber);
    if (!previous) order.push(section.sectionNumber);
    if (!previous || section.text.length > previous.length) byNumber.set(section.sectionNumber, section.text);
  }

  const sections = order.map((number) => ({ sectionNumber: number, text: byNumber.get(number)! }));
  return lead ? [{ sectionNumber: null, text: lead.slice(0, 3000) }, ...sections] : sections;
}

function looksLikeActText(sections: Array<{ sectionNumber: string | null }>): boolean {
  const numbers = sections.map((section) => Number(section.sectionNumber)).filter((n) => Number.isInteger(n) && n > 0);
  return numbers.length >= 3 && numbers.includes(1) && numbers.includes(2);
}

async function sectionsFromSectionPages(actId: string, entries: SectionEntry[]) {
  const out: Array<{ sectionNumber: string | null; text: string }> = [];
  const queue = entries.slice(0, 200);
  const workers = Array.from({ length: 5 }, async () => {
    while (queue.length) {
      const entry = queue.shift()!;
      try {
        const html = await fetchBdlawsPage(`act-${actId}/section-${entry.sectionId}.html`);
        const text = htmlToText(html).replace(/\n/g, " ");
        const heading = entry.label.replace(/\s+/g, " ").trim();
        const start = heading ? text.indexOf(heading.slice(0, Math.min(heading.length, 40))) : -1;
        const body = (start >= 0 ? text.slice(start) : text)
          .replace(/\s*(?:Copyright|©|Disclaimer|Legislative and Parliamentary Affairs Division)[\s\S]*$/i, "")
          .slice(0, 6500)
          .trim();
        if (body.length > 20) out.push({ sectionNumber: entry.number, text: body });
      } catch {
        // Skip a section that can't be read; the rest are still useful.
      }
    }
  });
  await Promise.all(workers);
  return out.sort((a, b) => parseInt(a.sectionNumber || "0", 10) - parseInt(b.sectionNumber || "0", 10));
}

/**
 * Fetch an act's title, repeal status and section texts from bdlaws.
 * Tries the print page (whole act on one page), then the details page,
 * then individual section pages. Returns null if the act can't be read.
 */
export async function fetchLiveAct(actId: string): Promise<LiveAct | null> {
  const actFile = `${actId}.json`;
  const index = await getActIndex(actId);
  const repeal: RepealBanner = index.status
    ? { repealed: index.status.repealed, repealedBy: index.status.repealedBy }
    : { repealed: false };

  for (const page of [`act-print-${actId}.html`, `act-details-${actId}.html`]) {
    try {
      const html = await fetchBdlawsPage(page, 15000);
      const text = htmlToText(html);
      const sections = collectSections(text.replace(/\n/g, " "));
      if (!looksLikeActText(sections)) continue;

      const titleFromPage = cleanTitle(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]);
      const title = cleanTitle(index.title) || titleFromPage || parseActSections(html, actId).title || `act-${actId}`;
      const pageRepeal = repeal.repealed ? repeal : detectRepealBanner(text);
      return { actFile, title, fetchedAt: Date.now(), repeal: pageRepeal, sections };
    } catch {
      // Try the next page type.
    }
  }

  if (index.sections.length > 0) {
    const sections = await sectionsFromSectionPages(actId, index.sections);
    if (sections.length > 0) {
      return { actFile, title: cleanTitle(index.title) || `act-${actId}`, fetchedAt: Date.now(), repeal, sections };
    }
  }

  return null;
}

/** Make sure an act's text is searchable; fetches it from bdlaws if needed. */
async function ensureActLoaded(actId: string): Promise<boolean> {
  const actFile = `${actId}.json`;
  if (hasActText(actFile)) return true;

  const act = await fetchLiveAct(actId);
  if (!act) return false;

  addLiveAct(act.actFile, act.title, act.sections, act.repeal);
  runtime.acts[act.actFile] = act;
  scheduleSave();
  console.log(`live laws: loaded ${act.title} (act-${actId}, ${act.sections.length} sections) from bdlaws`);
  return true;
}

/* ---------------------------------------------------------
   Checking acts before they are cited
--------------------------------------------------------- */

function withBudget<T>(task: Promise<T>, fallback: T, ms: number): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export type LiveCheckResult = {
  /** True when at least one act turned out to be repealed (status changed). */
  changed: boolean;
  /** Current replacements now in the corpus, to be preferred in retrieval. */
  replacements: Set<string>;
  /** Repealed laws whose replacement text could not be loaded. */
  notes: LawNote[];
};

async function checkOne(actFile: string, result: LiveCheckResult, depth = 0): Promise<void> {
  const actId = actIdFromFile(actFile);
  if (!actId || depth > 3) return;

  const index = await getActIndex(actId);
  const live = index.status;
  if (!live?.repealed) return;

  const replacementId = live.replacementActId || actIdFromFile(findActByTitle(live.repealedBy));
  const replacementActFile = replacementId ? `${replacementId}.json` : undefined;

  const record: LiveStatusRecord = {
    repealed: true,
    repealedBy: live.repealedBy,
    replacementActFile,
    title: getLawStatus(actFile)?.title || index.title,
    checkedAt: Date.now(),
  };

  const before = getLawStatus(actFile);
  const loaded = replacementId ? await ensureActLoaded(replacementId) : false;
  if (applyLiveStatus(actFile, record) || !before?.repealed) result.changed = true;
  runtime.statuses[actFile] = record;
  scheduleSave();

  if (loaded && replacementActFile) {
    // The replacement may itself have been replaced since.
    await checkOne(replacementActFile, result, depth + 1);
    if (!getLawStatus(replacementActFile)?.repealed) result.replacements.add(replacementActFile);
    return;
  }

  result.notes.push({
    actFile,
    title: record.title || actFile,
    repealedBy: live.repealedBy,
    replacementUrl: replacementId ? actPageUrl(replacementId) : undefined,
  });
}

/**
 * Check the live bdlaws status of the given acts (within a time budget).
 * If bdlaws can't be reached, nothing changes and the snapshot status is used.
 */
export async function checkActsLive(actFiles: Iterable<string>): Promise<LiveCheckResult> {
  const result: LiveCheckResult = { changed: false, replacements: new Set(), notes: [] };
  if (!LIVE_CHECKS_ENABLED) return result;

  await initLiveLaws();
  const unique = Array.from(new Set(actFiles)).filter((actFile) => actIdFromFile(actFile));
  if (unique.length === 0) return result;

  await withBudget(
    Promise.all(unique.map((actFile) => checkOne(actFile, result).catch(() => undefined))),
    undefined,
    LIVE_CHECK_BUDGET_MS,
  );
  return result;
}

/** Plain-language status lines for the answer prompt. */
export function lawNotesText(notes: LawNote[]): string[] {
  return notes.map(
    (note) =>
      `${note.title} has been repealed${note.repealedBy ? ` by ${note.repealedBy}` : ""} and is no longer in force.` +
      (note.replacementUrl ? ` The current law is on Laws of Bangladesh: ${note.replacementUrl}` : ""),
  );
}

