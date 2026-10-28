import {
  Contrast,
  Languages,
  Moon,
  RotateCcw,
  ShieldCheck,
  Sun,
  Type,
  Volume2,
} from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import {
  useApp,
  type PlaybackSpeed,
  type TextSize,
  type Theme,
} from "../context/AppContext";
import PageFooter from "../components/PageFooter";

function Toggle({
  enabled,
  onClick,
}: {
  enabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`toggle ${enabled ? "toggle-on" : ""}`}
      aria-pressed={enabled}
    >
      <span />
    </button>
  );
}

export default function SettingsPage() {
  const { lang, setLang } = useLanguage();

  const {
    textSize,
    setTextSize,
    voiceEnabled,
    setVoiceEnabled,
    contrast,
    setContrast,
    simpleLanguage,
    setSimpleLanguage,
    playbackSpeed,
    setPlaybackSpeed,
    theme,
    setTheme,
    notify,
  } = useApp();

  const bn = lang === "bn";

  const sizes: Array<[TextSize, string, string]> = [
    ["small", bn ? "ছোট" : "Small", "90%"],
    ["medium", bn ? "মাঝারি" : "Medium", "100%"],
    ["large", bn ? "বড়" : "Large", "115%"],
  ];

  const speeds: Array<[PlaybackSpeed, string]> = [
    [0.75, "0.75×"],
    [1, "1×"],
    [1.25, "1.25×"],
    [1.5, "1.5×"],
  ];

  const reset = () => {
    setTextSize("medium");
    setVoiceEnabled(true);
    setContrast(false);
    setSimpleLanguage(false);
    setPlaybackSpeed(1);
    setTheme("light");

    notify(
      bn
        ? "ডিফল্ট সেটিংসে ফিরে গেছে।"
        : "Settings reset to defaults."
    );
  };

  return (
    <div className="mx-auto max-w-[1144px]">
      {/* HERO */}
      <section className="hero-gradient px-6 py-5 text-white md:px-[52px]">
        <p className="text-[10px] font-bold uppercase tracking-[.7px] text-white/50">
          {bn ? "পছন্দসমূহ" : "PREFERENCES"}
        </p>

        <h1
          className={`pt-1.5 text-[22px] font-bold ${
            bn ? "bn" : ""
          }`}
        >
          {bn ? "অ্যাক্সেসিবিলিটি ও সেটিংস" : "Accessibility & Settings"}
        </h1>

        <p
          className={`pt-1 text-[12px] text-white/60 ${
            bn ? "bn" : ""
          }`}
        >
          {bn
            ? "আপনার AinBodh অভিজ্ঞতা কাস্টমাইজ করুন।"
            : "Customize your AinBodh experience."}
        </p>
      </section>

      <div className="grid gap-3 px-6 py-6 md:grid-cols-2 md:px-[52px]">
        {/* LANGUAGE */}
        <div className="card p-5">
          <div className="flex items-start gap-3">
            <Languages className="size-5 text-teal" />

            <div className="flex-1">
              <h2 className={`section-title ${bn ? "bn" : ""}`}>
                {bn ? "ভাষা" : "Language"}
              </h2>

              <p
                className={`pt-1 text-[11px] text-muted ${
                  bn ? "bn" : ""
                }`}
              >
                {bn
                  ? "সমস্ত এআই উত্তর নির্বাচিত ভাষায় প্রদর্শিত হবে।"
                  : "All AI responses will appear in the selected language."}
              </p>

              <div className="grid grid-cols-2 gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setLang("en")}
                  className={`settings-choice ${
                    lang === "en"
                      ? "settings-choice-active"
                      : ""
                  }`}
                >
                  English
                </button>

                <button
                  type="button"
                  onClick={() => setLang("bn")}
                  className={`settings-choice ${
                    lang === "bn"
                      ? "settings-choice-active"
                      : ""
                  }`}
                >
                  বাংলা
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* TEXT SIZE */}
        <div className="card p-5">
          <div className="flex items-start gap-3">
            <Type className="size-5 text-teal" />

            <div className="flex-1">
              <h2 className={`section-title ${bn ? "bn" : ""}`}>
                {bn ? "লেখার আকার" : "Text Size"}
              </h2>

              <p
                className={`pt-1 text-[11px] text-muted ${
                  bn ? "bn" : ""
                }`}
              >
                {bn
                  ? "পুরো অ্যাপের লেখার আকার পরিবর্তন করুন।"
                  : "Change the text size across the application."}
              </p>

              <div className="grid grid-cols-3 gap-2 pt-3">
                {sizes.map(([id, label, scale]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTextSize(id)}
                    className={`settings-choice ${
                      textSize === id
                        ? "settings-choice-active"
                        : ""
                    }`}
                  >
                    <span>{label}</span>
                    <small>{scale}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* THEME */}
        <div className="card p-5">
          <div className="flex items-start gap-3">
            {theme === "dark" ? (
              <Moon className="size-5 text-teal" />
            ) : (
              <Sun className="size-5 text-teal" />
            )}

            <div className="flex-1">
              <h2 className={`section-title ${bn ? "bn" : ""}`}>
                {bn ? "দেখার ধরন" : "Appearance"}
              </h2>

              <p
                className={`pt-1 text-[11px] text-muted ${
                  bn ? "bn" : ""
                }`}
              >
                {bn
                  ? "দিন বা রাতের জন্য AinBodh-এর চেহারা বেছে নিন।"
                  : "Choose a light or dark appearance for AinBodh."}
              </p>

              <div className="grid grid-cols-2 gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  className={`settings-choice flex items-center justify-center gap-2 ${
                    theme === "light"
                      ? "settings-choice-active"
                      : ""
                  }`}
                  aria-pressed={theme === "light"}
                >
                  <Sun className="size-4" />
                  <span>{bn ? "দিন" : "Day"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  className={`settings-choice flex items-center justify-center gap-2 ${
                    theme === "dark"
                      ? "settings-choice-active"
                      : ""
                  }`}
                  aria-pressed={theme === "dark"}
                >
                  <Moon className="size-4" />
                  <span>{bn ? "রাত" : "Night"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* VOICE */}
        <div className="card p-5">
          <div className="flex items-start gap-3">
            <Volume2 className="size-5 text-teal" />

            <div className="flex-1">
              <h2 className={`section-title ${bn ? "bn" : ""}`}>
                {bn ? "ভয়েস সেটিংস" : "Voice Settings"}
              </h2>

              <div className="flex items-center justify-between pt-3">
                <div>
                  <p
                    className={`text-[13px] text-navy ${
                      bn ? "bn" : ""
                    }`}
                  >
                    {bn
                      ? "ভয়েস সহায়ক চালু করুন"
                      : "Enable voice assistant"}
                  </p>

                  <p
                    className={`pt-1 text-[10px] text-muted ${
                      bn ? "bn" : ""
                    }`}
                  >
                    {bn
                      ? "ব্যাখ্যা পড়ে শোনানোর সুবিধা চালু করুন।"
                      : "Enable read-aloud controls for explanations."}
                  </p>
                </div>

                <Toggle
                  enabled={voiceEnabled}
                  onClick={() =>
                    setVoiceEnabled(!voiceEnabled)
                  }
                />
              </div>

              <p
                className={`pt-4 text-[11px] text-muted ${
                  bn ? "bn" : ""
                }`}
              >
                {bn ? "অডিও প্লেব্যাক গতি" : "Audio playback speed"}
              </p>

              <div className="grid grid-cols-4 gap-1.5 pt-2">
                {speeds.map(([speed, label]) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => setPlaybackSpeed(speed)}
                    className={`settings-choice !py-2 ${
                      playbackSpeed === speed
                        ? "settings-choice-active"
                        : ""
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ACCESSIBILITY */}
        <div className="card p-5">
          <div className="flex items-start gap-3">
            <Contrast className="size-5 text-teal" />

            <div className="flex-1">
              <h2 className={`section-title ${bn ? "bn" : ""}`}>
                {bn ? "অ্যাক্সেসিবিলিটি" : "Accessibility"}
              </h2>

              <div className="space-y-4 pt-3">
                {/* HIGH CONTRAST */}
                <div className="flex items-start gap-3">
                  <Toggle
                    enabled={contrast}
                    onClick={() =>
                      setContrast(!contrast)
                    }
                  />

                  <div>
                    <p
                      className={`text-[13px] text-navy ${
                        bn ? "bn" : ""
                      }`}
                    >
                      {bn
                        ? "উচ্চ কনট্রাস্ট মোড"
                        : "High contrast mode"}
                    </p>

                    <p
                      className={`pt-1 text-[10px] text-muted ${
                        bn ? "bn" : ""
                      }`}
                    >
                      {bn
                        ? "ভালো পঠনযোগ্যতার জন্য দৃশ্যমান কন্ট্রাস্ট বাড়ায়"
                        : "Increases visual contrast for better readability"}
                    </p>
                  </div>
                </div>

                {/* SIMPLE LANGUAGE */}
                <div className="flex items-start gap-3">
                  <Toggle
                    enabled={simpleLanguage}
                    onClick={() =>
                      setSimpleLanguage(!simpleLanguage)
                    }
                  />

                  <div>
                    <p
                      className={`text-[13px] text-navy ${
                        bn ? "bn" : ""
                      }`}
                    >
                      {bn
                        ? "সহজ ভাষা মোড"
                        : "Simple language mode"}
                    </p>

                    <p
                      className={`pt-1 text-[10px] text-muted ${
                        bn ? "bn" : ""
                      }`}
                    >
                      {bn
                        ? "এআই উত্তরে প্রযুক্তিগত আইনি পরিভাষা এড়িয়ে চলে"
                        : "Avoids technical legal terms in AI responses"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* PRIVACY / LOCAL SETTINGS */}
        <div className="card p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="size-5 text-teal" />

            <div>
              <h2 className={`section-title ${bn ? "bn" : ""}`}>
                {bn ? "স্থানীয় পছন্দসমূহ" : "Local Preferences"}
              </h2>

              <p
                className={`pt-1 text-[11px] leading-5 text-muted ${
                  bn ? "bn" : ""
                }`}
              >
                {bn
                  ? "আপনার অ্যাক্সেসিবিলিটি ও প্রদর্শন পছন্দ এই ডিভাইসেই সংরক্ষিত থাকে।"
                  : "Your accessibility and appearance preferences are stored locally on this device."}
              </p>
            </div>
          </div>
        </div>

        {/* RESET */}
        <div className="md:col-span-2">
          <button
            type="button"
            onClick={reset}
            className="secondary-btn"
          >
            <RotateCcw className="mr-1.5 size-3.5" />
            {bn ? "ডিফল্টে ফিরুন" : "Reset to defaults"}
          </button>
        </div>
      </div>
    </div>
  );
}
