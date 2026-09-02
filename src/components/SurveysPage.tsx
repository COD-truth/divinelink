import React, { useEffect, useMemo, useState } from "react";
import { db, type Survey, type SurveyQuestion, type SurveyResponse, type SurveyQuestionType } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { getClinicId } from "@/lib/clinicSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Plus, Trash2, GripVertical, ArrowLeft, Share2, Copy, Download, BarChart3,
  ChevronUp, ChevronDown, FileText, Mic, Eye, Play, Edit3, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { SURVEY_TEMPLATES } from "@/lib/surveyTemplates";
import { generateInviteCode, newQuestion, computeStats, responsesToCsv } from "@/lib/surveyHelpers";
import { saveFile, withDateStamp } from "@/lib/download";
import { formatDateTime } from "@/lib/dateFormat";
import { logAudit } from "@/lib/audit";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

type View = "list" | "edit" | "dashboard";

const QTYPE_LABELS: Record<SurveyQuestionType, string> = {
  short_text: "Texte court / Short text",
  long_text: "Texte long / Long text",
  single_choice: "Choix unique / Single choice",
  multi_choice: "Choix multiples / Multi-choice",
  rating: "Note / Rating",
  date: "Date",
  file: "Fichier / File",
  voice: "Note vocale / Voice note",
};

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

export function SurveysPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [view, setView] = useState<View>("list");
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [activeSurvey, setActiveSurvey] = useState<Survey | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);

  const load = async () => {
    const all = await db.surveys.orderBy("createdAt").reverse().toArray();
    setSurveys(all);
  };
  useEffect(() => { load(); }, []);

  const createNew = async () => {
    if (!isAdmin) return;
    const now = new Date().toISOString();
    const draft: Survey = {
      clinicId: getClinicId(),
      title: "",
      description: "",
      inviteCode: generateInviteCode(),
      questions: [newQuestion("short_text")],
      status: "draft",
      createdBy: user?.id,
      createdAt: now,
      updatedAt: now,
      synced: false,
    };
    const id = await db.surveys.add(draft);
    const s = await db.surveys.get(id);
    if (s) { setActiveSurvey(s); setView("edit"); }
  };

  if (view === "edit" && activeSurvey) {
    return (
      <SurveyEditor
        survey={activeSurvey}
        onBack={() => { load(); setView("list"); setActiveSurvey(null); }}
        canEdit={isAdmin}
      />
    );
  }

  if (view === "dashboard" && activeSurvey) {
    return (
      <SurveyDashboard
        survey={activeSurvey}
        onBack={() => { load(); setView("list"); setActiveSurvey(null); }}
        onEdit={() => setView("edit")}
        canEdit={isAdmin}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Enquêtes / Surveys</h2>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setTemplateOpen(true)} className="gap-2">
              <ClipboardList className="w-4 h-4"/>Modèles
            </Button>
            <Button onClick={createNew} className="gap-2">
              <Plus className="w-4 h-4" /> Nouvelle enquête / New survey
            </Button>
          </div>
        )}
      </div>
      {!isAdmin && (
        <p className="text-sm text-muted-foreground">
          Lecture seule. Seuls les administrateurs peuvent créer ou modifier des enquêtes.
        </p>
      )}

      {surveys.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
            Aucune enquête. Créez-en une pour commencer.
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {surveys.map(s => (
            <SurveyCard
              key={s.id}
              survey={s}
              onOpen={() => { setActiveSurvey(s); setView("dashboard"); }}
              onEdit={() => { setActiveSurvey(s); setView("edit"); }}
              canEdit={isAdmin}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SurveyCard({ survey, onOpen, onEdit, canEdit }: {
  survey: Survey; onOpen: () => void; onEdit: () => void; canEdit: boolean;
}) {
  const [respCount, setRespCount] = useState(0);
  useEffect(() => {
    db.surveyResponses.where("surveyId").equals(survey.id!).count().then(setRespCount);
  }, [survey.id]);

  const statusColor = survey.status === "active" ? "bg-green-500" :
    survey.status === "closed" ? "bg-muted" : "bg-amber-500";

  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={onOpen}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base line-clamp-2">
            {survey.title || <span className="italic text-muted-foreground">Sans titre</span>}
          </CardTitle>
          <Badge className={statusColor + " text-white shrink-0"}>{survey.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {survey.description && <p className="text-muted-foreground line-clamp-2">{survey.description}</p>}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{survey.questions.length} questions · {respCount} réponses</span>
          <code className="bg-muted px-1 py-0.5 rounded">{survey.inviteCode}</code>
        </div>
        <div className="flex gap-1 pt-1" onClick={e => e.stopPropagation()}>
          <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={onOpen}>
            <BarChart3 className="w-3 h-3" /> Résultats
          </Button>
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={onEdit}>
              <Edit3 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Survey editor (builder)                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

function SurveyEditor({ survey, onBack, canEdit }: { survey: Survey; onBack: () => void; canEdit: boolean }) {
  const [draft, setDraft] = useState<Survey>(survey);
  const [shareOpen, setShareOpen] = useState(false);
  const dragFromRef = React.useRef<number | null>(null);

  const update = (patch: Partial<Survey>) => setDraft(d => ({ ...d, ...patch, updatedAt: new Date().toISOString() }));

  const save = async (newStatus?: Survey["status"]) => {
    if (!draft.title.trim()) {
      toast.error("Titre requis");
      return;
    }
    const status = newStatus ?? draft.status;
    const payload: Survey = {
      ...draft,
      status,
      distributedAt: status === "active" && !draft.distributedAt ? new Date().toISOString() : draft.distributedAt,
      closedAt: status === "closed" ? new Date().toISOString() : draft.closedAt,
      updatedAt: new Date().toISOString(),
      synced: false,
    };
    await db.surveys.put(payload);
    setDraft(payload);

    // Push survey to server when published, so other devices can find it
    if (status === "active") {
      try {
        const token = localStorage.getItem("divinelink.apiToken");
        if (token) {
          await fetch("https://divinelink.mooo.com/api/surveys", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              invite_code: payload.inviteCode,
              title: payload.title,
              description: payload.description,
              survey_type: payload.surveyType,
              questions: payload.questions,
              status: payload.status,
              anonymous: payload.anonymous,
            }),
          });
        }
      } catch (e) { console.warn("Survey server push failed", e); }
    }

    toast.success(status === "active" ? "Enquête publiée" : "Enregistré");
    try { await logAudit("backup_import" as any, draft.title, { message: `Survey ${status}: ${draft.title}` }); } catch {}
  };

  const addQ = (type: SurveyQuestionType) => {
    update({ questions: [...draft.questions, newQuestion(type)] });
  };

  const updateQ = (idx: number, patch: Partial<SurveyQuestion>) => {
    const qs = draft.questions.slice();
    qs[idx] = { ...qs[idx], ...patch };
    update({ questions: qs });
  };

  const removeQ = (idx: number) => {
    update({ questions: draft.questions.filter((_, i) => i !== idx) });
  };

  const moveQ = (idx: number, dir: -1 | 1) => {
    const qs = draft.questions.slice();
    const tgt = idx + dir;
    if (tgt < 0 || tgt >= qs.length) return;
    [qs[idx], qs[tgt]] = [qs[tgt], qs[idx]];
    update({ questions: qs });
  };

  const onDragStart = (idx: number) => { dragFromRef.current = idx; };
  const onDropTo = (idx: number) => {
    const from = dragFromRef.current;
    dragFromRef.current = null;
    if (from == null || from === idx) return;
    const qs = draft.questions.slice();
    const [item] = qs.splice(from, 1);
    qs.splice(idx, 0, item);
    update({ questions: qs });
  };

  const shareUrl = `${window.location.origin}/s/${draft.inviteCode}`;
  const copy = (t: string) => { navigator.clipboard.writeText(t); toast.success("Copié"); };

  const deleteSurvey = async () => {
    if (!confirm("Supprimer cette enquête et toutes ses réponses ?")) return;
    await db.surveyResponses.where("surveyId").equals(draft.id!).delete();
    await db.surveys.delete(draft.id!);
    onBack();
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-20">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ArrowLeft className="w-4 h-4" /> Retour
        </Button>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)} className="gap-1">
            <Share2 className="w-4 h-4" /> Partager
          </Button>
          {canEdit && (
            <>
              <Button size="sm" variant="outline" onClick={() => save("draft")}>Enregistrer brouillon</Button>
              {draft.status !== "active" && (
                <Button size="sm" onClick={() => save("active")} className="bg-green-600 hover:bg-green-700">
                  Publier / Go Live
                </Button>
              )}
              {draft.status === "active" && (
                <Button size="sm" variant="destructive" onClick={() => save("closed")}>Clôturer</Button>
              )}
              <Button size="sm" variant="ghost" onClick={deleteSurvey} className="text-destructive">
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div>
            <Label>Titre / Title</Label>
            <Input value={draft.title} onChange={e => update({ title: e.target.value })} disabled={!canEdit}
              placeholder="ex: Évaluation santé Kribi" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={draft.description || ""} onChange={e => update({ description: e.target.value })}
              disabled={!canEdit} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={draft.surveyType || "custom"} onValueChange={v => update({ surveyType: v })} disabled={!canEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="health_assessment">Évaluation santé</SelectItem>
                  <SelectItem value="vaccination">Couverture vaccinale</SelectItem>
                  <SelectItem value="community_needs">Besoins communautaires</SelectItem>
                  <SelectItem value="custom">Personnalisé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex items-center gap-2">
                <Switch checked={!!draft.anonymous} onCheckedChange={v => update({ anonymous: v })} disabled={!canEdit} />
                <Label className="text-sm">Anonyme</Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Questions ({draft.questions.length})</h3>
        {canEdit && (
          <Select onValueChange={v => addQ(v as SurveyQuestionType)}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="+ Ajouter question" /></SelectTrigger>
            <SelectContent>
              {(Object.keys(QTYPE_LABELS) as SurveyQuestionType[]).map(t => (
                <SelectItem key={t} value={t}>{QTYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {draft.questions.map((q, idx) => (
        <Card
          key={q.id}
          draggable={canEdit}
          onDragStart={() => onDragStart(idx)}
          onDragOver={e => e.preventDefault()}
          onDrop={() => onDropTo(idx)}
        >
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-start gap-2">
              <div className="flex flex-col items-center pt-1 text-muted-foreground">
                {canEdit && <GripVertical className="w-4 h-4 cursor-move" />}
                <span className="text-xs font-mono">Q{idx + 1}</span>
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{QTYPE_LABELS[q.type]}</Badge>
                  {canEdit && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => moveQ(idx, -1)} disabled={idx === 0}>
                        <ChevronUp className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => moveQ(idx, 1)} disabled={idx === draft.questions.length - 1}>
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive ml-auto" onClick={() => removeQ(idx)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                </div>
                <Input value={q.text} onChange={e => updateQ(idx, { text: e.target.value })} disabled={!canEdit}
                  placeholder="Texte de la question" />
                <Input value={q.helpText || ""} onChange={e => updateQ(idx, { helpText: e.target.value })} disabled={!canEdit}
                  placeholder="Aide (optionnel)" className="text-sm" />
                {(q.type === "single_choice" || q.type === "multi_choice") && (
                  <div className="space-y-1 pl-2">
                    {(q.options || []).map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <Input value={opt} onChange={e => {
                          const opts = (q.options || []).slice();
                          opts[oi] = e.target.value;
                          updateQ(idx, { options: opts });
                        }} disabled={!canEdit} placeholder={`Option ${oi + 1}`} />
                        {canEdit && (
                          <Button size="sm" variant="ghost" onClick={() => {
                            updateQ(idx, { options: (q.options || []).filter((_, i) => i !== oi) });
                          }}><Trash2 className="w-3 h-3" /></Button>
                        )}
                      </div>
                    ))}
                    {canEdit && (
                      <Button size="sm" variant="outline" onClick={() => {
                        updateQ(idx, { options: [...(q.options || []), ""] });
                      }} className="gap-1"><Plus className="w-3 h-3" /> Option</Button>
                    )}
                  </div>
                )}
                {q.type === "rating" && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Échelle max:</Label>
                    <Select value={String(q.ratingMax || 5)} onValueChange={v => updateQ(idx, { ratingMax: parseInt(v) })} disabled={!canEdit}>
                      <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3</SelectItem>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-1">
                    <Switch checked={!!q.required} onCheckedChange={v => updateQ(idx, { required: v })} disabled={!canEdit} />
                    Requis
                  </label>
                  {q.type !== "voice" && (
                    <label className="flex items-center gap-1">
                      <Switch checked={!!q.allowVoice} onCheckedChange={v => updateQ(idx, { allowVoice: v })} disabled={!canEdit} />
                      <Mic className="w-3 h-3" /> Note vocale
                    </label>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Partager l'enquête</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Code d'invitation</Label>
              <div className="flex gap-2">
                <Input value={draft.inviteCode} readOnly className="font-mono text-lg" />
                <Button onClick={() => copy(draft.inviteCode)}><Copy className="w-4 h-4" /></Button>
              </div>
            </div>
            <div>
              <Label>Lien direct</Label>
              <div className="flex gap-2">
                <Input value={shareUrl} readOnly />
                <Button onClick={() => copy(shareUrl)}><Copy className="w-4 h-4" /></Button>
              </div>
            </div>
            <div className="bg-muted rounded p-3 text-xs">
              <p className="font-medium mb-1">📱 QR Code</p>
              <img
                alt="QR"
                className="bg-white p-2 rounded"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(shareUrl)}`}
              />
              <p className="mt-1 text-muted-foreground">Imprimez ou affichez pour vos équipes terrain.</p>
            </div>
            {draft.status !== "active" && (
              <p className="text-xs text-amber-600">⚠ L'enquête doit être publiée pour accepter des réponses.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Survey dashboard                                                           */
/* ────────────────────────────────────────────────────────────────────────── */

function SurveyDashboard({ survey, onBack, onEdit, canEdit }: {
  survey: Survey; onBack: () => void; onEdit: () => void; canEdit: boolean;
}) {
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
 const reload = async () => {
    // Pull responses from server (from phones/field devices) and merge into local
    try {
      const token = localStorage.getItem("divinelink.apiToken");
      if (token && navigator.onLine) {
        const res = await fetch(`https://divinelink.mooo.com/api/surveys/${survey.inviteCode}/responses`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const serverResponses = await res.json();
          for (const sr of serverResponses) {
            const existing = await db.surveyResponses
              .where("surveyId").equals(survey.id!)
              .filter(r => (r as any).serverId === sr.id).first();
            if (!existing) {
              await db.surveyResponses.add({
                surveyId: survey.id!,
                respondentName: sr.respondent_name || "",
                respondentPhone: sr.respondent_phone || "",
                answers: sr.answers || {},
                startedAt: sr.started_at || sr.created_at,
                completedAt: sr.completed_at || sr.created_at,
                synced: true,
                syncedAt: sr.created_at,
                ...({ serverId: sr.id } as any),
              } as any);
            }
          }
        }
      }
    } catch (e) { console.warn("Survey response pull failed", e); }

    const all = await db.surveyResponses.where("surveyId").equals(survey.id!).toArray();
    setResponses(all.sort((a, b) => (b.completedAt || b.startedAt).localeCompare(a.completedAt || a.startedAt)));
  };
  useEffect(() => {
    reload();
    const id = setInterval(reload, 5000);
    return () => clearInterval(id);
  }, [survey.id]);

  const completed = responses.filter(r => r.completedAt);
  const stats = useMemo(() => computeStats(survey.questions, completed), [survey.questions, completed]);

  const exportCsv = () => {
    const csv = responsesToCsv(survey, completed);
    saveFile(withDateStamp(`survey-${survey.inviteCode}.csv`), csv, "csv");
  };

  const exportPdf = async () => {
    try {
      const jsPDF = (await import("jspdf")).default;
      const doc = new jsPDF();
      doc.setFontSize(16); doc.text(survey.title || "Survey", 14, 18);
      doc.setFontSize(10);
      doc.text(`Code: ${survey.inviteCode} · Réponses: ${completed.length}`, 14, 26);
      let y = 36;
      stats.forEach((s, i) => {
        if (y > 270) { doc.addPage(); y = 18; }
        doc.setFontSize(12);
        doc.text(`Q${i + 1}. ${s.question.text}`, 14, y); y += 6;
        doc.setFontSize(9);
        if (Object.keys(s.counts).length) {
          Object.entries(s.counts).forEach(([k, v]) => {
            if (y > 285) { doc.addPage(); y = 18; }
            doc.text(`  • ${k}: ${v}`, 14, y); y += 5;
          });
        } else if (s.textValues.length) {
          doc.text(`  ${s.textValues.length} réponse(s) texte`, 14, y); y += 5;
        } else {
          doc.text("  (aucune réponse)", 14, y); y += 5;
        }
        if (s.numericAvg != null) {
          doc.text(`  Moyenne: ${s.numericAvg.toFixed(2)}`, 14, y); y += 5;
        }
        y += 3;
      });
      doc.save(withDateStamp(`survey-${survey.inviteCode}.pdf`));
    } catch (e: any) {
      toast.error("Export PDF: " + (e?.message || e));
    }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-20">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ArrowLeft className="w-4 h-4" /> Retour
        </Button>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv} className="gap-1"><Download className="w-4 h-4" /> CSV</Button>
          <Button size="sm" variant="outline" onClick={exportPdf} className="gap-1"><FileText className="w-4 h-4" /> PDF</Button>
          {canEdit && <Button size="sm" variant="outline" onClick={onEdit} className="gap-1"><Edit3 className="w-4 h-4" /> Modifier</Button>}
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          {survey.title}
          <Badge>{survey.status}</Badge>
        </h2>
        {survey.description && <p className="text-sm text-muted-foreground">{survey.description}</p>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Réponses" value={String(completed.length)} />
        <StatCard label="En cours" value={String(responses.length - completed.length)} />
        <StatCard label="Questions" value={String(survey.questions.length)} />
        <StatCard label="Code" value={survey.inviteCode} mono />
      </div>

      {completed.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          Aucune réponse encore. Partagez le code <code className="font-mono">{survey.inviteCode}</code>.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {stats.map((s, i) => <QuestionStatCard key={s.question.id} index={i} stat={s} />)}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Réponses récentes</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b">
              <tr className="text-left">
                <th className="p-1">Date</th>
                <th className="p-1">Nom</th>
                <th className="p-1">Tél</th>
                <th className="p-1">Sync</th>
              </tr>
            </thead>
            <tbody>
              {responses.slice(0, 50).map(r => (
                <tr key={r.id} className="border-b">
                  <td className="p-1">{formatDateTime(r.completedAt || r.startedAt)}</td>
                  <td className="p-1">{r.respondentName || (survey.anonymous ? "—" : "Anonyme")}</td>
                  <td className="p-1">{r.respondentPhone || "—"}</td>
                  <td className="p-1">{r.synced ? "✅" : "⏳"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Card><CardContent className="pt-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={"text-2xl font-bold " + (mono ? "font-mono text-lg" : "")}>{value}</div>
    </CardContent></Card>
  );
}

function QuestionStatCard({ index, stat }: { index: number; stat: ReturnType<typeof computeStats>[number] }) {
  const { question: q, counts, textValues, numericAvg } = stat;
  const chartData = Object.entries(counts).map(([name, value]) => ({ name, value }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Q{index + 1}. {q.text || <i className="text-muted-foreground">sans texte</i>}</CardTitle>
      </CardHeader>
      <CardContent>
        {q.type === "single_choice" || q.type === "rating" ? (
          chartData.length === 0 ? <p className="text-xs text-muted-foreground">Pas de données.</p> : (
            <div className="grid sm:grid-cols-2 gap-3">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={70} label>
                    {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 text-xs">
                {chartData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="flex-1">{d.name}</span>
                    <span className="font-mono">{d.value}</span>
                  </div>
                ))}
                {numericAvg != null && <p className="pt-2 font-medium">Moyenne: {numericAvg.toFixed(2)}</p>}
              </div>
            </div>
          )
        ) : q.type === "multi_choice" ? (
          chartData.length === 0 ? <p className="text-xs text-muted-foreground">Pas de données.</p> : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          )
        ) : q.type === "voice" ? (
          <VoiceList responseIds={[]} questionId={q.id} />
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto text-sm">
            {textValues.length === 0 ? <p className="text-xs text-muted-foreground">Pas de réponses.</p> :
              textValues.map((t, i) => (
                <div key={i} className="border-l-2 border-primary/30 pl-2 py-1">{t}</div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Renders all voice recordings for a given question across responses. */
function VoiceList({ questionId }: { responseIds: number[]; questionId: string }) {
  const [recs, setRecs] = useState<{ id: number; url: string; transcript: string }[]>([]);
  useEffect(() => {
    (async () => {
      const all = await db.voiceRecordings.where("questionId").equals(questionId).toArray();
      const list = all.map(r => ({
        id: r.id!,
        url: URL.createObjectURL(r.blob),
        transcript: r.manualTranscript || r.serverTranscript || r.transcript || "",
      }));
      setRecs(list);
      return () => list.forEach(l => URL.revokeObjectURL(l.url));
    })();
  }, [questionId]);

  if (recs.length === 0) return <p className="text-xs text-muted-foreground">Aucun enregistrement vocal.</p>;
  return (
    <div className="space-y-2">
      {recs.map(r => (
        <div key={r.id} className="border rounded p-2 space-y-1">
          <audio src={r.url} controls className="w-full" />
          <p className="text-xs italic">{r.transcript || <span className="text-muted-foreground">— pas de transcription —</span>}</p>
        </div>
      ))}
    </div>
  );
}
