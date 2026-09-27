import type { ReactNode } from "react";

type Tone = "error" | "success" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  error: "bg-red-50 text-red-700 border-red-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
};

export function Banner({
  tone = "info",
  children,
  onDismiss,
}: {
  tone?: Tone;
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${TONE_CLASSES[tone]}`}
    >
      <span>{children}</span>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="shrink-0 opacity-60 hover:opacity-100"
        >
          ✕
        </button>
      )}
    </div>
  );
}
