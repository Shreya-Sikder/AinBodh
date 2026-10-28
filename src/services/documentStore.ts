/*
 * The document currently being worked on — the original file, its extracted
 * pages, the verified text and the analysis — kept in this browser's
 * IndexedDB so it survives a page reload. Nothing here leaves the device.
 *
 * Every call is best-effort: private windows or blocked storage simply
 * mean the document lives in memory for this tab only.
 */

import type { ExtractedPage } from "./api";

export type ActiveDocument = {
  id: string;
  name: string;
  /** MIME type of the original, e.g. application/pdf, image/jpeg. */
  mimeType: string;
  size: number;
  pages: number;
  /** The original uploaded file, for the document viewer. */
  file: Blob | null;
  pageData: ExtractedPage[];
  warnings: string[];
  extractionMethod?: "text" | "ocr" | "mixed";
  verifiedText?: string;
  analysis?: Record<string, unknown> | null;
  savedAt: number;
};

const DB_NAME = "AinBodh";
const STORE = "documents";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

const keyFor = (email?: string | null) => `active:${(email || "guest").trim().toLowerCase()}`;

export async function saveActiveDocument(email: string | null | undefined, document: ActiveDocument | null): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      if (document) store.put(document, keyFor(email));
      else store.delete(keyFor(email));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

export async function loadActiveDocument(email: string | null | undefined): Promise<ActiveDocument | null> {
  const db = await openDb();
  if (!db) return null;
  const result = await new Promise<ActiveDocument | null>((resolve) => {
    try {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(keyFor(email));
      request.onsuccess = () => resolve((request.result as ActiveDocument) ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  db.close();
  return result;
}

/* ---------------------------------------------------------
   Files of documents sent in chats (by document id)
--------------------------------------------------------- */

export type StoredDocumentFile = {
  file: Blob;
  name: string;
  mimeType: string;
  pages: number;
  pageData: ExtractedPage[];
};

export async function saveDocumentFile(id: string, value: StoredDocumentFile): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, `file:${id}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

export async function loadDocumentFile(id: string): Promise<StoredDocumentFile | null> {
  const db = await openDb();
  if (!db) return null;
  const result = await new Promise<StoredDocumentFile | null>((resolve) => {
    try {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(`file:${id}`);
      request.onsuccess = () => resolve((request.result as StoredDocumentFile) ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  db.close();
  return result;
}
