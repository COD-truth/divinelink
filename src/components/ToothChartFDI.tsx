import React from "react";
import { cn } from "@/lib/utils";

/** FDI adult numbering, arranged upper-right→upper-left, then lower-left→lower-right */
const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

interface Props {
  /** Comma-separated list or array of selected FDI numbers */
  value?: string | number[];
  onChange?: (csv: string, list: number[]) => void;
  readOnly?: boolean;
  size?: "sm" | "md";
}

function parse(value?: string | number[]): Set<number> {
  if (!value) return new Set();
  if (Array.isArray(value)) return new Set(value);
  return new Set(
    String(value)
      .split(/[,\s]+/)
      .map(s => parseInt(s, 10))
      .filter(n => !isNaN(n))
  );
}

export function ToothChartFDI({ value, onChange, readOnly, size = "md" }: Props) {
  const selected = parse(value);

  const toggle = (n: number) => {
    if (readOnly) return;
    const next = new Set(selected);
    next.has(n) ? next.delete(n) : next.add(n);
    const list = Array.from(next).sort((a, b) => a - b);
    onChange?.(list.join(", "), list);
  };

  const dim = size === "sm" ? "w-7 h-7 text-[10px]" : "w-9 h-9 text-xs";

  const row = (nums: number[]) => (
    <div className="flex gap-1 justify-center flex-wrap">
      {nums.map((n, i) => (
        <React.Fragment key={n}>
          {i === 8 && <div className="w-1.5" />}
          <button
            type="button"
            onClick={() => toggle(n)}
            className={cn(
              dim,
              "rounded border font-mono font-semibold transition-colors",
              selected.has(n)
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-muted border-border"
            )}
            title={`Dent ${n}`}
          >
            {n}
          </button>
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <div className="space-y-1 select-none">
      {row(UPPER)}
      <div className="h-px bg-border my-1" />
      {row(LOWER)}
    </div>
  );
}
