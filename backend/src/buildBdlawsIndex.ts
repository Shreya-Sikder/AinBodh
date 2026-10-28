/*
 * Optional: pre-download the section index of every act in data/metadata.csv
 * into cache/bdlaws-sections.json, so section links work without fetching
 * bdlaws at question time (e.g. on an exhibition machine).
 *
 * Run from backend/:  npx tsx src/buildBdlawsIndex.ts
 * Re-running skips acts that are already cached.
 */
import fs from "node:fs";
import path from "node:path";
import { actIdFromFile, getActIndex } from "./bdlaws";

const METADATA = path.resolve(__dirname, "..", "..", "data", "metadata.csv");
const CONCURRENCY = 3;
const PAUSE_MS = 300;

async function main() {
  const ids = fs
    .readFileSync(METADATA, "utf8")
    .split(/\r?\n/)
    .slice(1)
    .map((line) => actIdFromFile(line.split(",")[0]))
    .filter((id): id is string => Boolean(id));

  console.log(`Indexing ${ids.length} acts from bdlaws.minlaw.gov.bd …`);

  let done = 0;
  let withSections = 0;
  const queue = [...ids];

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const id = queue.shift()!;
        const index = await getActIndex(id);
        done += 1;
        if (index.ok) withSections += 1;
        if (done % 50 === 0) console.log(`${done}/${ids.length} (${withSections} with section links)`);
        await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
      }
    }),
  );

  // Give the cache writer time to flush.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log(`Done: ${withSections}/${ids.length} acts have section-level links.`);
}

void main();
