import { Check, Circle, Loader2 } from "lucide-react";

export type StepState = "done" | "current" | "pending";

export default function StatusStepper({
  steps,
  current,
  vertical = false,
  bn = false,
}: {
  steps: string[];
  current: number;
  vertical?: boolean;
  bn?: boolean;
}) {
  return (
    <div className={vertical ? "space-y-3" : "flex items-start"}>
      {steps.map((step, index) => {
        const state: StepState = index < current ? "done" : index === current ? "current" : "pending";
        return (
          <div key={`${step}-${index}`} className={vertical ? "flex items-center gap-2.5" : "flex min-w-0 flex-1 items-start"}>
            <div className={vertical ? "flex items-center gap-2.5" : "flex w-full flex-col items-center"}>
              <div
                className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition ${
                  state === "done"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : state === "current"
                      ? "border-teal bg-teal text-white"
                      : "border-slate-200 bg-white text-slate-400"
                }`}
              >
                {state === "done" ? <Check className="size-3.5" /> : state === "current" ? <Loader2 className="size-3.5 animate-spin" /> : <Circle className="size-2.5" />}
              </div>
              <span className={`pt-1.5 text-center text-[9px] leading-3 ${state === "current" ? "font-bold text-navy" : "text-muted"} ${bn ? "bn" : ""}`}>
                {step}
              </span>
            </div>
            {!vertical && index < steps.length - 1 ? <div className={`mx-1 mt-3 h-px flex-1 ${index < current ? "bg-emerald-300" : "bg-border"}`} /> : null}
          </div>
        );
      })}
    </div>
  );
}

