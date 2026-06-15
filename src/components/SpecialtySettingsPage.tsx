import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { GripVertical, Eye, EyeOff, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/contexts/LangContext";
import {
  getUiPref, setUiPref,
  SPECIALTY_ORDER_KEY, SPECIALTY_HIDDEN_KEY,
} from "@/lib/uiPreferences";

/** Mirror of the canonical specialty list used by ConsultationsPage. */
export const DEFAULT_SPECIALTIES: string[] = [
  "Médecine générale",
  "Dentisterie",
  "Orthodontie",
  "Prothèse dentaire",
  "ORL",
  "Pédiatrie",
  "Chirurgie",
  "Gynécologie",
  "Ophtalmologie",
  "Dermatologie",
  "Cardiologie",
  "Autre",
];

export function SpecialtySettingsPage() {
  const { lang } = useLang();
  const [order, setOrder] = useState<string[]>(DEFAULT_SPECIALTIES);
  const [hidden, setHidden] = useState<string[]>([]);
  const dragFrom = React.useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      const savedOrder = await getUiPref<string[]>(SPECIALTY_ORDER_KEY, []);
      const savedHidden = await getUiPref<string[]>(SPECIALTY_HIDDEN_KEY, []);
      const merged = savedOrder.length
        ? [...savedOrder.filter(s => DEFAULT_SPECIALTIES.includes(s)),
           ...DEFAULT_SPECIALTIES.filter(s => !savedOrder.includes(s))]
        : DEFAULT_SPECIALTIES;
      setOrder(merged);
      setHidden(savedHidden);
    })();
  }, []);

  const onDragStart = (i: number) => () => { dragFrom.current = i; };
  const onDragOver = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = dragFrom.current;
    if (from == null || from === i) return;
    setOrder(prev => {
      const next = [...prev];
      const [m] = next.splice(from, 1);
      next.splice(i, 0, m);
      dragFrom.current = i;
      return next;
    });
  };
  const onDragEnd = () => { dragFrom.current = null; };

  const toggleHidden = (s: string) => {
    setHidden(h => h.includes(s) ? h.filter(x => x !== s) : [...h, s]);
  };

  const save = async () => {
    await setUiPref(SPECIALTY_ORDER_KEY, order);
    await setUiPref(SPECIALTY_HIDDEN_KEY, hidden);
    toast.success(lang === "en" ? "Specialty preferences saved" : "Préférences enregistrées");
  };

  const reset = async () => {
    setOrder(DEFAULT_SPECIALTIES);
    setHidden([]);
    await setUiPref(SPECIALTY_ORDER_KEY, []);
    await setUiPref(SPECIALTY_HIDDEN_KEY, []);
    toast.success(lang === "en" ? "Reset to defaults" : "Réinitialisé");
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {lang === "en" ? "Specialties — order & visibility" : "Spécialités — ordre et visibilité"}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {lang === "en"
              ? "Drag to reorder. Toggle the checkbox to show or hide a specialty in the consultations form."
              : "Glissez pour réorganiser. Cochez pour afficher/masquer la spécialité dans le formulaire de consultation."}
          </p>
        </CardHeader>
        <CardContent className="space-y-1">
          {order.map((s, i) => {
            const isHidden = hidden.includes(s);
            return (
              <div
                key={s}
                draggable
                onDragStart={onDragStart(i)}
                onDragOver={onDragOver(i)}
                onDragEnd={onDragEnd}
                className={`flex items-center gap-3 px-3 py-2 rounded border bg-muted/30 cursor-move ${isHidden ? "opacity-50" : ""}`}
              >
                <GripVertical className="w-4 h-4 text-muted-foreground" />
                <Checkbox
                  checked={!isHidden}
                  onCheckedChange={() => toggleHidden(s)}
                />
                <span className="flex-1 text-sm">{s}</span>
                {isHidden
                  ? <EyeOff className="w-4 h-4 text-muted-foreground" />
                  : <Eye className="w-4 h-4 text-primary" />}
              </div>
            );
          })}
          <div className="flex gap-2 pt-3">
            <Button onClick={save} className="flex-1">
              {lang === "en" ? "Save" : "Enregistrer"}
            </Button>
            <Button variant="outline" onClick={reset} className="gap-1">
              <RotateCcw className="w-4 h-4" />
              {lang === "en" ? "Reset" : "Réinitialiser"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
