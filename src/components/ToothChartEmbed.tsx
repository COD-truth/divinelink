import React, { useState } from "react";
import { type ToothRecord, type ToothCondition } from "@/lib/db";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { useLang } from "@/contexts/LangContext";

const ADULT_UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const ADULT_UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const ADULT_LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];
const ADULT_LOWER_RIGHT = [41, 42, 43, 44, 45, 46, 47, 48];
const PED_UR = [55, 54, 53, 52, 51];
const PED_UL = [61, 62, 63, 64, 65];
const PED_LL = [71, 72, 73, 74, 75];
const PED_LR = [81, 82, 83, 84, 85];

const CONDITION_COLORS: Record<ToothCondition, string> = {
  healthy: "#22c55e", decayed: "#ef4444", missing: "#1c1917", crowned: "#f97316",
  filled: "#3b82f6", fractured: "#d4d4d4", to_extract: "#eab308", mobile: "#a855f7",
};
const CONDITION_EMOJI: Record<ToothCondition, string> = {
  healthy: "🟢", decayed: "🔴", missing: "⚫", crowned: "🟠",
  filled: "🔵", fractured: "⚪", to_extract: "🟡", mobile: "🟣",
};
const CONDITIONS: ToothCondition[] = ["healthy", "decayed", "missing", "crowned", "filled", "fractured", "to_extract", "mobile"];

function makeEmpty(pediatric: boolean): ToothRecord[] {
  const nums = pediatric
    ? [...PED_UR, ...PED_UL, ...PED_LL, ...PED_LR]
    : [...ADULT_UPPER_RIGHT, ...ADULT_UPPER_LEFT, ...ADULT_LOWER_LEFT, ...ADULT_LOWER_RIGHT];
  return nums.map(n => ({ number: n, condition: "healthy" as ToothCondition }));
}

function Tooth({ n, rec, selected, onClick }: { n: number; rec: ToothRecord; selected: boolean; onClick: () => void }) {
  const color = CONDITION_COLORS[rec.condition];
  const missing = rec.condition === "missing";
  return (
    <g onClick={onClick} className="cursor-pointer">
      <rect x={-10} y={-14} width={20} height={28} rx={4}
        fill={missing ? "transparent" : color}
        stroke={selected ? "#fff" : "hsl(var(--border))"}
        strokeWidth={selected ? 2.5 : 1} opacity={missing ? 0.2 : 0.85} />
      {missing && <line x1={-8} y1={-12} x2={8} y2={12} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} />}
      <text y={4} textAnchor="middle" fill={missing ? "hsl(var(--muted-foreground))" : "#fff"}
        fontSize={9} fontWeight={700} fontFamily="monospace" style={{ pointerEvents: "none" }}>{n}</text>
    </g>
  );
}

interface Props {
  teeth: ToothRecord[];
  onChange: (teeth: ToothRecord[]) => void;
  pediatric?: boolean;
}

export function ToothChartEmbed({ teeth: initial, onChange, pediatric: initialPed }: Props) {
  const { t } = useLang();
  const [pediatric, setPediatric] = useState(!!initialPed);
  const teeth = initial.length ? initial : makeEmpty(pediatric);
  const [sel, setSel] = useState<number | null>(null);
  const map = new Map(teeth.map(t => [t.number, t]));
  const rec = sel !== null ? map.get(sel) : undefined;

  const togglePed = (v: boolean) => { setPediatric(v); onChange(makeEmpty(v)); setSel(null); };
  const update = (patch: Partial<ToothRecord>) => {
    if (sel === null) return;
    onChange(teeth.map(t => t.number === sel ? { ...t, ...patch } : t));
  };

  const ur = pediatric ? PED_UR : ADULT_UPPER_RIGHT;
  const ul = pediatric ? PED_UL : ADULT_UPPER_LEFT;
  const ll = pediatric ? PED_LL : ADULT_LOWER_LEFT;
  const lr = pediatric ? PED_LR : ADULT_LOWER_RIGHT;
  const count = pediatric ? 5 : 8;
  const spacing = 28;
  const w = count * spacing + 20;

  const renderRow = (nums: number[], y: number, offsetX = 0) => (
    <g transform={`translate(${offsetX}, ${y})`}>
      {nums.map((n, i) => (
        <g key={n} transform={`translate(${i * spacing + spacing / 2}, 0)`}>
          <Tooth n={n} rec={map.get(n) || { number: n, condition: "healthy" }} selected={sel === n} onClick={() => setSel(n)} />
        </g>
      ))}
    </g>
  );

  return (
    <Card>
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-sm">
            <span>{t("dental.adult")}</span>
            <Switch checked={pediatric} onCheckedChange={togglePed} />
            <span>{t("dental.pediatric")}</span>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px]">
            {CONDITIONS.map(c => (
              <span key={c} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: CONDITION_COLORS[c] }} />
                {t(`dental.${c}`)}
              </span>
            ))}
          </div>
        </div>
        <svg viewBox={`0 0 ${w * 2 + 20} 140`} className="w-full max-w-lg mx-auto" style={{ maxHeight: 200 }}>
          {renderRow(ur, 20)}
          {renderRow(ul, 20, w + 10)}
          <line x1={0} y1={55} x2={w * 2 + 20} y2={55} stroke="hsl(var(--border))" strokeWidth={0.5} strokeDasharray="4 2" />
          {renderRow(ll, 90)}
          {renderRow([...lr].reverse(), 90, w + 10)}
        </svg>
        {rec && (
          <div className="border rounded p-3 space-y-2 bg-muted/30">
            <div className="font-semibold text-sm">{t("dental.tooth")} {sel} {CONDITION_EMOJI[rec.condition]}</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t("dental.condition")}</Label>
                <Select value={rec.condition} onValueChange={v => update({ condition: v as ToothCondition })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map(c => <SelectItem key={c} value={c}>{CONDITION_EMOJI[c]} {t(`dental.${c}`)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{t("dental.notes")}</Label>
                <Input value={rec.notes || ""} onChange={e => update({ notes: e.target.value })} />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
