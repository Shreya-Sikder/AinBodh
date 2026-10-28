/* =========================================================
   MAIN TEXT — keep the document's actual content, drop the page clutter

   OCR and PDF text contain much more than the document says: stamps and
   seals, notary boilerplate, signature lines, letterheads and footers
   repeated on every page, page numbers, photo captions, barcodes and
   scanner debris. The analysis (and the person) should work only with the
   main passage.

   extractMainText() asks the model to copy the main body word for word
   without that clutter, then VERIFIES the result: nearly every word in the
   output must already appear in the extracted text. If the model rewrote,
   summarised or invented anything, the cleaned raw text is used instead.
========================================================= */

import type Groq from "groq-sdk";

export type MainTextResult = {
  mainText: string;
  /** What kinds of page elements were left out, e.g. "stamps", "page numbers". */
  excluded: string[];
  /** True when the model's version passed verification; false = raw text fallback. */
  verified: boolean;
  /** Some words could not be read and are marked [unclear]. */
  hasUnclear: boolean;
};

const CHUNK_CHARS = 12000;
const MAX_LLM_CHARS = 60000;

const words = (text: string) =>
  text
    .normalize("NFC")
    .replace(/য়/g, "য়")
    .toLowerCase()
    .replace(/\[unclear\]|\[অস্পষ্ট\]/gi, " ")
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .filter((word) => word.length >= 2);

/** Share of output words that exist in the source (guards against invented text). */
export function groundedShare(output: string, source: string): number {
  const vocabulary = new Set(words(source));
  const outputWords = words(output);
  if (outputWords.length === 0) return 0;
  return outputWords.filter((word) => vocabulary.has(word)).length / outputWords.length;
}

function splitChunks(text: string): string[] {
  const pages = text.split(/(?=^\s*\[Page\s+\d+\]\s*$)/im);
  const chunks: string[] = [];
  let current = "";
  for (const page of pages) {
    if (current && current.length + page.length > CHUNK_CHARS) {
      chunks.push(current);
      current = "";
    }
    if (page.length > CHUNK_CHARS) {
      for (let i = 0; i < page.length; i += CHUNK_CHARS) chunks.push(page.slice(i, i + CHUNK_CHARS));
    } else {
      current += page;
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

function parseJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Light, rule-based clean-up used as the fallback. */
export function basicClean(text: string): string {
  return text
    .replace(/^\s*\[Page\s+\d+\]\s*$/gim, "")
    .replace(/^\s*(?:page|পৃষ্ঠা)\s*[-–]?\s*[0-9০-৯]+\s*(?:of|এর)?\s*[0-9০-৯]*\s*$/gim, "")
    .replace(/^\s*[-–—]?\s*[0-9০-৯]{1,3}\s*[-–—]?\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function cleanChunk(groq: Groq, model: string, chunk: string) {
  const prompt = `Below is text extracted (OCR or PDF) from ONE document. It contains the document's main
content plus clutter. Return the main content only.

REMOVE: stamps and seals, notary/attestation stamp text, registration or court-fee stamp text,
signature lines and "Signature/স্বাক্ষর" labels, letterheads/headers/footers repeated on pages,
page numbers, "[Page N]" markers, photo captions, barcodes/QR/serial noise, watermark text,
and scanner debris (stray letters/symbols).

KEEP, COPIED WORD FOR WORD: the title, every sentence and clause of the body, numbered items,
names, dates, amounts, addresses and legal references exactly as written (same spelling,
same digits, same language). Join lines that were broken in the middle of a sentence.
Keep numbered clauses on their own lines. Where a word cannot be read, write [unclear].
Do NOT summarise, translate, correct, re-order or add anything.

Return ONLY JSON: {"main_text": "...", "excluded": ["short names of what you removed"]}

TEXT:
${chunk}`;

  const completion = await groq.chat.completions.create({
    model,
    temperature: 0,
    max_tokens: Math.min(8000, Math.ceil(chunk.length / 2) + 600),
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });
  const parsed = parseJson(completion.choices?.[0]?.message?.content ?? "");
  return {
    text: typeof parsed?.main_text === "string" ? parsed.main_text.trim() : "",
    excluded: Array.isArray(parsed?.excluded) ? (parsed!.excluded as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 8) : [],
  };
}

export async function extractMainText(groq: Groq, model: string, rawText: string): Promise<MainTextResult> {
  const source = rawText.trim();
  const fallback = (): MainTextResult => {
    const text = basicClean(source);
    return { mainText: text, excluded: [], verified: false, hasUnclear: false };
  };
  if (!source) return fallback();

  const head = source.slice(0, MAX_LLM_CHARS);
  const tail = source.slice(MAX_LLM_CHARS);

  try {
    const parts: string[] = [];
    const excluded = new Set<string>();
    for (const chunk of splitChunks(head)) {
      const result = await cleanChunk(groq, model, chunk);
      // Each chunk must be grounded in its own source, and must not drop most of it.
      const grounded = groundedShare(result.text, chunk);
      const kept = words(result.text).length / Math.max(1, words(chunk).length);
      if (!result.text || grounded < 0.9 || kept < 0.25) {
        parts.push(basicClean(chunk));
        continue;
      }
      parts.push(result.text);
      result.excluded.forEach((item) => excluded.add(item));
    }

    const mainText = [parts.join("\n\n"), tail ? basicClean(tail) : ""].filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!mainText) return fallback();

    return {
      mainText,
      excluded: Array.from(excluded),
      verified: groundedShare(mainText, source) >= 0.9,
      hasUnclear: /\[unclear\]|\[অস্পষ্ট\]/i.test(mainText),
    };
  } catch (error) {
    console.error("Main-text extraction failed:", (error as Error).message);
    return fallback();
  }
}
