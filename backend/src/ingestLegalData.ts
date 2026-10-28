import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import crypto from "node:crypto";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { pipeline } from "@xenova/transformers";

/* =========================================================
   ENVIRONMENT
========================================================= */

const envCandidates = [
  path.resolve(process.cwd(), "backend/.env"),
  path.resolve(process.cwd(), ".env"),
];

const envFile = envCandidates.find((file) =>
  fs.existsSync(file)
);

if (!envFile) {
  throw new Error(
    [
      "Could not find .env file.",
      "",
      "Expected one of:",
      ...envCandidates,
    ].join("\n")
  );
}

dotenv.config({
  path: envFile,
});

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (
  !SUPABASE_URL ||
  !SUPABASE_SERVICE_ROLE_KEY
) {
  throw new Error(
    `Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in ${envFile}`
  );
}

/* =========================================================
   SUPABASE
========================================================= */

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

/* =========================================================
   CONFIG
========================================================= */

const TABLE_NAME = "legal_chunks";

const MODEL_NAME = "Xenova/bge-m3";

const EMBEDDING_BATCH_SIZE = 16;

const INSERT_BATCH_SIZE = 100;

const MAX_RETRIES = 5;

/* =========================================================
   INPUT FILE
========================================================= */

const inputCandidates = [
  path.resolve(
    process.cwd(),
    "data/rag_passages_fresh.jsonl"
  ),

  path.resolve(
    process.cwd(),
    "../data/rag_passages_fresh.jsonl"
  ),

  path.resolve(
    process.cwd(),
    "backend/data/rag_passages_fresh.jsonl"
  ),
];

const INPUT_FILE = path.resolve(
  process.cwd(),
  "data/rag_passages.jsonl",
);

if (!INPUT_FILE) {
  throw new Error(
    [
      "Input file not found: rag_passages_fresh.jsonl",
      "",
      "Checked:",
      ...inputCandidates,
    ].join("\n")
  );
}

/* =========================================================
   TYPES
========================================================= */

type Passage = {
  id?: string | number;
  title?: string;
  act_file?: string;
  start?: number;
  end?: number;
  text?: string;
};

type NormalizedPassage = {
  id: string;
  title: string;
  actFile: string;
  start: number | null;
  end: number | null;
  text: string;
};

type EmbeddingPipeline = (
  texts: string[],
  options: {
    pooling: "cls";
    normalize: boolean;
  }
) => Promise<{
  dims: number[];
  data: Float32Array;
  tolist: () => number[][];
}>;

/* =========================================================
   EMBEDDING MODEL
========================================================= */

let extractor:
  | EmbeddingPipeline
  | null = null;

async function getExtractor() {
  if (extractor) {
    return extractor;
  }

  console.log(
    `\nLoading ${MODEL_NAME}...`
  );

  extractor =
    (await pipeline(
      "feature-extraction",
      MODEL_NAME
    )) as unknown as EmbeddingPipeline;

  console.log(
    "✅ BGE-M3 loaded."
  );

  return extractor;
}

/* =========================================================
   RETRY
========================================================= */

async function retry<T>(
  operation: () => PromiseLike<T>,
  label: string
): Promise<T> {
  let lastError: unknown;

  for (
    let attempt = 1;
    attempt <= MAX_RETRIES;
    attempt++
  ) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      console.log(
        `⚠️ ${label} failed (attempt ${attempt}/${MAX_RETRIES})`
      );

      if (
        attempt < MAX_RETRIES
      ) {
        const delay = Math.min(
          2000 *
            2 ** (attempt - 1),
          30000
        );

        console.log(
          `   Retrying in ${delay / 1000}s...`
        );

        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              delay
            )
        );
      }
    }
  }

  throw lastError;
}

/* =========================================================
   NORMALIZE PASSAGE
========================================================= */

function generateId(
  passage: Passage
): string {
  const raw = [
    passage.title ?? "",
    passage.act_file ?? "",
    passage.start ?? "",
    passage.end ?? "",
    passage.text ?? "",
  ].join("|");

  return crypto
    .createHash("sha1")
    .update(raw, "utf8")
    .digest("hex");
}

function normalizePassage(
  passage: Passage
): NormalizedPassage | null {
  const text =
    typeof passage.text ===
    "string"
      ? passage.text.trim()
      : "";

  if (!text) {
    return null;
  }

  const title =
    typeof passage.title ===
    "string" &&
    passage.title.trim()
      ? passage.title.trim()
      : "Untitled Act";

  const actFile =
    typeof passage.act_file ===
    "string"
      ? passage.act_file
      : "";

  const id =
    passage.id !== undefined &&
    passage.id !== null &&
    String(passage.id).trim()
      ? String(passage.id)
      : generateId(passage);

  const start =
    typeof passage.start ===
    "number"
      ? passage.start
      : null;

  const end =
    typeof passage.end ===
    "number"
      ? passage.end
      : null;

  return {
    id,
    title,
    actFile,
    start,
    end,
    text,
  };
}

/* =========================================================
   GET EXISTING IDS
========================================================= */

async function getExistingIds(): Promise<
  Set<string>
> {
  const ids =
    new Set<string>();

  let from = 0;

  const pageSize = 1000;

  while (true) {
    const result =
      await retry(
        () =>
          supabase
            .from(TABLE_NAME)
            .select("id")
            .range(
              from,
              from +
                pageSize -
                1
            ),
        `Fetching existing IDs ${from}-${from + pageSize - 1}`
      );

    const {
      data,
      error,
    } = result;

    if (error) {
      throw error;
    }

    if (
      !data ||
      data.length === 0
    ) {
      break;
    }

    for (
      const row of data
    ) {
      if (
        row &&
        row.id !==
          undefined &&
        row.id !== null
      ) {
        ids.add(
          String(row.id)
        );
      }
    }

    console.log(
      `Existing chunks loaded: ${ids.size}`
    );

    if (
      data.length <
      pageSize
    ) {
      break;
    }

    from += pageSize;
  }

  return ids;
}

/* =========================================================
   CREATE EMBEDDINGS
========================================================= */

async function createEmbeddings(
  texts: string[]
): Promise<number[][]> {
  const model =
    await getExtractor();

  const output =
    await model(texts, {
      pooling: "cls",
      normalize: true,
    });

  const dimensions =
    Number(
      output.dims[
        output.dims.length - 1
      ]
    );

  if (
    dimensions !== 1024
  ) {
    throw new Error(
      `Expected 1024-dimensional embeddings, received ${dimensions}.`
    );
  }

  const vectors =
    output.tolist();

  if (
    !Array.isArray(vectors) ||
    vectors.length !==
      texts.length
  ) {
    throw new Error(
      `Embedding count mismatch. Expected ${texts.length}, received ${vectors.length}.`
    );
  }

  return vectors;
}

/* =========================================================
   INSERT CHUNKS
========================================================= */

async function insertChunks(
  passages: NormalizedPassage[],
  embeddings: number[][]
): Promise<void> {
  if (
    passages.length === 0
  ) {
    return;
  }

  if (
    passages.length !==
    embeddings.length
  ) {
    throw new Error(
      `Passage/embedding count mismatch: ${passages.length} passages, ${embeddings.length} embeddings.`
    );
  }

  const rows =
    passages.map(
      (
        passage,
        index
      ) => ({
        id: passage.id,

        title:
          passage.title,

        act_file:
          passage.actFile,

        start_position:
          passage.start,

        end_position:
          passage.end,

        content:
          passage.text,

        embedding:
          embeddings[index],
      })
    );

  for (
    let i = 0;
    i < rows.length;
    i += INSERT_BATCH_SIZE
  ) {
    const batch =
      rows.slice(
        i,
        i +
          INSERT_BATCH_SIZE
      );

    await retry(
      async () => {
        const {
          error,
        } =
          await supabase
            .from(
              TABLE_NAME
            )
            .upsert(
              batch,
              {
                onConflict:
                  "id",
                ignoreDuplicates:
                  true,
              }
            );

        if (error) {
          throw error;
        }
      },
      `Supabase insert ${i + 1}-${i + batch.length}`
    );
  }
}

/* =========================================================
   MAIN
========================================================= */

async function main() {
  console.log(
    "=========================================="
  );
  console.log(
    "AinBodh BD — Vector Ingestion"
  );
  console.log(
    "=========================================="
  );

  console.log(
    `Input file: ${INPUT_FILE}`
  );

  console.log(
    `Database table: ${TABLE_NAME}`
  );

  console.log(
    `Embedding model: ${MODEL_NAME}`
  );

  console.log(
    "=========================================="
  );

  /* -------------------------------------------------------
     EXISTING EMBEDDINGS
  ------------------------------------------------------- */

  console.log(
    "\nChecking existing legal_chunks..."
  );

  const existingIds =
    await getExistingIds();

  console.log(
    `✅ Existing embeddings: ${existingIds.size}`
  );

  /* -------------------------------------------------------
     MODEL
  ------------------------------------------------------- */

  await getExtractor();

  /* -------------------------------------------------------
     STREAM INPUT
  ------------------------------------------------------- */

  const fileStream =
    fs.createReadStream(
      INPUT_FILE,
      {
        encoding: "utf-8",
      }
    );

  const rl =
    readline.createInterface({
      input: fileStream,
      crlfDelay:
        Infinity,
    });

  let total = 0;

  let skipped = 0;

  let invalid = 0;

  let processed = 0;

  let embeddingBatch:
    NormalizedPassage[] = [];

  /* -------------------------------------------------------
     PROCESS EMBEDDING BATCH
  ------------------------------------------------------- */

  async function processBatch(
    batch: NormalizedPassage[]
  ) {
    if (
      batch.length === 0
    ) {
      return;
    }

    console.log(
      `\nEmbedding batch: ${batch.length} passages...`
    );

    const texts =
      batch.map(
        (passage) =>
          passage.text
      );

    const embeddings =
      await retry(
        () =>
          createEmbeddings(
            texts
          ),
        "Embedding batch"
      );

    await retry(
      () =>
        insertChunks(
          batch,
          embeddings
        ),
      "Supabase insert batch"
    );

    for (
      const passage of batch
    ) {
      existingIds.add(
        passage.id
      );
    }

    processed +=
      batch.length;

    console.log(
      `✅ New embeddings created: ${processed}`
    );

    console.log(
      `   Total database chunks: ${existingIds.size}`
    );
  }

  /* -------------------------------------------------------
     READ JSONL
  ------------------------------------------------------- */

  for await (
    const line of rl
  ) {
    const trimmed =
      line.trim();

    if (!trimmed) {
      continue;
    }

    total++;

    let raw: Passage;

    try {
      raw =
        JSON.parse(
          trimmed
        ) as Passage;
    } catch {
      invalid++;

      console.warn(
        `⚠️ Invalid JSON at record ${total}; skipping.`
      );

      continue;
    }

    const passage =
      normalizePassage(raw);

    if (!passage) {
      invalid++;
      continue;
    }

    /*
     * RESUME LOGIC
     *
     * Existing IDs are skipped.
     */
    if (
      existingIds.has(
        passage.id
      )
    ) {
      skipped++;
      continue;
    }

    embeddingBatch.push(
      passage
    );

    if (
      embeddingBatch.length >=
      EMBEDDING_BATCH_SIZE
    ) {
      await processBatch(
        embeddingBatch
      );

      embeddingBatch = [];
    }

    if (
      total % 1000 ===
      0
    ) {
      console.log(
        `Read: ${total} | Existing: ${skipped} | Invalid: ${invalid} | New processed: ${processed}`
      );
    }
  }

  /* -------------------------------------------------------
     FINAL BATCH
  ------------------------------------------------------- */

  if (
    embeddingBatch.length >
    0
  ) {
    await processBatch(
      embeddingBatch
    );
  }

  /* -------------------------------------------------------
     SUMMARY
  ------------------------------------------------------- */

  console.log(
    "\n=========================================="
  );

  console.log(
    "INGESTION COMPLETE"
  );

  console.log(
    "=========================================="
  );

  console.log(
    `Total corpus records: ${total}`
  );

  console.log(
    `Already existed:      ${skipped}`
  );

  console.log(
    `Invalid/skipped:      ${invalid}`
  );

  console.log(
    `New embeddings:       ${processed}`
  );

  console.log(
    `Database total:       ${existingIds.size}`
  );

  console.log(
    "=========================================="
  );
}

/* =========================================================
   ERROR HANDLING
========================================================= */

main().catch(
  (error) => {
    console.error(
      "\n❌ INGESTION FAILED"
    );

    console.error(
      error instanceof Error
        ? error.stack ??
          error.message
        : error
    );

    process.exit(1);
  }
);