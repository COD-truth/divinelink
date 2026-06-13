import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { db, type Survey, type SurveyQuestion, type SurveyResponse } from "@/lib/db";
import { getSurveyByCode } from "@/lib/surveyHelpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { CheckCircle2, ChevronLeft, ChevronRight, WifiOff } from "lucide-react";

export default function SurveyTakePage() {
  const { code } = useParams<{ code: string }>();
  const [survey, setSurvey] = useState<Survey | null | undefined>(undefined);
  const [stage, setStage] = useState<"intro" | "form" | "review" | "done">("intro");
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  /** questionId -> { blob, transcript } */
  const [voices, setVoices] = useState<Record<string, { blob: Blob | null; transcript: string }>>({});
  const [respondentName, setRespondentName] = useState("");
  const [respondentPhone, setRespondentPhone] = useState("");
  const [startedAt] = useState(() => new Date().toISOString());
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    if (!code) return;
    getSurveyByCode(code).then(async (s) => {
      if (s) { setSurvey(s); return; }
      // Not found locally — fetch from server
      try {
        const res = await fetch(`https://divinelink.mooo.com/api/surveys/${code}`);
        if (res.ok) {
          const sv = await res.json();
          const mapped: Survey = {
            clinicId: undefined,
            title: sv.title,
            description: sv.description,
            surveyType: sv.survey_type,
            inviteCode: sv.invite_code,
            questions: sv.questions || [],
            status: sv.status,
            anonymous: sv.anonymous,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await db.surveys.put(mapped);
          setSurvey(mapped);
        } else {
          setSurvey(null);
        }
      } catch {
        setSurvey(null);
      }
    });
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [code]);

  if (survey === undefined) return <FullScreen><p className="text-muted-foreground">Chargement…</p></FullScreen>;
  if (survey === null) return <FullScreen>
    <div className="text-center">
      <h1 className="text-xl font-bold mb-2">Enquête introuvable</h1>
      <p className="text-sm text-muted-foreground mb-4">Le code <code>{code}</code> n'existe pas sur cet appareil.</p>
      <Link to="/" className="text-primary underline">Retour à l'accueil</Link>
    </div>
  </FullScreen>;
  if (survey.status !== "active") return <FullScreen>
    <div className="text-center">
      <h1 className="text-xl font-bold mb-2">Enquête {survey.status === "draft" ? "non publiée" : "clôturée"}</h1>
      <p className="text-sm text-muted-foreground">Contactez l'administrateur.</p>
    </div>
  </FullScreen>;

  const q = survey.questions[idx];
  const totalQ = survey.questions.length;

  const canNext = () => {
    if (!q) return true;
    if (!q.required) return true;
    const v = answers[q.id];
    if (q.type === "multi_choice") return Array.isArray(v) && v.length > 0;
    if (q.type === "voice") return !!voices[q.id]?.blob;
    return v != null && v !== "";
  };

  const submit = async () => {
    const completedAt = new Date().toISOString();
    const resp: SurveyResponse = {
      surveyId: survey.id!,
      respondentName: survey.anonymous ? undefined : (respondentName || undefined),
      respondentPhone: survey.anonymous ? undefined : (respondentPhone || undefined),
      clinicId: survey.clinicId,
      answers,
      startedAt,
      completedAt,
      synced: false,
    };
    const respId = await db.surveyResponses.add(resp);
    // Save voice blobs
    for (const [questionId, v] of Object.entries(voices)) {
      if (!v.blob) continue;
      await db.voiceRecordings.add({
        responseId: respId as number,
        questionId,
        blob: v.blob,
        transcript: v.transcript,
        createdAt: completedAt,
        synced: false,
      });
    }
    toast.success("Réponse enregistrée");
    setStage("done");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b p-3 flex items-center justify-between">
        <div className="text-sm font-semibold truncate">{survey.title}</div>
        {!online && (
          <span className="text-xs flex items-center gap-1 text-amber-600">
            <WifiOff className="w-3 h-3" /> Hors-ligne
          </span>
        )}
      </header>

      <main className="flex-1 p-4 max-w-xl w-full mx-auto">
        {stage === "intro" && (
          <Card><CardContent className="pt-6 space-y-4">
            <h1 className="text-2xl font-bold">{survey.title}</h1>
            {survey.description && <p className="text-muted-foreground">{survey.description}</p>}
            <p className="text-sm text-muted-foreground">{totalQ} questions · Temps estimé: ~{Math.max(1, Math.round(totalQ * 0.5))} min</p>
            {!survey.anonymous && (
              <>
                <div>
                  <Label>Votre nom</Label>
                  <Input value={respondentName} onChange={e => setRespondentName(e.target.value)} placeholder="Optionnel" />
                </div>
                <div>
                  <Label>Téléphone</Label>
                  <Input value={respondentPhone} onChange={e => setRespondentPhone(e.target.value)} placeholder="Optionnel" />
                </div>
              </>
            )}
            <Button className="w-full h-12" onClick={() => setStage("form")}>Commencer / Start</Button>
          </CardContent></Card>
        )}

        {stage === "form" && q && (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground">Q {idx + 1} / {totalQ}</div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${((idx + 1) / totalQ) * 100}%` }} />
            </div>
            <Card><CardContent className="pt-6 space-y-3">
              <h2 className="text-lg font-semibold">
                {q.text} {q.required && <span className="text-destructive">*</span>}
              </h2>
              {q.helpText && <p className="text-sm text-muted-foreground">{q.helpText}</p>}
              <QuestionInput
                q={q}
                value={answers[q.id]}
                onChange={v => setAnswers(a => ({ ...a, [q.id]: v }))}
                voice={voices[q.id]}
                onVoice={(blob, transcript) => setVoices(p => ({ ...p, [q.id]: { blob, transcript } }))}
              />
            </CardContent></Card>
            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => idx === 0 ? setStage("intro") : setIdx(i => i - 1)} className="gap-1 h-12">
                <ChevronLeft className="w-4 h-4" /> Précédent
              </Button>
              {idx < totalQ - 1 ? (
                <Button onClick={() => setIdx(i => i + 1)} disabled={!canNext()} className="gap-1 h-12">
                  Suivant <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button onClick={() => setStage("review")} disabled={!canNext()} className="h-12">
                  Revoir mes réponses
                </Button>
              )}
            </div>
          </div>
        )}

        {stage === "review" && (
          <Card><CardContent className="pt-6 space-y-3">
            <h2 className="text-xl font-semibold">Revue avant envoi</h2>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {survey.questions.map((qq, i) => (
                <div key={qq.id} className="border-b pb-2">
                  <p className="text-xs text-muted-foreground">Q{i + 1}. {qq.text}</p>
                  <p className="text-sm font-medium">
                    {formatAnswer(qq, answers[qq.id], !!voices[qq.id]?.blob)}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStage("form")} className="flex-1 h-12">Modifier</Button>
              <Button onClick={submit} className="flex-1 h-12">Envoyer</Button>
            </div>
          </CardContent></Card>
        )}

        {stage === "done" && (
          <Card><CardContent className="pt-6 text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 mx-auto text-green-600" />
            <h2 className="text-2xl font-bold">Merci !</h2>
            <p className="text-muted-foreground">Votre réponse a été enregistrée localement et sera synchronisée dès que possible.</p>
            <p className="text-xs text-muted-foreground">{new Date().toLocaleString()}</p>
            <Button onClick={() => window.location.reload()} variant="outline">Reprendre une autre enquête</Button>
          </CardContent></Card>
        )}
      </main>
    </div>
  );
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center p-4">{children}</div>;
}

function formatAnswer(q: SurveyQuestion, v: any, hasVoice: boolean): React.ReactNode {
  let txt: string;
  if (v == null || v === "") txt = "— vide —";
  else if (Array.isArray(v)) txt = v.join(", ");
  else txt = String(v);
  return <>{txt}{hasVoice && <span className="ml-2 text-xs text-primary">🎤</span>}</>;
}

function QuestionInput({ q, value, onChange, voice, onVoice }: {
  q: SurveyQuestion;
  value: any;
  onChange: (v: any) => void;
  voice?: { blob: Blob | null; transcript: string };
  onVoice: (blob: Blob | null, transcript: string) => void;
}) {
  const body = (() => {
    switch (q.type) {
      case "short_text":
        return <Input value={value || ""} onChange={e => onChange(e.target.value)} className="h-12" />;
      case "long_text":
        return <Textarea value={value || ""} onChange={e => onChange(e.target.value)} rows={5} />;
      case "single_choice":
        return (
          <div className="space-y-2">
            {(q.options || []).map(opt => (
              <label key={opt} className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted">
                <input type="radio" name={q.id} checked={value === opt} onChange={() => onChange(opt)} />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        );
      case "multi_choice": {
        const arr: string[] = Array.isArray(value) ? value : [];
        return (
          <div className="space-y-2">
            {(q.options || []).map(opt => (
              <label key={opt} className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted">
                <Checkbox
                  checked={arr.includes(opt)}
                  onCheckedChange={v => {
                    if (v) onChange([...arr, opt]);
                    else onChange(arr.filter(o => o !== opt));
                  }}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        );
      }
      case "rating": {
        const max = q.ratingMax || 5;
        return (
          <div className="flex gap-2 flex-wrap">
            {Array.from({ length: max }).map((_, i) => {
              const n = i + 1;
              return (
                <Button key={n} type="button" variant={value === n ? "default" : "outline"}
                  onClick={() => onChange(n)} className="h-12 w-12">
                  {n}
                </Button>
              );
            })}
          </div>
        );
      }
      case "date":
        return <Input type="date" value={value || ""} onChange={e => onChange(e.target.value)} className="h-12" />;
      case "file":
        return (
          <Input type="file" accept="image/*,application/pdf" onChange={async e => {
            const f = e.target.files?.[0]; if (!f) return;
            const reader = new FileReader();
            reader.onload = () => onChange({ name: f.name, dataUrl: reader.result });
            reader.readAsDataURL(f);
          }} />
        );
      case "voice":
        return null; // handled below
    }
  })();

  return (
    <div className="space-y-3">
      {body}
      {(q.type === "voice" || q.allowVoice) && (
        <VoiceRecorder
          existingBlob={voice?.blob || undefined}
          initialTranscript={voice?.transcript || ""}
          onChange={(blob, transcript) => {
            onVoice(blob, transcript);
            if (q.type === "voice") onChange(transcript || (blob ? "[audio]" : ""));
          }}
        />
      )}
    </div>
  );
}
