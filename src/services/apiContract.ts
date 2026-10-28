/**
 * Backend integration contract for AinBodh.
 *
 * These interfaces describe what the frontend expects from the production API.
 * The current api.ts file provides mock implementations with the same intent.
 * Replace the mock implementations with fetch/axios calls without changing the
 * page components.
 */

export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

export type AuthResponse = {
  accessToken: string;
  refreshToken?: string;
  user: AuthUser;
};

export type UploadResponse = {
  documentId: string;
  filename: string;
  mimeType: string;
  pageCount?: number;
  status: "uploaded" | "processing";
};

export type ExtractionResponse = {
  documentId: string;
  language: "en" | "bn" | "mixed";
  extractedText: string;
  pages: Array<{
    pageNumber: number;
    text: string;
    confidence?: number;
  }>;
  warnings?: string[];
};

export type Evidence = {
  id: string;
  pageNumber: number;
  section?: string;
  quote?: string;
  startOffset?: number;
  endOffset?: number;
};

export type BackendFinding = {
  id: string;
  category: "attention" | "missing" | "contradiction" | "information";
  severity?: "high" | "medium" | "low";
  title: string;
  explanation: string;
  evidence: Evidence[];
  confidence?: number;
};

export type BackendAnalysisResponse = {
  documentId: string;
  language: "en" | "bn";
  overview: string;
  twoMinuteSummary?: string;
  parties: Array<{ role: string; name: string; evidence: Evidence[] }>;
  dates: Array<{ label: string; value: string; evidence: Evidence[] }>;
  amounts: Array<{ label: string; value: string; evidence: Evidence[] }>;
  obligations: Array<{ title: string; explanation: string; evidence: Evidence[] }>;
  findings: BackendFinding[];
  legalTerms: Array<{
    term: string;
    plainEnglish: string;
    plainBangla: string;
    documentContext: string;
    evidence: Evidence[];
  }>;
};

export type ChatRequest = {
  documentId: string;
  conversationId?: string;
  question: string;
  language: "en" | "bn";
};

export type ChatResponse = {
  conversationId: string;
  answer: string;
  evidence: Evidence[];
  confidence?: number;
};

export type ConversationSummary = {
  id: string;
  title: string;
  documentId?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  evidence?: Evidence[];
  createdAt: string;
};

export type CompareRequest = {
  documentIds: string[];
  language: "en" | "bn";
};

export type CompareFinding = {
  id: string;
  topic: string;
  documents: Array<{
    documentId: string;
    value: string;
    evidence: Evidence[];
  }>;
  result: "consistent" | "potential_contradiction" | "needs_review";
};

export type CompareResponse = {
  findings: CompareFinding[];
};

export type ApiError = {
  code: string;
  message: string;
  field?: string;
  retryable?: boolean;
};

export const apiEndpoints = {
  auth: {
    login: "/api/auth/login",
    signup: "/api/auth/signup",
    refresh: "/api/auth/refresh",
    logout: "/api/auth/logout",
  },
  documents: {
    upload: "/api/documents",
    extraction: (id: string) => `/api/documents/${id}/extraction`,
    analysis: (id: string) => `/api/documents/${id}/analysis`,
    file: (id: string) => `/api/documents/${id}/file`,
    delete: (id: string) => `/api/documents/${id}`,
  },
  chat: {
    conversations: "/api/conversations",
    messages: (id: string) => `/api/conversations/${id}/messages`,
  },
  compare: "/api/documents/compare",
  settings: "/api/settings",
};

export function buildAuthHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

export function isApiError(value: unknown): value is ApiError {
  return typeof value === "object" && value !== null && "code" in value && "message" in value;
}

export function evidenceLabel(evidence: Evidence, language: "en" | "bn") {
  const page = language === "bn" ? `পৃষ্ঠা ${evidence.pageNumber}` : `Page ${evidence.pageNumber}`;
  return evidence.section ? `${page} · ${language === "bn" ? "ধারা" : "Section"} ${evidence.section}` : page;
}

