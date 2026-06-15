"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  downloadProject,
  loadFromLocal,
  parseProjectFile,
  saveToLocal,
} from "@/lib/persistence";
import { useBuilder } from "@/lib/store";

const AUTOSAVE_DEBOUNCE_MS = 800;

/**
 * Auto-saves the project (sheets + assets) to localStorage on change,
 * restores it on first mount, and exposes manual save/load helpers.
 */
export function usePersistence() {
  const restoredRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRef = useRef<{ sheets: unknown; assets: unknown }>({
    sheets: null,
    assets: null,
  });
  const quotaWarnedRef = useRef(false);

  // restore once on mount
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const saved = loadFromLocal();
    if (saved) {
      useBuilder.getState().loadProject(saved.sheets, saved.assets);
      // seed last-saved refs so we don't immediately re-save the restore
      const s = useBuilder.getState();
      lastRef.current = { sheets: s.sheets, assets: s.assets };
    }
  }, []);

  // debounced autosave on sheets/assets changes
  useEffect(() => {
    const unsub = useBuilder.subscribe((state) => {
      if (
        state.sheets === lastRef.current.sheets &&
        state.assets === lastRef.current.assets
      ) {
        return; // only document changes matter, not UI/view state
      }
      lastRef.current = { sheets: state.sheets, assets: state.assets };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const ok = saveToLocal({
          sheets: state.sheets,
          assets: state.assets,
          activeSheetId: state.activeSheetId,
        });
        if (!ok && !quotaWarnedRef.current) {
          quotaWarnedRef.current = true;
          useBuilder
            .getState()
            .pushToast(
              "warning",
              "Auto-save is off — the project is too large for browser storage. Use Save to download a backup."
            );
        }
      }, AUTOSAVE_DEBOUNCE_MS);
    });
    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const saveProject = useCallback(() => {
    const s = useBuilder.getState();
    downloadProject({
      sheets: s.sheets,
      assets: s.assets,
      activeSheetId: s.activeSheetId,
    });
    s.pushToast("success", "Project downloaded.");
  }, []);

  const loadProjectFile = useCallback(async (file: File) => {
    try {
      const data = await parseProjectFile(file);
      useBuilder.getState().loadProject(data.sheets, data.assets);
      useBuilder.getState().pushToast("success", "Project loaded.");
    } catch (err) {
      useBuilder
        .getState()
        .pushToast(
          "error",
          err instanceof Error ? err.message : "Could not load that project file."
        );
    }
  }, []);

  return { saveProject, loadProjectFile };
}
