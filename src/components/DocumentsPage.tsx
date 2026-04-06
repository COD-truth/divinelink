import React, { useEffect, useState } from "react";
import { db, type Document as Doc, type Patient } from "@/lib/db";
import { useLang } from "@/contexts/LangContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, Trash2, Image, X } from "lucide-react";
import { toast } from "sonner";

const MAX_SIZE = 5 * 1024 * 1024;

export function DocumentsPage() {
  const { t } = useLang();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState("");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [preview, setPreview] = useState<Doc | null>(null);

  const load = async () => {
    setPatients(await db.patients.toArray());
    if (selectedPatient) {
      setDocs(await db.documents.where("patientId").equals(parseInt(selectedPatient)).reverse().toArray());
    }
  };

  useEffect(() => { load(); }, [selectedPatient]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedPatient || !e.target.files) return;
    const file = e.target.files[0];
    if (file.size > MAX_SIZE) {
      toast.error(t("doc.maxSize"));
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      await db.documents.add({
        patientId: parseInt(selectedPatient),
        name: file.name,
        type: file.type,
        data: reader.result as string,
        size: file.size,
        createdAt: new Date().toISOString(),
      });
      toast.success(t("doc.upload"));
      load();
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleDelete = async (id: number) => {
    await db.documents.delete(id);
    toast.success(t("doc.delete"));
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Label>{t("apt.patient")}</Label>
          <Select value={selectedPatient} onValueChange={setSelectedPatient}>
            <SelectTrigger><SelectValue placeholder="..." /></SelectTrigger>
            <SelectContent>
              {patients.map(p => (
                <SelectItem key={p.id} value={p.id!.toString()}>{p.firstName} {p.lastName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedPatient && (
          <div className="flex items-end">
            <Button asChild className="gap-2">
              <label>
                <Upload className="w-4 h-4" /> {t("doc.upload")}
                <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
              </label>
            </Button>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t("doc.maxSize")}</p>

      {docs.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">{selectedPatient ? t("doc.noFiles") : t("common.noData")}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {docs.map(d => (
            <Card key={d.id} className="group relative cursor-pointer" onClick={() => setPreview(d)}>
              <CardContent className="p-2">
                <div className="aspect-square rounded bg-muted overflow-hidden">
                  <img src={d.data} alt={d.name} className="w-full h-full object-cover" />
                </div>
                <p className="text-xs truncate mt-1">{d.name}</p>
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 right-1 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={e => { e.stopPropagation(); handleDelete(d.id!); }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{preview?.name}</DialogTitle></DialogHeader>
          {preview && <img src={preview.data} alt={preview.name} className="w-full rounded" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
