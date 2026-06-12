"use client";

import dynamic from "next/dynamic";

// Konva touches `window` at import time, so the builder is client-only.
const BuilderShell = dynamic(
  () => import("@/components/builder/BuilderShell"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center bg-surface-0">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
          <span className="text-sm">Loading builder…</span>
        </div>
      </div>
    ),
  }
);

export default function BuilderPage() {
  return <BuilderShell />;
}
