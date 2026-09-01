import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Send, Bot } from "lucide-react";

const GUIDES = [
  { keywords: ["patient","ajouter","nouveau patient","add patient","register","enregistrer"],
    answer: "Patients dans le menu gauche → bouton Nouveau patient → remplissez nom, prenom, telephone → Enregistrer." },
  { keywords: ["consultation","consulter","consult","examen"],
    answer: "Menu Consultations → Nouvelle consultation → selectionnez le patient → remplissez diagnostic, traitement → Enregistrer." },
  { keywords: ["pharmacie","medicament","drug","stock"],
    answer: "Menu Pharmacie → Inventaire pour voir le stock → Ajouter medicament → remplissez nom, quantite, prix." },
  { keywords: ["paiement","payment","facture","recu","receipt","imprimer"],
    answer: "Menu Paiements → Nouveau paiement → selectionnez patient et montant. Cliquez l icone imprimante pour generer un recu PDF." },
  { keywords: ["rendez-vous","agenda","appointment","rdv"],
    answer: "Menu Agenda → cliquez sur une date → ajoutez le patient et l heure. Rappels automatiques 30min avant." },
  { keywords: ["analyse","lab","laboratoire","nfs","glycemie","bilan"],
    answer: "Ouvrez un patient → onglet Analyses → choisissez un modele (NFS, Glycemie, Paludisme...) → remplissez les valeurs → PDF." },
  { keywords: ["document","fichier","photo","image","scanner"],
    answer: "Ouvrez un patient → onglet Documents → Ajouter → choisissez fichier ou photo depuis la camera." },
  { keywords: ["parametre","settings","clinique","configuration"],
    answer: "Icone engrenage en bas du menu → nom clinique, logo, adresse, notifications, utilisateurs." },
  { keywords: ["notification","alerte","push","stock bas"],
    answer: "Parametres → section Notifications en bas → Activer → choisissez: stock bas, RDV, factures impayees, resume quotidien." },
  { keywords: ["sync","synchron","hors ligne","offline","internet"],
    answer: "DivineLink fonctionne 100% hors ligne. Synchronisation automatique quand internet revient. Icone sync en haut = statut." },
  { keywords: ["dental","dentaire","dent","tooth","extraction","detartrage","couronne"],
    answer: "Nouvelle consultation → type Dentaire → schema dentaire FDI apparait. Cliquez sur une dent pour noter l acte." },
  { keywords: ["referral","reference","refere","oriente"],
    answer: "Dans une consultation → faites defiler → champs Referral: medecin/hopital qui envoie le patient + notes." },
  { keywords: ["minsante","rapport","mensuel","reporting"],
    answer: "Menu Rapports MINSANTE → selectionnez le mois → Generer → les donnees se remplissent automatiquement → Telecharger PDF." },
  { keywords: ["utilisateur","user","personnel","staff","role","permission"],
    answer: "Parametres → Utilisateurs → Nouveau → entrez nom, role, PIN → dans la fiche utilisateur vous pouvez cocher les pages autorisees." },
  { keywords: ["prix","tarif","abonnement","combien","cost"],
    answer: "DivineLink: 5000 FCFA/mois (Essentiel), 15000 (Standard), 50000 (Premium). Contact: ekanetony123@gmail.com" },
];

function getAnswer(q: string): string {
  const lower = q.toLowerCase();
  for (const g of GUIDES) {
    if (g.keywords.some(k => lower.includes(k))) return g.answer;
  }
  return "Je n ai pas trouve. Essayez: patient, consultation, pharmacie, paiement, analyses, agenda, notifications, sync, dental, utilisateurs, MINSANTE.";
}

interface Msg { role: "user"|"assistant"; text: string; }

export function AppGuide() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", text: "Bonjour! Je suis votre guide DivineLink.\n\nExemples:\n- Comment ajouter un patient?\n- Ou generer un recu?\n- Comment activer les notifications?" }
  ]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:"smooth"}); }, [msgs]);

  const send = () => {
    if (!input.trim()) return;
    const q = input.trim();
    setInput("");
    setMsgs(m => [...m, {role:"user",text:q}, {role:"assistant",text:getAnswer(q)}]);
  };

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 bg-teal-600 hover:bg-teal-700 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg">
          <MessageCircle className="w-6 h-6"/>
        </button>
      )}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-80 h-[480px] bg-background border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="bg-teal-600 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-white"/>
              <div>
                <p className="text-white font-medium text-sm">Guide DivineLink</p>
                <p className="text-teal-100 text-xs">Aide FR/EN</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)}><X className="w-4 h-4 text-white"/></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {msgs.map((m,i) => (
              <div key={i} className={"flex " + (m.role==="user"?"justify-end":"justify-start")}>
                <div className={"max-w-[90%] px-3 py-2 rounded-2xl text-sm whitespace-pre-line " + (m.role==="user"?"bg-teal-600 text-white rounded-br-sm":"bg-muted text-foreground rounded-bl-sm")}>
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={bottomRef}/>
          </div>
          <div className="p-2 border-t flex gap-2 flex-shrink-0">
            <Input value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&send()}
              placeholder="Ex: comment ajouter un patient?"
              className="text-sm h-9"/>
            <Button size="sm" className="h-9 w-9 p-0 bg-teal-600 hover:bg-teal-700 flex-shrink-0" onClick={send}>
              <Send className="w-4 h-4"/>
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
