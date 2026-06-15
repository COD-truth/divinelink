import React, { useEffect, useState } from "react";
import { db, type CustomCategory } from "@/lib/db";
import { useLang } from "@/contexts/LangContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Tag as TagIcon } from "lucide-react";
import { toast } from "sonner";
import { TREATMENT_CATEGORIES } from "@/lib/uiPreferences";
import { getClinicId } from "@/lib/clinicSettings";

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || `cat_${Date.now()}`;
}

export function DocumentCategoriesPage() {
  const { lang } = useLang();
  const tr = (fr: string, en: string) => (lang === "en" ? en : fr);
  const [items, setItems] = useState<CustomCategory[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CustomCategory | null>(null);
  const [fr, setFr] = useState(""); const [en, setEn] = useState("");

  const load = async () => setItems(await db.customCategories.toArray());
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setFr(""); setEn(""); setOpen(true); };
  const openEdit = (c: CustomCategory) => { setEditing(c); setFr(c.fr); setEn(c.en); setOpen(true); };

  const save = async () => {
    if (!fr.trim() && !en.trim()) { toast.error(tr("Nom requis", "Name required")); return; }
    const label = (fr || en).trim();
    const value = editing?.value || slugify(en || fr);
    if (!editing) {
      const exists = [...TREATMENT_CATEGORIES, ...items].some(c => c.value === value);
      if (exists) { toast.error(tr("Code déjà utilisé", "Slug already used")); return; }
    }
    if (editing?.id) await db.customCategories.update(editing.id, { fr: fr.trim() || label, en: en.trim() || label });
    else await db.customCategories.add({ value, fr: fr.trim() || label, en: en.trim() || label, clinicId: getClinicId(), createdAt: new Date().toISOString() });
    setOpen(false); load();
  };

  const remove = async (c: CustomCategory) => {
    if (!confirm(tr("Supprimer ? Les documents existants conserveront le code.", "Delete? Existing documents keep the slug."))) return;
    await db.customCategories.delete(c.id!);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2"><TagIcon className="w-5 h-5" />{tr("Catégories de documents", "Document categories")}</h2>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />{tr("Ajouter", "Add")}</Button>
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2">{tr("Intégrées", "Built-in")}</p>
        <div className="flex flex-wrap gap-2">
          {TREATMENT_CATEGORIES.map(c => (
            <Badge key={c.value} variant="secondary">{lang === "en" ? c.en : c.fr}</Badge>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2">{tr("Personnalisées", "Custom")}</p>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tr("Aucune catégorie personnalisée", "No custom categories")}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {items.map(c => (
              <Card key={c.id}><CardContent className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{lang === "en" ? c.en : c.fr}</p>
                  <p className="text-[10px] font-mono text-muted-foreground">{c.value}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(c)}><Pencil className="w-3 h-3" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => remove(c)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </CardContent></Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? tr("Modifier catégorie", "Edit category") : tr("Nouvelle catégorie", "New category")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Français</Label><Input value={fr} onChange={e => setFr(e.target.value)} /></div>
            <div><Label>English</Label><Input value={en} onChange={e => setEn(e.target.value)} /></div>
            {editing && <p className="text-xs font-mono text-muted-foreground">{editing.value}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{tr("Annuler", "Cancel")}</Button><Button onClick={save}>{tr("Enregistrer", "Save")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
