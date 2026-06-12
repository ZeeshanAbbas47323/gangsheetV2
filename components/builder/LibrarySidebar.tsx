"use client";

import { useMemo, useRef, useState } from "react";
import { useImageTools } from "@/hooks/useImageTools";
import { ACCEPT_ATTR } from "@/lib/files";
import { useBuilder } from "@/lib/store";
import { useUploads } from "./useUploads";

export default function LibrarySidebar() {
  const assets = useBuilder((s) => s.assets);
  const uploads = useBuilder((s) => s.uploads);
  const removeAsset = useBuilder((s) => s.removeAsset);
  const renameAsset = useBuilder((s) => s.renameAsset);
  const queuePlacement = useBuilder((s) => s.queuePlacement);
  const { importFiles } = useUploads();
  const { processAsset, processing } = useImageTools();

  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((a) => a.name.toLowerCase().includes(q));
  }, [assets, search]);

  const commitRename = () => {
    if (renamingId && renameText.trim()) {
      renameAsset(renamingId, renameText.trim());
    }
    setRenamingId(null);
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-surface-3 bg-surface-1">
      <div className="border-b border-surface-3 p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Image library
        </h2>
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void importFiles(e.dataTransfer.files);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-5 text-center transition-colors
            ${dragOver ? "border-accent bg-accent/10" : "border-surface-3 hover:border-gray-500"}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="m17 8-5-5-5 5" />
            <path d="M12 3v12" />
          </svg>
          <span className="text-xs text-gray-300">
            Drop images or <span className="text-accent">browse</span>
          </span>
          <span className="text-[10px] text-gray-500">PNG · JPG · WEBP · SVG</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void importFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {uploads.length > 0 && (
        <div className="space-y-1 border-b border-surface-3 p-3">
          {uploads.map((u) => (
            <div key={u.id} className="flex items-center gap-2 text-xs">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  u.status === "processing"
                    ? "animate-pulse bg-amber-400"
                    : u.status === "done"
                      ? "bg-emerald-400"
                      : "bg-red-400"
                }`}
              />
              <span className="truncate text-gray-300">{u.fileName}</span>
            </div>
          ))}
        </div>
      )}

      <div className="p-3 pb-1">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search images…"
          className="w-full rounded border border-surface-3 bg-surface-2 px-2.5 py-1.5 text-xs text-gray-100 outline-none placeholder:text-gray-500 focus:border-accent"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-3 pt-2">
        {filtered.length === 0 ? (
          <p className="mt-6 text-center text-xs text-gray-500">
            {assets.length === 0
              ? "No images yet — upload some to get started."
              : "No images match your search."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map((asset) => (
              <div
                key={asset.id}
                className="group relative rounded-lg border border-surface-3 bg-surface-2 p-1.5 transition-colors hover:border-accent"
              >
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-asset-id", asset.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => queuePlacement([asset.id])}
                  title={`${asset.name} — click to set size & quantity, drag to place directly (${asset.naturalWidth}×${asset.naturalHeight}px)`}
                  className="flex h-20 cursor-grab items-center justify-center overflow-hidden rounded bg-[conic-gradient(#e3e6ea_90deg,#f7f8fa_90deg_180deg,#e3e6ea_180deg_270deg,#f7f8fa_270deg)] bg-[length:14px_14px] active:cursor-grabbing"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.src}
                    alt={asset.name}
                    className="max-h-full max-w-full object-contain"
                    draggable={false}
                  />
                </div>
                {renamingId === asset.id ? (
                  <input
                    autoFocus
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="mt-1 w-full rounded border border-accent bg-surface-1 px-1 py-0.5 text-[10px] text-gray-100 outline-none"
                  />
                ) : (
                  <p
                    onDoubleClick={() => {
                      setRenamingId(asset.id);
                      setRenameText(asset.name);
                    }}
                    title="Double-click to rename"
                    className="mt-1 truncate text-[10px] text-gray-400"
                  >
                    {asset.name}
                  </p>
                )}
                <div className="mt-1 flex gap-1">
                  <button
                    type="button"
                    disabled={!!processing[asset.id] || asset.bgRemoved}
                    onClick={() => void processAsset(asset.id, "remove-bg")}
                    title={asset.bgRemoved ? "Background already removed" : "Remove background"}
                    className="flex h-5 flex-1 items-center justify-center gap-0.5 rounded bg-surface-3 text-[9px] font-medium text-gray-300 hover:bg-surface-3/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {processing[asset.id] === "remove-bg" ? (
                      <span className="h-2.5 w-2.5 animate-spin rounded-full border border-gray-400 border-t-transparent" />
                    ) : asset.bgRemoved ? (
                      "BG ✓"
                    ) : (
                      "Rm BG"
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={!!processing[asset.id] || asset.upscaled}
                    onClick={() => void processAsset(asset.id, "upscale")}
                    title={asset.upscaled ? "Already upscaled" : "Upscale image"}
                    className="flex h-5 flex-1 items-center justify-center gap-0.5 rounded bg-surface-3 text-[9px] font-medium text-gray-300 hover:bg-surface-3/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {processing[asset.id] === "upscale" ? (
                      <span className="h-2.5 w-2.5 animate-spin rounded-full border border-gray-400 border-t-transparent" />
                    ) : asset.upscaled ? (
                      "HD ✓"
                    ) : (
                      "Upscale"
                    )}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeAsset(asset.id)}
                  title="Delete from library"
                  aria-label={`Delete ${asset.name}`}
                  className="absolute right-1 top-1 hidden rounded bg-black/70 p-1 text-gray-300 hover:text-red-400 group-hover:block"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
