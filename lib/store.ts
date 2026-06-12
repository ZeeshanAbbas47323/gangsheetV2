import { create } from "zustand";
import { uid } from "./id";
import type { NestPlacement, NestStats } from "./nesting/types";
import { DEFAULT_SHEET, MAX_SHEET_IN, MIN_SHEET_IN } from "./presets";
import type {
  AlignType,
  CanvasElement,
  ExportJob,
  ImageToolOp,
  LibraryAsset,
  SheetConfig,
  Toast,
  Unit,
  UploadProgress,
} from "./types";
import { elementAABB } from "./units";

const HISTORY_LIMIT = 100;
const DUPLICATE_OFFSET_IN = 0.25;

interface Snapshot {
  elements: CanvasElement[];
  sheet: SheetConfig;
}

export interface BuilderState {
  sheet: SheetConfig;
  elements: CanvasElement[];
  assets: LibraryAsset[];
  selectedIds: string[];
  unit: Unit;
  /** Zoom factor relative to "fit sheet to viewport". */
  zoom: number;
  /** Absolute render scale in screen pixels per inch (set by the canvas). */
  viewScale: number;
  /** Stage offset in screen pixels. */
  pan: { x: number; y: number };
  /** Bumped to ask the canvas to re-fit the sheet into view. */
  fitRequest: number;
  /** Zoom factor requests from UI controls, applied by the canvas (anchored at center). */
  pendingZoom: { factor: number; seq: number } | null;
  aspectLock: boolean;
  showShortcuts: boolean;
  showExportModal: boolean;
  toasts: Toast[];
  uploads: UploadProgress[];
  quantity: number;
  nestStats: NestStats | null;
  exportJobs: ExportJob[];
  /** Asset ids waiting in the pre-placement (size & quantity) modal. */
  pendingPlacement: string[];
  /** Per-asset in-flight image tool (remove-bg / upscale). */
  assetProcessing: Record<string, ImageToolOp | undefined>;

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
  setNestStats: (stats: NestStats | null) => void;
  /** Commit nest placements (one undo step). Overflow stacks beside the sheet. */
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

  // placement queue
  queuePlacement: (assetIds: string[]) => void;
  dequeuePlacement: (assetId: string) => void;
  clearPlacementQueue: () => void;

  // elements (all history-committing unless noted)
  addElementFromAsset: (
    assetId: string,
    center?: { x: number; y: number }
  ) => string | null;
  /** Insert pre-positioned elements as one undo step and select them. */
  addElements: (elements: CanvasElement[]) => void;
  /** Atomic auto-build commit: new sheet height + new elements, one undo step. */
  applyAutoBuild: (elements: CanvasElement[], sheetHeightIn: number) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  /** Transient update — does NOT push history. Pair with begin/endTransient. */
  updateElementsTransient: (
    updates: { id: string; patch: Partial<CanvasElement> }[]
  ) => void;
  /** History-committing single-shot update. */
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

  // sheet
  setSheet: (patch: Partial<SheetConfig>) => void;
  swapOrientation: () => void;

  // history
  undo: () => void;
  redo: () => void;
}

function takeSnapshot(s: Pick<BuilderState, "elements" | "sheet">): Snapshot {
  return { elements: s.elements, sheet: s.sheet };
}

function pushPast(past: Snapshot[], snap: Snapshot): Snapshot[] {
  const next = [...past, snap];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

let pendingSnapshot: Snapshot | null = null;

export const useBuilder = create<BuilderState>((set, get) => {
  /** Push current document state to the undo stack and clear redo. */
  const commit = () =>
    set((s) => ({ past: pushPast(s.past, takeSnapshot(s)), future: [] }));

  const clampSheetDim = (v: number) =>
    Math.min(MAX_SHEET_IN, Math.max(MIN_SHEET_IN, v));

  return {
    sheet: DEFAULT_SHEET,
    elements: [],
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
    toasts: [],
    uploads: [],
    quantity: 1,
    nestStats: null,
    exportJobs: [],
    pendingPlacement: [],
    assetProcessing: {},
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
    setNestStats: (nestStats) => set({ nestStats }),

    applyNestResult: (placements, overflowIds, scale) => {
      const { sheet } = get();
      commit();
      const byId = new Map(placements.map((p) => [p.id, p]));
      // stack overflow items in a column beside the sheet so they stay visible
      let overflowY = 0.5;
      const overflowPos = new Map<string, { x: number; y: number }>();
      for (const id of overflowIds) {
        const el = get().elements.find((e) => e.id === id);
        if (!el) continue;
        const box = elementAABB(el);
        overflowPos.set(id, {
          x: sheet.widthIn + 1 + box.width / 2,
          y: overflowY + box.height / 2,
        });
        overflowY += box.height + 0.5;
      }
      set((s) => ({
        elements: s.elements.map((e) => {
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
        }),
      }));
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
      const usedBy = get().elements.filter((e) => e.assetId === id);
      if (usedBy.length > 0) commit();
      set((s) => ({
        assets: s.assets.filter((a) => a.id !== id),
        elements: s.elements.filter((e) => e.assetId !== id),
        selectedIds: s.selectedIds.filter(
          (sid) => !usedBy.some((e) => e.id === sid)
        ),
      }));
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

      // Natural physical size at the source DPI, capped so it fits the sheet.
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
      set({ elements: [...elements, el], selectedIds: [el.id] });
      return el.id;
    },

    addElements: (els) => {
      if (els.length === 0) return;
      commit();
      set((s) => ({
        elements: [...s.elements, ...els],
        selectedIds: els.map((e) => e.id),
      }));
    },

    applyAutoBuild: (els, sheetHeightIn) => {
      commit();
      set((s) => ({
        sheet: { ...s.sheet, heightIn: clampSheetDim(sheetHeightIn) },
        elements: [...s.elements, ...els],
        selectedIds: els.map((e) => e.id),
      }));
    },

    deleteSelected: () => {
      const { selectedIds, elements } = get();
      const deletable = selectedIds.filter(
        (id) => !elements.find((e) => e.id === id)?.locked
      );
      if (deletable.length === 0) return;
      commit();
      set((s) => ({
        elements: s.elements.filter((e) => !deletable.includes(e.id)),
        selectedIds: [],
      }));
    },

    duplicateSelected: () => {
      const { selectedIds, elements } = get();
      const sources = elements.filter((e) => selectedIds.includes(e.id));
      if (sources.length === 0) return;
      commit();
      const clones = sources.map((e) => ({
        ...e,
        id: uid(),
        x: e.x + DUPLICATE_OFFSET_IN,
        y: e.y + DUPLICATE_OFFSET_IN,
        locked: false,
      }));
      set((s) => ({
        elements: [...s.elements, ...clones],
        selectedIds: clones.map((c) => c.id),
      }));
    },

    updateElementsTransient: (updates) =>
      set((s) => ({
        elements: s.elements.map((e) => {
          const u = updates.find((x) => x.id === e.id);
          return u ? { ...e, ...u.patch } : e;
        }),
      })),

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
      set({ elements: snap.elements, sheet: snap.sheet });
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
      set({ elements: next });
    },

    alignSelected: (type) => {
      const { elements, selectedIds, sheet } = get();
      const selected = elements.filter(
        (e) => selectedIds.includes(e.id) && !e.locked
      );
      if (selected.length === 0) return;

      // Single element aligns to the sheet; multiple align within their bounds.
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
      set((s) => ({
        elements: s.elements.map((e) => {
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
        }),
      }));
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
      set((s) => ({
        elements: s.elements.map((e) => {
          const i = sorted.findIndex((x) => x.id === e.id);
          if (i === -1) return e;
          return axis === "horizontal"
            ? { ...e, x: first + step * i }
            : { ...e, y: first + step * i };
        }),
      }));
    },

    nudgeSelected: (dxIn, dyIn) => {
      const { elements, selectedIds } = get();
      const movable = elements.filter(
        (e) => selectedIds.includes(e.id) && !e.locked
      );
      if (movable.length === 0) return;
      commit();
      set((s) => ({
        elements: s.elements.map((e) =>
          movable.some((m) => m.id === e.id)
            ? { ...e, x: e.x + dxIn, y: e.y + dyIn }
            : e
        ),
      }));
    },

    setSheet: (patch) => {
      const next = { ...get().sheet, ...patch };
      if (patch.widthIn !== undefined) next.widthIn = clampSheetDim(patch.widthIn);
      if (patch.heightIn !== undefined)
        next.heightIn = clampSheetDim(patch.heightIn);
      commit();
      set({ sheet: next });
    },

    swapOrientation: () => {
      const { sheet } = get();
      commit();
      set({
        sheet: { ...sheet, widthIn: sheet.heightIn, heightIn: sheet.widthIn },
      });
    },

    undo: () => {
      const { past, future } = get();
      if (past.length === 0) return;
      const snap = past[past.length - 1];
      set((s) => ({
        past: past.slice(0, -1),
        future: [...future, takeSnapshot(s)],
        elements: snap.elements,
        sheet: snap.sheet,
        selectedIds: s.selectedIds.filter((id) =>
          snap.elements.some((e) => e.id === id)
        ),
      }));
    },

    redo: () => {
      const { past, future } = get();
      if (future.length === 0) return;
      const snap = future[future.length - 1];
      set((s) => ({
        future: future.slice(0, -1),
        past: pushPast(past, takeSnapshot(s)),
        elements: snap.elements,
        sheet: snap.sheet,
        selectedIds: s.selectedIds.filter((id) =>
          snap.elements.some((e) => e.id === id)
        ),
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
