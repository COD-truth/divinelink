import React, { useState } from "react";
import { useLang } from "@/contexts/LangContext";
import { type ToothCondition } from "@/lib/db";
import { Button } from "@/components/ui/button";

// Adult teeth numbering (FDI notation)
const upperTeeth = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const lowerTeeth = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];

const conditionColors: Record<ToothCondition, string> = {
  healthy: "bg-tooth-healthy",
  caries: "bg-tooth-caries",
  filled: "bg-tooth-filled",
  extracted: "bg-tooth-extracted",
  crown: "bg-tooth-crown",
};

interface Props {
  chart: Record<string, ToothCondition>;
  onChange: (chart: Record<string, ToothCondition>) => void;
  readOnly?: boolean;
}

export function ToothChart({ chart, onChange, readOnly }: Props) {
  const { t } = useLang();
  const [selectedCondition, setSelectedCondition] = useState<ToothCondition>("caries");

  const handleClick = (num: number) => {
    if (readOnly) return;
    const key = num.toString();
    const current = chart[key] || "healthy";
    if (current === selectedCondition) {
      const newChart = { ...chart };
      delete newChart[key];
      onChange(newChart);
    } else {
      onChange({ ...chart, [key]: selectedCondition });
    }
  };

  const getCondition = (num: number): ToothCondition => chart[num.toString()] || "healthy";

  const conditions: ToothCondition[] = ["healthy", "caries", "filled", "extracted", "crown"];

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          {conditions.map(c => (
            <Button
              key={c}
              size="sm"
              variant={selectedCondition === c ? "default" : "outline"}
              onClick={() => setSelectedCondition(c)}
              className="gap-2"
            >
              <span className={`w-3 h-3 rounded-full ${conditionColors[c]}`} />
              {t(`tooth.${c}`)}
            </Button>
          ))}
        </div>
      )}

      <div className="bg-muted rounded-lg p-4 space-y-3">
        {/* Upper jaw */}
        <div className="flex justify-center gap-1 flex-wrap">
          {upperTeeth.map(num => (
            <button
              key={num}
              onClick={() => handleClick(num)}
              className={`tooth-btn w-8 h-10 rounded-t-lg border-2 border-border flex flex-col items-center justify-center text-[10px] font-mono ${conditionColors[getCondition(num)]} ${readOnly ? "cursor-default" : ""}`}
              title={`${num}: ${getCondition(num)}`}
            >
              {num}
            </button>
          ))}
        </div>
        <div className="border-t border-border" />
        {/* Lower jaw */}
        <div className="flex justify-center gap-1 flex-wrap">
          {lowerTeeth.map(num => (
            <button
              key={num}
              onClick={() => handleClick(num)}
              className={`tooth-btn w-8 h-10 rounded-b-lg border-2 border-border flex flex-col items-center justify-center text-[10px] font-mono ${conditionColors[getCondition(num)]} ${readOnly ? "cursor-default" : ""}`}
              title={`${num}: ${getCondition(num)}`}
            >
              {num}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
