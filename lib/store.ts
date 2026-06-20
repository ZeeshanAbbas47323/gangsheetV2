import { create } from "zustand";
import { uid } from "./id";
import type { NestPlacement, NestStats } from "./nesting/types";
import {
  DEFAULT_SHEET,
  normalizeHeight,
  SHEET_WIDTH_IN,
} from "./presets";
import { DEFAULT_FONT, measureText } from "./text";
import type {
  AlignType,
  CanvasElement,
  ExportJob,
  ImageToolOp,
  LibraryAsset,
  Sheet,
  SheetConfig,
  TextElement,
  Toast,
  Unit,
  UploadProgress,
} from "./types";
import { elementAABB } from "./units";

const HISTORY_LIMIT = 100;
const DUPLICATE_OFFSET_IN = 0.25;

/** SheetConfig fields shared across every sheet (vs. per-sheet height). */
const GLOBAL_CONFIG_KEYS: (keyof SheetConfig)[] = [
  "dpi",
  "background",
  "showBleed",
  "showSafeZone",
  "snapToGrid",
  "snapToEdges",
  "gridSizeIn",
];

interface Snapshot {
  sheets: Sheet[];
  activeSheetId: string;
}

/** One sheet's height + the elements packed onto it (for multi-sheet build). */
export interface SheetBuild {
  heightIn: number;
  elements: CanvasElement[];
  name?: string;
}

export interface BuilderState {
  sheets: Sheet[];
  activeSheetId: string;
  /** Read-only mirror of the active sheet's config (kept in sync). */
  sheet: SheetConfig;
  /** Read-only mirror of the active sheet's elements (kept in sync). */
  elements: CanvasElement[];

  assets: LibraryAsset[];
  selectedIds: string[];
  unit: Unit;
  zoom: number;
  viewScale: number;
  pan: { x: number; y: number };
  fitRequest: number;
  pendingZoom: { factor: number; seq: number } | null;
  aspectLock: boolean;
  showShortcuts: boolean;
  showExportModal: boolean;
  /** Quality-check confirmation gate shown before the export modal. */
  showQualityCheck: boolean;
  toasts: Toast[];
  uploads: UploadProgress[];
  quantity: number;
  nestStats: NestStats | null;
  exportJobs: ExportJob[];
  pendingPlacement: string[];
  assetProcessing: Record<string, ImageToolOp | undefined>;
  /** Asset currently open in the custom crop tool (null = closed). */
  croppingAssetId: string | null;

  past: Snapshot[];
  future: Snapshot[];

  // view / ui
  setUnit: (unit: Unit) => void;
  setZoom: (zoom: number) => void;
  setView: (zoom: number, pan: { x: number; y: number }, viewScale: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  requestFit: () => void;
  requestZoom: (factor: number) => void;
  setAspectLock: (locked: boolean) => void;
  setShowShortcuts: (show: boolean) => void;
  setShowExportModal: (show: boolean) => void;
  setShowQualityCheck: (show: boolean) => void;
  setNestStats: (stats: NestStats | null) => void;
  applyNestResult: (
    placements: NestPlacement[],
    overflowIds: string[],
    scale: number
  ) => void;
  upsertExportJob: (job: ExportJob) => void;
  removeExportJob: (id: string) => void;
  setQuantity: (qty: number) => void;
  pushToast: (kind: Toast["kind"], message: string) => void;
  dismissToast: (id: string) => void;
  setUploads: (
    updater: (uploads: UploadProgress[]) => UploadProgress[]
  ) => void;

  // selection
  select: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // assets
  addAssets: (assets: LibraryAsset[]) => void;
  removeAsset: (id: string) => void;
  renameAsset: (id: string, name: string) => void;
  updateAsset: (id: string, patch: Partial<LibraryAsset>) => void;
  setAssetProcessing: (id: string, op: ImageToolOp | undefined) => void;
  setCroppingAsset: (id: string | null) => void;

  // placement queue
  queuePlacement: (assetIds: string[]) => void;
  dequeuePlacement: (assetId: string) => void;
  clearPlacementQueue: () => void;

  // elements (history-committing unless noted)
  addElementFromAsset: (
    assetId: string,
    center?: { x: number; y: number }
  ) => string | null;
  addElements: (elements: CanvasElement[]) => void;
  addTextElement: (patch?: Partial<TextElement>) => string;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  updateElementsTransient: (
    updates: { id: string; patch: Partial<CanvasElement> }[]
  ) => void;
  updateElements: (
    updates: { id: string; patch: Partial<CanvasElement> }[]
  ) => void;
  beginTransient: () => void;
  endTransient: () => void;
  cancelTransient: () => void;
  reorderSelected: (dir: "front" | "back" | "forward" | "backward") => void;
  alignSelected: (type: AlignType) => void;
  distributeSelected: (axis: "horizontal" | "vertical") => void;
  nudgeSelected: (dxIn: number, dyIn: number) => void;

  // sheet config
  setSheet: (patch: Partial<SheetConfig>) => void;

  // multi-sheet management
  addSheet: () => void;
  deleteSheet: (id: string) => void;
  renameSheet: (id: string, name: string) => void;
  duplicateSheet: (id: string) => void;
  setActiveSheet: (id: string) => void;
  nextSheet: () => void;
  prevSheet: () => void;
  /** Commit a multi-sheet build (one undo step): active sheet content/height + extra sheets. */
  commitBuild: (
    activeElements: CanvasElement[],
    activeHeightIn: number,
    extraSheets: SheetBuild[]
  ) => void;

  // persistence
  loadProject: (sheets: Sheet[], assets: LibraryAsset[]) => void;
  resetProject: () => void;

  // history
  undo: () => void;
  redo: () => void;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function makeSheet(
  name: string,
  config: SheetConfig,
  elements: CanvasElement[] = []
): Sheet {
  return {
    id: uid(),
    name,
    config: { ...config, widthIn: SHEET_WIDTH_IN },
    elements,
  };
}

function takeSnapshot(s: Pick<BuilderState, "sheets" | "activeSheetId">): Snapshot {
  return { sheets: s.sheets, activeSheetId: s.activeSheetId };
}

function pushPast(past: Snapshot[], snap: Snapshot): Snapshot[] {
  const next = [...past, snap];
  return next.length > HISTORY_LIMIT
    ? next.slice(next.length - HISTORY_LIMIT)
    : next;
}

/** Derive the active-sheet mirrors from a sheets array. */
function mirror(sheets: Sheet[], activeSheetId: string) {
  const active = sheets.find((sh) => sh.id === activeSheetId) ?? sheets[0];
  return { sheet: active.config, elements: active.elements };
}

/** Clone an element with a fresh id (used by duplicate/clone). */
function cloneElement(el: CanvasElement): CanvasElement {
  return { ...el, id: uid() };
}

let pendingSnapshot: Snapshot | null = null;

function initialState() {
  const first = makeSheet("Sheet 1", DEFAULT_SHEET);
  return {
    sheets: [first],
    activeSheetId: first.id,
    sheet: first.config,
    elements: first.elements,
  };
}

export const useBuilder = create<BuilderState>((set, get) => {
  const commit = () =>
    set((s) => ({ past: pushPast(s.past, takeSnapshot(s)), future: [] }));

  /** Replace the active sheet's elements (+ optional extra state) and resync mirror. */
  const setActiveElements = (
    elements: CanvasElement[],
    extra: Partial<BuilderState> = {}
  ) =>
    set((s) => {
      const sheets = s.sheets.map((sh) =>
        sh.id === s.activeSheetId ? { ...sh, elements } : sh
      );
      return { sheets, elements, ...extra };
    });

  const init = initialState();

  return {
    ...init,
    assets: [],
    selectedIds: [],
    unit: "in",
    zoom: 1,
    viewScale: 20,
    pan: { x: 0, y: 0 },
    fitRequest: 0,
    pendingZoom: null,
    aspectLock: true,
    showShortcuts: false,
    showExportModal: false,
    showQualityCheck: false,
    toasts: [],
    uploads: [],
    quantity: 1,
    nestStats: null,
    exportJobs: [],
    pendingPlacement: [],
    assetProcessing: {},
    croppingAssetId: null,
    past: [],
    future: [],

    setUnit: (unit) => set({ unit }),
    setZoom: (zoom) => set({ zoom }),
    setView: (zoom, pan, viewScale) => set({ zoom, pan, viewScale }),
    setPan: (pan) => set({ pan }),
    requestFit: () => set((s) => ({ fitRequest: s.fitRequest + 1 })),
    requestZoom: (factor) =>
      set((s) => ({
        pendingZoom: { factor, seq: (s.pendingZoom?.seq ?? 0) + 1 },
      })),
    setAspectLock: (aspectLock) => set({ aspectLock }),
    setShowShortcuts: (showShortcuts) => set({ showShortcuts }),
    setShowExportModal: (showExportModal) => set({ showExportModal }),
    setShowQualityCheck: (showQualityCheck) => set({ showQualityCheck }),
    setNestStats: (nestStats) => set({ nestStats }),

    applyNestResult: (placements, overflowIds, scale) => {
      const { sheet, elements } = get();
      commit();
      const byId = new Map(placements.map((p) => [p.id, p]));
      let overflowY = 0.5;
      const overflowPos = new Map<string, { x: number; y: number }>();
      for (const id of overflowIds) {
        const el = elements.find((e) => e.id === id);
        if (!el) continue;
        const box = elementAABB(el);
        overflowPos.set(id, {
          x: sheet.widthIn + 1 + box.width / 2,
          y: overflowY + box.height / 2,
        });
        overflowY += box.height + 0.5;
      }
      setActiveElements(
        elements.map((e) => {
          const p = byId.get(e.id);
          if (p) {
            return {
              ...e,
              x: p.x + p.w / 2,
              y: p.y + p.h / 2,
              widthIn: e.widthIn * scale,
              heightIn: e.heightIn * scale,
              rotation: e.rotation + (p.rotated ? 90 : 0),
            };
          }
          const o = overflowPos.get(e.id);
          return o ? { ...e, x: o.x, y: o.y } : e;
        })
      );
    },

    upsertExportJob: (job) =>
      set((s) => {
        const exists = s.exportJobs.some((j) => j.id === job.id);
        return {
          exportJobs: exists
            ? s.exportJobs.map((j) => (j.id === job.id ? job : j))
            : [...s.exportJobs, job],
        };
      }),
    removeExportJob: (id) =>
      set((s) => ({ exportJobs: s.exportJobs.filter((j) => j.id !== id) })),
    setQuantity: (qty) =>
      set({ quantity: Math.max(1, Math.min(999, Math.round(qty) || 1)) }),

    pushToast: (kind, message) => {
      const id = uid();
      set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
      setTimeout(() => get().dismissToast(id), 4000);
    },
    dismissToast: (id) =>
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    setUploads: (updater) => set((s) => ({ uploads: updater(s.uploads) })),

    select: (ids) => set({ selectedIds: ids }),
    toggleSelect: (id) =>
      set((s) => ({
        selectedIds: s.selectedIds.includes(id)
          ? s.selectedIds.filter((x) => x !== id)
          : [...s.selectedIds, id],
      })),
    selectAll: () =>
      set((s) => ({
        selectedIds: s.elements.filter((e) => !e.locked).map((e) => e.id),
      })),
    clearSelection: () => set({ selectedIds: [] }),

    addAssets: (assets) => set((s) => ({ assets: [...s.assets, ...assets] })),
    removeAsset: (id) => {
      const { sheets } = get();
      const usedAnywhere = sheets.some((sh) =>
        sh.elements.some((e) => e.type === "image" && e.assetId === id)
      );
      if (usedAnywhere) commit();
      set((s) => {
        const nextSheets = s.sheets.map((sh) => ({
          ...sh,
          elements: sh.elements.filter(
            (e) => !(e.type === "image" && e.assetId === id)
          ),
        }));
        return {
          assets: s.assets.filter((a) => a.id !== id),
          sheets: nextSheets,
          ...mirror(nextSheets, s.activeSheetId),
          selectedIds: [],
        };
      });
    },
    renameAsset: (id, name) =>
      set((s) => ({
        assets: s.assets.map((a) => (a.id === id ? { ...a, name } : a)),
      })),
    updateAsset: (id, patch) =>
      set((s) => ({
        assets: s.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      })),
    setAssetProcessing: (id, op) =>
      set((s) => ({
        assetProcessing: { ...s.assetProcessing, [id]: op },
      })),
    setCroppingAsset: (croppingAssetId) => set({ croppingAssetId }),

    queuePlacement: (assetIds) =>
      set((s) => ({
        pendingPlacement: [
          ...s.pendingPlacement,
          ...assetIds.filter((id) => !s.pendingPlacement.includes(id)),
        ],
      })),
    dequeuePlacement: (assetId) =>
      set((s) => ({
        pendingPlacement: s.pendingPlacement.filter((id) => id !== assetId),
      })),
    clearPlacementQueue: () => set({ pendingPlacement: [] }),

    addElementFromAsset: (assetId, center) => {
      const { assets, sheet, elements } = get();
      const asset = assets.find((a) => a.id === assetId);
      if (!asset) return null;

      const srcDpi = asset.dpi ?? 300;
      let w = asset.naturalWidth / srcDpi;
      let h = asset.naturalHeight / srcDpi;
      const maxW = sheet.widthIn * 0.9;
      const maxH = sheet.heightIn * 0.9;
      const fit = Math.min(1, maxW / w, maxH / h);
      w = Math.max(0.25, w * fit);
      h = Math.max(0.25, h * fit);

      const el: CanvasElement = {
        id: uid(),
        type: "image",
        assetId,
        name: asset.name,
        x: center?.x ?? sheet.widthIn / 2,
        y: center?.y ?? sheet.heightIn / 2,
        widthIn: w,
        heightIn: h,
        rotation: 0,
        flipX: false,
        flipY: false,
        opacity: 1,
        locked: false,
        visible: true,
      };
      commit();
      setActiveElements([...elements, el], { selectedIds: [el.id] });
      return el.id;
    },

    addElements: (els) => {
      if (els.length === 0) return;
      commit();
      setActiveElements([...get().elements, ...els], {
        selectedIds: els.map((e) => e.id),
      });
    },

    addTextElement: (patch) => {
      const { sheet, elements } = get();
      const base: TextElement = {
        id: uid(),
        type: "text",
        name: "Text",
        text: "Your text",
        fontFamily: DEFAULT_FONT,
        fontSize: 72, // points → 1"
        fontWeight: 700,
        italic: false,
        underline: false,
        align: "center",
        color: "#111111",
        outlineColor: "#ffffff",
        outlineWidth: 0,
        letterSpacing: 0,
        lineHeight: 1.15,
        x: sheet.widthIn / 2,
        y: sheet.heightIn / 2,
        widthIn: 1,
        heightIn: 1,
        rotation: 0,
        flipX: false,
        flipY: false,
        opacity: 1,
        locked: false,
        visible: true,
        ...patch,
      };
      base.name = base.text.slice(0, 24) || "Text";
      const m = measureText(base);
      base.widthIn = m.widthIn;
      base.heightIn = m.heightIn;
      commit();
      setActiveElements([...elements, base], { selectedIds: [base.id] });
      return base.id;
    },

    deleteSelected: () => {
      const { selectedIds, elements } = get();
      const deletable = selectedIds.filter(
        (id) => !elements.find((e) => e.id === id)?.locked
      );
      if (deletable.length === 0) return;
      commit();
      setActiveElements(
        elements.filter((e) => !deletable.includes(e.id)),
        { selectedIds: [] }
      );
    },

    duplicateSelected: () => {
      const { selectedIds, elements } = get();
      const sources = elements.filter((e) => selectedIds.includes(e.id));
      if (sources.length === 0) return;
      commit();
      const clones = sources.map((e) => ({
        ...cloneElement(e),
        x: e.x + DUPLICATE_OFFSET_IN,
        y: e.y + DUPLICATE_OFFSET_IN,
        locked: false,
      }));
      setActiveElements([...elements, ...clones], {
        selectedIds: clones.map((c) => c.id),
      });
    },

    updateElementsTransient: (updates) =>
      setActiveElements(
        get().elements.map((e) => {
          const u = updates.find((x) => x.id === e.id);
          return u ? ({ ...e, ...u.patch } as CanvasElement) : e;
        })
      ),

    updateElements: (updates) => {
      commit();
      get().updateElementsTransient(updates);
    },

    beginTransient: () => {
      pendingSnapshot = takeSnapshot(get());
    },
    endTransient: () => {
      if (!pendingSnapshot) return;
      const snap = pendingSnapshot;
      pendingSnapshot = null;
      set((s) => ({ past: pushPast(s.past, snap), future: [] }));
    },
    cancelTransient: () => {
      if (!pendingSnapshot) return;
      const snap = pendingSnapshot;
      pendingSnapshot = null;
      set({
        sheets: snap.sheets,
        activeSheetId: snap.activeSheetId,
        ...mirror(snap.sheets, snap.activeSheetId),
      });
    },

    reorderSelected: (dir) => {
      const { elements, selectedIds } = get();
      if (selectedIds.length === 0) return;
      const selected = elements.filter((e) => selectedIds.includes(e.id));
      const rest = elements.filter((e) => !selectedIds.includes(e.id));
      let next: CanvasElement[];
      if (dir === "front") {
        next = [...rest, ...selected];
      } else if (dir === "back") {
        next = [...selected, ...rest];
      } else {
        next = [...elements];
        const indices = selectedIds
          .map((id) => next.findIndex((e) => e.id === id))
          .sort((a, b) => (dir === "forward" ? b - a : a - b));
        for (const i of indices) {
          const j = dir === "forward" ? i + 1 : i - 1;
          if (j < 0 || j >= next.length) continue;
          [next[i], next[j]] = [next[j], next[i]];
        }
      }
      commit();
      setActiveElements(next);
    },

    alignSelected: (type) => {
      const { elements, selectedIds, sheet } = get();
      const selected = elements.filter(
        (e) => selectedIds.includes(e.id) && !e.locked
      );
      if (selected.length === 0) return;

      let bounds = { left: 0, top: 0, right: sheet.widthIn, bottom: sheet.heightIn };
      if (selected.length > 1) {
        const boxes = selected.map(elementAABB);
        bounds = {
          left: Math.min(...boxes.map((b) => b.left)),
          top: Math.min(...boxes.map((b) => b.top)),
          right: Math.max(...boxes.map((b) => b.right)),
          bottom: Math.max(...boxes.map((b) => b.bottom)),
        };
      }

      commit();
      setActiveElements(
        elements.map((e) => {
          if (!selected.some((sel) => sel.id === e.id)) return e;
          const box = elementAABB(e);
          switch (type) {
            case "left":
              return { ...e, x: e.x + (bounds.left - box.left) };
            case "right":
              return { ...e, x: e.x + (bounds.right - box.right) };
            case "centerX":
              return { ...e, x: e.x + ((bounds.left + bounds.right) / 2 - box.cx) };
            case "top":
              return { ...e, y: e.y + (bounds.top - box.top) };
            case "bottom":
              return { ...e, y: e.y + (bounds.bottom - box.bottom) };
            case "centerY":
              return { ...e, y: e.y + ((bounds.top + bounds.bottom) / 2 - box.cy) };
          }
        })
      );
    },

    distributeSelected: (axis) => {
      const { elements, selectedIds } = get();
      const selected = elements.filter(
        (e) => selectedIds.includes(e.id) && !e.locked
      );
      if (selected.length < 3) return;

      const sorted = [...selected].sort((a, b) =>
        axis === "horizontal" ? a.x - b.x : a.y - b.y
      );
      const first = axis === "horizontal" ? sorted[0].x : sorted[0].y;
      const last =
        axis === "horizontal"
          ? sorted[sorted.length - 1].x
          : sorted[sorted.length - 1].y;
      const step = (last - first) / (sorted.length - 1);

      commit();
      setActiveElements(
        elements.map((e) => {
          const i = sorted.findIndex((x) => x.id === e.id);
          if (i === -1) return e;
          return axis === "horizontal"
            ? { ...e, x: first + step * i }
            : { ...e, y: first + step * i };
        })
      );
    },

    nudgeSelected: (dxIn, dyIn) => {
      const { elements, selectedIds } = get();
      const movable = elements.filter(
        (e) => selectedIds.includes(e.id) && !e.locked
      );
      if (movable.length === 0) return;
      commit();
      setActiveElements(
        elements.map((e) =>
          movable.some((m) => m.id === e.id)
            ? { ...e, x: e.x + dxIn, y: e.y + dyIn }
            : e
        )
      );
    },

    setSheet: (patch) => {
      commit();
      set((s) => {
        const globalPatch: Partial<SheetConfig> = {};
        for (const k of GLOBAL_CONFIG_KEYS) {
          if (patch[k] !== undefined) (globalPatch as Record<string, unknown>)[k] = patch[k];
        }
        const newHeight =
          patch.heightIn !== undefined ? normalizeHeight(patch.heightIn) : undefined;
        const sheets = s.sheets.map((sh) => {
          const config: SheetConfig = {
            ...sh.config,
            ...globalPatch,
            widthIn: SHEET_WIDTH_IN,
          };
          if (sh.id === s.activeSheetId && newHeight !== undefined) {
            config.heightIn = newHeight;
          }
          return { ...sh, config };
        });
        return { sheets, ...mirror(sheets, s.activeSheetId) };
      });
    },

    // ---- multi-sheet management -----------------------------------------
    addSheet: () => {
      commit();
      set((s) => {
        const sheet = makeSheet(`Sheet ${s.sheets.length + 1}`, get().sheet, []);
        const sheets = [...s.sheets, sheet];
        return {
          sheets,
          activeSheetId: sheet.id,
          selectedIds: [],
          ...mirror(sheets, sheet.id),
        };
      });
      get().requestFit();
    },

    deleteSheet: (id) => {
      if (get().sheets.length <= 1) {
        // never leave the project with zero sheets — reset the single sheet
        get().resetProject();
        return;
      }
      commit();
      set((s) => {
        const idx = s.sheets.findIndex((sh) => sh.id === id);
        const sheets = s.sheets.filter((sh) => sh.id !== id);
        const activeSheetId =
          s.activeSheetId === id
            ? sheets[Math.max(0, idx - 1)].id
            : s.activeSheetId;
        return {
          sheets,
          activeSheetId,
          selectedIds: [],
          ...mirror(sheets, activeSheetId),
        };
      });
      get().requestFit();
    },

    renameSheet: (id, name) =>
      set((s) => ({
        sheets: s.sheets.map((sh) =>
          sh.id === id ? { ...sh, name: name.trim() || sh.name } : sh
        ),
      })),

    duplicateSheet: (id) => {
      commit();
      set((s) => {
        const src = s.sheets.find((sh) => sh.id === id);
        if (!src) return {};
        const copy = makeSheet(
          `${src.name} copy`,
          src.config,
          src.elements.map(cloneElement)
        );
        const idx = s.sheets.findIndex((sh) => sh.id === id);
        const sheets = [
          ...s.sheets.slice(0, idx + 1),
          copy,
          ...s.sheets.slice(idx + 1),
        ];
        return {
          sheets,
          activeSheetId: copy.id,
          selectedIds: [],
          ...mirror(sheets, copy.id),
        };
      });
      get().requestFit();
    },

    setActiveSheet: (id) => {
      if (get().activeSheetId === id) return;
      set((s) => ({
        activeSheetId: id,
        selectedIds: [],
        ...mirror(s.sheets, id),
      }));
      get().requestFit();
    },

    nextSheet: () => {
      const { sheets, activeSheetId } = get();
      const i = sheets.findIndex((sh) => sh.id === activeSheetId);
      if (i < sheets.length - 1) get().setActiveSheet(sheets[i + 1].id);
    },
    prevSheet: () => {
      const { sheets, activeSheetId } = get();
      const i = sheets.findIndex((sh) => sh.id === activeSheetId);
      if (i > 0) get().setActiveSheet(sheets[i - 1].id);
    },

    commitBuild: (activeElements, activeHeightIn, extraSheets) => {
      commit();
      set((s) => {
        const baseConfig = { ...get().sheet };
        const sheets = s.sheets.map((sh) =>
          sh.id === s.activeSheetId
            ? {
                ...sh,
                elements: activeElements,
                config: {
                  ...sh.config,
                  widthIn: SHEET_WIDTH_IN,
                  heightIn: normalizeHeight(activeHeightIn),
                },
              }
            : sh
        );
        const created = extraSheets.map((es, i) =>
          makeSheet(
            es.name ?? `Sheet ${s.sheets.length + i + 1}`,
            { ...baseConfig, heightIn: normalizeHeight(es.heightIn) },
            es.elements
          )
        );
        const all = [...sheets, ...created];
        return {
          sheets: all,
          selectedIds: [],
          ...mirror(all, s.activeSheetId),
        };
      });
      get().requestFit();
    },

    // ---- persistence -----------------------------------------------------
    loadProject: (sheets, assets) => {
      const safe = sheets.length > 0 ? sheets : [makeSheet("Sheet 1", DEFAULT_SHEET)];
      set({
        sheets: safe,
        activeSheetId: safe[0].id,
        assets,
        selectedIds: [],
        past: [],
        future: [],
        ...mirror(safe, safe[0].id),
      });
      get().requestFit();
    },

    resetProject: () => {
      const fresh = initialState();
      set({
        ...fresh,
        assets: [],
        selectedIds: [],
        past: [],
        future: [],
        nestStats: null,
      });
      get().requestFit();
    },

    undo: () => {
      const { past, future } = get();
      if (past.length === 0) return;
      const snap = past[past.length - 1];
      set((s) => ({
        past: past.slice(0, -1),
        future: [...future, takeSnapshot(s)],
        sheets: snap.sheets,
        activeSheetId: snap.activeSheetId,
        selectedIds: [],
        ...mirror(snap.sheets, snap.activeSheetId),
      }));
    },

    redo: () => {
      const { past, future } = get();
      if (future.length === 0) return;
      const snap = future[future.length - 1];
      set((s) => ({
        future: future.slice(0, -1),
        past: pushPast(past, takeSnapshot(s)),
        sheets: snap.sheets,
        activeSheetId: snap.activeSheetId,
        selectedIds: [],
        ...mirror(snap.sheets, snap.activeSheetId),
      }));
    },
  };
});

// dev-only handles for debugging and integration testing from the console
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  (window as unknown as { __builder?: typeof useBuilder }).__builder =
    useBuilder;
  void import("./nesting/engine").then((m) => {
    (window as unknown as { __nest?: typeof m.runNest }).__nest = m.runNest;
  });
  void import("pdf-lib").then((m) => {
    (window as unknown as { __pdf?: typeof m }).__pdf = m;
  });
}
