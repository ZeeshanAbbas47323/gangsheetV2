"use client";

import { useBuilder } from "@/lib/store";

const SHORTCUTS: [string, string][] = [
  ["Ctrl + Z", "Undo"],
  ["Ctrl + Y / Ctrl + Shift + Z", "Redo"],
  ["Ctrl + D", "Duplicate selection"],
  ["Ctrl + A", "Select all"],
  ["Delete / Backspace", "Delete selection"],
  ["Escape", "Clear selection"],
  ["Arrow keys", "Nudge 0.05\""],
  ["Shift + Arrow keys", "Nudge 0.5\""],
  ["Shift + Click", "Add/remove from selection"],
  ["Mouse wheel", "Zoom at cursor"],
  ["Space + Drag / Middle drag", "Pan canvas"],
  ["Ctrl + = / Ctrl + -", "Zoom in / out"],
  ["Ctrl + 0", "Fit sheet to view"],
  ["?", "Show this panel"],
];

export default function ShortcutsModal() {
  const show = useBuilder((s) => s.showShortcuts);
  const setShow = useBuilder((s) => s.setShowShortcuts);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => setShow(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="w-full max-w-md rounded-xl border border-surface-3 bg-surface-1 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={() => setShow(false)}
            className="rounded p-1 text-gray-400 hover:bg-surface-3 hover:text-white"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="space-y-1.5">
          {SHORTCUTS.map(([keys, action]) => (
            <div key={keys} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-gray-400">{action}</span>
              <kbd className="rounded border border-surface-3 bg-surface-2 px-2 py-0.5 font-mono text-xs text-gray-200">
                {keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
