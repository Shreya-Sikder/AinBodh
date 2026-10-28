import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  Clock3,
  Edit3,
  MessageCircle,
  MoreHorizontal,
  Trash2,
} from "lucide-react";

import { useLanguage } from "../context/LanguageContext";
import { useApp } from "../context/AppContext";
import PageFooter from "../components/PageFooter";

function formatChatDate(timestamp: number, bn: boolean) {
  const date = new Date(timestamp);

  const now = new Date();

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString(
      bn ? "bn-BD" : "en-US",
      {
        hour: "numeric",
        minute: "2-digit",
      }
    );
  }

  return date.toLocaleDateString(
    bn ? "bn-BD" : "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );
}

export default function ChatsPage() {
  const { lang } = useLanguage();

  const {
    chatConversations,
    activeChatId,
    selectChat,
    renameChat,
    deleteChat,
  } = useApp();

  const bn = lang === "bn";
  const navigate = useNavigate();

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [editingTitle, setEditingTitle] =
    useState("");

  const [openMenuId, setOpenMenuId] =
    useState<string | null>(null);

  /*
   * Always show most recently updated chats first.
   */
  const chats = useMemo(
    () =>
      [...chatConversations].sort(
        (a, b) => b.updatedAt - a.updatedAt
      ),
    [chatConversations]
  );

  /*
   * If the user enters /chats?id=...
   * open that exact saved conversation.
   *
   * This also lets another page link directly to
   * a particular conversation.
   */
  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search
    );

    const requestedId = params.get("id");

    if (
      requestedId &&
      chatConversations.some(
        (chat) => chat.id === requestedId
      ) &&
      requestedId !== activeChatId
    ) {
      selectChat(requestedId);
    }
  }, [
    chatConversations,
    activeChatId,
    selectChat,
  ]);

  // Open the conversation where it can be read and continued.
  const openChat = (id: string) => {
    selectChat(id);
    navigate("/upload");
  };

  const beginRename = (
    id: string,
    currentTitle: string
  ) => {
    setOpenMenuId(null);
    setEditingId(id);
    setEditingTitle(currentTitle);
  };

  const saveRename = () => {
    if (!editingId) return;

    const cleaned = editingTitle.trim();

    if (cleaned) {
      renameChat(editingId, cleaned);
    }

    setEditingId(null);
    setEditingTitle("");
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  const handleDelete = (id: string) => {
    setOpenMenuId(null);

    const confirmed = window.confirm(
      bn
        ? "এই চ্যাটটি মুছে ফেলতে চান?"
        : "Delete this chat?"
    );

    if (!confirmed) return;

    deleteChat(id);
  };

  return (
    <div className="mx-auto max-w-[1144px] bg-[#f4f6f9]">
      <section className="hero-gradient px-6 pb-6 pt-6 text-white md:px-[52px]">
        <p
          className={`text-[10px] font-bold uppercase tracking-[.7px] text-white/50 ${
            bn ? "bn" : ""
          }`}
        >
          {bn ? "সংরক্ষিত কথোপকথন" : "SAVED CONVERSATIONS"}
        </p>

        <div className="flex items-end justify-between gap-4 pt-2">
          <div>
            <h1
              className={`text-[24px] font-bold tracking-tight ${
                bn ? "bn" : ""
              }`}
            >
              {bn ? "আমার চ্যাট" : "My Chats"}
            </h1>

            <p
              className={`max-w-[620px] pt-2 text-[12px] leading-5 text-white/55 ${
                bn ? "bn" : ""
              }`}
            >
              {bn
                ? "আপনার সংরক্ষিত কথোপকথনগুলো এখানে থাকবে। যেকোনো চ্যাট খুলে আগের জায়গা থেকেই চালিয়ে যেতে পারবেন।"
                : "Your saved conversations appear here. Open any chat to continue exactly where you left off."}
            </p>
          </div>

          <div className="hidden shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 md:block">
            <p className="text-[9px] uppercase tracking-[.6px] text-white/35">
              {bn ? "সংরক্ষিত চ্যাট" : "Saved chats"}
            </p>

            <p className="pt-0.5 text-[16px] font-bold">
              {chats.length}
            </p>
          </div>
        </div>
      </section>

      <main className="px-6 py-6 md:px-[52px]">
        {chats.length === 0 ? (
          <div className="card flex min-h-[330px] flex-col items-center justify-center px-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-tealSoft text-teal">
              <MessageCircle className="size-5" />
            </div>

            <h2
              className={`pt-4 text-[15px] font-bold text-navy ${
                bn ? "bn" : ""
              }`}
            >
              {bn
                ? "এখনও কোনো সংরক্ষিত চ্যাট নেই"
                : "No saved chats yet"}
            </h2>

            <p
              className={`max-w-[440px] pt-2 text-[11px] leading-5 text-muted ${
                bn ? "bn" : ""
              }`}
            >
              {bn
                ? "আপনি যখন AinBodh-এর সাথে কোনো কথোপকথন শুরু করবেন, সেটি স্বয়ংক্রিয়ভাবে এখানে সংরক্ষিত হবে।"
                : "When you start a conversation with AinBodh, it will automatically appear here."}
            </p>
          </div>
        ) : (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2
                className={`text-[13px] font-bold text-navy ${
                  bn ? "bn" : ""
                }`}
              >
                {bn
                  ? "সাম্প্রতিক কথোপকথন"
                  : "Recent conversations"}
              </h2>

              <p
                className={`text-[10px] text-muted ${
                  bn ? "bn" : ""
                }`}
              >
                {bn
                  ? "সর্বশেষ আপডেট অনুযায়ী"
                  : "Sorted by recent activity"}
              </p>
            </div>

            <div className="space-y-2">
              {chats.map((chat) => {
                const isActive =
                  chat.id === activeChatId;

                const lastMessage =
                  chat.messages[
                    chat.messages.length - 1
                  ];

                const preview =
                  lastMessage?.text ??
                  (bn
                    ? "কোনো বার্তা নেই"
                    : "No messages yet");

                const isEditing =
                  editingId === chat.id;

                return (
                  <div
                    key={chat.id}
                    className={`group relative rounded-xl border bg-white transition ${
                      isActive
                        ? "border-teal/40 shadow-sm"
                        : "border-border hover:border-slate-300 hover:shadow-sm"
                    }`}
                  >
                    {isEditing ? (
                      <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                        <input
                          autoFocus
                          value={editingTitle}
                          onChange={(event) =>
                            setEditingTitle(
                              event.target.value
                            )
                          }
                          onKeyDown={(event) => {
                            if (
                              event.key === "Enter"
                            ) {
                              saveRename();
                            }

                            if (
                              event.key === "Escape"
                            ) {
                              cancelRename();
                            }
                          }}
                          className="min-w-0 flex-1 rounded-lg border border-border bg-white px-3 py-2 text-[12px] text-navy outline-none focus:border-teal"
                        />

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={saveRename}
                            className="secondary-btn"
                          >
                            {bn
                              ? "সংরক্ষণ"
                              : "Save"}
                          </button>

                          <button
                            type="button"
                            onClick={cancelRename}
                            className="text-[11px] font-semibold text-muted hover:text-navy"
                          >
                            {bn
                              ? "বাতিল"
                              : "Cancel"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3 p-4">
                        <button
                          type="button"
                          onClick={() =>
                            openChat(chat.id)
                          }
                          className="flex min-w-0 flex-1 items-start gap-3 text-left"
                        >
                          <div
                            className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${
                              isActive
                                ? "bg-teal text-white"
                                : "bg-[#eef5f6] text-teal"
                            }`}
                          >
                            <MessageCircle className="size-4" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3
                                className={`truncate text-[13px] font-bold text-navy ${
                                  bn ? "bn" : ""
                                }`}
                              >
                                {chat.title}
                              </h3>

                              {isActive ? (
                                <span
                                  className={`rounded-full bg-tealSoft px-2 py-0.5 text-[9px] font-semibold text-teal ${
                                    bn ? "bn" : ""
                                  }`}
                                >
                                  {bn
                                    ? "খোলা"
                                    : "Open"}
                                </span>
                              ) : null}
                            </div>

                            <p
                              className={`mt-1 line-clamp-2 text-[11px] leading-5 text-muted ${
                                bn ? "bn" : ""
                              }`}
                            >
                              {preview}
                            </p>

                            <div className="flex flex-wrap items-center gap-3 pt-2 text-[9px] text-muted">
                              <span className="flex items-center gap-1">
                                <Clock3 className="size-3" />

                                {formatChatDate(
                                  chat.updatedAt,
                                  bn
                                )}
                              </span>

                              <span>
                                {chat.messages.length}{" "}
                                {bn
                                  ? "টি বার্তা"
                                  : chat.messages.length ===
                                      1
                                    ? "message"
                                    : "messages"}
                              </span>
                            </div>
                          </div>
                        </button>

                        <div className="relative shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenMenuId(
                                openMenuId ===
                                  chat.id
                                  ? null
                                  : chat.id
                              )
                            }
                            className="flex size-8 items-center justify-center rounded-lg text-muted opacity-100 transition hover:bg-[#f3f5f7] hover:text-navy md:opacity-0 md:group-hover:opacity-100"
                            aria-label={
                              bn
                                ? "চ্যাট অপশন"
                                : "Chat options"
                            }
                          >
                            <MoreHorizontal className="size-4" />
                          </button>

                          {openMenuId ===
                          chat.id ? (
                            <div className="absolute right-0 top-9 z-20 w-36 rounded-lg border border-border bg-white p-1.5 shadow-lg">
                              <button
                                type="button"
                                onClick={() =>
                                  beginRename(
                                    chat.id,
                                    chat.title
                                  )
                                }
                                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] text-navy hover:bg-[#f5f7f8]"
                              >
                                <Edit3 className="size-3.5" />

                                {bn
                                  ? "নাম পরিবর্তন"
                                  : "Rename"}
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handleDelete(
                                    chat.id
                                  )
                                }
                                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="size-3.5" />

                                {bn
                                  ? "মুছে ফেলুন"
                                  : "Delete"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}