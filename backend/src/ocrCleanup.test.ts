/*
 * Run: npx tsx src/ocrCleanup.test.ts
 * 1. Text clean-up rules (fast).
 * 2. Image quality + OCR on a rendered document, clean and degraded
 *    (needs eng/ben traineddata in backend/; ~1-2 minutes).
 *    Bangla lines need a Bengali font installed (e.g. Noto Sans Bengali);
 *    without one the image test uses English only.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import sharp from "sharp";
import { assessImage, cleanOcrText, ocrBestVariant } from "./ocrCleanup";

// --- 1. text clean-up -------------------------------------------------
assert.equal(cleanOcrText("টাকা |"), "টাকা।", "dari read as |");
assert.equal(cleanOcrText("ভা\u09A1\u09BCা"), "ভা\u09DCা", "decomposed ড় unified");
assert.equal(cleanOcrText("য়"), "য়", "decomposed য় unified");
assert.equal(cleanOcrText("The tenant shall termi-\nnate the lease"), "The tenant shall terminate\nthe lease");
assert.equal(cleanOcrText("Clause 1\n~ ' ; | ,\nClause 2"), "Clause 1\nClause 2", "symbol-only noise line removed");
assert.equal(cleanOcrText("Signature: ________"), "Signature: ________", "form blanks kept");
assert.equal(cleanOcrText("1\nRent is BDT 25,000 ."), "1\nRent is BDT 25,000.", "numbers kept, space before . removed");
console.log("text clean-up ok");

// --- 2. images -----------------------------------------------------------
const hasBengaliFont = (() => {
  try {
    return /bengali/i.test(execSync("fc-list", { encoding: "utf8" }));
  } catch {
    return false;
  }
})();

const lines = [
  ...(hasBengaliFont ? ["বাড়ী ভাড়ার চুক্তিপত্র", "মাসিক ভাড়া ২৫,০০০ টাকা এবং জামানত ৫০,০০০ টাকা।"] : []),
  "RENT AGREEMENT",
  "The tenant shall pay the monthly rent of BDT 25,000 by the 5th day of each month.",
  "Either party may terminate this agreement with 30 days written notice.",
];
const truth = lines.join(" ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="${120 + lines.length * 95}"><rect width="100%" height="100%" fill="#f6f2e8"/>${lines
  .map((line, i) => `<text x="60" y="${90 + i * 95}" font-family="Noto Sans Bengali, DejaVu Sans" font-size="30" fill="#222">${line}</text>`)
  .join("")}</svg>`;

function distance(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
}
const flat = (text: string) => text.normalize("NFC").replace(/\s+/g, " ").trim();
const accuracy = (text: string) => 1 - distance(flat(text), flat(truth)) / flat(truth).length;

(async () => {
  const clean = await sharp(Buffer.from(svg)).png().toBuffer();
  // Camera-like grain: Gaussian noise added to every pixel, after a blur.
  const blurred = await sharp(clean).blur(2).greyscale().extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < blurred.data.length; i++) {
    const gaussian = Math.sqrt(-2 * Math.log(random() + 1e-9)) * Math.cos(2 * Math.PI * random());
    blurred.data[i] = Math.max(0, Math.min(255, blurred.data[i] + gaussian * 40));
  }
  const blurredGrainy = await sharp(blurred.data, { raw: { width: blurred.info.width, height: blurred.info.height, channels: 1 } })
    .jpeg({ quality: 50 })
    .toBuffer();

  const cleanQuality = await assessImage(clean);
  assert.equal(cleanQuality.rating, "good", `clean page rated good (${JSON.stringify(cleanQuality)})`);

  const degradedQuality = await assessImage(blurredGrainy);
  assert.ok(degradedQuality.issues.includes("noisy"), `grain detected (${JSON.stringify(degradedQuality)})`);

  const cleanResult = await ocrBestVariant(clean);
  assert.ok(accuracy(cleanResult.text) > 0.97, `clean accuracy ${accuracy(cleanResult.text)}`);

  const degradedResult = await ocrBestVariant(blurredGrainy);
  assert.ok(accuracy(degradedResult.text) > 0.55, `degraded accuracy ${accuracy(degradedResult.text)}`);
  assert.ok(degradedResult.warnings.length > 0, "degraded page carries a warning for the reviewer");

  console.log(
    `ocr ok — clean ${(accuracy(cleanResult.text) * 100).toFixed(1)}%, blurred+grainy ${(accuracy(degradedResult.text) * 100).toFixed(1)}% via ${degradedResult.variant}`,
  );
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
