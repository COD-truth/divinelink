import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/db";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ChevronDown } from "lucide-react";

const DEFAULT_TREATMENTS = [
  { name: "Traitement canalaire / Root Canal", defaultPrice: 25000 },
  { name: "Extraction simple", defaultPrice: 8000 },
  { name: "Extraction chirurgicale", defaultPrice: 20000 },
  { name: "Couronne / Crown", defaultPrice: 80000 },
  { name: "Bridge", defaultPrice: 150000 },
  { name: "Implant dentaire", defaultPrice: 250000 },
  { name: "Detartrage / Scaling", defaultPrice: 15000 },
  { name: "Obturation composite", defaultPrice: 12000 },
  { name: "Obturation amalgame", defaultPrice: 8000 },
  { name: "Pulpectomie", defaultPrice: 15000 },
  { name: "Prothese partielle amovible", defaultPrice: 120000 },
  { name: "Prothese complete", defaultPrice: 200000 },
  { name: "Gouttiere occlusale", defaultPrice: 30000 },
  { name: "Blanchiment dentaire", defaultPrice: 50000 },
  { name: "Radio retro-alveolaire", defaultPrice: 5000 },
  { name: "Panoramique dentaire", defaultPrice: 15000 },
  { name: "Inlay / Onlay", defaultPrice: 45000 },
  { name: "Pose appareil orthodontique", defaultPrice: 300000 },
  { name: "Consultation dentaire", defaultPrice: 5000 },
  { name: "Consultation generale", defaultPrice: 5000 },
  { name: "Pansement", defaultPrice: 3000 },
  { name: "Injection IM", defaultPrice: 2000 },
  { name: "Injection IV", defaultPrice: 3000 },
  { name: "Perfusion", defaultPrice: 8000 },
  { name: "Suture", defaultPrice: 10000 },
  { name: "Prise de sang", defaultPrice: 5000 },
  { name: "Certificat medical", defaultPrice: 5000 },
];

export interface TreatmentLine {
  id: string;
  name: string;
  tooth?: string;
  quantity: number;
  unitPrice: number;
}

interface Props {
  value: TreatmentLine[];
  onChange: (lines: TreatmentLine[]) => void;
  clinicId?: string;
}

function uid() { return Math.random().toString(36).slice(2, 9); }

export function TreatmentItems({ value, onChange, clinicId }: Props) {
  const [query, setQuery] = useState<Record<string, string>>({});
  const [showSug, setShowSug] = useState<Record<string, boolean>>({});

  const getSuggestions = useCallback((q: string) => {
    if (!q || q.length < 1) return [];
    const lower = q.toLowerCase();
    return DEFAULT_TREATMENTS.filter(t => t.name.toLowerCase().includes(lower)).slice(0, 7);
  }, []);

  const addLine = () => onChange([...value, { id: uid(), name: "", tooth: "", quantity: 1, unitPrice: 0 }]);
  const removeLine = (id: string) => onChange(value.filter(l => l.id !== id));
  const updateLine = (id: string, field: keyof TreatmentLine, val: string | number) =>
    onChange(value.map(l => l.id === id ? { ...l, [field]: val } : l));

  const pickSuggestion = (lineId: string, name: string, price: number) => {
    onChange(value.map(l => l.id === lineId ? { ...l, name, unitPrice: l.unitPrice || price } : l));
    setQuery(q => ({ ...q, [lineId]: name }));
    setShowSug(s => ({ ...s, [lineId]: false }));
  };

  const total = value.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Traitements effectues / Treatments</span>
        <Button type="button" size="sm" variant="outline" onClick={addLine} className="gap-1 h-7 text-xs">
          <Plus className="w-3 h-3" /> Ajouter
        </Button>
      </div>
      {value.length === 0 && (
        <button type="button" onClick={addLine}
          className="w-full border-2 border-dashed border-muted rounded-lg py-4 text-sm text-muted-foreground hover:border-primary/40 transition-colors">
          + Cliquer pour ajouter un traitement
        </button>
      )}
      {value.map((line) => {
        const sug = getSuggestions(query[line.id] ?? line.name);
        return (
          <div key={line.id} className="relative bg-muted/30 rounded-lg p-3 space-y-2 border border-muted">
            <div className="relative">
              <Input
                placeholder="Nom du traitement... (ex: Root Canal)"
                value={query[line.id] ?? line.name}
                onChange={e => {
                  const v = e.target.value;
                  setQuery(q => ({ ...q, [line.id]: v }));
                  updateLine(line.id, "name", v);
                  setShowSug(s => ({ ...s, [line.id]: true }));
                }}
                onFocus={() => setShowSug(s => ({ ...s, [line.id]: true }))}
                onBlur={() => setTimeout(() => setShowSug(s => ({ ...s, [line.id]: false })), 200)}
                className="text-sm pr-8"
                autoComplete="off"
              />
              {showSug[line.id] && sug.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg overflow-hidden">
                  {sug.map((s, si) => (
                    <button key={si} type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b border-muted last:border-0"
                      onMouseDown={() => pickSuggestion(line.id, s.name, s.defaultPrice)}>
                      {s.name}
                      <span className="float-right text-xs text-muted-foreground">
                        {s.defaultPrice.toLocaleString()} FCFA
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Dent / Tooth</label>
                <Input placeholder="11-48" value={line.tooth || ""}
                  onChange={e => updateLine(line.id, "tooth", e.target.value)} className="text-sm h-8" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Quantite</label>
                <Input type="number" min={1} value={line.quantity}
                  onChange={e => updateLine(line.id, "quantity", Number(e.target.value) || 1)} className="text-sm h-8" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Prix (FCFA)</label>
                <Input type="number" min={0} placeholder="0" value={line.unitPrice || ""}
                  onChange={e => updateLine(line.id, "unitPrice", Number(e.target.value) || 0)} className="text-sm h-8" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Total: <strong>{(line.quantity * line.unitPrice).toLocaleString()} FCFA</strong>
              </span>
              <Button type="button" size="icon" variant="ghost"
                className="h-6 w-6 text-destructive" onClick={() => removeLine(line.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        );
      })}
      {value.length > 0 && (
        <div className="flex justify-end items-center gap-2 pt-1 border-t border-muted">
          <span className="text-sm text-muted-foreground">Total traitements:</span>
          <Badge variant="secondary" className="text-sm font-bold px-3">
            {total.toLocaleString()} FCFA
          </Badge>
        </div>
      )}
    </div>
  );
}
