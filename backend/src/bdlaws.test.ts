/*
 * Run: npx tsx src/bdlaws.test.ts
 * Offline tests for bdlaws link resolution. Fixtures mirror the structure
 * of real act pages (contents list of <a href=".../act-N/section-ID.html">N. Title</a>).
 */
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const PENAL_CODE_FIXTURE = `
<html><head><title>The Penal Code, 1860</title></head><body>
<div class="col-md-12"><a href="http://bdlaws.minlaw.gov.bd/act-11/section-1943.html">Preamble</a></div>
<div class="col-md-12"><a href="http://bdlaws.minlaw.gov.bd/act-11/section-1944.html">1. Title and extent of operation of the Code</a></div>
<div class="col-md-12"><a href="http://bdlaws.minlaw.gov.bd/act-11/section-1945.html"><span>2.</span> Punishment of offences committed within Bangladesh</a></div>
<div class="col-md-12"><a href="/act-11/section-19904.html">4.Extension of Code to extra-territorial offences</a></div>
<div class="col-md-12"><a href='https://bdlaws.minlaw.gov.bd/act-11/section-2005.html'>10. &quot;Man&quot; &quot;Woman&quot;</a></div>
<div class="col-md-12"><a href="http://bdlaws.minlaw.gov.bd/act-11/section-3170.html">304B. Dowry death</a></div>
<a href="http://bdlaws.minlaw.gov.bd/act-12/section-9999.html">5. Another act's section must be ignored</a>
</body></html>`;

const RENT_ACT_FIXTURE = `
<html><head><title>বাড়ী ভাড়া নিয়ন্ত্রণ আইন, ১৯৯১</title></head><body>
<a href="http://bdlaws.minlaw.gov.bd/act-748/section-30631.html">১। সংক্ষিপ্ত শিরোনাম</a>
<a href="http://bdlaws.minlaw.gov.bd/act-748/section-30643.html">১৩৷ ভাড়া আদায়ের রশিদ প্রদান</a>
<a href="http://bdlaws.minlaw.gov.bd/act-748/section-30649.html">১৯। ভাড়া গ্রহণে অস্বীকৃতির ক্ষেত্রে ভাড়া জমা</a>
<a href="http://bdlaws.minlaw.gov.bd/act-748/section-30650.html">১৯ক। উদাহরণ উপ-ধারা</a>
</body></html>`;

async function main() {
  // Isolated cache and a local stand-in for the bdlaws site.
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "bdlaws-test-"));
  let requests = 0;
  const server = http.createServer((req, res) => {
    requests += 1;
    if (req.url === "/act-11.html") return res.end(PENAL_CODE_FIXTURE);
    if (req.url === "/act-748.html") return res.end(RENT_ACT_FIXTURE);
    res.statusCode = 404;
    res.end("not found");
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;

  process.env.BDLAWS_FETCH_ORIGIN = `http://127.0.0.1:${port}`;
  process.env.BDLAWS_CACHE_DIR = cacheDir;

  const bdlaws = await import("./bdlaws");

  // --- act ID mapping
  assert.equal(bdlaws.actIdFromFile("11.json"), "11");
  assert.equal(bdlaws.actIdFromFile("748"), "748");
  assert.equal(bdlaws.actIdFromFile("some-act-name"), null);

  // --- section keys
  assert.equal(bdlaws.normalizeSectionKey("১৯"), "19");
  assert.equal(bdlaws.normalizeSectionKey("Section 304b"), "304B");
  assert.equal(bdlaws.normalizeSectionKey("ধারা ১৯ক"), "19ক");
  assert.equal(bdlaws.normalizeSectionKey(null), null);

  // --- parsing
  const penal = bdlaws.parseActSections(PENAL_CODE_FIXTURE, "11");
  assert.equal(penal.title, "The Penal Code, 1860");
  assert.deepEqual(
    penal.sections.map((s) => `${s.number}=${s.sectionId}`),
    ["1=1944", "2=1945", "4=19904", "10=2005", "304B=3170"],
    "Preamble and other acts' links are ignored; non-sequential IDs kept",
  );

  const rent = bdlaws.parseActSections(RENT_ACT_FIXTURE, "748");
  assert.deepEqual(
    rent.sections.map((s) => `${s.number}=${s.sectionId}`),
    ["1=30631", "13=30643", "19=30649", "19ক=30650"],
  );

  // --- resolution: exact section
  const s4 = await bdlaws.resolveOfficialSource("11.json", "4", "The Penal Code, 1860");
  assert.equal(s4?.sourceUrl, "https://bdlaws.minlaw.gov.bd/act-11/section-19904.html");
  assert.equal(s4?.sourceKind, "section");
  assert.equal(s4?.sourceName, "Laws of Bangladesh — The Penal Code, 1860, Section 4");

  const s19 = await bdlaws.resolveOfficialSource("748.json", "১৯", "বাড়ী ভাড়া নিয়ন্ত্রণ আইন, ১৯৯১");
  assert.equal(s19?.sourceUrl, "https://bdlaws.minlaw.gov.bd/act-748/section-30649.html");
  assert.equal(s19?.sourceName, "Laws of Bangladesh — বাড়ী ভাড়া নিয়ন্ত্রণ আইন, ১৯৯১, ধারা ১৯");

  // --- resolution: section not listed -> act page, never a guessed section URL
  const missing = await bdlaws.resolveOfficialSource("11.json", "999", "The Penal Code, 1860");
  assert.equal(missing?.sourceUrl, "https://bdlaws.minlaw.gov.bd/act-11.html");
  assert.equal(missing?.sourceKind, "act");

  // --- act page unreachable -> act page link
  const unreachable = await bdlaws.resolveOfficialSource("26.json", "10", "The Contract Act, 1872");
  assert.equal(unreachable?.sourceUrl, "https://bdlaws.minlaw.gov.bd/act-26.html");
  assert.equal(unreachable?.sourceKind, "act");

  // --- each act page fetched once (memory cache), then persisted
  const before = requests;
  await bdlaws.resolveOfficialSource("11.json", "1", "The Penal Code, 1860");
  await bdlaws.resolveOfficialSource("11.json", "2", "The Penal Code, 1860");
  assert.equal(requests, before, "cached act index is reused");
  await new Promise((resolve) => setTimeout(resolve, 700));
  const saved = JSON.parse(fs.readFileSync(path.join(cacheDir, "bdlaws-sections.json"), "utf8"));
  assert.ok(saved["11"].ok && saved["748"].ok, "cache written to disk");

  // --- non-bdlaws act file
  assert.equal(await bdlaws.resolveOfficialSource("unknown", "1", "x"), null);

  server.close();
  console.log("bdlaws tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
