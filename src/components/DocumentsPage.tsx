import React, { useEffect, useMemo, useState } from "react";
import { db, type Document as Doc, type DocumentTag, type Patient } from "@/lib/db";
import { useLang } from "@/contexts/LangContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Upload, Trash2, Search, FileText } from "lucide-react";
import { toast } from "sonner";
import { compressImage, fileToDataUrl, formatBytes } from "@/lib/imageUtils";
import { decryptPatients } from "@/lib/patientCrypto";

const MAX_SIZE = 5 * 1024 * 1024;

const TAG_KEYS: DocumentTag[] = ["lab", "referral", "xray", "other"];

export function DocumentsPage() {
  const { t } = useLang();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState("");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [preview, setPreview] = useState<Doc | null>(null);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<"all" | DocumentTag>("all");
  const [uploadDialog, setUploadDialog] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingTag, setPendingTag] = useState<DocumentTag>("other");

  const load = async () => {
    setPatients(await decryptPatients(await db.patients.toArray()));
    if (selectedPatient) {
      setDocs(await db.documents.where("patientId").equals(parseInt(selectedPatient)).reverse().toArray());
    } else {
      // Show all docs across all patients when no specific patient selected
      setDocs(await db.documents.reverse().toArray());
    }
  };

  useEffect(() => { load(); }, [selectedPatient]);

  const patientName = (id: number) => {
    const p = patients.find(p => p.id === id);
    return p ? `${p.firstName} ${p.lastName}` : "—";
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter(d => {
      if (tagFilter !== "all" && d.tag !== tagFilter) return false;
      if (!q) return true;
      const pn = patientName(d.patientId).toLowerCase();
      const date = new Date(d.createdAt).toLocaleDateString().toLowerCase();
      return d.name.toLowerCase().includes(q) || pn.includes(q) ||
        (d.tag && t(`doc.tag.${d.tag}`).toLowerCase().includes(q)) ||
        date.includes(q);
    });
  }, [docs, search, tagFilter, patients, t]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedPatient || !e.target.files) return;
    const file = e.target.files[0];
    if (file.size > MAX_SIZE) {
      toast.error(t("doc.maxSize"));
      e.target.value = "";
      return;
    }
    setPendingFile(file);
    setPendingTag("other");
    setUploadDialog(true);
    e.target.value = "";
  };

  const confirmUpload = async () => {
    if (!pendingFile || !selectedPatient) return;
    try {
      const data = pendingFile.type.startsWith("image/")
        ? await compressImage(pendingFile)
        : await fileToDataUrl(pendingFile);
      await db.documents.add({
        patientId: parseInt(selectedPatient),
        name: pendingFile.name,
        type: pendingFile.type,
        data,
        size: pendingFile.size,
        tag: pendingTag,
        createdAt: new Date().toISOString(),
      });
      toast.success(t("doc.upload"));
      setUploadDialog(false);
      setPendingFile(null);
      load();
    } catch {
      toast.error("Upload error");
    }
  };

  const handleDelete = async (id: number) => {
    await db.documents.delete(id);
    toast.success(t("doc.delete"));
    load();
  };

  const isImage = (d: Doc) => d.type.startsWith("image/");

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 min-w-0">
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
                <Upload className="w-4 h-4" /> {t("doc.uploadFile")}
                <input type="file" className="hidden" onChange={handleFileSelect} />
              </label>
            </Button>
          </div>
        )}
      </div>

      {/* Search & filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t("doc.search")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={tagFilter} onValueChange={v => setTagFilter(v as any)}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("doc.allTags")}</SelectItem>
            {TAG_KEYS.map(tg => (
              <SelectItem key={tg} value={tg}>{t(`doc.tag.${tg}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">{t("doc.maxSize")}</p>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">{selectedPatient ? t("doc.noFiles") : t("common.noData")}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map(d => (
            <Card key={d.id} className="group relative cursor-pointer" onClick={() => setPreview(d)}>
              <CardContent className="p-2">
                <div className="aspect-square rounded bg-muted overflow-hidden flex items-center justify-center">
                  {isImage(d) ? (
                    <img src={d.data} alt={d.name} className="w-full h-full object-cover" />
                  ) : (
                    <FileText className="w-12 h-12 text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs truncate mt-1" title={d.name}>{d.name}</p>
                <div className="flex items-center justify-between gap-1 mt-1">
                  {d.tag && <Badge variant="secondary" className="text-[10px] px-1 py-0">{t(`doc.tag.${d.tag}`)}</Badge>}
                  <span className="text-[10px] text-muted-foreground">{formatBytes(d.size)}</span>
                </div>
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

      {/* Preview */}
      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {preview?.name}
              {preview?.tag && <Badge variant="secondary">{t(`doc.tag.${preview.tag}`)}</Badge>}
            </DialogTitle>
          </DialogHeader>
          {preview && (
            isImage(preview) ? (
              <img src={preview.data} alt={preview.name} className="w-full rounded" />
            ) : (
              <iframe src={preview.data} title={preview.name} className="w-full h-[70vh] rounded border" />
            )
          )}
        </DialogContent>
      </Dialog>

      {/* Upload tag dialog */}
      <Dialog open={uploadDialog} onOpenChange={setUploadDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("doc.uploadFile")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground truncate">{pendingFile?.name}</p>
            <div>
              <Label>{t("doc.tag")}</Label>
              <Select value={pendingTag} onValueChange={v => setPendingTag(v as DocumentTag)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TAG_KEYS.map(tg => (
                    <SelectItem key={tg} value={tg}>{t(`doc.tag.${tg}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialog(false)}>{t("common.cancel")}</Button>
            <Button onClick={confirmUpload}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
