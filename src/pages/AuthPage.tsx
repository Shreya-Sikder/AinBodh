
import { useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  LockKeyhole,
  Mail,
  UserRound,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useApp } from "../context/AppContext";
import LanguageToggle from "../components/LanguageToggle";
import { login, signup } from "../services/api";
import { realAuthEnabled } from "../services/auth";

const DEMO_EMAIL = "demo@ainbodh.local";

function getDisplayName(email: string): string {
  const username = email.split("@")[0] || "User";

  return username
    .replace(/[._-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

export default function AuthPage({
  mode,
}: {
  mode: "login" | "signup";
}) {
  const { lang } = useLanguage();

  const {
    setAuthenticated,
    setCurrentUser,
    notify,
  } = useApp();

  const navigate = useNavigate();
  const bn = lang === "bn";
  const isSignup = mode === "signup";

  const [name, setName] = useState("");
  const [email, setEmail] = useState(() => {
    try {
      return sessionStorage.getItem("AinBodh-signup-email") ?? "";
    } catch {
      return "";
    }
  });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (loading) return;

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (isSignup && !cleanName) {
      notify(bn ? "আপনার নাম লিখুন।" : "Please enter your name.");
      return;
    }

    if (!cleanEmail) {
      notify(bn ? "আপনার ইমেইল লিখুন।" : "Please enter your email.");
      return;
    }

    if (!password.trim()) {
      notify(bn ? "পাসওয়ার্ড লিখুন।" : "Please enter your password.");
      return;
    }

    if (isSignup && password.length < 6) {
      notify(
        bn
          ? "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।"
          : "Password must be at least 6 characters.",
      );
      return;
    }

    if (isSignup && password !== confirm) {
      notify(bn ? "পাসওয়ার্ড মিলছে না।" : "Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      // SIGNUP: preserve the existing registration flow.
      if (isSignup) {
        const result = await signup(cleanName, cleanEmail, password);

        const registeredUser = {
          name: result.user.name.trim(),
          email: result.user.email.trim().toLowerCase(),
        };

        localStorage.setItem(
          "AinBodh-user",
          JSON.stringify(registeredUser),
        );

        setCurrentUser(null);
        setAuthenticated(false);
        setConfirmationSent(Boolean("needsConfirmation" in result && result.needsConfirmation));
        setSignupSuccess(true);

        return;
      }

      // OFFLINE DEMO: reserve this address for demo mode.
      if (cleanEmail === DEMO_EMAIL) {
        const result = await login(cleanEmail, password);

        const demoUser = {
          name: result.user.name.trim(),
          email: result.user.email.trim().toLowerCase(),
        };

        localStorage.setItem("AinBodh-user", JSON.stringify(demoUser));

        setCurrentUser(demoUser);
        setAuthenticated(true);

        notify(
          bn
            ? `অফলাইন ডেমোতে স্বাগতম, ${demoUser.name}।`
            : `Welcome to the offline demo, ${demoUser.name}.`,
        );

        navigate("/upload?demo=offline", { replace: true });
        return;
      }

      // Real accounts (Supabase Auth) when configured; otherwise the local
      // development login, where any email and password can enter.
      const loggedInUser = realAuthEnabled
        ? (await login(cleanEmail, password)).user
        : {
            name: getDisplayName(cleanEmail),
            email: cleanEmail,
          };

      localStorage.setItem(
        "AinBodh-user",
        JSON.stringify(loggedInUser),
      );

      setCurrentUser(loggedInUser);
      setAuthenticated(true);

      try {
        sessionStorage.removeItem("AinBodh-signup-email");
      } catch {
        // Session storage is optional.
      }

      notify(
        bn
          ? `স্বাগতম, ${loggedInUser.name}।`
          : `Welcome, ${loggedInUser.name}.`,
      );

      // Normal logins must not be forced into offline demo mode.
      navigate("/upload", { replace: true });
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : bn
            ? "অনুরোধটি সম্পন্ন করা যায়নি।"
            : "Unable to complete the request.",
      );
    } finally {
      setLoading(false);
    }
  };

  function continueToLogin() {
    setSignupSuccess(false);

    try {
      if (email.trim()) {
        sessionStorage.setItem(
          "AinBodh-signup-email",
          email.trim(),
        );
      }
    } catch {
      // Session storage is optional.
    }

    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-[#eef2f6]">
      <header className="flex h-14 items-center border-b border-white/10 bg-navy px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="brand-icon">
            <FileText className="size-4 text-white" />
          </div>

          <div>
            <p className="text-[14px] font-bold text-white">AinBodh</p>
            <p className="text-[10px] text-white/45">
              {bn ? "এআই আইনি সহায়ক" : "AI Legal Assistant"}
            </p>
          </div>
        </Link>

        <div className="ml-auto">
          <LanguageToggle compact />
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-56px)] items-center justify-center px-4 py-10">
        <div className="w-full max-w-[420px]">
          <div className="card overflow-hidden shadow-sm">
            <div className="bg-gradient-to-br from-[#111f38] to-navy px-7 py-6 text-white">
              <p className="text-[10px] font-bold uppercase tracking-[.8px] text-white/45">
                {isSignup
                  ? bn
                    ? "অ্যাকাউন্ট তৈরি করুন"
                    : "CREATE ACCOUNT"
                  : bn
                    ? "স্বাগতম"
                    : "WELCOME BACK"}
              </p>

              <h1 className={`pt-2 text-[22px] font-bold ${bn ? "bn" : ""}`}>
                {isSignup
                  ? bn
                    ? "AinBodh-এ যোগ দিন"
                    : "Create your AinBodh account"
                  : bn
                    ? "AinBodh-এ লগ ইন করুন"
                    : "Log in to AinBodh"}
              </h1>

              <p className={`pt-1.5 text-[11px] leading-5 text-white/55 ${bn ? "bn" : ""}`}>
                {isSignup
                  ? bn
                    ? "আপনার নথি বোঝার জন্য একটি ব্যক্তিগত ওয়ার্কস্পেস তৈরি করুন।"
                    : "Create a personal workspace for understanding your legal documents."
                  : bn
                    ? "আপনার নথি ও বিশ্লেষণ ওয়ার্কস্পেসে ফিরে যান।"
                    : "Return to your document understanding workspace."}
              </p>
            </div>

            <form onSubmit={submit} className="space-y-4 p-7">
              {isSignup && (
                <label className="block">
                  <span className={`field-label ${bn ? "bn" : ""}`}>
                    {bn ? "নাম" : "Name"}
                  </span>

                  <div className="relative">
                    <UserRound className="field-icon" />
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="field pl-10"
                      placeholder={bn ? "আপনার নাম" : "Your name"}
                      autoComplete="name"
                      required
                    />
                  </div>
                </label>
              )}

              <label className="block">
                <span className={`field-label ${bn ? "bn" : ""}`}>
                  {bn ? "ইমেইল" : "Email"}
                </span>

                <div className="relative">
                  <Mail className="field-icon" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="field pl-10"
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
              </label>

              <label className="block">
                <span className={`field-label ${bn ? "bn" : ""}`}>
                  {bn ? "পাসওয়ার্ড" : "Password"}
                </span>

                <div className="relative">
                  <LockKeyhole className="field-icon" />
                  <input
                    required
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="field pl-10 pr-10"
                    placeholder="••••••••"
                    autoComplete={isSignup ? "new-password" : "current-password"}
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </label>

              {isSignup && (
                <label className="block">
                  <span className={`field-label ${bn ? "bn" : ""}`}>
                    {bn ? "পাসওয়ার্ড নিশ্চিত করুন" : "Confirm password"}
                  </span>

                  <input
                    required
                    type={showPassword ? "text" : "password"}
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    className="field"
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </label>
              )}

              <button
                type="submit"
                disabled={loading}
                className="primary-btn w-full !py-3 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? bn
                    ? "অপেক্ষা করুন…"
                    : "Please wait…"
                  : isSignup
                    ? bn
                      ? "অ্যাকাউন্ট তৈরি করুন"
                      : "Create account"
                    : bn
                      ? "লগ ইন"
                      : "Log in"}
              </button>

              {!isSignup && (
                <p className={`text-center text-[10px] leading-5 text-muted ${bn ? "bn" : ""}`}>
                  {bn
                    ? "ডেমো ব্যবহার করতে demo@ainbodh.local অ্যাকাউন্টটি ব্যবহার করুন।"
                    : "For the offline demonstration, use demo@ainbodh.local."}
                </p>
              )}

              <p className={`text-center text-[11px] text-muted ${bn ? "bn" : ""}`}>
                {isSignup
                  ? bn
                    ? "ইতিমধ্যে অ্যাকাউন্ট আছে? "
                    : "Already have an account? "
                  : bn
                    ? "অ্যাকাউন্ট নেই? "
                    : "Don't have an account? "}

                <Link
                  to={isSignup ? "/login" : "/signup"}
                  className="font-semibold text-teal hover:underline"
                >
                  {isSignup
                    ? bn
                      ? "লগ ইন"
                      : "Log in"
                    : bn
                      ? "সাইন আপ"
                      : "Sign up"}
                </Link>
              </p>
            </form>
          </div>

          <p className={`pt-5 text-center text-[10px] leading-5 text-slate-400 ${bn ? "bn" : ""}`}>
            {bn
              ? "AinBodh AI-এর সহায়তায় আইনি তথ্য সহজভাবে বুঝতে সাহায্য করে। এটি পেশাদার আইনি পরামর্শের বিকল্প নয় এবং আপনার হয়ে কোনো সিদ্ধান্ত নেয় না। গুরুত্বপূর্ণ বিষয়ে তথ্য যাচাই করুন এবং প্রয়োজনে যোগ্য আইনজীবীর পরামর্শ নিন।"
              : "AinBodh provides AI-assisted legal information for understanding purposes only. It does not replace professional legal advice or make decisions on your behalf. Always review important information and consult a qualified legal professional when necessary."}
          </p>
        </div>
      </div>

      {signupSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 px-4 backdrop-blur-sm">
          <div
            className="w-full max-w-[390px] rounded-2xl border border-white/60 bg-white p-7 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="signup-success-title"
          >
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="size-7 text-emerald-600" />
            </div>

            <div className="pt-5 text-center">
              <h2
                id="signup-success-title"
                className={`text-[18px] font-bold text-navy ${bn ? "bn" : ""}`}
              >
                {bn ? "অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে" : "Account created successfully"}
              </h2>

              <p className={`pt-2 text-[11px] leading-5 text-slate-500 ${bn ? "bn" : ""}`}>
                {confirmationSent
                  ? bn
                    ? "আপনার ইমেইলে একটি নিশ্চিতকরণ লিংক পাঠানো হয়েছে। লিংকে ক্লিক করে তারপর লগ ইন করুন।"
                    : "We've sent a confirmation link to your email. Click it, then log in."
                  : bn
                    ? "AinBodh ব্যবহার চালিয়ে যেতে এখন আপনার অ্যাকাউন্টে লগ ইন করুন।"
                    : "Please log in to continue using AinBodh."}
              </p>

              {email.trim() && (
                <div className="mt-4 rounded-xl bg-[#f8fafc] px-4 py-3">
                  <p className="text-[9px] uppercase tracking-[0.08em] text-slate-400">
                    {bn ? "অ্যাকাউন্ট" : "Account"}
                  </p>
                  <p className="truncate pt-1 text-[11px] font-semibold text-navy">
                    {email.trim()}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={continueToLogin}
                className="primary-btn mt-5 w-full !py-3"
              >
                {bn ? "লগ ইন করতে যান" : "Continue to login"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
