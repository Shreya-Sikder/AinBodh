/*
 * Regenerate data/law-status.json from the corpus (run after re-ingesting laws):
 *   npx tsx src/buildLawStatus.ts
 * The server uses this file when the full corpus isn't deployed with it.
 */
import fs from "node:fs";
import path from "node:path";
import { allLawStatuses, loadLegalCorpus } from "./legalCorpus";

(async () => {
  await loadLegalCorpus();
  const statuses = allLawStatuses().sort((a, b) => Number.parseInt(a.actFile) - Number.parseInt(b.actFile));
  const out = path.resolve(__dirname, "..", "data", "law-status.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(statuses, null, 1));
  console.log(`Wrote ${statuses.length} acts (${statuses.filter((s) => s.repealed).length} repealed) to ${out}`);
})();
