/* =========================================================
   DOCUMENT COMPARISON — POST /api/legal/compare

   { documents: [{ name, text }, ...2-5], language: "bn" | "en" }
   -> { ok, findings: [{ topic, status, documents: [{ documentName, excerpt }],
                         explanation }], summary }

   Compares what the documents themselves say (amounts, dates, parties,
   obligations, terms). Excerpts must be quoted from the documents; a topic
   missing from a document is reported as "not_found", never filled in.
========================================================= */

import type { Express, Request, Response } from "express";
import type Groq from "groq-sdk";

type Status = "consistent" | "different" | "potential_conflict" | "not_found";

const MAX_DOCUMENTS = 5;
const PER_DOCUMENT_CHARS = 14000;

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

const squash = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

export function registerCompareRoute(app: Express, groq: Groq, model: string) {
  app.post("/api/legal/compare", async (req: Request, res: Response) => {
    const bn = req.body?.language !== "en";
    const documents = (Array.isArray(req.body?.documents) ? req.body.documents : [])
      .filter((item: unknown) => item && typeof item === "object")
      .map((item: { name?: unknown; text?: unknown }, index: number) => ({
        name: typeof item.name === "string" && item.name.trim() ? item.name.trim().slice(0, 120) : `Document ${index + 1}`,
        text: typeof item.text === "string" ? item.text.trim() : "",
      }))
      .filter((item: { text: string }) => item.text.length > 0)
      .slice(0, MAX_DOCUMENTS);

    if (documents.length < 2) {
      return res.status(400).json({
        ok: false,
        error: bn ? "তুলনার জন্য অন্তত ২টি পাঠযোগ্য নথি দরকার।" : "At least two readable documents are required.",
      });
    }

    const corpus = documents
      .map((doc: { name: string; text: string }, index: number) => `=== DOCUMENT ${index + 1}: ${doc.name} ===\n${doc.text.slice(0, PER_DOCUMENT_CHARS)}`)
      .join("\n\n");

    const prompt = `
Compare these ${documents.length} documents for an ordinary person in Bangladesh.

${corpus}

Find the topics that matter (parties, dates, duration, amounts, payment terms, deposits,
penalties, notice periods, termination, obligations, signatures, anything that differs).

Return ONLY JSON:
{
  "findings": [
    {
      "topic": "short topic name",
      "status": "consistent" | "different" | "potential_conflict" | "not_found",
      "documents": [{ "documentName": "exact document name", "excerpt": "short quote copied from that document, or empty if not stated" }],
      "explanation": "one or two plain sentences"
    }
  ]
}

Rules:
- One entry in "documents" for EVERY document, in the same order as above.
- Excerpts must be copied word for word from the document (at most ~25 words). Never invent text.
- "not_found": the topic is stated in some documents but missing from at least one.
- "potential_conflict": the documents say incompatible things (e.g. different rent for the same period).
- 4-12 findings, most important first.
- Write "topic" and "explanation" in ${bn ? "proper Bengali script (no Banglish)" : "clear English"}; keep excerpts in the document's own language.
`;

    try {
      const completion = await groq.chat.completions.create({
        model,
        temperature: 0,
        max_tokens: 3500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You compare documents precisely. Quote only text that appears in them. Return JSON only." },
          { role: "user", content: prompt },
        ],
      });

      const parsed = parseJson(completion.choices?.[0]?.message?.content ?? "");
      if (!parsed || !Array.isArray(parsed.findings)) throw new Error("comparison returned no findings");

      const statuses: Status[] = ["consistent", "different", "potential_conflict", "not_found"];
      const findings = (parsed.findings as Array<Record<string, unknown>>)
        .map((finding) => {
          const listed = Array.isArray(finding.documents) ? (finding.documents as Array<Record<string, unknown>>) : [];
          return {
            topic: typeof finding.topic === "string" ? finding.topic.trim() : "",
            status: (statuses.includes(finding.status as Status) ? finding.status : "different") as Status,
            explanation: typeof finding.explanation === "string" ? finding.explanation.trim() : "",
            documents: documents.map((doc: { name: string; text: string }, index: number) => {
              const entry = listed[index] ?? {};
              const excerpt = typeof entry.excerpt === "string" ? entry.excerpt.trim() : "";
              // Drop any "quote" that isn't actually in the document.
              const verified = excerpt && squash(doc.text).includes(squash(excerpt).slice(0, 60)) ? excerpt : "";
              return { documentName: doc.name, excerpt: verified };
            }),
          };
        })
        .filter((finding) => finding.topic)
        .slice(0, 12);

      const count = (status: Status) => findings.filter((finding) => finding.status === status).length;

      return res.json({
        ok: true,
        findings,
        summary: {
          documentsCompared: documents.length,
          consistent: count("consistent"),
          different: count("different"),
          potentialConflicts: count("potential_conflict"),
          notFound: count("not_found"),
        },
      });
    } catch (error) {
      console.error("Comparison failed:", (error as Error).message);
      const busy = (error as { status?: number }).status === 429;
      return res.status(busy ? 503 : 502).json({
        ok: false,
        error: bn ? "নথিগুলো তুলনা করা যায়নি। আবার চেষ্টা করুন।" : "The documents could not be compared. Please try again.",
      });
    }
  });
}
