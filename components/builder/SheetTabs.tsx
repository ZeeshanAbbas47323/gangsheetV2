"use client";

import { useState } from "react";
import { useBuilder } from "@/lib/store";

/** Tab strip for switching, renaming, duplicating, and deleting sheets. */
export default function SheetTabs() {
  const sheets = useBuilder((s) => s.sheets);
  const activeSheetId = useBuilder((s) => s.activeSheetId);
  const setActiveSheet = useBuilder((s) => s.setActiveSheet);
  const addSheet = useBuilder((s) => s.addSheet);
  const deleteSheet = useBuilder((s) => s.deleteSheet);
  const duplicateSheet = useBuilder((s) => s.duplicateSheet);
  const renameSheet = useBuilder((s) => s.renameSheet);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const commitRename = () => {
    if (editingId) renameSheet(editingId, draft);
    setEditingId(null);
  };

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-surface-3 bg-surface-1 px-2">
      {sheets.map((sheet) => {
        const active = sheet.id === activeSheetId;
        return (
          <div
            key={sheet.id}
            onClick={() => setActiveSheet(sheet.id)}
            onDoubleClick={() => {
              setEditingId(sheet.id);
              setDraft(sheet.name);
            }}
            title={`${sheet.name} — ${sheet.config.widthIn}" × ${sheet.config.heightIn}"`}
            className={`group flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${
              active
                ? "border-accent bg-accent/15 text-white"
                : "border-surface-3 text-gray-400 hover:border-gray-500 hover:text-gray-200"
            }`}
          >
            {editingId === sheet.id ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="w-20 rounded border border-accent bg-surface-1 px-1 text-xs text-gray-100 outline-none"
              />
            ) : (
              <span className="max-w-[120px] truncate">{sheet.name}</span>
            )}
            <span className="text-[9px] tabular-nums text-gray-500">
              {sheet.config.heightIn}&quot;
            </span>
            {active && (
              <span className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicateSheet(sheet.id);
                  }}
                  title="Duplicate sheet"
                  aria-label="Duplicate sheet"
                  className="rounded p-0.5 text-gray-400 hover:bg-surface-3 hover:text-white"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                </button>
                {sheets.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSheet(sheet.id);
                    }}
                    title="Delete sheet"
                    aria-label="Delete sheet"
                    className="rounded p-0.5 text-gray-400 hover:bg-surface-3 hover:text-red-400"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                )}
              </span>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={addSheet}
        title="New sheet"
        aria-label="New sheet"
        className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-dashed border-surface-3 px-2 text-xs text-gray-400 hover:border-accent hover:text-white"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        New
      </button>
    </div>
  );
}
