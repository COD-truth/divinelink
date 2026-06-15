import React, { useEffect, useMemo, useState } from "react";
import { db, type PrivateNote, type PrivateDoc, type QuickTemplate, type Patient, type Consultation } from "@/lib/db";
import { useLang } from "@/contexts/LangContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, FileText, NotebookPen, Upload, Bookmark, BarChart3, Users, Lock, Pencil, Copy } from "lucide-react";
import { toast } from "sonner";
import { getClinicId } from "@/lib/clinicSettings";
import { compressImage, fileToDataUrl, formatBytes } from "@/lib/imageUtils";
import { decryptPatients } from "@/lib/patientCrypto";
import { formatDateTime } from "@/lib/dateFormat";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

const MAX_DOC = 5 * 1024 * 1024;

export function MySpacePage() {
  const { lang } = useLang();
  const { user } = useAuth();
  const tr = (fr: string, en: string) => (lang === "en" ? en : fr);

  if (!user) return null;
  const uid = user.id!;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Lock className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">{tr("Mon espace", "My Space")}</h2>
        <Badge variant="secondary">{user.name}</Badge>
        <p className="text-xs text-muted-foreground ml-auto">{tr("Privé · visible uniquement par vous", "Private · only visible to you")}</p>
      </div>

      <Tabs defaultValue="notes">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="notes" className="gap-1 text-xs"><NotebookPen className="w-3 h-3" />{tr("Notes", "Notes")}</TabsTrigger>
          <TabsTrigger value="patients" className="gap-1 text-xs"><Users className="w-3 h-3" />{tr("Mes patients", "My patients")}</TabsTrigger>
          <TabsTrigger value="stats" className="gap-1 text-xs"><BarChart3 className="w-3 h-3" />{tr("Stats", "Stats")}</TabsTrigger>
          <TabsTrigger value="docs" className="gap-1 text-xs"><FileText className="w-3 h-3" />{tr("Documents", "Docs")}</TabsTrigger>
          <TabsTrigger value="tpls" className="gap-1 text-xs"><Bookmark className="w-3 h-3" />{tr("Modèles", "Templates")}</TabsTrigger>
        </TabsList>

        <TabsContent value="notes" className="mt-4"><NotesTab ownerId={uid} tr={tr} /></TabsContent>
        <TabsContent value="patients" className="mt-4"><MyPatientsTab ownerId={uid} tr={tr} /></TabsContent>
        <TabsContent value="stats" className="mt-4"><MyStatsTab ownerId={uid} tr={tr} /></TabsContent>
        <TabsContent value="docs" className="mt-4"><DocsTab ownerId={uid} tr={tr} /></TabsContent>
        <TabsContent value="tpls" className="mt-4"><TemplatesTab ownerId={uid} tr={tr} /></TabsContent>
      </Tabs>
    </div>
  );
}

function NotesTab({ ownerId, tr }: { ownerId: number; tr: (a: string, b: string) => string }) {
  const [items, setItems] = useState<PrivateNote[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PrivateNote | null>(null);
  const [title, setTitle] = useState(""); const [body, setBody] = useState("");

  const load = async () => setItems(await db.privateNotes.where("ownerUserId").equals(ownerId).reverse().sortBy("updatedAt"));
  useEffect(() => { load(); }, [ownerId]);

  const openNew = () => { setEditing(null); setTitle(""); setBody(""); setOpen(true); };
  const openEdit = (n: PrivateNote) => { setEditing(n); setTitle(n.title); setBody(n.body); setOpen(true); };
  const save = async () => {
    if (!title.trim()) { toast.error(tr("Titre requis", "Title required")); return; }
    const now = new Date().toISOString();
    if (editing?.id) await db.privateNotes.update(editing.id, { title, body, updatedAt: now });
    else await db.privateNotes.add({ ownerUserId: ownerId, title, body, clinicId: getClinicId(), createdAt: now, updatedAt: now });
    setOpen(false); load();
  };
  const remove = async (n: PrivateNote) => { if (confirm(tr("Supprimer ?", "Delete?"))) { await db.privateNotes.delete(n.id!); load(); } };

  return (
    <div className="space-y-3">
      <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />{tr("Nouvelle note", "New note")}</Button>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">{tr("Aucune note", "No notes")}</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {items.map(n => (
            <Card key={n.id}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium truncate">{n.title}</p>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(n)}><Pencil className="w-3 h-3" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => remove(n)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap mt-1">{n.body}</p>
                <p className="text-[10px] text-muted-foreground mt-2">{formatDateTime(n.updatedAt)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? tr("Modifier note", "Edit note") : tr("Nouvelle note", "New note")}</DialogTitle></DialogHeader>
          <Input placeholder={tr("Titre", "Title")} value={title} onChange={e => setTitle(e.target.value)} />
          <Textarea rows={8} value={body} onChange={e => setBody(e.target.value)} />
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{tr("Annuler", "Cancel")}</Button><Button onClick={save}>{tr("Enregistrer", "Save")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MyPatientsTab({ ownerId, tr }: { ownerId: number; tr: (a: string, b: string) => string }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  useEffect(() => {
    (async () => {
      const cs = await db.consultations.where("doctorId").equals(ownerId).toArray();
      const ids = Array.from(new Set(cs.map(c => c.patientId)));
      const ps = await db.patients.where("id").anyOf(ids).toArray();
      setPatients(await decryptPatients(ps));
    })();
  }, [ownerId]);
  return patients.length === 0 ? <p className="text-sm text-muted-foreground">{tr("Aucun patient suivi", "No patients yet")}</p> : (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {patients.map(p => (
        <Card key={p.id}><CardContent className="p-3">
          <p className="font-medium">{p.firstName} {p.lastName}</p>
          <p className="text-xs text-muted-foreground">{p.phone}</p>
          <p className="text-[10px] font-mono text-muted-foreground">{p.patientId}</p>
        </CardContent></Card>
      ))}
    </div>
  );
}

function MyStatsTab({ ownerId, tr }: { ownerId: number; tr: (a: string, b: string) => string }) {
  const [cs, setCs] = useState<Consultation[]>([]);
  useEffect(() => { db.consultations.where("doctorId").equals(ownerId).toArray().then(setCs); }, [ownerId]);
  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    cs.forEach(c => { const d = c.date.slice(0, 10); map.set(d, (map.get(d) || 0) + 1); });
    return Array.from(map.entries()).sort().slice(-14).map(([date, count]) => ({ date: date.slice(5), count }));
  }, [cs]);
  const byType = useMemo(() => {
    const map = new Map<string, number>();
    cs.forEach(c => { const t = c.consultType || "general"; map.set(t, (map.get(t) || 0) + 1); });
    return Array.from(map.entries()).map(([type, count]) => ({ type, count }));
  }, [cs]);
  return (
    <div className="space-y-4">
      <Card><CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{tr("Total consultations", "Total consultations")}</p>
        <p className="text-2xl font-bold">{cs.length}</p>
      </CardContent></Card>
      <Card><CardContent className="p-3">
        <p className="text-sm font-medium mb-2">{tr("14 derniers jours", "Last 14 days")}</p>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={byDay}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" fontSize={10} /><YAxis fontSize={10} allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" /></LineChart>
        </ResponsiveContainer>
      </CardContent></Card>
      <Card><CardContent className="p-3">
        <p className="text-sm font-medium mb-2">{tr("Par type", "By type")}</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={byType}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="type" fontSize={10} /><YAxis fontSize={10} allowDecimals={false} /><Tooltip /><Bar dataKey="count" fill="hsl(var(--primary))" /></BarChart>
        </ResponsiveContainer>
      </CardContent></Card>
    </div>
  );
}

function DocsTab({ ownerId, tr }: { ownerId: number; tr: (a: string, b: string) => string }) {
  const [items, setItems] = useState<PrivateDoc[]>([]);
  const load = async () => setItems(await db.privateDocs.where("ownerUserId").equals(ownerId).reverse().sortBy("createdAt"));
  useEffect(() => { load(); }, [ownerId]);
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > MAX_DOC) { toast.error(tr("5 Mo max", "5 MB max")); return; }
    try {
      const data = file.type.startsWith("image/") ? await compressImage(file) : await fileToDataUrl(file);
      await db.privateDocs.add({ ownerUserId: ownerId, name: file.name, mime: file.type, data, size: file.size, clinicId: getClinicId(), createdAt: new Date().toISOString() });
      load();
    } catch { toast.error(tr("Échec téléversement", "Upload failed")); }
    e.target.value = "";
  };
  const remove = async (d: PrivateDoc) => { if (confirm(tr("Supprimer ?", "Delete?"))) { await db.privateDocs.delete(d.id!); load(); } };
  return (
    <div className="space-y-3">
      <Button asChild className="gap-2"><label><Upload className="w-4 h-4" />{tr("Téléverser", "Upload")}<input type="file" hidden onChange={upload} /></label></Button>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">{tr("Aucun document", "No documents")}</p> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {items.map(d => (
            <Card key={d.id}><CardContent className="p-2">
              {d.mime.startsWith("image/") ? <img src={d.data} className="w-full aspect-square object-cover rounded" /> : <div className="aspect-square flex items-center justify-center bg-muted rounded"><FileText className="w-8 h-8 text-muted-foreground" /></div>}
              <p className="text-xs truncate mt-1">{d.name}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-muted-foreground">{formatBytes(d.size)}</span>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => remove(d)}><Trash2 className="w-3 h-3" /></Button>
              </div>
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplatesTab({ ownerId, tr }: { ownerId: number; tr: (a: string, b: string) => string }) {
  const [items, setItems] = useState<QuickTemplate[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<QuickTemplate | null>(null);
  const [label, setLabel] = useState(""); const [body, setBody] = useState("");
  const load = async () => setItems(await db.quickTemplates.where("ownerUserId").equals(ownerId).toArray());
  useEffect(() => { load(); }, [ownerId]);
  const openNew = () => { setEditing(null); setLabel(""); setBody(""); setOpen(true); };
  const openEdit = (q: QuickTemplate) => { setEditing(q); setLabel(q.label); setBody(q.body); setOpen(true); };
  const save = async () => {
    if (!label.trim()) { toast.error(tr("Étiquette requise", "Label required")); return; }
    const now = new Date().toISOString();
    if (editing?.id) await db.quickTemplates.update(editing.id, { label, body, updatedAt: now });
    else await db.quickTemplates.add({ ownerUserId: ownerId, label, body, clinicId: getClinicId(), createdAt: now, updatedAt: now });
    setOpen(false); load();
  };
  const remove = async (q: QuickTemplate) => { if (confirm(tr("Supprimer ?", "Delete?"))) { await db.quickTemplates.delete(q.id!); load(); } };
  const copy = async (q: QuickTemplate) => { try { await navigator.clipboard.writeText(q.body); toast.success(tr("Copié", "Copied")); } catch {} };
  return (
    <div className="space-y-3">
      <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />{tr("Nouveau modèle", "New template")}</Button>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">{tr("Aucun modèle", "No templates")}</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {items.map(q => (
            <Card key={q.id}><CardContent className="p-3">
              <div className="flex items-start justify-between">
                <p className="font-medium truncate">{q.label}</p>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => copy(q)}><Copy className="w-3 h-3" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(q)}><Pencil className="w-3 h-3" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => remove(q)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap mt-1">{q.body}</p>
            </CardContent></Card>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? tr("Modifier", "Edit") : tr("Nouveau modèle", "New template")}</DialogTitle></DialogHeader>
          <Input placeholder={tr("Étiquette", "Label")} value={label} onChange={e => setLabel(e.target.value)} />
          <Textarea rows={8} placeholder={tr("Contenu à coller…", "Snippet to insert…")} value={body} onChange={e => setBody(e.target.value)} />
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{tr("Annuler", "Cancel")}</Button><Button onClick={save}>{tr("Enregistrer", "Save")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
