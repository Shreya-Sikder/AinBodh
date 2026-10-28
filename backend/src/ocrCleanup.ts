/* =========================================================
   OCR CLEANUP — getting readable text out of grainy, blurry,
   dark or low-resolution photos and scans

   1. assessImage()     measures sharpness, contrast, brightness, noise
                        and resolution, and names the problems found.
   2. prepareVariant()  cleans the image for OCR:
                          standard  grey, stretch contrast (small images upscaled up to 2x)
                          enhanced  + remove grain (median filter), then a light
                                      sharpen — for grainy, blurry or low-light photos
                          binary    enhanced + local contrast (CLAHE), then black/white
                                      with an automatic (Otsu) threshold — for faded print
                        Measured on degraded test documents (ocrCleanup.test.ts):
                        sharpening BEFORE denoising destroys grainy images, so
                        sharpening only ever happens after the median filter.
   3. ocrBestVariant()  runs OCR on the standard version; if the image is poor
                        or confidence is low, also on the other versions, and keeps
                        the result Tesseract is most confident about.
   4. cleanOcrText()    removes OCR debris and fixes common Bangla/English
                        artefacts without changing any words, numbers or dates.

   The person still reviews the text on the Verify page; the warnings and
   low-confidence words returned here tell them what to check.
========================================================= */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createWorker, type Worker } from "tesseract.js";

export type QualityIssue = "blurry" | "low_contrast" | "dark" | "overexposed" | "low_resolution" | "noisy";

export type ImageQuality = {
  width: number;
  height: number;
  sharpness: number;
  contrast: number;
  brightness: number;
  noise: number;
  rating: "good" | "fair" | "poor";
  issues: QualityIssue[];
};

export type OcrVariant = "standard" | "enhanced" | "binary";

export type OcrPageResult = {
  text: string;
  /** Tesseract mean confidence, 0-100. */
  confidence: number;
  variant: OcrVariant;
  quality: ImageQuality;
  /** Words recognised with low confidence — worth checking by eye. */
  uncertainWords: string[];
  warnings: string[];
};

/* ---------------------------------------------------------
   1. Quality assessment
--------------------------------------------------------- */

const ANALYSIS_WIDTH = 1200;

// Calibrated on rendered document images at ANALYSIS_WIDTH (see ocrCleanup.test.ts).
const LIMITS = {
  blurry: 8, // edge strength relative to the ink/paper contrast; below = soft/blurred text
  lowContrast: 90, // gap between dark ink and paper (2nd-98th percentile)
  dark: 85,
  overexposed: 245,
  noisy: 6,
  minWidth: 900,
};

function percentile(histogram: number[], total: number, fraction: number): number {
  let seen = 0;
  for (let value = 0; value < 256; value++) {
    seen += histogram[value];
    if (seen >= total * fraction) return value;
  }
  return 255;
}

export async function assessImage(buffer: Buffer): Promise<ImageQuality> {
  const base = sharp(buffer, { failOn: "none" }).rotate();
  const meta = await base.metadata();
  // EXIF orientations 5-8 are rotated by 90 degrees.
  const turned = (meta.orientation ?? 1) >= 5;
  const width = (turned ? meta.height : meta.width) ?? 0;
  const height = (turned ? meta.width : meta.height) ?? 0;

  const grey = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({ width: ANALYSIS_WIDTH, withoutEnlargement: false })
    .greyscale()
    .png()
    .toBuffer();

  // sharp's stats() reads its *input*, so each processed image is rendered first.
  const [laplacian, median] = await Promise.all([
    sharp(grey)
      .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 })
      .png()
      .toBuffer(),
    sharp(grey).median(3).png().toBuffer(),
  ]);

  const [greyStats, laplacianStats] = await Promise.all([sharp(grey).stats(), sharp(laplacian).stats()]);

  // Ink-to-paper contrast from the histogram (robust for mostly-white pages).
  const [{ data: pixels }, { data: smooth }] = await Promise.all([
    sharp(grey).extractChannel(0).raw().toBuffer({ resolveWithObject: true }),
    sharp(median).extractChannel(0).raw().toBuffer({ resolveWithObject: true }),
  ]);
  const histogram = new Array<number>(256).fill(0);
  for (const value of pixels) histogram[value]++;
  const paper = percentile(histogram, pixels.length, 0.6);
  const range = percentile(histogram, pixels.length, 0.98) - percentile(histogram, pixels.length, 0.02);

  // Grain: how far pixels on blank paper stray from their 3x3 median.
  // (Measured on paper only, so the edges of letters don't count as noise.)
  let strayTotal = 0;
  let paperPixels = 0;
  for (let i = 0; i < pixels.length; i++) {
    if (smooth[i] >= paper - 8) {
      strayTotal += Math.abs(pixels[i] - smooth[i]);
      paperPixels++;
    }
  }

  const brightness = greyStats.channels[0].mean;
  const contrast = range;
  // Edge strength relative to contrast, so faint-but-sharp text isn't called blurry.
  const sharpness = (laplacianStats.channels[0].stdev / Math.max(range, 20)) * 100;
  const noise = paperPixels ? (strayTotal / paperPixels) * 2 : 0;

  const issues: QualityIssue[] = [];
  if (sharpness < LIMITS.blurry) issues.push("blurry");
  if (contrast < LIMITS.lowContrast) issues.push("low_contrast");
  if (brightness < LIMITS.dark) issues.push("dark");
  if (brightness > LIMITS.overexposed) issues.push("overexposed");
  if (Math.max(width, height) < LIMITS.minWidth) issues.push("low_resolution");
  if (noise > LIMITS.noisy) issues.push("noisy");

  const rating = issues.length === 0 ? "good" : issues.length === 1 && !issues.includes("blurry") ? "fair" : "poor";

  return {
    width,
    height,
    sharpness: Math.round(sharpness * 10) / 10,
    contrast: Math.round(contrast * 10) / 10,
    brightness: Math.round(brightness),
    noise: Math.round(noise * 10) / 10,
    rating,
    issues,
  };
}

/* ---------------------------------------------------------
   2. Image clean-up variants
--------------------------------------------------------- */

/** Fallback width when an image reports no size. */
const OCR_WIDTH = 2480;

function otsuThreshold(pixels: Buffer): number {
  const histogram = new Array<number>(256).fill(0);
  for (const value of pixels) histogram[value]++;

  const total = pixels.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];

  let sumBackground = 0;
  let weightBackground = 0;
  let best = 0;
  let threshold = 128;

  for (let i = 0; i < 256; i++) {
    weightBackground += histogram[i];
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;
    sumBackground += i * histogram[i];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const between = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (between > best) {
      best = between;
      threshold = i;
    }
  }
  return threshold;
}

export async function prepareVariant(buffer: Buffer, variant: OcrVariant, quality: ImageQuality): Promise<Buffer> {
  // Upscale only small images (and at most 2x); large photos are capped. Measured:
  // upscaling a grainy photo turns the grain into blobs, so denoising happens first,
  // at the original resolution.
  const longSide = Math.max(quality.width, quality.height) || OCR_WIDTH;
  const scale = longSide < 1600 && !quality.issues.includes("noisy") ? Math.min(2, 2000 / longSide) : longSide > 3500 ? 3500 / longSide : 1;
  const resized = (image: sharp.Sharp) =>
    scale === 1 ? image : image.resize({ width: Math.round((quality.width || OCR_WIDTH) * scale), kernel: "lanczos3" });

  let image = sharp(buffer, { failOn: "none" }).rotate().greyscale();
  if (quality.issues.includes("dark")) image = image.gamma(2.2);

  if (variant === "standard") {
    return resized(image).normalise().png().toBuffer();
  }

  // Enhanced: remove grain first (sharpening or enlarging noise makes it much worse).
  const noisy = quality.issues.includes("noisy");
  image = resized(image.median(noisy ? 5 : 3)).normalise();
  if (variant === "enhanced") return (noisy ? image : image.sharpen()).png().toBuffer();

  // Binary: even out uneven lighting, then black text on white with an automatic (Otsu) threshold.
  image = image.clahe({ width: 96, height: 96, maxSlope: 3 }).normalise();
  const { data, info } = await sharp(await image.png().toBuffer())
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const threshold = otsuThreshold(data);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 1 } })
    .threshold(threshold)
    .png()
    .toBuffer();
}

/* ---------------------------------------------------------
   3. OCR with a shared worker
--------------------------------------------------------- */

const LANG_DIR = process.env.TESSDATA_DIR || path.resolve(__dirname, "..");
const IDLE_MS = 5 * 60 * 1000;

let workerPromise: Promise<Worker> | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let queue: Promise<unknown> = Promise.resolve();

function haveLocalLanguages(): boolean {
  return ["eng", "ben"].every((lang) => fs.existsSync(path.join(LANG_DIR, `${lang}.traineddata`)));
}

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    const local = haveLocalLanguages();
    workerPromise = createWorker(
      ["ben", "eng"],
      1,
      local ? { langPath: LANG_DIR, cachePath: LANG_DIR, gzip: false } : { cachePath: LANG_DIR },
    ).catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

function scheduleIdleShutdown() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    const pending = workerPromise;
    workerPromise = null;
    if (pending) (await pending.catch(() => null))?.terminate().catch(() => undefined);
  }, IDLE_MS);
  idleTimer.unref?.();
}

/** Run OCR jobs one at a time on one shared worker (loading the language data takes seconds). */
async function recognise(image: Buffer) {
  const job = queue.then(async () => {
    const worker = await getWorker();
    await worker.setParameters({ preserve_interword_spaces: "1", user_defined_dpi: "300" });
    return worker.recognize(image, { rotateAuto: true }, { text: true, blocks: true });
  });
  queue = job.catch(() => undefined);
  try {
    return await job;
  } finally {
    scheduleIdleShutdown();
  }
}

function uncertainWords(blocks: unknown): string[] {
  const words: string[] = [];
  for (const block of (blocks as Array<{ paragraphs?: Array<{ lines?: Array<{ words?: Array<{ text: string; confidence: number }> }> }> }>) ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          const text = word.text.trim();
          if (word.confidence < 55 && /[\p{L}\p{N}]{2,}/u.test(text) && !words.includes(text)) words.push(text);
        }
      }
    }
  }
  return words.slice(0, 25);
}

function qualityWarnings(quality: ImageQuality, confidence: number): string[] {
  const out: string[] = [];
  const has = (issue: QualityIssue) => quality.issues.includes(issue);

  if (has("blurry")) out.push("The image looks blurry. AinBodh sharpened it before reading, but please check names, dates, amounts and section numbers carefully.");
  if (has("noisy")) out.push("The image is grainy. Noise was reduced before reading; small letters and punctuation may still be wrong.");
  if (has("dark")) out.push("The image is dark. Brightness was corrected before reading.");
  if (has("overexposed")) out.push("The image is very bright or washed out; faint text may be missing.");
  if (has("low_contrast")) out.push("The text is faint (low contrast). Contrast was boosted before reading.");
  if (has("low_resolution")) out.push("The image resolution is low. For better results, take the photo closer or scan at a higher resolution.");
  if (confidence > 0 && confidence < 60) {
    out.push("AinBodh is not confident about parts of this text. If possible, retake the photo in good light, flat and in focus.");
  }
  return out;
}

/**
 * OCR one image (a photo or a rendered PDF page), cleaning it up first.
 * Tries stronger clean-ups only when the image is poor or the first read is unsure.
 */
export async function ocrBestVariant(buffer: Buffer): Promise<OcrPageResult> {
  const quality = await assessImage(buffer);

  const variants: OcrVariant[] = quality.rating === "good" ? ["standard"] : ["standard", "enhanced"];
  const results: Array<{ variant: OcrVariant; text: string; confidence: number; blocks: unknown }> = [];

  const run = async (variant: OcrVariant) => {
    const prepared = await prepareVariant(buffer, variant, quality);
    const result = await recognise(prepared);
    results.push({
      variant,
      text: cleanOcrText(result.data.text || ""),
      confidence: Math.round(result.data.confidence ?? 0),
      blocks: result.data.blocks,
    });
  };

  for (const variant of variants) await run(variant);
  const bestSoFar = Math.max(...results.map((item) => item.confidence));
  if (bestSoFar < 80 && !results.some((item) => item.variant === "enhanced")) await run("enhanced");
  if (Math.max(...results.map((item) => item.confidence)) < 70 || quality.issues.includes("low_contrast")) await run("binary");

  // Highest confidence wins. (Garbage reads of noisy images are often *longer*, so
  // length is only a tie-breaker between reads of similar confidence.)
  const best = [...results].sort((a, b) =>
    Math.abs(a.confidence - b.confidence) <= 3 ? b.text.length - a.text.length : b.confidence - a.confidence,
  )[0];

  return {
    text: best.text,
    confidence: best.confidence,
    variant: best.variant,
    quality,
    uncertainWords: uncertainWords(best.blocks),
    warnings: qualityWarnings(quality, best.confidence),
  };
}

/* ---------------------------------------------------------
   4. Text clean-up
--------------------------------------------------------- */

const BANGLA = "\\u0980-\\u09FF";

/**
 * Remove OCR debris and fix layout artefacts. Never changes words, digits,
 * dates or amounts — only whitespace, stray symbols and character encoding.
 */
export function cleanOcrText(raw: string): string {
  let text = raw
    .normalize("NFC")
    // One encoding for Bangla nukta letters (য়, ড়, ঢ়).
    .replace(/য়/g, "য়")
    .replace(/ড়/g, "ড়")
    .replace(/ঢ়/g, "ঢ়")
    .replace(/[​⁠﻿­]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ");

  // The Bangla full stop (dari) is often read as "|", "I" or "l" after Bangla text.
  text = text.replace(new RegExp(`([${BANGLA}])\\s?[|¦](?=\\s|$)`, "gmu"), "$1।");

  // English words split across lines with a hyphen.
  text = text.replace(/([A-Za-z]{2,})-\n([a-z]{2,})/g, "$1$2\n");

  const lines = text.split("\n").map((line) => line.replace(/ {2,}/g, " ").trim());

  const meaningful = (line: string) => {
    if (!line) return true; // keep paragraph breaks
    const letters = (line.match(new RegExp(`[A-Za-z0-9${BANGLA}০-৯]`, "gu")) || []).length;
    // Lines that are mostly symbols ("~ ' ; | _ ,") are scanner noise.
    if (letters === 0) return /^[_.\-–—]{3,}$/.test(line); // keep form blanks like "________"
    if (line.length >= 4 && letters / line.length < 0.35) return false;
    // A lone Latin character on its own line ("I", "l", "i") is almost always a speck.
    if (line.length === 1 && /[A-Za-z]/.test(line)) return false;
    return true;
  };

  return lines
    .filter(meaningful)
    .join("\n")
    .replace(/ +([,.;:!?।])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
