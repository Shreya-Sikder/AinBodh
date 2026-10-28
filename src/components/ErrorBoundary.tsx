import { Component, type ErrorInfo, type ReactNode } from "react";

/** Shows a calm recovery screen instead of a blank page if something in the UI crashes. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AinBodh UI error:", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    const bn = document.documentElement.lang === "bn";
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eef2f6] px-4">
        <div className="card w-full max-w-[420px] p-7 text-center">
          <h1 className={`text-[18px] font-bold text-navy ${bn ? "bn" : ""}`}>
            {bn ? "কিছু একটা সমস্যা হয়েছে" : "Something went wrong"}
          </h1>
          <p className={`pt-2 text-[12px] leading-6 text-muted ${bn ? "bn" : ""}`}>
            {bn
              ? "পৃষ্ঠাটি আবার লোড করুন। আপনার চ্যাট ও নথি এই ব্রাউজারে সংরক্ষিত আছে।"
              : "Please reload the page. Your chats and document are saved in this browser."}
          </p>
          <button type="button" className="primary-btn mt-5 w-full !py-3" onClick={() => window.location.reload()}>
            {bn ? "আবার লোড করুন" : "Reload"}
          </button>
        </div>
      </div>
    );
  }
}
