
import type { RecentDocument } from "../context/AppContext";
import { getAccessToken, realAuthEnabled, realLogin, realSignup } from "./auth";

/** Authorization header for the AinBodh backend when a real account session exists. */
async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/* =========================================================
   CONFIGURATION
========================================================= */

// Set VITE_API_BASE_URL in a root .env for a deployed backend; local backend uses port 5000.
const API_BASE_URL = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
  "http://127.0.0.1:5000"
).replace(/\/+$/, "");
const USER_STORAGE_KEY = "AinBodh-user";

/* =========================================================
   ANALYSIS TYPES
========================================================= */

export type LegalCitation = {
  id: string;
  title: string;
  actFile: string;
  sectionNumber: string | null;
  content: string;
  sourceName?: string;
  sourceUrl?: string;
  /** Set when the cited law has been repealed (the person asked about it by name). */
  repealedBy?: string;
};

export type AnalysisResponse = {
  document: RecentDocument;
  overview: string;
  keyPoints: Array<{
    icon: string;
    label: string;
    value: string;
    citation?: string;
  }>;
  attention: Array<{
    level: "high" | "review" | "info";
    title: string;
    body: string;
    citation?: string;
  }>;
  contradictions: Array<{
    title: string;
    body: string;
    citations: string[];
  }>;
  missing: Array<{
    title: string;
    body: string;
  }>;
  terms: Array<{
    term: string;
    /** Plain-language meaning. */
    meaning: string;
    /** A short everyday example. */
    example: string;
    inDocument: string;
    citation?: string;
  }>;
  citations: LegalCitation[];
};

/* =========================================================
   CHAT

   `text` matches ChatPanel's message structure.
   `content` is also supported for compatibility with
   backends that use OpenAI-style message objects.
========================================================= */

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  content?: string;
};

export type ChatResponse = {
  answer: string;
  citations: LegalCitation[];
  grounded?: boolean;
};

/* =========================================================
   DOCUMENT COMPARISON
========================================================= */

export type CompareDocumentInput = {
  name: string;
  text: string;
};

export type CompareFinding = {
  topic: string;
  status:
    | "consistent"
    | "different"
    | "potential_conflict"
    | "not_found";
  documents: Array<{
    documentName: string;
    excerpt: string;
  }>;
  explanation: string;
};

export type CompareResponse = {
  findings: CompareFinding[];
  summary: {
    documentsCompared: number;
    consistent: number;
    different: number;
    potentialConflicts: number;
    notFound: number;
  };
};

/* =========================================================
   SHARED HELPERS
========================================================= */

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

type ApiObject = Record<string, unknown>;

async function readJsonResponse(
  response: Response,
  fallbackMessage: string,
): Promise<ApiObject> {
  try {
    const data: unknown = await response.json();

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data)
    ) {
      throw new Error(fallbackMessage);
    }

    return data as ApiObject;
  } catch (error) {
    if (error instanceof Error &&
        error.message === fallbackMessage) {
      throw error;
    }

    throw new Error(fallbackMessage);
  }
}

function getServerError(
  data: ApiObject,
  fallback: string,
): string {
  return typeof data.error === "string" &&
    data.error.trim()
    ? data.error.trim()
    : fallback;
}

async function postJson(
  endpoint: string,
  body: unknown,
): Promise<{ response: Response; data: ApiObject }> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json",
        ...(await authHeaders()),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "Could not connect to the AinBodh server. Check that the backend is running and try again.",
    );
  }

  const data = await readJsonResponse(
    response,
    "The server returned an invalid response. Please check the backend logs.",
  );

  return { response, data };
}

/* =========================================================
   STREAMED REQUESTS — progress steps, then the result

   The backend sends one JSON object per line: {"type":"status","step":…}
   while it works and {"type":"result",…} at the end.
========================================================= */

export type StepHandler = (step: string) => void;

async function streamRequest(
  endpoint: string,
  init: RequestInit,
  onStep: StepHandler,
  fallbackError: string,
): Promise<ApiObject> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, init);
  } catch {
    throw new Error("Could not connect to the AinBodh server. Check that the backend is running and try again.");
  }

  // Errors before streaming started (rate limit, login required) arrive as plain JSON.
  if (!(response.headers.get("content-type") || "").includes("ndjson") || !response.body) {
    const data = await readJsonResponse(response, fallbackError);
    if (!response.ok || data.ok === false) throw new Error(getServerError(data, fallbackError));
    return data;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ApiObject | null = null;

  const handle = (line: string) => {
    if (!line.trim()) return;
    let event: ApiObject;
    try {
      event = JSON.parse(line) as ApiObject;
    } catch {
      return;
    }
    if (event.type === "status" && typeof event.step === "string") onStep(event.step);
    if (event.type === "result") result = event;
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      handle(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  handle(buffer);

  const final = result as ApiObject | null;
  if (!final) throw new Error(fallbackError);
  if (final.ok === false || (typeof final.status === "number" && final.status >= 400)) {
    throw new Error(getServerError(final, fallbackError));
  }
  return final;
}

/* =========================================================
   CITATION NORMALIZATION

   This function does not invent legal sources or links.
   It only accepts citation fields supplied by the backend.
========================================================= */

function normalizeSourceUrl(
  value: unknown,
): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  try {
    const url = new URL(value.trim());

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return undefined;
    }

    return url.href;
  } catch {
    return undefined;
  }
}


function normalizeCitation(
  item: unknown,
  index: number,
): LegalCitation | null {
  if (
    !item ||
    typeof item !== "object" ||
    Array.isArray(item)
  ) {
    return null;
  }

  const citation = item as ApiObject;

  const firstString = (...values: unknown[]): string => {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return "";
  };

  const title = firstString(
    citation.title,
    citation.actTitle,
    citation.sourceName,
    citation.actFile,
    citation.act,
  );

  if (!title) {
    return null;
  }

  const rawSection =
    citation.sectionNumber ??
    citation.section ??
    citation.sectionNo ??
    citation.section_number;

  const sectionNumber =
    typeof rawSection === "string" && rawSection.trim()
      ? rawSection.trim()
      : typeof rawSection === "number"
        ? String(rawSection)
        : null;

  const rawContent = firstString(
    citation.content,
    citation.text,
    citation.excerpt,
    citation.snippet,
    citation.sectionText,
  );

  const rawActFile = firstString(
    citation.actFile,
    citation.act_file,
    citation.file,
    citation.filename,
  );

  const rawSourceUrl =
    citation.sourceUrl ??
    citation.source_url ??
    citation.officialUrl ??
    citation.official_url ??
    citation.url;

  const rawSourceName = firstString(
    citation.sourceName,
    citation.source_name,
  );

  return {
    id: firstString(citation.id, citation.chunkId, citation.chunk_id)
      || `C${index + 1}`,

    title,

    actFile: rawActFile,

    sectionNumber,

    content: rawContent,

    sourceName: rawSourceName || undefined,

    sourceUrl: normalizeSourceUrl(rawSourceUrl),

    repealedBy: typeof citation.repealedBy === "string" && citation.repealedBy ? citation.repealedBy : undefined,
  };
}

function normalizeCitations(
  value: unknown,
): LegalCitation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => normalizeCitation(item, index))
    .filter(
      (item): item is LegalCitation => item !== null,
    );
}

/* =========================================================
   FRONTEND PROTOTYPE AUTHENTICATION

   This is local prototype authentication, not secure
   production authentication. Passwords are not stored.
========================================================= */

type StoredUser = {
  name: string;
  email: string;
};

function saveUser(user: StoredUser): void {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

function loadUser(): StoredUser | null {
  try {
    const saved = localStorage.getItem(USER_STORAGE_KEY);

    if (!saved) {
      return null;
    }

    const parsed: unknown = JSON.parse(saved);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const user = parsed as Record<string, unknown>;

    if (
      typeof user.name !== "string" ||
      typeof user.email !== "string"
    ) {
      return null;
    }

    const name = user.name.trim();
    const email = user.email.trim().toLowerCase();

    if (!name || !email) {
      return null;
    }

    return { name, email };
  } catch {
    localStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }
}

export async function signup(
  name: string,
  email: string,
  password: string,
) {
  await sleep(250);

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanName || !cleanEmail || !password) {
    throw new Error("All fields are required.");
  }

  if (realAuthEnabled) {
    return { offline: false, ...(await realSignup(cleanName, cleanEmail, password)) };
  }

  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  const user: StoredUser = {
    name: cleanName,
    email: cleanEmail,
  };

  saveUser(user);

  return {
    ok: true,
    offline: true,
    user: {
      name: user.name,
      email: user.email,
    },
  };
}

export async function login(
  email: string,
  password: string,
) {
  await sleep(200);

  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail || !password) {
    throw new Error("Email and password are required.");
  }

  if (
    cleanEmail === "demo@ainbodh.local" &&
    password === "demo1234"
  ) {
    const demoUser: StoredUser = {
      name: "AinBodh Demo User",
      email: "demo@ainbodh.local",
    };

    saveUser(demoUser);

    return {
      ok: true,
      offline: true,
      user: demoUser,
    };
  }

  if (realAuthEnabled) {
    const result = await realLogin(cleanEmail, password);
    saveUser(result.user);
    return { ...result, offline: false };
  }

  const savedUser = loadUser();

  if (!savedUser) {
    throw new Error(
      "No account was found. Please sign up first, or use the Offline Demo account.",
    );
  }

  if (savedUser.email !== cleanEmail) {
    throw new Error(
      "No account was found for this email. Please sign up first, or use the Offline Demo account.",
    );
  }

  return {
    ok: true,
    offline: true,
    user: {
      name: savedUser.name,
      email: savedUser.email,
    },
  };
}

/* =========================================================
   UPLOAD DOCUMENT — TEMPORARY METADATA PLACEHOLDER
========================================================= */

export async function uploadDocument(file: File) {
  await sleep(200);

  return {
    id: `doc-${Date.now()}`,
    name: file.name,
    pages: 1,
    type: file.type.includes("pdf")
      ? "PDF document"
      : "Uploaded document",
    size: file.size,
    status: "Processing" as const,
    uploadedAt: Date.now(),
  };
}

/* =========================================================
   ANALYZE DOCUMENT
========================================================= */

export async function analyzeDocument(
  input: {
    file?: File | null;
    text: string;
    language: "en" | "bn";
    documentName?: string;
    pages?: number;
  },
): Promise<AnalysisResponse> {
  const text = input.text.trim();

  if (!text) {
    throw new Error(
      "No verified document text is available for analysis.",
    );
  }

  const { response, data } = await postJson(
    "/api/legal/analyze-document",
    {
      text,
      language: input.language,
      documentName: input.documentName || input.file?.name || "Uploaded document",
      documentType: input.file?.type || "",
      pages: input.pages,
    },
  );

  if (!response.ok || data.ok === false) {
    throw new Error(
      getServerError(
        data,
        `Document analysis failed (${response.status}).`,
      ),
    );
  }

  if (
    !data.analysis ||
    typeof data.analysis !== "object" ||
    Array.isArray(data.analysis)
  ) {
    throw new Error(
      "The server returned an invalid document analysis.",
    );
  }

  const analysis = data.analysis as ApiObject;

  const document: RecentDocument = {
    id:
      typeof analysis.id === "string"
        ? analysis.id
        : `doc-${Date.now()}`,

    name:
      typeof analysis.name === "string"
        ? analysis.name
        : input.file?.name || "Uploaded document",

    type:
      typeof analysis.type === "string"
        ? analysis.type
        : input.file?.type || "Document",

    pages:
      typeof analysis.pages === "number"
        ? analysis.pages
        : 1,

    status: "Reviewed",
    uploadedAt: Date.now(),
  };

  return {
    document,

    overview:
      typeof analysis.overview === "string"
        ? analysis.overview
        : "",

    keyPoints: Array.isArray(analysis.keyPoints)
      ? analysis.keyPoints as AnalysisResponse["keyPoints"]
      : [],

    attention: Array.isArray(analysis.attention)
      ? analysis.attention as AnalysisResponse["attention"]
      : [],

    contradictions: Array.isArray(analysis.contradictions)
      ? analysis.contradictions as AnalysisResponse["contradictions"]
      : [],

    missing: Array.isArray(analysis.missing)
      ? analysis.missing as AnalysisResponse["missing"]
      : [],

    terms: Array.isArray(analysis.terms)
      ? analysis.terms as AnalysisResponse["terms"]
      : [],

    citations: normalizeCitations(analysis.citations),
  };
}

/* =========================================================
   ASK LEGAL QUESTION
========================================================= */

export async function askQuestion(
  question: string,
  documentId?: string,
  history: ChatMessage[] = [],
  language: "en" | "bn" = "en",
  /** The document being discussed, so answers can refer to it. */
  document?: { name?: string; text?: string },
  /** Receives short progress steps while the answer is prepared. */
  onStep?: StepHandler,
): Promise<ChatResponse> {
  const cleanQuestion = question.trim();

  if (!cleanQuestion) {
    throw new Error("Please enter a legal question.");
  }

  /*
   * Support both frontend `text` and backend-style `content`.
   * Sending both avoids losing message text when the backend
   * expects one field or the other.
   *
   * The backend should still be checked to confirm which
   * property it reads when building the model conversation.
   */
  const normalizedHistory = history.map((message) => {
    const messageText =
      typeof message.text === "string"
        ? message.text
        : typeof message.content === "string"
          ? message.content
          : "";

    return {
      role: message.role,
      text: messageText,
      content: messageText,
    };
  });

  const requestBody = {
    question: cleanQuestion,
    documentId,
    history: normalizedHistory.slice(-20),
    language,
    documentName: document?.name,
    documentText: document?.text ? document.text.slice(0, 15000) : undefined,
  };

  let data: ApiObject;
  if (onStep) {
    data = await streamRequest(
      "/api/legal/ask",
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", ...(await authHeaders()) },
        body: JSON.stringify({ ...requestBody, stream: true }),
      },
      onStep,
      "The legal server could not answer this question.",
    );
  } else {
    const posted = await postJson("/api/legal/ask", requestBody);
    data = posted.data;
    if (!posted.response.ok || data.ok === false) {
      throw new Error(
        getServerError(
          data,
          `The legal server could not answer this question (${posted.response.status}).`,
        ),
      );
    }
  }

  const answer =
    typeof data.answer === "string"
      ? data.answer.trim()
      : "";

  if (!answer) {
    throw new Error(
      "The server returned an empty answer. Please check the backend logs.",
    );
  }

  return {
    answer,
    citations: normalizeCitations(data.citations),
    grounded: data.grounded === true,
  };
}

/* =========================================================
   COMPARE DOCUMENTS
========================================================= */

export async function compareDocuments(
  documents: CompareDocumentInput[],
  language: "en" | "bn",
): Promise<CompareResponse> {
  if (!Array.isArray(documents) || documents.length < 2) {
    throw new Error(
      "At least two documents are required for comparison.",
    );
  }

  const validDocuments = documents.filter(
    (document) =>
      document &&
      typeof document.name === "string" &&
      typeof document.text === "string" &&
      Boolean(document.name.trim()) &&
      Boolean(document.text.trim()),
  );

  if (validDocuments.length < 2) {
    throw new Error(
      "At least two readable documents are required for comparison.",
    );
  }

  const { response, data } = await postJson(
    "/api/legal/compare",
    {
      documents: validDocuments,
      language,
    },
  );

  if (!response.ok || data.ok === false) {
    throw new Error(
      getServerError(
        data,
        `Comparison failed (${response.status}).`,
      ),
    );
  }

  if (
    !data.summary ||
    typeof data.summary !== "object" ||
    !Array.isArray(data.findings)
  ) {
    throw new Error(
      "The server returned an invalid comparison result.",
    );
  }

  return {
    findings: data.findings as CompareFinding[],
    summary: data.summary as CompareResponse["summary"],
  };
}

/* =========================================================
   DOCUMENT EXTRACTION
========================================================= */

export type ExtractedPage = {
  pageNumber: number;
  text: string;
  method: "text" | "ocr";
  /** OCR only: confidence 0-100 after image clean-up. */
  confidence?: number;
  quality?: { rating: "good" | "fair" | "poor"; issues: string[] };
  /** OCR only: words read with low confidence, worth checking by eye. */
  uncertainWords?: string[];
};

export type ExtractedDocument = {
  ok?: boolean;
  id: string;
  name: string;
  type: string;
  size: number;
  pages: number;
  extractionMethod: "text" | "ocr" | "mixed";
  text: string;
  pageData: ExtractedPage[];
  warnings: string[];
};

export type ExtractDocumentResponse = {
  ok: boolean;
  id: string;
  name: string;
  type: string;
  size: number;
  pages: number;
  extractionMethod: "text" | "ocr" | "mixed";
  text: string;
  pageData: ExtractedPage[];
  warnings: string[];
};

export async function extractDocument(
  file: File,
): Promise<ExtractedDocument> {
  const formData = new FormData();
  formData.append("file", file);

  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/api/legal/extract`,
      {
        method: "POST",
        headers: await authHeaders(),
        body: formData,
      },
    );
  } catch {
    throw new Error(
      "Could not connect to the document extraction server. Check that the backend is running.",
    );
  }

  const data = await readJsonResponse(
    response,
    "The document extraction server returned an invalid response.",
  );

  if (!response.ok || data.ok !== true) {
    throw new Error(
      getServerError(data, "Document extraction failed."),
    );
  }

  if (
    typeof data.text !== "string" ||
    !data.text.trim()
  ) {
    throw new Error(
      "No readable text was extracted from the document.",
    );
  }

  if (
    typeof data.id !== "string" ||
    typeof data.name !== "string" ||
    typeof data.type !== "string" ||
    typeof data.size !== "number" ||
    typeof data.pages !== "number" ||
    !["text", "ocr", "mixed"].includes(
      String(data.extractionMethod),
    ) ||
    !Array.isArray(data.pageData) ||
    !Array.isArray(data.warnings)
  ) {
    throw new Error(
      "The extraction server returned incomplete document information.",
    );
  }

  return {
    id: data.id,
    name: data.name,
    type: data.type,
    size: data.size,
    pages: data.pages,
    extractionMethod:
      data.extractionMethod as ExtractedDocument["extractionMethod"],
    text: data.text,
    pageData: data.pageData as ExtractedPage[],
    warnings: data.warnings.filter(
      (warning): warning is string =>
        typeof warning === "string",
    ),
  };
}

/* =========================================================
   DOCUMENTS IN CHAT
========================================================= */

export type DocumentAnalysisData = {
  type: string;
  overview: string;
  keyPoints: Array<Record<string, string>>;
  attention: Array<Record<string, string>>;
  missing: Array<Record<string, string>>;
  terms: Array<Record<string, string>>;
  citations: LegalCitation[];
};

export type UploadedDocumentResult = {
  document: { id: string; name: string; type: string; mimeType: string; size: number; pages: number };
  mainText: string;
  excluded: string[];
  hasUnclear: boolean;
  pageData: ExtractedPage[];
  warnings: string[];
  uncertainWords: string[];
  analysis: DocumentAnalysisData;
};

function toAnalysis(raw: unknown): DocumentAnalysisData {
  const analysis = (raw && typeof raw === "object" ? raw : {}) as ApiObject;
  const list = (value: unknown) =>
    Array.isArray(value) ? (value.filter((item) => item && typeof item === "object") as Array<Record<string, string>>) : [];
  return {
    type: typeof analysis.type === "string" ? analysis.type : "",
    overview: typeof analysis.overview === "string" ? analysis.overview : "",
    keyPoints: list(analysis.keyPoints),
    attention: list(analysis.attention),
    missing: list(analysis.missing),
    terms: list(analysis.terms),
    citations: normalizeCitations(analysis.citations),
  };
}

/** Read + clean + analyse an uploaded document, reporting progress steps. */
export async function analyzeUploadedDocument(
  file: File,
  language: "en" | "bn",
  onStep: StepHandler,
): Promise<UploadedDocumentResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("language", language);
  form.append("stream", "true");

  const data = await streamRequest(
    "/api/legal/document",
    { method: "POST", headers: await authHeaders(), body: form },
    onStep,
    language === "bn" ? "নথিটি প্রক্রিয়া করা যায়নি।" : "The document could not be processed.",
  );

  const document = (data.document ?? {}) as UploadedDocumentResult["document"];
  return {
    document: {
      id: String(document.id || `doc-${Date.now()}`),
      name: String(document.name || file.name),
      type: String(document.type || ""),
      mimeType: String(document.mimeType || file.type),
      size: Number(document.size || file.size),
      pages: Number(document.pages || 1),
    },
    mainText: typeof data.mainText === "string" ? data.mainText : "",
    excluded: Array.isArray(data.excluded) ? (data.excluded as string[]) : [],
    hasUnclear: data.hasUnclear === true,
    pageData: Array.isArray(data.pageData) ? (data.pageData as ExtractedPage[]) : [],
    warnings: Array.isArray(data.warnings) ? (data.warnings as string[]) : [],
    uncertainWords: Array.isArray(data.uncertainWords) ? (data.uncertainWords as string[]) : [],
    analysis: toAnalysis(data.analysis),
  };
}

/** Analyse (edited) document text again. */
export async function reanalyzeDocumentText(
  input: { text: string; name: string; pages: number; language: "en" | "bn" },
  onStep: StepHandler,
): Promise<DocumentAnalysisData> {
  const data = await streamRequest(
    "/api/legal/analyze-document",
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", ...(await authHeaders()) },
      body: JSON.stringify({ text: input.text, documentName: input.name, pages: input.pages, language: input.language, stream: true }),
    },
    onStep,
    input.language === "bn" ? "নথি বিশ্লেষণ করা যায়নি।" : "The document could not be analysed.",
  );
  return toAnalysis(data.analysis);
}

/** Translate a message (string or object of strings) without changing its meaning. */
export async function translateContent<T>(payload: T, target: "en" | "bn"): Promise<T> {
  const { response, data } = await postJson("/api/legal/translate", { payload, target });
  if (!response.ok || data.ok === false) {
    throw new Error(getServerError(data, target === "bn" ? "অনুবাদ করা যায়নি।" : "The translation could not be made."));
  }
  return data.translation as T;
}

/* =========================================================
   VOICE — server read-aloud and transcription
========================================================= */

/** Audio (MP3) for one chunk of text. Throws with `status` 501 when not set up. */
export async function fetchSpeech(
  text: string,
  language: "en" | "bn",
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/voice/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", ...(await authHeaders()) },
    body: JSON.stringify({ text, language }),
    signal,
  });

  if (!response.ok) {
    let message = "Read-aloud is not available right now.";
    try {
      const data = (await response.json()) as ApiObject;
      message = getServerError(data, message);
    } catch {
      // keep default
    }
    throw Object.assign(new Error(message), { status: response.status });
  }

  return response.blob();
}

export async function transcribeAudio(
  audio: Blob,
  language: "en" | "bn" | "banglish",
  signal?: AbortSignal,
): Promise<string> {
  const form = new FormData();
  const type = audio.type || "audio/webm";
  const extension = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
  form.append("audio", audio, `speech.${extension}`);
  form.append("language", language);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/voice/transcribe`, {
      method: "POST",
      headers: await authHeaders(),
      body: form,
      signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new Error("Could not connect to the AinBodh server for voice input.");
  }

  const data = await readJsonResponse(response, "Voice input failed.");
  if (!response.ok || data.ok !== true) {
    throw new Error(getServerError(data, "Voice input failed."));
  }
  return typeof data.text === "string" ? data.text : "";
}

/* =========================================================
   OFFLINE DEMO
========================================================= */

export {
  askQuestionOffline,
  isOfflineDemoMode,
} from "./offlineDemo";
