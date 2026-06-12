"use client";

import { useEffect, useState } from "react";

interface Props {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  decimals?: number;
  disabled?: boolean;
}

/** Numeric input that keeps local text state and commits on blur/Enter. */
export default function NumField({
  label,
  value,
  onCommit,
  min,
  max,
  step = 0.1,
  suffix,
  decimals = 2,
  disabled,
}: Props) {
  const [text, setText] = useState(value.toFixed(decimals));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(parseFloat(value.toFixed(decimals)).toString());
  }, [value, decimals, focused]);

  const commit = () => {
    const parsed = parseFloat(text);
    if (Number.isNaN(parsed)) {
      setText(parseFloat(value.toFixed(decimals)).toString());
      return;
    }
    let v = parsed;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    setText(parseFloat(v.toFixed(decimals)).toString());
    if (Math.abs(v - value) > 1e-9) onCommit(v);
  };

  return (
    <label className="flex items-center gap-1.5 text-xs text-gray-400">
      <span className="w-4 shrink-0">{label}</span>
      <span className="relative flex-1">
        <input
          type="number"
          value={text}
          step={step}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="w-full rounded border border-surface-3 bg-surface-2 px-2 py-1 text-xs text-gray-100 outline-none [appearance:textfield] focus:border-accent disabled:opacity-40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">
            {suffix}
          </span>
        )}
      </span>
    </label>
  );
}
