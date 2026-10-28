import { FilePlus2, MessageSquareText, Settings, PhoneCall, LogOut, UserCircle2, Route as RouteIcon } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useApp } from "../context/AppContext";

export default function Sidebar() {
  const { currentUser } = useApp();
  const { lang } = useLanguage();
  const { sidebarOpen, logout, startFreshChat } = useApp();
  const navigate = useNavigate();
  const bn = lang === "bn";

  const items = [
    { to: "/upload", icon: FilePlus2, en: "New Inquiry", bn: "নতুন অনুসন্ধান" },
    { to: "/chats", icon: MessageSquareText, en: "My Chats", bn: "আমার চ্যাট" },
    { to: "/helpline", icon: PhoneCall, en: "Emergency Helpline", bn: "জরুরি হেল্পলাইন" },
    { to: "/settings", icon: Settings, en: "Settings", bn: "সেটিংস" },
  ];

  if (!sidebarOpen) return null;

  return (
    <aside className="fixed bottom-0 left-0 top-14 z-40 flex w-[220px] flex-col border-r border-white/10 bg-[#111f38] text-white">
      <button
        type="button"
        onClick={() => navigate("/settings")}
        className="flex h-[73px] items-center gap-2.5 border-b border-white/10 px-4 text-left hover:bg-white/[0.03]"
      >
        <div className="flex size-9 items-center justify-center rounded-full bg-teal text-sm font-bold">{(currentUser?.name?.trim()?.charAt(0) || "A").toUpperCase()}</div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{currentUser?.name || "Account"}</p>
          <p className={`pt-0.5 text-[11px] text-white/45 ${bn ? "bn" : ""}`}>{bn ? "অ্যাকাউন্ট" : "Account"}</p>
        </div>
        <UserCircle2 className="ml-auto size-4 text-white/30" />
      </button>

      <nav className="flex-1 space-y-0.5 px-2 py-2.5">
        {items.map(({ to, icon: Icon, en, bn: bnText }) => (
          <NavLink
            key={to}
            to={to}
            // "New Inquiry" is an explicit request for a new conversation.
            onClick={to === "/upload" ? () => startFreshChat() : undefined}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "sidebar-link-active" : ""}`
            }
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.8} />
            <span className={bn ? "bn" : ""}>{bn ? bnText : en}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 p-2.5">
        <button
          type="button"
          onClick={() => {
            logout();
            navigate("/login");
          }}
          className="sidebar-link text-white/45 hover:text-white/75"
        >
          <LogOut className="size-4" />
          <span className={bn ? "bn" : ""}>{bn ? "লগ আউট" : "Log Out"}</span>
        </button>
      </div>
    </aside>
  );
}

