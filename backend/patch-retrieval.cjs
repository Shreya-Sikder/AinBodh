const fs = require("fs");
const path = require("path");

const serverPath = path.join("src", "server.ts");
const backupPath = path.join(
  "src",
  "server.ts.retrieval-before-patch.bak"
);

if (!fs.existsSync(serverPath)) {
  console.error("ERROR: src/server.ts not found.");
  process.exit(1);
}

let source = fs.readFileSync(serverPath, "utf8");
const original = source;

// ------------------------------------------------------------
// Backup current server.ts.
// Never modify the existing server.ts.bak.
// ------------------------------------------------------------
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(serverPath, backupPath);
  console.log(`Created backup: ${backupPath}`);
}

// ------------------------------------------------------------
// 1. Add retrieval configuration
// ------------------------------------------------------------
const portMarker =
  "const PORT = Number(process.env.PORT || 5000);";

const retrievalConfig = `
const RETRIEVAL_CONFIG = {
  semanticThreshold: 0.35,

  // Minimum quality required before retrieved law can
  // become grounding evidence.
  minimumCombinedScore: 0.30,

  // Strong semantic similarity may independently qualify.
  strongSemanticSimilarity: 0.48,

  // Otherwise require multiple lexical signals.
  minimumMatchedTerms: 3,

  maxEvidenceItems: 8,

  // Number of concept-level semantic searches.
  maxSemanticQueries: 6,
};

type RetrievalQuerySet = {
  queries: string[];
};
`;

if (
  !source.includes("const RETRIEVAL_CONFIG = {") &&
  source.includes(portMarker)
) {
  source = source.replace(
    portMarker,
    portMarker + "\n" + retrievalConfig,
  );
}

// ------------------------------------------------------------
// 2. Add concept-level retrieval queries
// ------------------------------------------------------------
const searchTermsMarker =
  "function extractLegalSearchTerms(";

const retrievalFunction = `
function buildRetrievalQueries(
  question: string,
  situation: SituationAnalysis,
  intent: LegalIntent,
): RetrievalQuerySet {
  const queries: string[] = [];

  const add = (value?: string) => {
    if (!value) return;

    const cleaned = value
      .replace(/\\\\s+/g, " ")
      .trim();

    if (!cleaned) return;

    const normalized = cleaned.toLowerCase();

    const duplicate = queries.some(
      (existing) =>
        existing.toLowerCase() === normalized ||
        existing.toLowerCase().includes(normalized) ||
        normalized.includes(existing.toLowerCase()),
    );

    if (!duplicate) {
      queries.push(cleaned);
    }
  };

  // Original question.
  add(question);

  // Situation analyzer's legal retrieval query.
  add(situation.retrievalQuery);

  // Legal issue + requested help.
  if (situation.legalIssue || situation.requestedHelp) {
    add(
      [
        situation.legalIssue,
        situation.requestedHelp,
      ]
        .filter(Boolean)
        .join(". "),
    );
  }

  // Legal issue + explicit facts.
  if (situation.legalIssue && situation.facts.length) {
    add(
      \`\${situation.legalIssue}. \${situation.facts
        .slice(0, 5)
        .join(". ")}\`,
    );
  }

  // Legal issue + relevant missing facts.
  if (situation.legalIssue && situation.missingFacts.length) {
    add(
      \`\${situation.legalIssue}. Relevant legal requirements and protections. \` +
      \`Questions that may affect the applicable law: \${situation.missingFacts
        .slice(0, 4)
        .join(". ")}\`,
    );
  }

  if (intent !== "unknown") {
    add(\`\${intent.replace(/_/g, " ")} under Bangladesh law\`);
  }

  return {
    queries: queries.slice(
      0,
      RETRIEVAL_CONFIG.maxSemanticQueries,
    ),
  };
}

`;

if (
  !source.includes("function buildRetrievalQueries(") &&
  source.includes(searchTermsMarker)
) {
  source = source.replace(
    searchTermsMarker,
    retrievalFunction + searchTermsMarker,
  );
}

// ------------------------------------------------------------
// 3. Replace semanticSearch()
// ------------------------------------------------------------
const semanticStart =
  source.indexOf("async function semanticSearch(");

if (semanticStart === -1) {
  console.error(
    "ERROR: Could not find semanticSearch()."
  );
  process.exit(1);
}

const semanticEnd =
  source.indexOf(
    "\nfunction mergeResults(",
    semanticStart,
  );

if (semanticEnd === -1) {
  console.error(
    "ERROR: Could not find end of semanticSearch()."
  );
  process.exit(1);
}

const newSemanticSearch = `
async function semanticSearch(
  query: string,
  threshold = RETRIEVAL_CONFIG.semanticThreshold,
  matchCount = 8,
): Promise<LegalSearchResult[]> {
  try {
    const output = await extractor(query, {
      pooling: "mean",
      normalize: true,
    });

    const embedding = Array.from(output.data);

    const { data, error } = await supabase.rpc(
      "match_legal_chunks",
      {
        query_embedding: embedding,
        match_threshold: threshold,
        match_count: matchCount,
      },
    );

    if (error) {
      console.error("Semantic search error:", error);
      return [];
    }

    return (data ?? []) as LegalSearchResult[];
  } catch (error) {
    console.error("Semantic search exception:", error);
    return [];
  }
}

`;

source =
  source.slice(0, semanticStart) +
  newSemanticSearch +
  source.slice(semanticEnd);

// ------------------------------------------------------------
// 4. Replace mergeResults()
// ------------------------------------------------------------
const mergeStart =
  source.indexOf("function mergeResults(");

if (mergeStart === -1) {
  console.error(
    "ERROR: Could not find mergeResults()."
  );
  process.exit(1);
}

const mergeEnd =
  source.indexOf(
    "\nfunction buildEvidence(",
    mergeStart,
  );

if (mergeEnd === -1) {
  console.error(
    "ERROR: Could not find end of mergeResults()."
  );
  process.exit(1);
}

const newMergeResults = `
function mergeResults(
  lexicalResults: LegalSearchResult[],
  semanticResults: LegalSearchResult[],
  question: string,
  searchTerms: string[],
  intent: LegalIntent,
): LegalSearchResult[] {
  const map = new Map<string, LegalSearchResult>();

  const keyFor = (
    item: LegalSearchResult,
    index: number,
  ) =>
    String(
      item.id ??
      item.chunk_id ??
      item.legal_chunk_id ??
      \`\${item.act_file ?? "unknown"}:\${item.section ?? ""}:\${index}\`,
    );

  lexicalResults.forEach((item, index) => {
    map.set(keyFor(item, index), {
      ...item,
      _lexicalSource: true,
    } as LegalSearchResult);
  });

  semanticResults.forEach((item, index) => {
    const key = keyFor(item, index);
    const existing = map.get(key);

    if (existing) {
      map.set(key, {
        ...existing,
        ...item,
        _lexicalSource: true,
      } as LegalSearchResult);
    } else {
      map.set(key, item);
    }
  });

  const questionWords = new Set(
    question
      .toLowerCase()
      .split(/\\\\s+/)
      .map((word) =>
        word.replace(/[^\\\\p{L}\\\\p{N}]/gu, ""),
      )
      .filter((word) => word.length >= 3),
  );

  const ranked = Array.from(map.values()).map((item) => {
    const text = [
      item.title,
      item.act_title,
      item.section,
      item.section_title,
      item.text,
      item.content,
      item.chunk_text,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    let matchedTerms = 0;

    for (const term of searchTerms) {
      const normalized = term.toLowerCase().trim();

      if (
        normalized.length >= 3 &&
        text.includes(normalized)
      ) {
        matchedTerms++;
      }
    }

    let exactQuestionMatches = 0;

    for (const word of questionWords) {
      if (
        word.length >= 4 &&
        text.includes(word)
      ) {
        exactQuestionMatches++;
      }
    }

    const lexicalScore =
      typeof item.lexicalScore === "number"
        ? item.lexicalScore
        : typeof item.score === "number"
          ? item.score
          : 0;

    const similarity =
      typeof item.similarity === "number"
        ? item.similarity
        : 0;

    const normalizedLexical =
      Math.max(0, Math.min(1, lexicalScore));

    const exactScore =
      Math.min(1, exactQuestionMatches / 8);

    const termScore =
      Math.min(1, matchedTerms / 6);

    const combinedScore =
      similarity * 0.55 +
      termScore * 0.20 +
      normalizedLexical * 0.15 +
      exactScore * 0.10;

    return {
      ...item,
      matchedTerms,
      exactQuestionMatches,
      semanticSimilarity: similarity,
      combinedScore,
    } as LegalSearchResult & {
      matchedTerms: number;
      exactQuestionMatches: number;
      semanticSimilarity: number;
      combinedScore: number;
    };
  });

  ranked.sort(
    (a, b) =>
      (b as any).combinedScore -
      (a as any).combinedScore,
  );

  console.log("\\n===== TOP LEGAL RETRIEVAL RESULTS =====");

  ranked.slice(0, 10).forEach((item, index) => {
    const result = item as any;

    console.log(
      \`\${index + 1}.\`,
      {
        act:
          item.act_title ??
          item.title ??
          item.act_file,

        section:
          item.section ??
          item.section_title,

        similarity:
          Number(
            (
              result.semanticSimilarity ?? 0
            ).toFixed(4),
          ),

        combinedScore:
          Number(
            (
              result.combinedScore ?? 0
            ).toFixed(4),
          ),

        matchedTerms:
          result.matchedTerms,

        exactMatches:
          result.exactQuestionMatches,
      },
    );
  });

  console.log(
    "=======================================\\n",
  );

  return ranked.slice(0, 20);
}

`;

source =
  source.slice(0, mergeStart) +
  newMergeResults +
  source.slice(mergeEnd);

// ------------------------------------------------------------
// 5. Replace buildEvidence()
// ------------------------------------------------------------
const evidenceStart =
  source.indexOf("function buildEvidence(");

if (evidenceStart === -1) {
  console.error(
    "ERROR: Could not find buildEvidence()."
  );
  process.exit(1);
}

const evidenceEnd =
  source.indexOf(
    "\nfunction getOfficialSource(",
    evidenceStart,
  );

if (evidenceEnd === -1) {
  console.error(
    "ERROR: Could not find end of buildEvidence()."
  );
  process.exit(1);
}

const newBuildEvidence = `
function buildEvidence(
  rankedResults: LegalSearchResult[],
  intent: LegalIntent,
): EvidenceItem[] {
  // Preserve the existing specific rent mappings.
  if (intent === "rent_refusal") {
    const section19 = rankedResults.find(
      (item) =>
        item.act_file === "748.json" &&
        String(item.section ?? "").includes("19"),
    );

    if (!section19) {
      return [];
    }

    return [
      {
        id: "C1",
        label:
          "House Rent Control Act, 1991 — Section 19",
        text:
          section19.text ??
          section19.content ??
          section19.chunk_text ??
          "",
        source:
          getOfficialSource(section19),
      },
    ];
  }

  if (intent === "rent_receipt") {
    const section13 = rankedResults.find(
      (item) =>
        item.act_file === "748.json" &&
        String(item.section ?? "").includes("13"),
    );

    if (!section13) {
      return [];
    }

    return [
      {
        id: "C1",
        label:
          "House Rent Control Act, 1991 — Section 13",
        text:
          section13.text ??
          section13.content ??
          section13.chunk_text ??
          "",
        source:
          getOfficialSource(section13),
      },
    ];
  }

  const candidates = rankedResults
    .map((item) => item as any)
    .filter((item) => {
      const similarity = Number(
        item.semanticSimilarity ??
        item.similarity ??
        0,
      );

      const combined = Number(
        item.combinedScore ?? 0,
      );

      const matchedTerms = Number(
        item.matchedTerms ?? 0,
      );

      if (
        similarity >=
        RETRIEVAL_CONFIG.strongSemanticSimilarity
      ) {
        return true;
      }

      if (
        combined >=
          RETRIEVAL_CONFIG.minimumCombinedScore &&
        matchedTerms >=
          RETRIEVAL_CONFIG.minimumMatchedTerms
      ) {
        return true;
      }

      return false;
    });

  const evidence = [];
  const seen = new Set();

  for (
    const item of candidates.slice(
      0,
      RETRIEVAL_CONFIG.maxEvidenceItems,
    )
  ) {
    const text =
      item.text ??
      item.content ??
      item.chunk_text ??
      "";

    if (!text.trim()) continue;

    const key = [
      item.act_file ?? "",
      item.section ?? "",
      item.section_title ?? "",
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);

    evidence.push({
      id: \`C\${evidence.length + 1}\`,
      label:
        item.section_title
          ? \`\${item.act_title ?? item.title ?? "Bangladesh law"} — \${item.section_title}\`
          : \`\${item.act_title ?? item.title ?? "Bangladesh law"}\${
              item.section
                ? \` — Section \${item.section}\`
                : ""
            }\`,
      text,
      source:
        getOfficialSource(item),
    });
  }

  console.log(
    \`Evidence gate: \${rankedResults.length} ranked -> \${evidence.length} usable evidence items\`,
  );

  return evidence;
}

`;

source =
  source.slice(0, evidenceStart) +
  newBuildEvidence +
  source.slice(evidenceEnd);

// ------------------------------------------------------------
// 6. Replace API retrieval block
// ------------------------------------------------------------
const oldBlock = `const searchTerms =
      extractLegalSearchTerms(
        contextualQuestion,
        intent,
        situation.retrievalQuery,
      );

    const [lexicalResults, semanticResults] =
      await Promise.all([
        lexicalSearch(searchTerms),
        semanticSearch(
          situation.retrievalQuery || question,
        ),
      ]);

    const rankedResults = mergeResults(
      lexicalResults,
      semanticResults,
      contextualQuestion,
      searchTerms,
      intent,
    );`;

const newBlock = `const searchTerms =
      extractLegalSearchTerms(
        contextualQuestion,
        intent,
        situation.retrievalQuery,
      );

    const retrievalQueries =
      buildRetrievalQueries(
        question,
        situation,
        intent,
      );

    console.log(
      "Retrieval queries:",
      retrievalQueries.queries,
    );

    const lexicalPromise =
      lexicalSearch(searchTerms);

    const semanticPromise =
      Promise.all(
        retrievalQueries.queries.map(
          (retrievalQuery) =>
            semanticSearch(
              retrievalQuery,
              RETRIEVAL_CONFIG.semanticThreshold,
              8,
            ),
        ),
      );

    const [lexicalResults, semanticResultSets] =
      await Promise.all([
        lexicalPromise,
        semanticPromise,
      ]);

    const semanticMap =
      new Map<string, LegalSearchResult>();

    semanticResultSets
      .flat()
      .forEach((item, index) => {
        const key = String(
          item.id ??
          item.chunk_id ??
          item.legal_chunk_id ??
          \`\${item.act_file ?? "unknown"}:\${item.section ?? ""}:\${index}\`,
        );

        if (!semanticMap.has(key)) {
          semanticMap.set(key, item);
        }
      });

    const semanticResults =
      Array.from(semanticMap.values());

    const rankedResults = mergeResults(
      lexicalResults,
      semanticResults,
      contextualQuestion,
      searchTerms,
      intent,
    );`;

if (source.includes(oldBlock)) {
  source = source.replace(
    oldBlock,
    newBlock,
  );
} else {
  console.warn(
    "WARNING: API retrieval block did not exactly match. " +
    "The other retrieval improvements were applied.",
  );
}

// ------------------------------------------------------------
// 7. Improve evidence failure logging
// ------------------------------------------------------------
const oldEvidenceGate =
  `if (!evidence.length) {
      return res.json({
        ok: true,
        grounded: false,`;

const newEvidenceGate =
  `if (!evidence.length) {
      console.log(
        "LEGAL EVIDENCE GATE FAILED: insufficiently relevant evidence.",
      );

      return res.json({
        ok: true,
        grounded: false,`;

if (source.includes(oldEvidenceGate)) {
  source = source.replace(
    oldEvidenceGate,
    newEvidenceGate,
  );
}

// ------------------------------------------------------------
// Save
// ------------------------------------------------------------
if (source === original) {
  console.error(
    "ERROR: No changes were made.",
  );
  process.exit(1);
}

fs.writeFileSync(
  serverPath,
  source,
  "utf8",
);

console.log("");
console.log("==========================================");
console.log("AinBodh retrieval patch applied.");
console.log("==========================================");
console.log(`Updated: ${serverPath}`);
console.log(`Backup:  ${backupPath}`);
console.log("Existing server.ts.bak was NOT modified.");
console.log("");