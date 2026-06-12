"use client";

import { useBuilder } from "@/lib/store";

const KIND_STYLES: Record<string, string> = {
  success: "border-emerald-500/40 bg-emerald-950/90 text-emerald-200",
  error: "border-red-500/40 bg-red-950/90 text-red-200",
  warning: "border-amber-500/40 bg-amber-950/90 text-amber-200",
  info: "border-sky-500/40 bg-sky-950/90 text-sky-200",
};

export default function Toasts() {
  const toasts = useBuilder((s) => s.toasts);
  const dismissToast = useBuilder((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismissToast(t.id)}
          className={`pointer-events-auto rounded-lg border px-4 py-2.5 text-left text-sm shadow-lg backdrop-blur ${KIND_STYLES[t.kind]}`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
