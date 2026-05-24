import React, { useEffect, useState } from "react";
import { db, type Document as Doc } from "@/lib/db";
import { useLang } from "@/contexts/LangContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, Image as ImageIcon, X, Save, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { compressImage } from "@/lib/imageUtils";
import { readFileAsDataUrl } from "@/components/AttachmentsField";
import { getClinicId } from "@/lib/clinicSettings";

interface Props {
  patientId: number;
}

/**
 * Medical booklet ("Carnet de santé") scanner.
 * Camera (rear-facing) + gallery + drag-and-drop. Stores each page as a
 * document row with source="carnet_capture". Supports lightbox preview.
 */
export function MedicalBookletScanner({ patientId }: Props) {
  const { lang } = useLang();
  const { user } = useAuth();
  const [pending, setPending] = useState<File[]>([]);
  const [saved, setSaved] = useState<Doc[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const reload = async () => {
    const all = await db.documents.where("patientId").equals(patientId).toArray();
    setSaved(all.filter(d => d.source === "carnet_capture").sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  };
  useEffect(() => { reload(); }, [patientId]);

  const addFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const list = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (list.length) setPending(p => [...p, ...list]);
  };

  const removePending = (i: number) => setPending(p => p.filter((_, idx) => idx !== i));

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const savePending = async () => {
    if (!pending.length) return;
    const now = new Date().toISOString();
    const cid = getClinicId();
    const startIndex = saved.length;
    for (let i = 0; i < pending.length; i++) {
      const f = pending[i];
      try {
        const data = await compressImage(f);
        await db.documents.add({
          patientId,
          name: `${lang === "fr" ? "Carnet page" : "Booklet page"} ${startIndex + i + 1}`,
          type: f.type || "image/jpeg",
          data,
          size: f.size,
          source: "carnet_capture",
          clinicId: cid,
          createdAt: now,
          updatedAt: now,
          updatedBy: user?.name,
        });
      } catch { /* skip */ }
    }
    toast.success(lang === "fr" ? "Carnet enregistré" : "Booklet saved");
    setPending([]);
    reload();
  };

  const deleteOne = async (id: number) => {
    await db.documents.delete(id);
    reload();
  };

  const title = lang === "fr" ? "📋 Carnet de santé" : "📋 Medical booklet";
  const hint = lang === "fr" ? "Photographier ou importer les pages" : "Snap or import pages";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BookOpen className="w-4 h-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-lg p-4 text-center min-h-[140px] flex flex-col items-center justify-center gap-3 transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/30"}`}
        >
          <p className="text-sm text-muted-foreground">{hint}</p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Button asChild size="sm" variant="default" type="button">
              <label className="cursor-pointer">
                <Camera className="w-4 h-4 mr-1" />
                {lang === "fr" ? "Caméra" : "Camera"}
                <input type="file" accept="image/*" capture="environment" multiple className="hidden"
                  onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
              </label>
            </Button>
            <Button asChild size="sm" variant="outline" type="button">
              <label className="cursor-pointer">
                <ImageIcon className="w-4 h-4 mr-1" />
                {lang === "fr" ? "Galerie" : "Gallery"}
                <input type="file" accept="image/*" multiple className="hidden"
                  onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
              </label>
            </Button>
          </div>
        </div>

        {pending.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {pending.map((f, i) => (
                <div key={i} className="relative aspect-square rounded overflow-hidden border bg-muted">
                  <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" onLoad={e => URL.revokeObjectURL((e.target as HTMLImageElement).src)} />
                  <button type="button" onClick={() => removePending(i)}
                    className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full w-6 h-6 flex items-center justify-center">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <Button type="button" onClick={savePending} className="w-full gap-2">
              <Save className="w-4 h-4" />
              {lang === "fr" ? `Sauvegarder (${pending.length})` : `Save (${pending.length})`}
            </Button>
          </>
        )}

        {saved.length > 0 && (
          <>
            <div className="text-xs font-medium text-muted-foreground pt-2 border-t">
              {lang === "fr" ? "Pages enregistrées" : "Saved pages"} ({saved.length})
            </div>
            <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto">
              {saved.map(d => (
                <div key={d.id} className="relative aspect-square rounded overflow-hidden border bg-muted group">
                  <img src={d.data} alt={d.name} className="w-full h-full object-cover cursor-pointer" onClick={() => setLightbox(d.data)} />
                  <button type="button" onClick={() => d.id && deleteOne(d.id)}
                    className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>

      {lightbox && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain" />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
      )}
    </Card>
  );
}
