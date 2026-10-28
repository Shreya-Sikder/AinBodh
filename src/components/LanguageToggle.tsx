import { useLanguage } from "../context/LanguageContext";

export default function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { lang, toggleLang } = useLanguage();
  const bn = lang === "bn";

  return (
    <button
      type="button"
      onClick={toggleLang}
      aria-label="Toggle language"
      className={`lang-toggle ${compact ? "lang-toggle-compact" : ""}`}
    >
      <span className={bn ? "lang-active" : "lang-muted"}>বাংলা</span>
      <span className="lang-switch">
        <span className={bn ? "lang-dot-left" : "lang-dot-right"} />
      </span>
      <span className={!bn ? "lang-active" : "lang-muted"}>EN</span>
    </button>
  );
}

