import type { RecentDocument } from "../context/AppContext";

const DOCUMENTS_KEY = "AinBodh-documents";
const CHAT_KEY = "AinBodh-chat-history";

export function saveDocuments(documents: RecentDocument[]) {
  localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(documents));
}

export function loadDocuments(fallback: RecentDocument[]) {
  try {
    const raw = localStorage.getItem(DOCUMENTS_KEY);
    return raw ? (JSON.parse(raw) as RecentDocument[]) : fallback;
  } catch {
    return fallback;
  }
}

export function saveChatHistory<T>(messages: T[]) {
  localStorage.setItem(CHAT_KEY, JSON.stringify(messages));
}

export function loadChatHistory<T>(fallback: T[]) {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    return raw ? (JSON.parse(raw) as T[]) : fallback;
  } catch {
    return fallback;
  }
}

export function clearLocalAinBodhData() {
  localStorage.removeItem(DOCUMENTS_KEY);
  localStorage.removeItem(CHAT_KEY);
  localStorage.removeItem("AinBodh-settings");
}

