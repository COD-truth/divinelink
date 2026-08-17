import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Send, Bot } from "lucide-react";

const GUIDES: { keywords: string[]; answer: string }[] = [
  { keywords: ["patient","ajouter patient","nouveau patient","add patient","register"], answer: "➡️ Cliquez sur 'Patients' dans le menu → bouton 'Nouveau patient' en haut à droite." },
  { keywords: ["consultation","consulter","consult","nouveau consult"], answer: "➡️ Menu 'Consultations' → 'Nouvelle consultation' → sélectionnez le patient." },
  { keywords: ["pharmacie","pharmacy","medicament","drug","stock","médicament"], answer: "➡️ Menu 'Pharmacie' → gérez le stock, ajoutez des médicaments, dispensez." },
  { keywords: ["paiement","payment","facture","invoice","receipt","recu","reçu"], answer: "➡️ Menu 'Paiements' → ajoutez un paiement. Cliquez l'icône imprimante 🖨️ pour générer un reçu PDF." },
  { keywords: ["rendez-vous","agenda","appointment","rdv"], answer: "➡️ Menu 'Agenda' → cliquez sur une date pour ajouter un rendez-vous." },
  { keywords: ["analyse","lab","laboratoire","nfs","glycemie","bilan"], answer: "➡️ Ouvrez un patient → onglet 'Analyses' → choisissez un modèle (NFS, Glycémie, etc.)." },
  { keywords: ["document","fichier","file","photo","image"], answer: "➡️ Ouvrez un patient → onglet 'Documents' → ajoutez fichiers et photos." },
  { keywords: ["parametre","settings","reglage","clinique","clinic"], answer: "➡️ Icône engrenage ⚙️ en bas du menu → paramètres de la clinique." },
  { keywords: ["notification","alerte","alert","push"], answer: "➡️ Paramètres → faites défiler vers le bas → section 'Notifications Push'." },
  { keywords: ["sync","synchron","backup","sauvegarde"], answer: "➡️ L'app synchronise automatiquement. Icône sync en haut pour le statut. Paramètres → Sauvegarde pour backup manuel." },
  { keywords: ["staff","personnel","utilisateur","user"], answer: "➡️ Paramètres → 'Utilisateurs' pour gérer le personnel de la clinique." },
  { keywords: ["dental","dentaire","dent","tooth","fdi"], answer: "➡️ Nouvelle consultation → type 'Dentaire' → le schéma dentaire FDI apparaît automatiquement." },
  { keywords: ["referral","reference","référence","referred"], answer: "➡️ Dans une consultation → faites défiler → champs 'Referral/Référence' pour noter les références." },
  { keywords: ["enquete","survey","collecte","données"], answer: "➡️ Menu 'Enquêtes' → créez une enquête et partagez le lien. Fonctionne hors ligne." },
  { keywords: ["offline","hors ligne","sans internet","network"], answer: "✅ DivineLink fonctionne 100% hors ligne. Les données se synchronisent automatiquement quand internet revient." },
  { keywords: ["prix","cost","tarif","abonnement","subscription"], answer: "💰 DivineLink: 5,000 FCFA/mois (Essentiel), 15,000 (Standard), 50,000 (Premium). Contactez admin pour vous inscrire." },
];

function getAnswer(q: string): string {
  const lower = q.toLowerCase();
  for (const guide of GUIDES) {
    if (guide.keywords.some(k => lower.includes(k))) {
      return guide.answer;
    }
  }
  return "Je n'ai pas trouvé cette fonctionnalité. Essayez: 'patient', 'consultation', 'pharmacie', 'paiement', 'analyses', 'agenda', 'documents', 'paramètres', 'dental', 'referral', 'sync'.";
}

interface Message { role: "user" | "assistant"; text: string; }

export function AppGuide() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "👋 Bonjour! Je suis votre guide DivineLink.\nPosez-moi une question: 'Comment ajouter un patient?' ou 'Où sont les paiements?'" }
  ]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setInput("");
    const answer = getAnswer(userMsg);
    setMessages(m => [...m,
      { role: "user", text: userMsg },
      { role: "assistant", text: answer }
    ]);
  };

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 bg-teal-600 hover:bg-teal-700 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg transition-all animate-pulse">
          <MessageCircle className="w-6 h-6" />
        </button>
      )}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-80 h-96 bg-background border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="bg-teal-600 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-white" />
              <span className="text-white font-medium text-sm">Guide DivineLink</span>
            </div>
            <button onClick={() => setOpen(false)}><X className="w-4 h-4 text-white" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-line ${
                  m.role === "user" ? "bg-teal-600 text-white rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"
                }`}>{m.text}</div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <div className="p-2 border-t flex gap-2">
            <Input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}
              placeholder="Ex: comment ajouter un patient?"
              className="text-sm h-8" />
            <Button size="sm" className="h-8 w-8 p-0 bg-teal-600 hover:bg-teal-700" onClick={send}>
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
