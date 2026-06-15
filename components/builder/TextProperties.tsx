"use client";

import { useBuilder } from "@/lib/store";
import { FONTS, measureText } from "@/lib/text";
import type { TextAlign, TextElement } from "@/lib/types";

const WEIGHTS = [
  { label: "Light", value: 300 },
  { label: "Regular", value: 400 },
  { label: "Medium", value: 500 },
  { label: "Semibold", value: 600 },
  { label: "Bold", value: 700 },
  { label: "Black", value: 800 },
];

const ALIGNS: { value: TextAlign; icon: string }[] = [
  { value: "left", icon: "M3 6h18M3 12h12M3 18h15" },
  { value: "center", icon: "M3 6h18M6 12h12M5 18h14" },
  { value: "right", icon: "M3 6h18M9 12h12M6 18h15" },
];

interface Props {
  element: TextElement;
}

/** Typography editor shown in the properties panel for a selected text element. */
export default function TextProperties({ element: el }: Props) {
  const updateElements = useBuilder((s) => s.updateElements);
  const updateElementsTransient = useBuilder((s) => s.updateElementsTransient);
  const beginTransient = useBuilder((s) => s.beginTransient);
  const endTransient = useBuilder((s) => s.endTransient);

  /** Apply a patch and re-measure the text box so the transform stays correct. */
  const patch = (p: Partial<TextElement>, commit = true) => {
    const next = { ...el, ...p } as TextElement;
    const m = measureText(next);
    const full = { ...p, widthIn: m.widthIn, heightIn: m.heightIn };
    if (commit) updateElements([{ id: el.id, patch: full }]);
    else updateElementsTransient([{ id: el.id, patch: full }]);
  };

  return (
    <div className="space-y-2.5 border-b border-surface-3 px-3 pb-3 pt-1">
      <textarea
        value={el.text}
        onChange={(e) => patch({ text: e.target.value, name: e.target.value.slice(0, 24) || "Text" })}
        rows={2}
        className="w-full resize-none rounded border border-surface-3 bg-surface-2 px-2 py-1.5 text-xs text-gray-100 outline-none focus:border-accent"
        placeholder="Type your text…"
      />

      <div className="flex gap-1.5">
        <select
          value={el.fontFamily}
          onChange={(e) => patch({ fontFamily: e.target.value })}
          className="min-w-0 flex-1 rounded border border-surface-3 bg-surface-2 px-1.5 py-1 text-xs text-gray-100 outline-none focus:border-accent"
          style={{ fontFamily: el.fontFamily }}
        >
          {FONTS.map((f) => (
            <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>
              {f.family}
            </option>
          ))}
        </select>
        <select
          value={el.fontWeight}
          onChange={(e) => patch({ fontWeight: parseInt(e.target.value, 10) })}
          className="w-24 rounded border border-surface-3 bg-surface-2 px-1.5 py-1 text-xs text-gray-100 outline-none focus:border-accent"
        >
          {WEIGHTS.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1.5">
        {/* font size (points) */}
        <label className="flex flex-1 items-center gap-1.5 text-[10px] text-gray-500">
          Size
          <input
            type="number"
            min={4}
            max={2000}
            value={Math.round(el.fontSize)}
            onChange={(e) => patch({ fontSize: Math.max(4, parseInt(e.target.value, 10) || 4) })}
            className="w-full rounded border border-surface-3 bg-surface-2 px-1.5 py-1 text-xs text-gray-100 outline-none focus:border-accent"
          />
        </label>
        {/* style toggles */}
        {([
          ["B", { fontWeight: el.fontWeight >= 700 ? 400 : 700 }, el.fontWeight >= 700, "font-bold"],
          ["I", { italic: !el.italic }, el.italic, "italic"],
          ["U", { underline: !el.underline }, el.underline, "underline"],
        ] as const).map(([label, p, active, cls]) => (
          <button
            key={label}
            type="button"
            onClick={() => patch(p)}
            className={`h-7 w-7 shrink-0 rounded border text-xs ${cls} ${
              active ? "border-accent bg-accent/15 text-white" : "border-surface-3 text-gray-300 hover:border-gray-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        {/* alignment */}
        <div className="flex overflow-hidden rounded border border-surface-3">
          {ALIGNS.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => patch({ align: a.value })}
              aria-label={`Align ${a.value}`}
              className={`flex h-7 w-7 items-center justify-center ${
                el.align === a.value ? "bg-accent text-white" : "text-gray-300 hover:bg-surface-3"
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d={a.icon} />
              </svg>
            </button>
          ))}
        </div>
        {/* fill colour */}
        <label className="flex items-center gap-1 text-[10px] text-gray-500" title="Text color">
          Fill
          <input
            type="color"
            value={el.color}
            onChange={(e) => patch({ color: e.target.value })}
            className="h-7 w-7 cursor-pointer rounded border border-surface-3 bg-transparent p-0.5"
          />
        </label>
        {/* outline colour */}
        <label className="flex items-center gap-1 text-[10px] text-gray-500" title="Outline color">
          Out
          <input
            type="color"
            value={el.outlineColor}
            onChange={(e) => patch({ outlineColor: e.target.value })}
            className="h-7 w-7 cursor-pointer rounded border border-surface-3 bg-transparent p-0.5"
          />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[10px] text-gray-500">
        <label className="space-y-1">
          <span>Outline {el.outlineWidth.toFixed(1)}pt</span>
          <input
            type="range"
            min={0}
            max={12}
            step={0.5}
            value={el.outlineWidth}
            onPointerDown={beginTransient}
            onPointerUp={endTransient}
            onChange={(e) => patch({ outlineWidth: parseFloat(e.target.value) }, false)}
            className="w-full accent-[#4f8ef7]"
          />
        </label>
        <label className="space-y-1">
          <span>Spacing {el.letterSpacing.toFixed(1)}</span>
          <input
            type="range"
            min={-5}
            max={30}
            step={0.5}
            value={el.letterSpacing}
            onPointerDown={beginTransient}
            onPointerUp={endTransient}
            onChange={(e) => patch({ letterSpacing: parseFloat(e.target.value) }, false)}
            className="w-full accent-[#4f8ef7]"
          />
        </label>
        <label className="space-y-1">
          <span>Line {el.lineHeight.toFixed(2)}</span>
          <input
            type="range"
            min={0.8}
            max={2.5}
            step={0.05}
            value={el.lineHeight}
            onPointerDown={beginTransient}
            onPointerUp={endTransient}
            onChange={(e) => patch({ lineHeight: parseFloat(e.target.value) }, false)}
            className="w-full accent-[#4f8ef7]"
          />
        </label>
      </div>
    </div>
  );
}
