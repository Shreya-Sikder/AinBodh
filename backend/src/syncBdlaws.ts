/* =========================================================
   SYNC WITH bdlaws — bring the law snapshot up to date

     cd backend
     npx tsx src/syncBdlaws.ts            # status of every act + newer acts
     npx tsx src/syncBdlaws.ts --new-only # only look for acts newer than the snapshot
     options: --from <actId>  --max-gap <n>  (default 80 missing IDs in a row ends the scan)

   1. Re-reads every act page in the corpus and records repeals printed on
      bdlaws since the snapshot was taken (e.g. সাইবার সুরক্ষা অধ্যাদেশ, ২০২৫ ->
      সাইবার সুরক্ষা আইন, ২০২৬).
   2. Looks for acts published after the snapshot (act IDs above the highest
      one in the corpus) and downloads their text.
   3. Downloads every replacement law that isn't in the corpus.

   Output: data/live-updates.json, loaded by the server at startup.
   Takes 15–40 minutes for the full run (polite: 3 requests at a time).
   Run it monthly, or whenever bdlaws publishes new laws.

   The new acts are searched locally by the server. They are NOT in
   Supabase; re-ingest the corpus if you want them in semantic search too.
========================================================= */

import fs from "node:fs";
import { actIdFromFile, getActIndex } from "./bdlaws";
import { allLawStatuses, findActByTitle, loadLegalCorpus } from "./legalCorpus";
import { fetchLiveAct, SYNC_FILE, type LiveUpdates } from "./liveLaws";

const CONCURRENCY = 3;
const argValue = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? Number(process.argv[index + 1]) : undefined;
};
/** bdlaws act IDs have gaps; stop after this many IDs in a row that don't exist. */
const MISSES_BEFORE_STOP = argValue("--max-gap") ?? 80;
const START_FROM = argValue("--from");
const newOnly = process.argv.includes("--new-only");

async function runPool<T>(items: T[], worker: (item: T, index: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        const index = next++;
        await worker(items[index], index);
      }
    }),
  );
}

function save(updates: LiveUpdates) {
  updates.generatedAt = new Date().toISOString();
  fs.writeFileSync(SYNC_FILE, JSON.stringify(updates, null, 1));
}

async function main() {
  await loadLegalCorpus();

  let updates: LiveUpdates = { statuses: {}, acts: {} };
  try {
    updates = { statuses: {}, acts: {}, ...JSON.parse(fs.readFileSync(SYNC_FILE, "utf8")) };
  } catch {
    // First run.
  }

  const known = allLawStatuses();
  const ids = known.map((item) => Number(actIdFromFile(item.actFile))).filter(Number.isFinite);
  const maxKnown = Math.max(...ids, ...Object.keys(updates.acts).map((file) => Number(actIdFromFile(file)) || 0));
  const replacementsNeeded = new Set<string>();

  /* 1. Status of every act already known. */
  if (!newOnly) {
    let done = 0;
    let repealed = 0;
    await runPool(known, async (item) => {
      const actId = actIdFromFile(item.actFile);
      if (!actId) return;
      const index = await getActIndex(actId);
      done++;
      if (index.status?.repealed) {
        repealed++;
        const replacementId = index.status.replacementActId || actIdFromFile(findActByTitle(index.status.repealedBy));
        updates.statuses[item.actFile] = {
          repealed: true,
          repealedBy: index.status.repealedBy,
          replacementActFile: replacementId ? `${replacementId}.json` : undefined,
          title: item.title,
          checkedAt: Date.now(),
        };
        if (replacementId) replacementsNeeded.add(replacementId);
      }
      if (done % 100 === 0) {
        console.log(`status: ${done}/${known.length} checked, ${repealed} repealed`);
        save(updates);
      }
    });
    console.log(`status: ${done}/${known.length} checked, ${repealed} repealed`);
    save(updates);
  }

  /* 2. Acts newer than the snapshot. */
  let misses = 0;
  for (let id = START_FROM ?? maxKnown + 1; misses < MISSES_BEFORE_STOP; id++) {
    const act = await fetchLiveAct(String(id));
    if (!act) {
      misses++;
      continue;
    }
    misses = 0;
    updates.acts[act.actFile] = act;
    if (act.repeal.repealed) {
      updates.statuses[act.actFile] = {
        repealed: true,
        repealedBy: act.repeal.repealedBy,
        title: act.title,
        checkedAt: Date.now(),
      };
    }
    console.log(`new: act-${id} ${act.title} (${act.sections.length} sections)${act.repeal.repealed ? " [repealed]" : ""}`);
    save(updates);
  }

  /* 3. Replacement laws missing from the corpus. */
  const knownFiles = new Set(known.map((item) => item.actFile));
  for (const id of replacementsNeeded) {
    const actFile = `${id}.json`;
    if (knownFiles.has(actFile) || updates.acts[actFile]) continue;
    const act = await fetchLiveAct(id);
    if (act) {
      updates.acts[actFile] = act;
      console.log(`replacement: act-${id} ${act.title}`);
    } else {
      console.warn(`replacement: act-${id} could not be read`);
    }
  }

  // Link repeals to replacements that were only found in this run.
  for (const [actFile, record] of Object.entries(updates.statuses)) {
    if (record.replacementActFile || !record.repealedBy) continue;
    const match = Object.values(updates.acts).find((act) => act.title.replace(/\s+/g, " ") === record.repealedBy);
    if (match) updates.statuses[actFile] = { ...record, replacementActFile: match.actFile };
  }

  save(updates);
  console.log(
    `Done: ${Object.keys(updates.acts).length} newer/replacement acts, ${
      Object.values(updates.statuses).filter((item) => item.repealed).length
    } repeals -> ${SYNC_FILE}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
