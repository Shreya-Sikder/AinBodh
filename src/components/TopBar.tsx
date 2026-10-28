import { Menu } from "lucide-react";
import { useApp } from "../context/AppContext";
import LanguageToggle from "./LanguageToggle";
import Logo from "./Logo";

export default function TopBar() {
  const { sidebarOpen, setSidebarOpen } = useApp();
  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center border-b border-white/10 bg-navy px-5 shadow-sm">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="icon-button-dark"
          aria-label={sidebarOpen ? "Collapse sidebar" : "Open sidebar"}
        >
          <Menu className="size-[18px]" />
        </button>
        <Logo />
      </div>
      <div className="flex-1" />
      <LanguageToggle compact />
    </header>
  );
}

