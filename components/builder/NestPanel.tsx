"use client";

import { useState } from "react";
import { useAutoNest } from "@/hooks/useAutoNest";
import type {
  ArrangeMode,
  NestOptions,
  OptimizationMode,
} from "@/lib/nesting/types";
import { SAFE_ZONE_IN } from "@/lib/presets";
import { useBuilder } from "@/lib/store";
import NumField from "./NumField";

const MODES: { value: ArrangeMode; label: string; hint: string }[] = [
  { value: "compact", label: "Compact", hint: "Maximum density free-form packing" },
  { value: "rows", label: "Rows", hint: "Uniform rows — DTF-cut friendly" },
  { value: "grid", label: "Grid", hint: "Uniform cells, ideal for identical designs" },
  { value: "production", label: "Production", hint: "Multi-pass packing for best utilization" },
];

const OPTIMIZATIONS: { value: OptimizationMode; label: string }[] = [
  { value: "fast", label: "Fast" },
  { value: "balanced", label: "Balanced" },
  { value: "maximum", label: "Maximum" },
];

export default function NestPanel() {
  const elementsCount = useBuilder((s) => s.elements.length);
  const selectedCount = useBuilder((s) => s.selectedIds.length);
  const stats = useBuilder((s) => s.nestStats);
  const showSafeZone = useBuilder((s) => s.sheet.showSafeZone);

  const { nest, extendSheetAndNest, busy } = useAutoNest();

  const [mode, setMode] = useState<ArrangeMode>("compact");
  const [optimization, setOptimization] = useState<OptimizationMode>("balanced");
  const [allowRotation, setAllowRotation] = useState(true);
  const [spacing, setSpacing] = useState(0.125);
  const [allowScale, setAllowScale] = useState(false);
  const [minScale, setMinScale] = useState(70);

  const buildOptions = (): NestOptions => ({
    mode,
    optimization: mode === "production" ? "maximum" : optimization,
    allowRotation,
    spacing,
    margin: showSafeZone ? SAFE_ZONE_IN : 0,
    allowScale,
    minScale: minScale / 100,
  });

  return (
    <div className="border-b border-surface-3 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Auto-Nest
      </h3>

      <div className="mb-2 grid grid-cols-2 gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            title={m.hint}
            onClick={() => setMode(m.value)}
            className={`rounded border px-2 py-1.5 text-xs transition-colors ${
              mode === m.value
                ? "border-accent bg-accent/15 text-white"
                : "border-surface-3 text-gray-300 hover:border-gray-500"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode !== "production" && (
        <div className="mb-2 flex items-center justify-between text-xs text-gray-300">
          <span>Effort</span>
          <div className="flex overflow-hidden rounded border border-surface-3">
            {OPTIMIZATIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setOptimization(o.value)}
                className={`px-2 py-1 text-[11px] ${
                  optimization === o.value
                    ? "bg-accent text-white"
                    : "text-gray-300 hover:bg-surface-3"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="flex cursor-pointer items-center justify-between py-1 text-xs text-gray-300">
        Allow 90° rotation
        <input
          type="checkbox"
          checked={allowRotation}
          onChange={(e) => setAllowRotation(e.target.checked)}
          className="h-3.5 w-3.5 accent-[#4f8ef7]"
        />
      </label>

      <div className="flex items-center justify-between gap-2 py-1">
        <span className="text-xs text-gray-300">Spacing</span>
        <div className="w-24">
          <NumField
            label=""
            value={spacing}
            min={0}
            max={2}
            step={0.0625}
            suffix="in"
            onCommit={setSpacing}
          />
        </div>
      </div>

      <label className="flex cursor-pointer items-center justify-between py-1 text-xs text-gray-300">
        Allow auto-scale to fit
        <input
          type="checkbox"
          checked={allowScale}
          onChange={(e) => setAllowScale(e.target.checked)}
          className="h-3.5 w-3.5 accent-[#4f8ef7]"
        />
      </label>
      {allowScale && (
        <div className="flex items-center justify-between gap-2 py-1">
          <span className="text-xs text-gray-300">Minimum scale</span>
          <div className="w-24">
            <NumField
              label=""
              value={minScale}
              min={25}
              max={100}
              step={5}
              decimals={0}
              suffix="%"
              onCommit={setMinScale}
            />
          </div>
        </div>
      )}

      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          disabled={busy || elementsCount === 0}
          onClick={() => void nest("all", buildOptions())}
          className="flex-1 rounded bg-accent px-2 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Nesting…" : "Nest all"}
        </button>
        <button
          type="button"
          disabled={busy || selectedCount === 0}
          onClick={() => void nest("selected", buildOptions())}
          title="Nest only the selected designs around everything else"
          className="flex-1 rounded border border-surface-3 px-2 py-1.5 text-xs text-gray-300 hover:border-gray-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Nest selected
        </button>
      </div>

      {stats && (
        <div className="mt-3 space-y-1 rounded-lg bg-surface-2 p-2.5 text-xs">
          <div className="flex justify-between text-gray-300">
            <span>Sheet utilization</span>
            <span className="font-semibold text-white tabular-nums">
              {(stats.utilization * 100).toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${Math.min(100, stats.utilization * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Empty area</span>
            <span className="tabular-nums">
              {(100 - stats.utilization * 100).toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Placed / rows</span>
            <span className="tabular-nums">
              {stats.placed} / {stats.rows}
            </span>
          </div>
          {stats.scale < 1 && (
            <div className="flex justify-between text-amber-400">
              <span>Auto-scaled to</span>
              <span className="tabular-nums">{Math.round(stats.scale * 100)}%</span>
            </div>
          )}
          <div className="flex justify-between text-gray-500">
            <span>{stats.strategy}</span>
            <span className="tabular-nums">{stats.durationMs} ms</span>
          </div>
        </div>
      )}

      {stats && stats.overflow > 0 && (
        <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-950/40 p-2.5 text-xs text-amber-200">
          <p className="mb-2 font-medium">
            {stats.overflow} design{stats.overflow === 1 ? "" : "s"} could not
            fit. Increase sheet length or allow scaling.
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => void extendSheetAndNest(buildOptions())}
              className="flex-1 rounded bg-amber-500/20 px-2 py-1 font-medium hover:bg-amber-500/30 disabled:opacity-40"
            >
              Extend sheet
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setAllowScale(true);
                void nest("all", { ...buildOptions(), allowScale: true });
              }}
              className="flex-1 rounded bg-amber-500/20 px-2 py-1 font-medium hover:bg-amber-500/30 disabled:opacity-40"
            >
              Auto scale
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
