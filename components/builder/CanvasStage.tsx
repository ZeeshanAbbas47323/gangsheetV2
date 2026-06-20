"use client";

import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Layer, Line, Rect, Shape, Stage, Transformer } from "react-konva";
import { findOverlaps } from "@/lib/nesting/geometry";
import { BLEED_IN, SAFE_ZONE_IN } from "@/lib/presets";
import {
  computeSnap,
  elementSnapLines,
  sheetSnapLines,
  type SnapGuide,
} from "@/lib/snapping";
import { useBuilder } from "@/lib/store";
import { measureText } from "@/lib/text";
import { elementAABB, formatLength, type AABB } from "@/lib/units";
import CanvasElementNode from "./CanvasElementNode";
import CanvasScrollbars from "./CanvasScrollbars";
import TextElementNode from "./TextElementNode";
import { useUploads } from "./useUploads";

const FIT_PADDING = 56;
const SNAP_THRESHOLD_PX = 8;
const MIN_ELEMENT_IN = 0.1;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 16;

interface SelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SizeLabel {
  x: number;
  y: number;
  text: string;
}

function unionAABB(boxes: AABB[]): AABB {
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  const right = Math.max(...boxes.map((b) => b.right));
  const bottom = Math.max(...boxes.map((b) => b.bottom));
  return {
    left,
    top,
    right,
    bottom,
    cx: (left + right) / 2,
    cy: (top + bottom) / 2,
    width: right - left,
    height: bottom - top,
  };
}

export default function CanvasStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const contentLayerRef = useRef<Konva.Layer>(null);
  const trRef = useRef<Konva.Transformer>(null);

  const sheet = useBuilder((s) => s.sheet);
  const elements = useBuilder((s) => s.elements);
  const assets = useBuilder((s) => s.assets);
  const selectedIds = useBuilder((s) => s.selectedIds);
  const zoom = useBuilder((s) => s.zoom);
  const pan = useBuilder((s) => s.pan);
  const aspectLock = useBuilder((s) => s.aspectLock);
  const unit = useBuilder((s) => s.unit);
  const fitRequest = useBuilder((s) => s.fitRequest);
  const pendingZoom = useBuilder((s) => s.pendingZoom);

  const { importFiles } = useUploads();

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [spaceDown, setSpaceDown] = useState(false);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [selRect, setSelRect] = useState<SelRect | null>(null);
  const [sizeLabel, setSizeLabel] = useState<SizeLabel | null>(null);

  const baseScaleRef = useRef(20);
  const didInitFitRef = useRef(false);
  const selStartRef = useRef<{ x: number; y: number } | null>(null);
  const middlePanRef = useRef<{
    startClientX: number;
    startClientY: number;
    startPan: { x: number; y: number };
  } | null>(null);
  const pinchRef = useRef<{ dist: number; center: { x: number; y: number } } | null>(
    null
  );
  const dragCtxRef = useRef<{
    positions: Map<string, { x: number; y: number }>;
    linesV: number[];
    linesH: number[];
  } | null>(null);
  const transformActiveRef = useRef(false);

  const scale = baseScaleRef.current * zoom;

  // ---- container sizing -------------------------------------------------
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const ro = new ResizeObserver(() => {
      setSize({ width: node.clientWidth, height: node.clientHeight });
    });
    ro.observe(node);
    setSize({ width: node.clientWidth, height: node.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ---- fit to view -------------------------------------------------------
  const fitToView = useCallback(() => {
    const cw = containerRef.current?.clientWidth ?? 0;
    const ch = containerRef.current?.clientHeight ?? 0;
    if (cw === 0 || ch === 0) return;
    const { sheet: sh, setView } = useBuilder.getState();
    const base = Math.max(
      0.5,
      Math.min(
        (cw - FIT_PADDING * 2) / sh.widthIn,
        (ch - FIT_PADDING * 2) / sh.heightIn
      )
    );
    baseScaleRef.current = base;
    setView(
      1,
      {
        x: (cw - sh.widthIn * base) / 2,
        y: (ch - sh.heightIn * base) / 2,
      },
      base
    );
  }, []);

  useEffect(() => {
    if (size.width === 0 || size.height === 0) return;
    if (!didInitFitRef.current) {
      didInitFitRef.current = true;
      fitToView();
    }
  }, [size, fitToView]);

  useEffect(() => {
    if (!didInitFitRef.current) return;
    fitToView();
    // refit when the sheet dimensions change or a fit is requested
  }, [sheet.widthIn, sheet.heightIn, fitRequest, fitToView]);

  // ---- transformer wiring ------------------------------------------------
  useEffect(() => {
    const tr = trRef.current;
    const layer = contentLayerRef.current;
    if (!tr || !layer) return;
    const state = useBuilder.getState();
    const nodes = selectedIds
      .map((id) => layer.findOne(`#${id}`))
      .filter((n): n is Konva.Node => {
        if (!n) return false;
        const el = state.elements.find((e) => e.id === n.id());
        return !!el && !el.locked && el.visible;
      });
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, elements]);

  // ---- keyboard ----------------------------------------------------------
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (el as HTMLElement).isContentEditable
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping()) return;
      const s = useBuilder.getState();
      const mod = e.ctrlKey || e.metaKey;

      if (e.code === "Space") {
        e.preventDefault();
        setSpaceDown(true);
        return;
      }
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? s.redo() : s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        s.duplicateSelected();
        return;
      }
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        s.selectAll();
        return;
      }
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        zoomBy(1.25);
        return;
      }
      if (mod && e.key === "-") {
        e.preventDefault();
        zoomBy(1 / 1.25);
        return;
      }
      if (mod && e.key === "0") {
        e.preventDefault();
        s.requestFit();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        s.deleteSelected();
        return;
      }
      if (e.key === "Escape") {
        s.clearSelection();
        return;
      }
      if (e.key === "?") {
        s.setShowShortcuts(true);
        return;
      }
      const nudge = e.shiftKey ? 0.5 : 0.05;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        s.nudgeSelected(-nudge, 0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        s.nudgeSelected(nudge, 0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        s.nudgeSelected(0, -nudge);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        s.nudgeSelected(0, nudge);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- zoom helpers -------------------------------------------------------
  const zoomBy = (factor: number, anchor?: { x: number; y: number }) => {
    const s = useBuilder.getState();
    const cw = containerRef.current?.clientWidth ?? 0;
    const ch = containerRef.current?.clientHeight ?? 0;
    const point = anchor ?? { x: cw / 2, y: ch / 2 };
    const oldScale = baseScaleRef.current * s.zoom;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s.zoom * factor));
    const newScale = baseScaleRef.current * newZoom;
    const world = {
      x: (point.x - s.pan.x) / oldScale,
      y: (point.y - s.pan.y) / oldScale,
    };
    s.setView(
      newZoom,
      { x: point.x - world.x * newScale, y: point.y - world.y * newScale },
      newScale
    );
  };

  // apply zoom requests from toolbar buttons, anchored at the viewport center
  useEffect(() => {
    if (pendingZoom) zoomBy(pendingZoom.factor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingZoom]);

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    zoomBy(e.evt.deltaY < 0 ? 1.1 : 1 / 1.1, pointer);
  };

  // ---- pinch zoom (mobile) -----------------------------------------------
  const handleTouchMove = (e: KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    if (touches.length !== 2) return;
    e.evt.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const p1 = { x: touches[0].clientX - rect.left, y: touches[0].clientY - rect.top };
    const p2 = { x: touches[1].clientX - rect.left, y: touches[1].clientY - rect.top };
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

    const prev = pinchRef.current;
    pinchRef.current = { dist, center };
    if (!prev) return;

    const s = useBuilder.getState();
    // pan by center movement
    let newPan = {
      x: s.pan.x + (center.x - prev.center.x),
      y: s.pan.y + (center.y - prev.center.y),
    };
    // zoom around center
    const factor = dist / Math.max(1, prev.dist);
    const oldScale = baseScaleRef.current * s.zoom;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s.zoom * factor));
    const newScale = baseScaleRef.current * newZoom;
    const world = {
      x: (center.x - newPan.x) / oldScale,
      y: (center.y - newPan.y) / oldScale,
    };
    newPan = { x: center.x - world.x * newScale, y: center.y - world.y * newScale };
    s.setView(newZoom, newPan, newScale);
  };

  const handleTouchEnd = () => {
    pinchRef.current = null;
  };

  // ---- selection (click + rubber band) ------------------------------------
  const toWorld = (point: { x: number; y: number }) => {
    const s = useBuilder.getState();
    return { x: (point.x - s.pan.x) / scale, y: (point.y - s.pan.y) / scale };
  };

  const handleSelect = (
    e: KonvaEventObject<MouseEvent | Event>,
    id: string
  ) => {
    const s = useBuilder.getState();
    const evt = e.evt as MouseEvent;
    if (evt.shiftKey) {
      s.toggleSelect(id);
    } else {
      s.select([id]);
    }
  };

  const handleStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    // middle mouse: pan
    if (e.evt.button === 1) {
      e.evt.preventDefault();
      const s = useBuilder.getState();
      middlePanRef.current = {
        startClientX: e.evt.clientX,
        startClientY: e.evt.clientY,
        startPan: s.pan,
      };
      const onMove = (me: MouseEvent) => {
        const ctx = middlePanRef.current;
        if (!ctx) return;
        useBuilder.getState().setPan({
          x: ctx.startPan.x + (me.clientX - ctx.startClientX),
          y: ctx.startPan.y + (me.clientY - ctx.startClientY),
        });
      };
      const onUp = () => {
        middlePanRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      return;
    }

    if (e.evt.button !== 0 || spaceDown) return;
    const isEmpty =
      e.target === e.target.getStage() || e.target.name() === "sheet";
    if (!isEmpty) return;

    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    const world = toWorld(pointer);
    selStartRef.current = world;
    setSelRect({ x: world.x, y: world.y, width: 0, height: 0 });
  };

  const handleStageMouseMove = () => {
    const start = selStartRef.current;
    if (!start) return;
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    const world = toWorld(pointer);
    setSelRect({
      x: Math.min(start.x, world.x),
      y: Math.min(start.y, world.y),
      width: Math.abs(world.x - start.x),
      height: Math.abs(world.y - start.y),
    });
  };

  const handleStageMouseUp = () => {
    const start = selStartRef.current;
    selStartRef.current = null;
    if (!start || !selRect) {
      setSelRect(null);
      return;
    }
    const s = useBuilder.getState();
    const tiny = selRect.width * scale < 4 && selRect.height * scale < 4;
    if (tiny) {
      s.clearSelection();
    } else {
      const rect: AABB = {
        left: selRect.x,
        top: selRect.y,
        right: selRect.x + selRect.width,
        bottom: selRect.y + selRect.height,
        cx: selRect.x + selRect.width / 2,
        cy: selRect.y + selRect.height / 2,
        width: selRect.width,
        height: selRect.height,
      };
      const hits = s.elements
        .filter((el) => el.visible && !el.locked)
        .filter((el) => {
          const box = elementAABB(el);
          return (
            box.left < rect.right &&
            box.right > rect.left &&
            box.top < rect.bottom &&
            box.bottom > rect.top
          );
        })
        .map((el) => el.id);
      s.select(hits);
    }
    setSelRect(null);
  };

  // ---- stage pan with space ------------------------------------------------
  const handleStageDragMove = (e: KonvaEventObject<DragEvent>) => {
    if (e.target !== stageRef.current) return;
    useBuilder.getState().setPan({ x: e.target.x(), y: e.target.y() });
  };

  // ---- element drag + snapping ----------------------------------------------
  const handleElementDragStart = (
    e: KonvaEventObject<DragEvent>,
    id: string
  ) => {
    const s = useBuilder.getState();
    let sel = s.selectedIds;
    if (!sel.includes(id)) {
      s.select([id]);
      sel = [id];
    }
    s.beginTransient();

    const movableIds = s.elements
      .filter((el) => sel.includes(el.id) && !el.locked)
      .map((el) => el.id);
    const positions = new Map<string, { x: number; y: number }>();
    for (const mid of movableIds) {
      const el = s.elements.find((x) => x.id === mid)!;
      positions.set(mid, { x: el.x, y: el.y });
    }

    const lines = sheetSnapLines(s.sheet.widthIn, s.sheet.heightIn);
    const linesV = [...lines.vertical];
    const linesH = [...lines.horizontal];
    for (const el of s.elements) {
      if (movableIds.includes(el.id) || !el.visible) continue;
      const elLines = elementSnapLines(elementAABB(el));
      linesV.push(...elLines.vertical);
      linesH.push(...elLines.horizontal);
    }
    dragCtxRef.current = { positions, linesV, linesH };
  };

  const handleElementDragMove = (
    e: KonvaEventObject<DragEvent>,
    id: string
  ) => {
    const ctx = dragCtxRef.current;
    if (!ctx) return;
    const s = useBuilder.getState();
    const node = e.target;
    const start = ctx.positions.get(id);
    if (!start) return;

    let dx = node.x() - start.x;
    let dy = node.y() - start.y;

    // snap the union bounding box of everything being moved
    const movingEls = s.elements.filter((el) => ctx.positions.has(el.id));
    if (s.sheet.snapToEdges || s.sheet.snapToGrid) {
      const boxes = movingEls.map((el) => {
        const p = ctx.positions.get(el.id)!;
        return elementAABB({ ...el, x: p.x + dx, y: p.y + dy });
      });
      const union = unionAABB(boxes);
      const result = computeSnap(
        union,
        s.sheet.snapToEdges ? ctx.linesV : [],
        s.sheet.snapToEdges ? ctx.linesH : [],
        s.sheet.snapToGrid ? s.sheet.gridSizeIn : null,
        SNAP_THRESHOLD_PX / scale
      );
      dx += result.dx;
      dy += result.dy;
      setGuides(result.guides);
    }

    const layer = contentLayerRef.current;
    const updates: { id: string; patch: { x: number; y: number } }[] = [];
    ctx.positions.forEach((p, elId) => {
      const nx = p.x + dx;
      const ny = p.y + dy;
      const n = elId === id ? node : layer?.findOne(`#${elId}`);
      n?.position({ x: nx, y: ny });
      updates.push({ id: elId, patch: { x: nx, y: ny } });
    });
    s.updateElementsTransient(updates);

    // live position/size readout
    const boxes = movingEls.map((el) => {
      const p = ctx.positions.get(el.id)!;
      return elementAABB({ ...el, x: p.x + dx, y: p.y + dy });
    });
    const union = unionAABB(boxes);
    setSizeLabel({
      x: union.cx * scale + s.pan.x,
      y: union.bottom * scale + s.pan.y,
      text: `${formatLength(union.width, unit, s.sheet.dpi)} × ${formatLength(
        union.height,
        unit,
        s.sheet.dpi
      )}`,
    });
  };

  const handleElementDragEnd = () => {
    const ctx = dragCtxRef.current;
    dragCtxRef.current = null;
    setGuides([]);
    setSizeLabel(null);
    if (!ctx) return;
    const s = useBuilder.getState();
    // detect no-op drags so we don't pollute undo history
    const moved = s.elements.some((el) => {
      const p = ctx.positions.get(el.id);
      return p && (Math.abs(el.x - p.x) > 1e-6 || Math.abs(el.y - p.y) > 1e-6);
    });
    moved ? s.endTransient() : s.cancelTransient();
  };

  // ---- transform -----------------------------------------------------------
  const handleTransformStart = () => {
    if (transformActiveRef.current) return;
    transformActiveRef.current = true;
    useBuilder.getState().beginTransient();
  };

  const handleTransform = () => {
    const tr = trRef.current;
    if (!tr) return;
    const s = useBuilder.getState();
    const nodes = tr.nodes();
    if (nodes.length === 0) return;
    let text: string;
    if (nodes.length === 1) {
      const n = nodes[0];
      const w = n.width() * Math.abs(n.scaleX());
      const h = n.height() * Math.abs(n.scaleY());
      text = `${formatLength(w, unit, s.sheet.dpi)} × ${formatLength(h, unit, s.sheet.dpi)}`;
    } else {
      const rect = tr.getClientRect();
      text = `${formatLength(rect.width / scale, unit, s.sheet.dpi)} × ${formatLength(
        rect.height / scale,
        unit,
        s.sheet.dpi
      )}`;
    }
    const rect = tr.getClientRect();
    setSizeLabel({ x: rect.x + rect.width / 2, y: rect.y + rect.height, text });
  };

  const handleNodeTransformEnd = (node: Konva.Node, id: string) => {
    const s = useBuilder.getState();
    const el = s.elements.find((x) => x.id === id);
    if (!el) return;
    const flipX = node.scaleX() < 0;
    const flipY = node.scaleY() < 0;
    const sx = Math.abs(node.scaleX());
    const sy = Math.abs(node.scaleY());

    if (el.type === "text") {
      // Resizing text scales the font size (uniform), then we re-measure the box.
      const factor = Math.max(sx, sy);
      const fontSize = Math.max(4, el.fontSize * factor);
      node.scaleX(flipX ? -1 : 1);
      node.scaleY(flipY ? -1 : 1);
      const measured = measureText({ ...el, fontSize });
      s.updateElementsTransient([
        {
          id,
          patch: {
            x: node.x(),
            y: node.y(),
            rotation: node.rotation(),
            fontSize,
            widthIn: measured.widthIn,
            heightIn: measured.heightIn,
            flipX,
            flipY,
          },
        },
      ]);
      return;
    }

    const widthIn = Math.max(MIN_ELEMENT_IN, node.width() * sx);
    const heightIn = Math.max(MIN_ELEMENT_IN, node.height() * sy);
    node.scaleX(flipX ? -1 : 1);
    node.scaleY(flipY ? -1 : 1);
    s.updateElementsTransient([
      {
        id,
        patch: {
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          widthIn,
          heightIn,
          flipX,
          flipY,
        },
      },
    ]);
  };

  const handleTransformerTransformEnd = () => {
    setSizeLabel(null);
    // node-level transformend handlers run in the same tick; commit after them
    setTimeout(() => {
      transformActiveRef.current = false;
      useBuilder.getState().endTransient();
    }, 0);
  };

  // ---- HTML drag & drop ------------------------------------------------------
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = useBuilder.getState();
    const world = {
      x: (e.clientX - rect.left - s.pan.x) / scale,
      y: (e.clientY - rect.top - s.pan.y) / scale,
    };

    const assetId = e.dataTransfer.getData("application/x-asset-id");
    if (assetId) {
      s.addElementFromAsset(assetId, world);
      return;
    }
    if (e.dataTransfer.files.length > 0) {
      // dropping on the canvas is an explicit placement — skip the size modal
      const imported = await importFiles(e.dataTransfer.files, false);
      imported.forEach((asset, i) => {
        useBuilder
          .getState()
          .addElementFromAsset(asset.id, {
            x: world.x + i * 0.5,
            y: world.y + i * 0.5,
          });
      });
    }
  };

  // ---- static drawing helpers -------------------------------------------------
  const checkerTile = useMemo(() => {
    if (typeof document === "undefined") return undefined;
    const c = document.createElement("canvas");
    c.width = 24;
    c.height = 24;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#f7f8fa";
    ctx.fillRect(0, 0, 24, 24);
    ctx.fillStyle = "#e3e6ea";
    ctx.fillRect(0, 0, 12, 12);
    ctx.fillRect(12, 12, 12, 12);
    return c;
  }, []);

  const px = (v: number) => v / scale; // constant-screen-size length in world units

  const hasContent = elements.length > 0;

  // real-time collision detection (drag, manual placement, nest, resize)
  const overlapIds = useMemo(() => findOverlaps(elements), [elements]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-surface-0"
      style={{ cursor: spaceDown ? "grab" : "default" }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {size.width > 0 && size.height > 0 && (
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        scaleX={scale}
        scaleY={scale}
        x={pan.x}
        y={pan.y}
        draggable={spaceDown}
        onDragMove={handleStageDragMove}
        onDragEnd={handleStageDragMove}
        onWheel={handleWheel}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* background: sheet + grid */}
        <Layer listening={true}>
          {/* sheet shadow + base */}
          <Rect
            name="sheet"
            x={0}
            y={0}
            width={sheet.widthIn}
            height={sheet.heightIn}
            fill={sheet.background ?? undefined}
            fillPatternImage={
              // Konva accepts a canvas tile at runtime; types only allow images
              sheet.background
                ? undefined
                : (checkerTile as unknown as HTMLImageElement)
            }
            fillPatternScaleX={sheet.background ? 1 : 1 / scale}
            fillPatternScaleY={sheet.background ? 1 : 1 / scale}
            shadowColor="black"
            shadowBlur={px(24)}
            shadowOpacity={0.45}
            stroke="#3a4150"
            strokeWidth={px(1)}
          />
          {sheet.snapToGrid && (
            <Shape
              listening={false}
              sceneFunc={(ctx, shape) => {
                ctx.beginPath();
                for (let x = sheet.gridSizeIn; x < sheet.widthIn; x += sheet.gridSizeIn) {
                  ctx.moveTo(x, 0);
                  ctx.lineTo(x, sheet.heightIn);
                }
                for (let y = sheet.gridSizeIn; y < sheet.heightIn; y += sheet.gridSizeIn) {
                  ctx.moveTo(0, y);
                  ctx.lineTo(sheet.widthIn, y);
                }
                ctx.setAttr("strokeStyle", "rgba(80, 110, 180, 0.25)");
                ctx.setAttr("lineWidth", px(1));
                ctx.stroke();
                // required by Konva's Shape contract
                ctx.fillStrokeShape(shape);
              }}
            />
          )}
        </Layer>

        {/* content */}
        <Layer ref={contentLayerRef}>
          {elements.map((el) =>
            el.type === "text" ? (
              <TextElementNode
                key={el.id}
                element={el}
                onSelect={handleSelect}
                onDragStart={handleElementDragStart}
                onDragMove={handleElementDragMove}
                onDragEnd={handleElementDragEnd}
                onTransformEnd={handleNodeTransformEnd}
              />
            ) : (
              <CanvasElementNode
                key={el.id}
                element={el}
                asset={assets.find((a) => a.id === el.assetId)}
                onSelect={handleSelect}
                onDragStart={handleElementDragStart}
                onDragMove={handleElementDragMove}
                onDragEnd={handleElementDragEnd}
                onTransformEnd={handleNodeTransformEnd}
              />
            )
          )}
        </Layer>

        {/* overlay: guides, overlays, selection */}
        <Layer>
          {sheet.showBleed && (
            <Rect
              listening={false}
              x={-BLEED_IN}
              y={-BLEED_IN}
              width={sheet.widthIn + BLEED_IN * 2}
              height={sheet.heightIn + BLEED_IN * 2}
              stroke="#ef4444"
              strokeWidth={px(1)}
              dash={[px(6), px(4)]}
            />
          )}
          {sheet.showSafeZone && (
            <Rect
              listening={false}
              x={SAFE_ZONE_IN}
              y={SAFE_ZONE_IN}
              width={sheet.widthIn - SAFE_ZONE_IN * 2}
              height={sheet.heightIn - SAFE_ZONE_IN * 2}
              stroke="#22d3ee"
              strokeWidth={px(1)}
              dash={[px(6), px(4)]}
            />
          )}
          {guides.map((g, i) =>
            g.orientation === "v" ? (
              <Line
                key={i}
                listening={false}
                points={[g.position, -2, g.position, sheet.heightIn + 2]}
                stroke="#f43f5e"
                strokeWidth={px(1)}
                dash={[px(4), px(4)]}
              />
            ) : (
              <Line
                key={i}
                listening={false}
                points={[-2, g.position, sheet.widthIn + 2, g.position]}
                stroke="#f43f5e"
                strokeWidth={px(1)}
                dash={[px(4), px(4)]}
              />
            )
          )}
          {Array.from(overlapIds).map((id) => {
            const el = elements.find((e) => e.id === id);
            if (!el || !el.visible) return null;
            return (
              <Rect
                key={`overlap-${id}`}
                listening={false}
                x={el.x}
                y={el.y}
                width={el.widthIn}
                height={el.heightIn}
                offsetX={el.widthIn / 2}
                offsetY={el.heightIn / 2}
                rotation={el.rotation}
                stroke="#ef4444"
                strokeWidth={px(2)}
                dash={[px(6), px(3)]}
              />
            );
          })}
          {selRect && (
            <Rect
              listening={false}
              x={selRect.x}
              y={selRect.y}
              width={selRect.width}
              height={selRect.height}
              fill="rgba(79, 142, 247, 0.12)"
              stroke="#4f8ef7"
              strokeWidth={px(1)}
            />
          )}
          <Transformer
            ref={trRef}
            keepRatio={aspectLock}
            flipEnabled
            rotateAnchorOffset={26}
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            rotationSnapTolerance={5}
            anchorSize={9}
            anchorCornerRadius={2}
            anchorStroke="#4f8ef7"
            anchorFill="#ffffff"
            borderStroke="#4f8ef7"
            ignoreStroke
            boundBoxFunc={(oldBox, newBox) => {
              const minPx = MIN_ELEMENT_IN * scale;
              if (Math.abs(newBox.width) < minPx || Math.abs(newBox.height) < minPx) {
                return oldBox;
              }
              return newBox;
            }}
            onTransformStart={handleTransformStart}
            onTransform={handleTransform}
            onTransformEnd={handleTransformerTransformEnd}
          />
        </Layer>
      </Stage>
      )}

      {/* draggable scrollbars for navigating large sheets */}
      {size.width > 0 && size.height > 0 && (
        <CanvasScrollbars width={size.width} height={size.height} />
      )}

      {/* live size readout */}
      {sizeLabel && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 translate-y-2 rounded bg-accent px-2 py-0.5 text-xs font-medium text-white shadow"
          style={{ left: sizeLabel.x, top: sizeLabel.y }}
        >
          {sizeLabel.text}
        </div>
      )}

      {/* collision warning */}
      {overlapIds.size > 0 && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-md border border-red-500/40 bg-red-950/80 px-2.5 py-1 text-xs font-medium text-red-300 backdrop-blur">
          ⚠ {overlapIds.size} overlapping design{overlapIds.size === 1 ? "" : "s"}
        </div>
      )}

      {/* empty-state hint */}
      {!hasContent && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-xl border border-dashed border-surface-3 bg-surface-1/70 px-8 py-6 text-center text-sm text-gray-400">
            <p className="mb-1 text-base font-medium text-gray-300">
              Your gang sheet is empty
            </p>
            <p>Drop images here, or upload them in the library panel</p>
          </div>
        </div>
      )}
    </div>
  );
}
