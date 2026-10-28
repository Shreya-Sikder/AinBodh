import { useLanguage } from "../context/LanguageContext";
// import Logo from "./Logo";

export default function PageFooter() {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  return (
    <footer className="border-t border-slate-200/80 bg-[#faf9f5] px-4 py-5">
      <div className="mx-auto flex w-full max-w-[900px] flex-col items-center justify-between gap-3 sm:flex-row">
        <link href="law icon.png" rel="icon" />
        {/* <Logo dark={false} small /> */}

        <p
          className={`text-center text-[10px] leading-5 text-slate-400 sm:text-right ${
            bn ? "bn" : ""
          }`}
        >
          {bn
            ? "তথ্য সহায়ক হিসেবে ব্যবহার করুন। গুরুত্বপূর্ণ আইনি সিদ্ধান্তের আগে আইনজীবীর পরামর্শ নিন।"
            : "Use AinBodh as an information assistant. Consult a lawyer before making important legal decisions."}
        </p>
      </div>

      <div className="mx-auto mt-3 w-full max-w-[900px] text-center">
        <p
          className={`text-[9px] text-slate-300 ${bn ? "bn" : ""}`}
        >
          © {new Date().getFullYear()} AinBodh · AI Legal Assistant
        </p>
      </div>
    </footer>
  );
}
