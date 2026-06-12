"use client";

import { useCallback } from "react";
import { fileToAsset, FileValidationError } from "@/lib/files";
import { uid } from "@/lib/id";
import { useBuilder } from "@/lib/store";
import type { LibraryAsset } from "@/lib/types";

/** Shared file-import pipeline used by the library sidebar and canvas drop. */
export function useUploads() {
  const addAssets = useBuilder((s) => s.addAssets);
  const setUploads = useBuilder((s) => s.setUploads);
  const pushToast = useBuilder((s) => s.pushToast);

  const importFiles = useCallback(
    async (files: FileList | File[]): Promise<LibraryAsset[]> => {
      const list = Array.from(files);
      if (list.length === 0) return [];

      const imported: LibraryAsset[] = [];
      for (const file of list) {
        const progressId = uid();
        setUploads((u) => [
          ...u,
          { id: progressId, fileName: file.name, status: "processing" },
        ]);
        try {
          const asset = await fileToAsset(file);
          imported.push(asset);
          setUploads((u) =>
            u.map((p) => (p.id === progressId ? { ...p, status: "done" } : p))
          );
        } catch (err) {
          const message =
            err instanceof FileValidationError
              ? err.message
              : `Failed to import "${file.name}".`;
          setUploads((u) =>
            u.map((p) =>
              p.id === progressId ? { ...p, status: "error", error: message } : p
            )
          );
          pushToast("error", message);
        } finally {
          setTimeout(
            () => setUploads((u) => u.filter((p) => p.id !== progressId)),
            2500
          );
        }
      }

      if (imported.length > 0) {
        addAssets(imported);
        pushToast(
          "success",
          imported.length === 1
            ? `Imported "${imported[0].name}"`
            : `Imported ${imported.length} images`
        );
      }
      return imported;
    },
    [addAssets, setUploads, pushToast]
  );

  return { importFiles };
}
