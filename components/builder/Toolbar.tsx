"use client";

import { useRef } from "react";
import { usePersistence } from "@/hooks/usePersistence";
import { clearLocal } from "@/lib/persistence";
import { useBuilder } from "@/lib/store";
import type { Unit } from "@/lib/types";

function ToolButton({
  label,
  onClick,
  disabled,
  active,
  title,
  children,
}: {
  label?: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`flex h-8 min-w-8 items-center justify-center gap-1 rounded px-1.5 text-sm transition-colors
        ${active ? "bg-accent text-white" : "text-gray-300 hover:bg-surface-3"}
        disabled:cursor-not-allowed disabled:opacity-35`}
    >
      {children}
      {label && <span className="text-xs">{label}</span>}
    </button>
  );
}

const Divider = () => <div className="mx-1 h-5 w-px bg-surface-3" />;

export default function Toolbar() {
  const canUndo = useBuilder((s) => s.past.length > 0);
  const canRedo = useBuilder((s) => s.future.length > 0);
  const undo = useBuilder((s) => s.undo);
  const redo = useBuilder((s) => s.redo);
  const zoom = useBuilder((s) => s.zoom);
  const requestZoom = useBuilder((s) => s.requestZoom);
  const requestFit = useBuilder((s) => s.requestFit);
  const unit = useBuilder((s) => s.unit);
  const setUnit = useBuilder((s) => s.setUnit);
  const aspectLock = useBuilder((s) => s.aspectLock);
  const setAspectLock = useBuilder((s) => s.setAspectLock);
  const sheet = useBuilder((s) => s.sheet);
  const setSheet = useBuilder((s) => s.setSheet);
  const hasSelection = useBuilder((s) => s.selectedIds.length > 0);
  const duplicateSelected = useBuilder((s) => s.duplicateSelected);
  const deleteSelected = useBuilder((s) => s.deleteSelected);
  const setShowShortcuts = useBuilder((s) => s.setShowShortcuts);
  const setShowExportModal = useBuilder((s) => s.setShowExportModal);
  const resetProject = useBuilder((s) => s.resetProject);
  const { saveProject, loadProjectFile } = usePersistence();
  const fileRef = useRef<HTMLInputElement>(null);

  // NEW CHANGE: full builder reset — clears sheets, images, settings, history,
  // and the saved localStorage project, after explicit confirmation.
  const handleReset = () => {
    if (
      confirm(
        "Reset the builder? This clears all sheets, uploaded images, and settings. This cannot be undone."
      )
    ) {
      clearLocal();
      resetProject();
    }
  };

  return (
    <div className="flex h-12 items-center gap-1 border-b border-surface-3 bg-surface-1 px-3">
      <span className="mr-2 select-none text-sm font-semibold tracking-tight text-white">
        Gangsheet Builder{" "}
        <span className="font-normal text-gray-400">by ModFirst</span>
      </span>

      <Divider />

      <ToolButton title="New project" onClick={handleReset}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M12 11v6M9 14h6" /></svg>
      </ToolButton>
      <ToolButton title="Save project (download)" onClick={saveProject}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></svg>
      </ToolButton>
      <ToolButton title="Load project" onClick={() => fileRef.current?.click()}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
      </ToolButton>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void loadProjectFile(f);
          e.target.value = "";
        }}
      />

      <Divider />

      <ToolButton title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>
      </ToolButton>
      <ToolButton title="Redo (Ctrl+Y)" onClick={redo} disabled={!canRedo}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" /></svg>
      </ToolButton>

      <Divider />

      <ToolButton title="Zoom out (Ctrl+-)" onClick={() => requestZoom(1 / 1.25)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14" /></svg>
      </ToolButton>
      <button
        type="button"
        onClick={requestFit}
        title="Fit sheet to view (Ctrl+0)"
        className="h-8 min-w-14 rounded px-1 text-xs tabular-nums text-gray-300 hover:bg-surface-3"
      >
        {Math.round(zoom * 100)}%
      </button>
      <ToolButton title="Zoom in (Ctrl+=)" onClick={() => requestZoom(1.25)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </ToolButton>

      <Divider />

      <select
        value={unit}
        onChange={(e) => setUnit(e.target.value as Unit)}
        title="Measurement unit"
        className="h-8 rounded border border-surface-3 bg-surface-2 px-1.5 text-xs text-gray-200 outline-none focus:border-accent"
      >
        <option value="in">inches</option>
        <option value="cm">cm</option>
        <option value="px">px</option>
      </select>

      <ToolButton
        title={aspectLock ? "Aspect ratio locked (click to unlock)" : "Aspect ratio unlocked (click to lock)"}
        onClick={() => setAspectLock(!aspectLock)}
        active={aspectLock}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {aspectLock ? (
            <>
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </>
          ) : (
            <>
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </>
          )}
        </svg>
      </ToolButton>

      <Divider />

      <ToolButton
        title="Snap to edges & centers"
        label="Snap"
        onClick={() => setSheet({ snapToEdges: !sheet.snapToEdges })}
        active={sheet.snapToEdges}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 3v18M3 12h18" strokeDasharray="3 3" /></svg>
      </ToolButton>
      <ToolButton
        title="Snap to grid"
        label="Grid"
        onClick={() => setSheet({ snapToGrid: !sheet.snapToGrid })}
        active={sheet.snapToGrid}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" /></svg>
      </ToolButton>

      <Divider />

      <ToolButton title="Duplicate selection (Ctrl+D)" onClick={duplicateSelected} disabled={!hasSelection}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      </ToolButton>
      <ToolButton title="Delete selection (Del)" onClick={deleteSelected} disabled={!hasSelection}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
      </ToolButton>

      <div className="flex-1" />

      <ToolButton title="Keyboard shortcuts (?)" onClick={() => setShowShortcuts(true)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
      </ToolButton>

      {/* NEW CHANGE: prominent Reset Builder button */}
      <button
        type="button"
        onClick={handleReset}
        title="Reset the entire builder"
        className="ml-1 flex h-8 items-center gap-1.5 rounded border border-red-500/50 px-3 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/15 hover:text-red-200"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.7 3" /><path d="M3 3v5h5" /></svg>
        Reset
      </button>

      <button
        type="button"
        onClick={() => setShowExportModal(true)}
        className="ml-1 flex h-8 items-center gap-1.5 rounded bg-accent px-3 text-xs font-semibold text-white transition-colors hover:bg-accent-hover"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></svg>
        Export
      </button>
    </div>
  );
}
