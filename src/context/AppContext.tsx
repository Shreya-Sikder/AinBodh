import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  loadActiveDocument,
  saveActiveDocument,
  type ActiveDocument,
} from "../services/documentStore";
import { hasValidSession, realLogout } from "../services/auth";

export type { ActiveDocument } from "../services/documentStore";

export type TextSize = "small" | "medium" | "large";
export type PlaybackSpeed = 0.75 | 1 | 1.25 | 1.5;
export type InputMode = "file" | "text" | "voice";
export type Theme = "light" | "dark";

export type RecentDocument = {
  id: string;
  name: string;
  pages: number;
  type: string;
  size?: number;
  status: "Reviewed" | "Processing";
  uploadedAt: number;
};

export type ChatCitation = {
  id: string;
  title: string;
  actFile: string;
  sectionNumber: string | null;
  content: string;
  sourceName?: string;
  sourceUrl?: string;
};

/** A file the person attached to a message. */
export type MessageAttachment = {
  name: string;
  size: number;
  mimeType: string;
  /** Set once the document has been read; the file itself is kept in IndexedDB. */
  documentId?: string;
};

/** A key point / item in a document analysis. */
export type AnalysisItem = Record<string, string>;

/** The result of reading + analysing an uploaded document, shown as a chat message. */
export type DocumentAnalysisMessage = {
  id: string;
  name: string;
  mimeType: string;
  pages: number;
  /** The main passage only (no stamps, signatures, page numbers). Editable. */
  mainText: string;
  edited?: boolean;
  excluded: string[];
  hasUnclear: boolean;
  warnings: string[];
  uncertainWords: string[];
  type: string;
  overview: string;
  keyPoints: AnalysisItem[];
  attention: AnalysisItem[];
  missing: AnalysisItem[];
  terms: AnalysisItem[];
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations?: ChatCitation[];
  createdAt: number;
  attachment?: MessageAttachment;
  document?: DocumentAnalysisMessage;
  /** Short progress steps shown as "Thought for N s". */
  steps?: string[];
  thinkingMs?: number;
  /** A saved translation of this message (text answers or document analyses). */
  translation?: { language: "en" | "bn"; text?: string; document?: Partial<DocumentAnalysisMessage> };
};

export type ChatConversation = {
  id: string;
  title: string;
  titleManuallySet?: boolean;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};

/* =========================================================
   STORAGE
========================================================= */

const CHAT_STORAGE_KEY =
  "AinBodh-chat-conversations";

const ACTIVE_CHAT_KEY =
  "AinBodh-active-chat";

const AUTH_STORAGE_KEY =
  "AinBodh-auth";

const USER_STORAGE_KEY =
  "AinBodh-user";

/* =========================================================
   CONTEXT TYPES
========================================================= */

type AppUser = {
  name: string;
  email: string;
};

type AppContextValue = {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  /* Accessibility & appearance */
  textSize: TextSize;
  setTextSize: (size: TextSize) => void;

  voiceEnabled: boolean;
  setVoiceEnabled: (enabled: boolean) => void;

  contrast: boolean;
  setContrast: (enabled: boolean) => void;

  simpleLanguage: boolean;
  setSimpleLanguage: (enabled: boolean) => void;

  playbackSpeed: PlaybackSpeed;
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;

  theme: Theme;
  setTheme: (theme: Theme) => void;

  /* Authentication */
  authenticated: boolean;
  setAuthenticated: (value: boolean) => void;

  currentUser: AppUser | null;
  setCurrentUser: (user: AppUser | null) => void;

  logout: () => void;

  /* Documents */
  recentDocuments: RecentDocument[];
  addDocument: (document: RecentDocument) => void;
  removeDocument: (id: string) => void;

  selectedDocument: RecentDocument | null;
  setSelectedDocument: (
    document: RecentDocument | null
  ) => void;

  /* Input */
  pendingFile: File | null;
  pendingText: string;
  inputMode: InputMode;
  setInputMode: (mode: InputMode) => void;

  setPendingInput: (
    file: File | null,
    text: string
  ) => void;

  clearPendingInput: () => void;

  /* Verification */
  verifiedText: string;
  setVerifiedText: (text: string) => void;

  /*
   * The document being reviewed/analysed: original file + extracted pages
   * (+ analysis). Survives navigation and reloads (IndexedDB, this browser only).
   */
  activeDocument: ActiveDocument | null;
  setActiveDocument: (document: ActiveDocument | null) => void;
  updateActiveDocument: (changes: Partial<ActiveDocument>) => void;

  /* Chat */
  chatConversations: ChatConversation[];
  activeChatId: string | null;
  chatMessages: ChatMessage[];

  createChat: () => string;
  startFreshChat: () => void;
  selectChat: (id: string) => void;

  /*
   * IMPORTANT:
   * addMessage now RETURNS the chat ID.
   * This fixes the first-message race.
   */
  addMessage: (message: ChatMessage) => string;

  addMessageToChat: (
    chatId: string,
    message: ChatMessage
  ) => void;

  /** Change a message in place (edited document text, saved translation). */
  updateMessage: (
    chatId: string,
    messageId: string,
    changes: Partial<ChatMessage>
  ) => void;

  clearChat: () => void;
  deleteChat: (id: string) => void;

  renameChat: (
    id: string,
    title: string
  ) => void;

  /* Notifications */
  toast: string | null;
  notify: (message: string) => void;
  clearToast: () => void;
};

/* =========================================================
   CONTEXT
========================================================= */

const AppContext =
  createContext<AppContextValue | undefined>(
    undefined
  );

/* =========================================================
   HELPERS
========================================================= */

function makeChatId() {
  return `chat-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function generateChatTitle(text: string) {
  const cleaned = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?。！？]+$/, "");

  if (!cleaned) {
    return "New chat";
  }

  const maxLength = 52;

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned
    .slice(0, maxLength)
    .trim()}…`;
}

/*
 * Chats are stored per account ("AinBodh-chat-conversations:<email>") so
 * people sharing a browser don't see each other's conversations. Chats saved
 * by older versions under the shared key move to the first account that logs in.
 */
function chatKeyFor(email?: string | null): string | null {
  return email ? `${CHAT_STORAGE_KEY}:${email.trim().toLowerCase()}` : null;
}

function activeKeyFor(email?: string | null): string | null {
  return email ? `${ACTIVE_CHAT_KEY}:${email.trim().toLowerCase()}` : null;
}

function loadSavedChats(key: string | null): ChatConversation[] {
  if (!key) return [];

  try {
    if (
      localStorage.getItem(key) === null &&
      localStorage.getItem(CHAT_STORAGE_KEY) !== null
    ) {
      localStorage.setItem(key, localStorage.getItem(CHAT_STORAGE_KEY) as string);
      localStorage.removeItem(CHAT_STORAGE_KEY);
      const legacyActive = localStorage.getItem(ACTIVE_CHAT_KEY);
      const activeKey = key.replace(CHAT_STORAGE_KEY, ACTIVE_CHAT_KEY);
      if (legacyActive) localStorage.setItem(activeKey, legacyActive);
      localStorage.removeItem(ACTIVE_CHAT_KEY);
    }

    const saved =
      localStorage.getItem(
        key
      );

    if (!saved) {
      return [];
    }

    const parsed = JSON.parse(saved);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (chat): chat is ChatConversation =>
        Boolean(
          chat &&
            typeof chat.id === "string" &&
            typeof chat.title === "string" &&
            Array.isArray(chat.messages) &&
            typeof chat.createdAt === "number" &&
            typeof chat.updatedAt === "number"
        )
    );
  } catch {
    return [];
  }
}

function loadSavedUser(): AppUser | null {
  try {
    const saved =
      localStorage.getItem(
        USER_STORAGE_KEY
      );

    if (!saved) {
      return null;
    }

    const parsed = JSON.parse(saved);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.name !== "string" ||
      typeof parsed.email !== "string"
    ) {
      return null;
    }

    return {
      name: parsed.name,
      email: parsed.email,
    };
  } catch {
    return null;
  }
}

/* =========================================================
   PROVIDER
========================================================= */

export function AppProvider({
  children,
}: {
  children: ReactNode;
}) {
  /* =========================================================
     SIDEBAR
  ========================================================= */

  const [sidebarOpen, setSidebarOpen] =
    useState(true);

  /* =========================================================
     ACCESSIBILITY
  ========================================================= */

  const [textSize, setTextSizeState] =
    useState<TextSize>("medium");

  const [voiceEnabled, setVoiceEnabled] =
    useState(true);

  const [contrast, setContrastState] =
    useState(false);

  const [simpleLanguage, setSimpleLanguage] =
    useState(false);

  const [playbackSpeed, setPlaybackSpeed] =
    useState<PlaybackSpeed>(1);

  const [theme, setThemeState] =
    useState<Theme>("light");

  /* =========================================================
     AUTHENTICATION
  ========================================================= */

  // With real accounts configured, "logged in" also requires a stored session.
  const [authenticated, setAuthenticated] =
    useState(
      () =>
        localStorage.getItem(
          AUTH_STORAGE_KEY
        ) === "true" && hasValidSession()
    );

  const [currentUser, setCurrentUser] =
    useState<AppUser | null>(
      () => loadSavedUser()
    );

  /* =========================================================
     DOCUMENTS
     
     NOTE:
     This is still existing demo state.
     We will remove the document dummy data when the
     real upload/analysis flow is fully connected.
  ========================================================= */

  const [recentDocuments, setRecentDocuments] =
    useState<RecentDocument[]>([]);

  const [selectedDocument, setSelectedDocument] =
    useState<RecentDocument | null>(null);

  /* =========================================================
     INPUT
  ========================================================= */

  const [pendingFile, setPendingFile] =
    useState<File | null>(null);

  const [pendingText, setPendingText] =
    useState("");

  const [inputMode, setInputMode] =
    useState<InputMode>("file");

  /* =========================================================
     VERIFIED TEXT
  ========================================================= */

  /*
   * Start empty.
   * The real uploaded/verified document will populate this.
   */
  const [verifiedText, setVerifiedText] =
    useState("");

  const [activeDocument, setActiveDocumentState] =
    useState<ActiveDocument | null>(null);

  /* =========================================================
     CHAT
  ========================================================= */

  const userEmail = currentUser?.email ?? null;

  const [chatConversations, setChatConversations] =
    useState<ChatConversation[]>(
      () => loadSavedChats(chatKeyFor(loadSavedUser()?.email))
    );

  const [activeChatId, setActiveChatId] =
    useState<string | null>(() => {
      const email = loadSavedUser()?.email;
      const savedChats =
        loadSavedChats(chatKeyFor(email));

      const activeKey = activeKeyFor(email);
      const savedActiveId =
        activeKey ? localStorage.getItem(activeKey) : null;

      if (
        savedActiveId &&
        savedChats.some(
          (chat) =>
            chat.id === savedActiveId
        )
      ) {
        return savedActiveId;
      }

      return null;
    });

  /* =========================================================
     TOAST
  ========================================================= */

  const [toast, setToast] =
    useState<string | null>(null);

  /* =========================================================
     SETTINGS LOAD
  ========================================================= */

  useEffect(() => {
    const saved =
      localStorage.getItem(
        "AinBodh-settings"
      );

    if (!saved) return;

    try {
      const value = JSON.parse(saved);

      const savedTextSize: TextSize =
        value.textSize === "small" ||
        value.textSize === "large" ||
        value.textSize === "medium"
          ? value.textSize
          : "medium";

      const savedSpeed: PlaybackSpeed =
        value.playbackSpeed === 0.75 ||
        value.playbackSpeed === 1 ||
        value.playbackSpeed === 1.25 ||
        value.playbackSpeed === 1.5
          ? value.playbackSpeed
          : 1;

      const savedTheme: Theme =
        value.theme === "dark"
          ? "dark"
          : "light";

      setTextSizeState(savedTextSize);
      setVoiceEnabled(
        value.voiceEnabled ?? true
      );
      setContrastState(
        value.contrast ?? false
      );
      setSimpleLanguage(
        value.simpleLanguage ?? false
      );
      setPlaybackSpeed(savedSpeed);
      setThemeState(savedTheme);
    } catch {
      /* Ignore malformed preferences. */
    }
  }, []);

  /* =========================================================
     APPLY SETTINGS
  ========================================================= */

  useEffect(() => {
    const root =
      document.documentElement;

    root.dataset.textSize = textSize;

    root.dataset.contrast =
      contrast
        ? "high"
        : "normal";

    root.dataset.theme = theme;

    root.style.colorScheme = theme;
  }, [
    textSize,
    contrast,
    theme,
  ]);

  /* =========================================================
     SAVE SETTINGS
  ========================================================= */

  useEffect(() => {
    localStorage.setItem(
      "AinBodh-settings",
      JSON.stringify({
        textSize,
        voiceEnabled,
        contrast,
        simpleLanguage,
        playbackSpeed,
        theme,
      })
    );
  }, [
    textSize,
    voiceEnabled,
    contrast,
    simpleLanguage,
    playbackSpeed,
    theme,
  ]);

  /* =========================================================
     SWITCH ACCOUNT → LOAD THAT ACCOUNT'S CHATS
  ========================================================= */

  const loadedChatKey = useRef<string | null>(chatKeyFor(loadSavedUser()?.email));

  useEffect(() => {
    const key = chatKeyFor(userEmail);
    if (key === loadedChatKey.current) return;

    loadedChatKey.current = key;
    const chats = loadSavedChats(key);
    const activeKey = activeKeyFor(userEmail);
    const savedActive = activeKey ? localStorage.getItem(activeKey) : null;

    setChatConversations(chats);
    setActiveChatId(savedActive && chats.some((chat) => chat.id === savedActive) ? savedActive : null);
  }, [userEmail]);

  /* =========================================================
     SAVE CHATS
  ========================================================= */

  useEffect(() => {
    const key = loadedChatKey.current;
    if (!key) return;

    try {
      localStorage.setItem(
        key,
        JSON.stringify(
          chatConversations
        )
      );
    } catch (error) {
      console.error(
        "Could not save AinBodh chats:",
        error
      );
    }
  }, [
    chatConversations,
  ]);

  /* =========================================================
     SAVE ACTIVE CHAT
  ========================================================= */

  useEffect(() => {
    const key = activeKeyFor(userEmail);
    if (!key || chatKeyFor(userEmail) !== loadedChatKey.current) return;

    if (activeChatId) {
      localStorage.setItem(key, activeChatId);
    } else {
      localStorage.removeItem(key);
    }
  }, [
    activeChatId,
    userEmail,
  ]);

  /* =========================================================
     SAVE AUTH
  ========================================================= */

  useEffect(() => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      authenticated
        ? "true"
        : "false"
    );
  }, [
    authenticated,
  ]);

  /* =========================================================
     SAVE USER
  ========================================================= */

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(
        USER_STORAGE_KEY,
        JSON.stringify(
          currentUser
        )
      );
    } else {
      localStorage.removeItem(
        USER_STORAGE_KEY
      );
    }
  }, [
    currentUser,
  ]);

  /* =========================================================
     TOAST
  ========================================================= */

  useEffect(() => {
    if (!toast) return;

    const timer =
      window.setTimeout(
        () => setToast(null),
        2800
      );

    return () =>
      window.clearTimeout(timer);
  }, [toast]);

  /* =========================================================
     CREATE CHAT
  ========================================================= */

  const createChat = useCallback(() => {
    const now = Date.now();
    const id = makeChatId();

    const chat: ChatConversation = {
      id,
      title: "New chat",
      titleManuallySet: false,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };

    setChatConversations(
      (current) => [
        chat,
        ...current,
      ]
    );

    setActiveChatId(id);

    return id;
  }, []);

  /* =========================================================
     START FRESH CHAT
     
     Does NOT create an empty saved chat.
     The next user message creates the conversation.
  ========================================================= */

  const startFreshChat =
    useCallback(() => {
      setActiveChatId(null);
    }, []);

  /* =========================================================
     SELECT CHAT
  ========================================================= */

  const selectChat =
    useCallback(
      (id: string) => {
        // Validate against the current render's conversation list.
        // Do not call another state setter from inside a state updater.
        const exists = chatConversations.some(
          (chat) => chat.id === id
        );

        if (exists) {
          setActiveChatId(id);
        }
      },
      [chatConversations]
    );

  /* =========================================================
     ADD MESSAGE TO SPECIFIC CHAT
  ========================================================= */

  const addMessageToChat =
    useCallback(
      (
        chatId: string,
        message: ChatMessage
      ) => {
        setChatConversations(
          (current) =>
            current.map(
              (chat) => {
                if (chat.id !== chatId) {
                  return chat;
                }

                // A retried event must never append the same message twice.
                if (chat.messages.some((item) => item.id === message.id)) {
                  return chat;
                }

                const hasUserMessage =
                  chat.messages.some(
                    (item) =>
                      item.role ===
                      "user"
                  );

                const shouldAutoTitle =
                  message.role ===
                    "user" &&
                  !hasUserMessage &&
                  !chat.titleManuallySet;

                return {
                  ...chat,

                  title:
                    shouldAutoTitle
                      ? generateChatTitle(
                          message.text || message.attachment?.name || ""
                        )
                      : chat.title,

                  messages: [
                    ...chat.messages,
                    message,
                  ],

                  updatedAt:
                    Date.now(),
                };
              }
            )
        );
      },
      []
    );

  /* =========================================================
     ADD MESSAGE
     
     IMPORTANT:
     Returns the exact chat ID used.
     
     This is what prevents the first user message and
     assistant response from ending up in different chats.
  ========================================================= */

  const addMessage =
    useCallback(
      (
        message: ChatMessage
      ): string => {
        const existingId =
          activeChatId;

        if (existingId) {
          const exists =
            chatConversations.some(
              (chat) =>
                chat.id ===
                existingId
            );

          if (exists) {
            addMessageToChat(
              existingId,
              message
            );

            return existingId;
          }
        }

        const now = Date.now();
        const id = makeChatId();

        const newChat:
          ChatConversation = {
          id,

          title:
            message.role === "user"
              ? generateChatTitle(
                  message.text || message.attachment?.name || ""
                )
              : "New chat",

          titleManuallySet: false,

          messages: [
            message,
          ],

          createdAt: now,

          updatedAt: now,
        };

        setChatConversations(
          (current) => [
            newChat,
            ...current,
          ]
        );

        setActiveChatId(id);

        return id;
      },
      [
        activeChatId,
        chatConversations,
        addMessageToChat,
      ]
    );

  /* =========================================================
     CLEAR CURRENT CHAT
  ========================================================= */

  const clearChat =
    useCallback(() => {
      if (!activeChatId) {
        return;
      }

      setChatConversations(
        (current) =>
          current.map(
            (chat) =>
              chat.id ===
              activeChatId
                ? {
                    ...chat,
                    messages: [],
                    title:
                      "New chat",
                    titleManuallySet:
                      false,
                    updatedAt:
                      Date.now(),
                  }
                : chat
          )
      );
    }, [
      activeChatId,
    ]);

  /* =========================================================
     DELETE CHAT
  ========================================================= */

  const deleteChat =
    useCallback(
      (id: string) => {
        const remaining = chatConversations.filter(
          (chat) => chat.id !== id
        );

        if (remaining.length === chatConversations.length) {
          return;
        }

        setChatConversations(remaining);

        if (activeChatId === id) {
          setActiveChatId(remaining[0]?.id ?? null);
        }
      },
      [activeChatId, chatConversations]
    );

  /* =========================================================
     RENAME CHAT
  ========================================================= */

  const updateMessage =
    useCallback(
      (chatId: string, messageId: string, changes: Partial<ChatMessage>) => {
        setChatConversations((current) =>
          current.map((chat) =>
            chat.id !== chatId
              ? chat
              : {
                  ...chat,
                  messages: chat.messages.map((message) =>
                    message.id === messageId ? { ...message, ...changes } : message
                  ),
                  updatedAt: Date.now(),
                }
          )
        );
      },
      []
    );

  const renameChat =
    useCallback(
      (
        id: string,
        title: string
      ) => {
        const cleaned =
          title
            .replace(
              /\s+/g,
              " "
            )
            .trim();

        if (!cleaned) {
          return;
        }

        setChatConversations(
          (current) =>
            current.map(
              (chat) =>
                chat.id === id
                  ? {
                      ...chat,
                      title:
                        cleaned.slice(
                          0,
                          100
                        ),
                      titleManuallySet:
                        true,
                      updatedAt:
                        Date.now(),
                    }
                  : chat
            )
        );
      },
      []
    );

  /* =========================================================
     ACTIVE CHAT
  ========================================================= */

  const activeConversation =
    chatConversations.find(
      (chat) =>
        chat.id ===
        activeChatId
    );

  const chatMessages =
    activeConversation
      ?.messages ?? [];

  /* =========================================================
     DOCUMENT ACTIONS
  ========================================================= */

  const addDocument =
    useCallback(
      (
        document: RecentDocument
      ) => {
        setRecentDocuments(
          (current) => [
            document,
            ...current.filter(
              (item) =>
                item.id !==
                document.id
            ),
          ]
        );

        setSelectedDocument(
          document
        );
      },
      []
    );

  const removeDocument =
    useCallback(
      (id: string) => {
        setRecentDocuments(
          (current) =>
            current.filter(
              (document) =>
                document.id !==
                id
            )
        );

        setSelectedDocument(
          (current) =>
            current?.id === id
              ? null
              : current
        );
      },
      []
    );

  /* =========================================================
     ACTIVE DOCUMENT (persisted per account in IndexedDB)
  ========================================================= */

  const activeDocumentRef = useRef<ActiveDocument | null>(null);

  const setActiveDocument = useCallback(
    (document: ActiveDocument | null) => {
      activeDocumentRef.current = document;
      setActiveDocumentState(document);
      void saveActiveDocument(userEmail, document);
    },
    [userEmail]
  );

  const updateActiveDocument = useCallback(
    (changes: Partial<ActiveDocument>) => {
      const current = activeDocumentRef.current;
      if (!current) return;
      const next = { ...current, ...changes, savedAt: Date.now() };
      activeDocumentRef.current = next;
      setActiveDocumentState(next);
      void saveActiveDocument(userEmail, next);
    },
    [userEmail]
  );

  // Restore the last document after a reload (or when another account logs in).
  useEffect(() => {
    let cancelled = false;
    void loadActiveDocument(userEmail).then((saved) => {
      if (cancelled) return;
      activeDocumentRef.current = saved;
      setActiveDocumentState(saved);
      if (saved?.verifiedText) {
        setVerifiedText((current) => current || saved.verifiedText || "");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userEmail]);

  /* =========================================================
     LOGOUT
  ========================================================= */

  const logout =
    useCallback(() => {
      void realLogout();
      setAuthenticated(false);
      setCurrentUser(null);

      /*
       * Do not delete chat history here.
       * Chats should remain available in this browser.
       */
      setActiveChatId(null);
      setSelectedDocument(null);
      setVerifiedText("");
      activeDocumentRef.current = null;
      setActiveDocumentState(null);
    }, []);

  /* =========================================================
     CONTEXT VALUE
  ========================================================= */

  const value =
    useMemo<AppContextValue>(
      () => ({
        /* Sidebar */
        sidebarOpen,
        setSidebarOpen,

        /* Accessibility */
        textSize,
        setTextSize:
          setTextSizeState,

        voiceEnabled,
        setVoiceEnabled,

        contrast,
        setContrast:
          setContrastState,

        simpleLanguage,
        setSimpleLanguage,

        playbackSpeed,
        setPlaybackSpeed,

        /* Appearance */
        theme,
        setTheme:
          setThemeState,

        /* Authentication */
        authenticated,
        setAuthenticated,

        currentUser,
        setCurrentUser,

        logout,

        /* Documents */
        recentDocuments,
        addDocument,
        removeDocument,

        selectedDocument,
        setSelectedDocument,

        /* Input */
        pendingFile,
        pendingText,
        inputMode,
        setInputMode,

        setPendingInput: (
          file,
          text
        ) => {
          setPendingFile(file);
          setPendingText(text);
        },

        clearPendingInput: () => {
          setPendingFile(null);
          setPendingText("");
        },

        /* Verification */
        verifiedText,
        setVerifiedText,

        activeDocument,
        setActiveDocument,
        updateActiveDocument,

        /* Chat */
        chatConversations,
        activeChatId,
        chatMessages,

        createChat,
        startFreshChat,
        selectChat,
        addMessage,
        addMessageToChat,
        updateMessage,
        clearChat,
        deleteChat,
        renameChat,

        /* Notifications */
        toast,

        notify: (
          message: string
        ) => {
          setToast(message);
        },

        clearToast: () => {
          setToast(null);
        },
      }),
      [
        sidebarOpen,
        textSize,
        voiceEnabled,
        contrast,
        simpleLanguage,
        playbackSpeed,
        theme,

        authenticated,
        currentUser,

        recentDocuments,
        addDocument,
        removeDocument,

        selectedDocument,

        pendingFile,
        pendingText,
        inputMode,

        verifiedText,
        activeDocument,
        setActiveDocument,
        updateActiveDocument,

        chatConversations,
        activeChatId,
        chatMessages,

        createChat,
        startFreshChat,
        selectChat,
        addMessage,
        addMessageToChat,
        updateMessage,
        clearChat,
        deleteChat,
        renameChat,

        toast,

        logout,
      ]
    );

  return (
    <AppContext.Provider
      value={value}
    >
      {children}
    </AppContext.Provider>
  );
}

/* =========================================================
   USE APP
========================================================= */

export function useApp() {
  const value =
    useContext(AppContext);

  if (!value) {
    throw new Error(
      "useApp must be used inside AppProvider"
    );
  }

  return value;
}