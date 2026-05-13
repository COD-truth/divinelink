import React, { useEffect, useRef, useState } from "react";
import { useLang } from "@/contexts/LangContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { X, Send, Bot, User, CirclePlus as PlusCircle, Wifi, WifiOff, Loader as Loader2 } from "lucide-react";
import type { Patient, Consultation, VitalSigns } from "@/lib/db";
import { ageFromDob } from "@/lib/patientHelpers";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

interface PatientContext {
  patient: Patient;
  recentConsultations?: Consultation[];
  currentVitals?: VitalSigns;
}

interface Props {
  open: boolean;
  onClose: () => void;
  patientContext?: PatientContext;
  onAddToNotes?: (text: string) => void;
  apiKey?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = (patientId: number | string) => `divinelink.ai.conv.${patientId}`;
const MAX_STORED = 10;

function loadHistory(patientId: number | string): Message[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(patientId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveHistory(patientId: number | string, msgs: Message[]) {
  try {
    const trimmed = msgs.slice(-MAX_STORED * 2);
    localStorage.setItem(STORAGE_KEY(patientId), JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

function buildSystemContext(ctx: PatientContext): string {
  const { patient, recentConsultations, currentVitals } = ctx;
  const age = ageFromDob(patient.dob) ?? patient.ageYears ?? "inconnu";
  const ant = patient.antecedents;

  const lines: string[] = [
    "Vous êtes un assistant clinique pour un médecin. Répondez en français, de manière concise et cliniquement rigoureuse.",
    "IMPORTANT: Ces données sont anonymisées. Ne mentionnez jamais de nom réel.",
    "",
    `Patient anonymisé: ${patient.anonCode || "ANON"}`,
    `Âge: ${age} ans`,
  ];

  if (ant?.chronicDiseases?.length) lines.push(`Maladies chroniques: ${ant.chronicDiseases.join(", ")}`);
  if (ant?.diabetic) lines.push("Diabétique: oui");
  if (ant?.hypertensive) lines.push("Hypertendu: oui");
  if (ant?.smoker) lines.push("Fumeur: oui");

  if (ant?.allergies?.length) {
    const fatal = ant.allergies.filter(a => a.severity === "fatal");
    const other = ant.allergies.filter(a => a.severity !== "fatal");
    if (fatal.length) lines.push(`🚨 ALLERGIES MORTELLES: ${fatal.map(a => a.name).join(", ")}`);
    if (other.length) lines.push(`Autres allergies: ${other.map(a => `${a.name} (${a.severity})`).join(", ")}`);
  }

  if (recentConsultations?.length) {
    const recent = recentConsultations.slice(0, 3);
    lines.push(`\nDerniers diagnostics (${recent.length}):`);
    recent.forEach((c, i) => {
      const d = c.diagnosis || "";
      if (d) lines.push(`  ${i + 1}. ${d.substring(0, 100)}`);
    });
    const lastRx = recent.find(c => c.prescription)?.prescription;
    if (lastRx) lines.push(`Dernière prescription: ${lastRx.substring(0, 150)}`);
  }

  const vitals = currentVitals;
  if (vitals) {
    const vLines: string[] = [];
    if (vitals.bp) vLines.push(`TA: ${vitals.bp}`);
    if (vitals.temperature) vLines.push(`T°: ${vitals.temperature}°C`);
    if (vitals.pulse) vLines.push(`FC: ${vitals.pulse} bpm`);
    if (vitals.spo2) vLines.push(`SpO2: ${vitals.spo2}%`);
    if (vitals.weight) vLines.push(`Poids: ${vitals.weight} kg`);
    if (vLines.length) lines.push(`Dernières constantes: ${vLines.join(", ")}`);
  }

  return lines.join("\n");
}

async function callClaude(messages: Message[], systemContext: string, apiKey: string): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemContext,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message || `HTTP ${resp.status}`);
  }

  const data = await resp.json() as { content: Array<{ type: string; text: string }> };
  return data.content?.[0]?.text ?? "";
}

// ─── Quick suggestions ────────────────────────────────────────────────────────

const QUICK_SUGGESTIONS = [
  "Interactions médicamenteuses?",
  "Points d'attention pour ce patient?",
  "Diagnostics différentiels?",
  "Protocole de traitement?",
  "Signes d'alarme?",
];

// ─── Component ────────────────────────────────────────────────────────────────

export function AIClinicalAssistant({ open, onClose, patientContext, onAddToNotes, apiKey }: Props) {
  const { t } = useLang();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [apiKeyInput, setApiKeyInput] = useState(() => {
    try { return localStorage.getItem("divinelink.ai.apikey") || ""; } catch { return ""; }
  });
  const [showKeyInput, setShowKeyInput] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const patientId = patientContext?.patient?.id ?? "global";

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  useEffect(() => {
    if (open) {
      const hist = loadHistory(patientId);
      setMessages(hist.length ? hist : []);
    }
  }, [open, patientId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const effectiveKey = apiKey || apiKeyInput;

  const send = async (text: string) => {
    if (!text.trim() || !online || loading) return;
    if (!effectiveKey) { setShowKeyInput(true); return; }

    const userMsg: Message = { role: "user", content: text.trim(), ts: Date.now() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const system = patientContext
        ? buildSystemContext(patientContext)
        : "Vous êtes un assistant clinique médical. Répondez en français, de manière concise et rigoureuse.";

      const aiText = await callClaude(next, system, effectiveKey);
      const aiMsg: Message = { role: "assistant", content: aiText, ts: Date.now() };
      const withAI = [...next, aiMsg];
      setMessages(withAI);
      saveHistory(patientId, withAI);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : "Erreur inconnue";
      const errMsgObj: Message = { role: "assistant", content: `❌ Erreur: ${errMsg}`, ts: Date.now() };
      setMessages(m => [...m, errMsgObj]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop (mobile) */}
      <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={onClose} />

      {/* Panel */}
      <div className={`
        fixed z-50 bg-background shadow-2xl flex flex-col
        bottom-0 left-0 right-0 h-[85vh] rounded-t-2xl
        md:top-0 md:bottom-0 md:left-auto md:right-0 md:w-[420px] md:h-full md:rounded-none md:rounded-l-2xl
        transition-transform duration-300
      `}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-2xl md:rounded-tl-2xl md:rounded-tr-none text-white">
          <Bot className="w-5 h-5" />
          <div className="flex-1">
            <p className="font-semibold text-sm">Assistant IA Clinique</p>
            <p className="text-[10px] text-blue-200">
              {patientContext ? `Patient: ${patientContext.patient.anonCode || "ANON"}` : "Assistant général"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {online ? <Wifi className="w-4 h-4 text-green-300" /> : <WifiOff className="w-4 h-4 text-red-300" />}
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Disclaimers */}
        <div className="px-3 py-2 bg-blue-50 border-b text-[11px] text-blue-700 space-y-0.5">
          <p>ℹ️ L'IA assiste mais ne remplace pas le jugement clinique.</p>
          <p className="text-blue-500">🔒 Données anonymisées envoyées à l'IA.</p>
        </div>

        {/* Offline banner */}
        {!online && (
          <div className="px-3 py-2 bg-destructive/10 border-b text-[12px] text-destructive font-medium flex items-center gap-2">
            <WifiOff className="w-3.5 h-3.5" />
            Connexion requise pour l'IA
          </div>
        )}

        {/* API key setup */}
        {showKeyInput && (
          <div className="px-4 py-3 border-b bg-amber-50 space-y-2">
            <p className="text-xs font-medium text-amber-800">Clé API Anthropic requise</p>
            <div className="flex gap-2">
              <input
                type="password"
                className="flex-1 text-xs border rounded px-2 py-1"
                placeholder="sk-ant-..."
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
              />
              <Button size="sm" className="h-7 text-xs" onClick={() => {
                try { localStorage.setItem("divinelink.ai.apikey", apiKeyInput); } catch { /* */ }
                setShowKeyInput(false);
              }}>OK</Button>
            </div>
            <p className="text-[10px] text-amber-600">Stockée localement sur cet appareil uniquement.</p>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-8 space-y-2">
              <Bot className="w-10 h-10 mx-auto opacity-30" />
              <p>Posez une question clinique ou utilisez une suggestion rapide.</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === "user" ? "bg-blue-600 text-white" : "bg-muted"}`}>
                {msg.role === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>
              <div className={`rounded-2xl px-3 py-2 max-w-[85%] text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-tr-sm"
                  : "bg-muted text-foreground rounded-tl-sm"
              }`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.role === "assistant" && onAddToNotes && (
                  <button
                    onClick={() => { onAddToNotes(msg.content); }}
                    className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <PlusCircle className="w-3 h-3" />
                    Ajouter aux notes
                  </button>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Quick suggestions */}
        {messages.length === 0 && (
          <div className="px-3 pb-2 flex flex-wrap gap-1.5">
            {QUICK_SUGGESTIONS.map(s => (
              <button
                key={s}
                disabled={!online || loading}
                onClick={() => send(s)}
                className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full transition-colors disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="p-3 border-t flex gap-2 items-end">
          <Textarea
            className="flex-1 min-h-[40px] max-h-[120px] text-sm resize-none"
            placeholder={online ? "Question clinique..." : "Hors ligne"}
            value={input}
            disabled={!online || loading}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
            }}
          />
          <Button
            size="icon"
            className="h-10 w-10 flex-shrink-0"
            disabled={!input.trim() || !online || loading}
            onClick={() => send(input)}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>

        {/* API key link */}
        <div className="px-3 pb-2 flex items-center justify-between">
          <button
            className="text-[10px] text-muted-foreground hover:text-foreground underline"
            onClick={() => setShowKeyInput(s => !s)}
          >
            {effectiveKey ? "Changer la clé API" : "Configurer la clé API"}
          </button>
          {messages.length > 0 && (
            <button
              className="text-[10px] text-muted-foreground hover:text-destructive"
              onClick={() => {
                setMessages([]);
                saveHistory(patientId, []);
              }}
            >
              Effacer la conversation
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Floating trigger button ──────────────────────────────────────────────────

interface AIButtonProps {
  onClick: () => void;
  position?: "bottom-right" | "inline";
}

export function AIButton({ onClick, position = "bottom-right" }: AIButtonProps) {
  if (position === "inline") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onClick}
        className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
      >
        <Bot className="w-4 h-4" />
        <span className="text-xs">IA</span>
      </Button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="fixed bottom-20 right-4 md:bottom-6 z-30 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg px-4 py-2.5 flex items-center gap-2 text-sm font-medium transition-all hover:scale-105 active:scale-95"
    >
      <Bot className="w-4 h-4" />
      <span>IA</span>
    </button>
  );
}
