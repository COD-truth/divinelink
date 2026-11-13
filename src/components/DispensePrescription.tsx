import { useEffect, useMemo, useState } from "react";
import { db, generatePatientId, generateAnonCode, type Patient, type Drug } from "@/lib/db";
import { decryptPatients, encryptPatientForSave } from "@/lib/patientCrypto";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { logAudit } from "@/lib/audit";
import { generateThermalReceipt, generateFacture, type ReceiptLineItem } from "./ReceiptGenerator";
import { PatientPicker } from "./PatientPicker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, UserPlus, Printer, Pill, ShoppingBag, RotateCcw } from "lucide-react";
import { toast } from "sonner";

interface Line { drugId?: number; name: string; unitPrice: number; qtyPrescribed: number; qtyDispensed: number; free: boolean; posology?: string; lineTotal?: number; }
// Amount actually charged for a line: an explicit lineTotal override wins over Qté × PU
// (DH New bills lump amounts that don't equal unit×qty). Stock still uses qtyDispensed.
const lineAmt = (l: Line) => l.free ? 0 : (l.lineTotal != null ? l.lineTotal : l.qtyDispensed * l.unitPrice);
const isOverride = (l: Line) => l.lineTotal != null && l.lineTotal !== l.qtyDispensed * l.unitPrice;

const DICT = {
  fr: {
    title: "🧾 Ordonnance / Dispensation", patient: "Patient", choose: "Choisir un patient…", quickNew: "＋ Nouveau",
    addDrug: "Ajouter un médicament", pickDrug: "Médicament (stock)…", prescribed: "Prescrit", dispensed: "Donné", free: "Gratuit",
    noLines: "Ajoutez les médicaments prescrits.", total: "Total à payer", save: "Enregistrer", savePrint: "Reçu", saveFacture: "Facture A4",
    cancel: "Fermer", pickPatient: "Choisissez un patient", addLine: "Ajoutez au moins un médicament",
    saved: (n: number) => `Ordonnance enregistrée (${n} donné)`, insufficient: (d: string) => `Stock insuffisant: ${d}`,
    qpTitle: "Nouveau patient (rapide)", qpName: "Nom complet", qpAge: "Âge", qpSex: "Sexe", qpPhone: "Téléphone", qpSave: "Créer", qpNameReq: "Nom requis",
    note: "Tout est enregistré (même gratuit). Le reçu est optionnel.",
    searchDrug: "Rechercher ou saisir un médicament…", createDrug: (n: string) => `＋ Créer « ${n} »`, noDrug: "Aucun médicament. Tapez pour en créer un.",
    ndTitle: "Nouveau médicament", ndPrice: "Prix de vente (FCFA)", ndStock: "Stock initial", ndUnit: "Unité", ndSave: "Créer & ajouter",
    drugCreated: (n: string) => `${n} créé (pharmacie + magasin)`,
    walkIn: "Vente libre", walkInName: "Vente libre / Client comptant", walkInHint: "sans nom de patient",
    unitPriceLbl: "Prix U.", qtyLbl: "Qté", walkInTitle: "🛒 Vente libre",
    dispDate: "Date", dispTimeLbl: "Heure", retroNote: "Date passée : enregistré sans toucher le stock.",
    stockLabel: "Stock", adjust: "Ajuster", stockSet: (n: string, s: number) => `Stock corrigé : ${n} = ${s}`,
    draftRestored: "Brouillon récupéré — reprise là où vous étiez.", fresh: "Vider",
    cov: "Prise en charge", covCash: "Espèces (patient 100%)", covIns: "Assurance / Mutuelle",
    insurer: "Assureur / Mutuelle", policy: "N° assuré / bon", rate: "Taux pris en charge (%)",
    covered: "Pris en charge (assureur)", patientPart: "Part patient (à encaisser)",
    remise: "Remise", gratuit: "Gratuit (hôpital)", net: "Net à payer", totalBrut: "Total brut", remiseFcfa: "FCFA", remisePct: "%",
    quickTitle: "Entrée rapide (sans stock)", encaisseLbl: "Montant encaissé", resteLbl: "Reste (dette)", payeTout: "Payé intégralement",
    thDrug: "Article", thPU: "P.U.", thQty: "Qté", thPresc: "Pres.", thGiven: "Donné", thTot: "Total", details: "détails",
    freeItem: (n: string) => `＋ Article libre « ${n} » (sans stock)`, ndCat: "Type",
    posologyLbl: "Posologie", posologyPh: "matin-midi-soir / 1-0-1",
  },
  en: {
    title: "🧾 Prescription / Dispensing", patient: "Patient", choose: "Select a patient…", quickNew: "＋ New",
    addDrug: "Add a drug", pickDrug: "Drug (in stock)…", prescribed: "Prescribed", dispensed: "Given", free: "Free",
    noLines: "Add the prescribed drugs.", total: "Total due", save: "Save", savePrint: "Receipt", saveFacture: "Invoice A4",
    cancel: "Close", pickPatient: "Choose a patient", addLine: "Add at least one drug",
    saved: (n: number) => `Prescription saved (${n} given)`, insufficient: (d: string) => `Insufficient stock: ${d}`,
    qpTitle: "New patient (quick)", qpName: "Full name", qpAge: "Age", qpSex: "Sex", qpPhone: "Phone", qpSave: "Create", qpNameReq: "Name required",
    note: "Everything is recorded (free included). The receipt is optional.",
    searchDrug: "Search or type a drug…", createDrug: (n: string) => `＋ Create "${n}"`, noDrug: "No drug. Type to create one.",
    ndTitle: "New drug", ndPrice: "Sell price (FCFA)", ndStock: "Initial stock", ndUnit: "Unit", ndSave: "Create & add",
    drugCreated: (n: string) => `${n} created (pharmacy + store)`,
    walkIn: "Walk-in sale", walkInName: "Walk-in / Over-the-counter", walkInHint: "no patient name",
    unitPriceLbl: "Unit price", qtyLbl: "Qty", walkInTitle: "🛒 Walk-in sale",
    dispDate: "Date", dispTimeLbl: "Time", retroNote: "Past date: recorded without touching stock.",
    stockLabel: "Stock", adjust: "Set", stockSet: (n: string, s: number) => `Stock corrected: ${n} = ${s}`,
    draftRestored: "Draft restored — picked up where you left off.", fresh: "Clear",
    cov: "Coverage", covCash: "Cash (patient 100%)", covIns: "Insurance / Mutual",
    insurer: "Insurer / Mutual", policy: "Member / voucher no.", rate: "Coverage rate (%)",
    covered: "Covered (insurer)", patientPart: "Patient part (to collect)",
    remise: "Discount", gratuit: "Free (hospital)", net: "Net due", totalBrut: "Gross total", remiseFcfa: "FCFA", remisePct: "%",
    quickTitle: "Quick entry (no stock)", encaisseLbl: "Amount collected", resteLbl: "Balance (debt)", payeTout: "Paid in full",
    thDrug: "Item", thPU: "Unit", thQty: "Qty", thPresc: "Presc.", thGiven: "Given", thTot: "Total", details: "details",
    freeItem: (n: string) => `＋ Free item "${n}" (no stock)`, ndCat: "Type",
    posologyLbl: "Dosage", posologyPh: "morning-noon-night / 1-0-1",
  },
};

const ITEM_CATS = ["Médicament", "Consommable", "Carnet", "Autre"];
// Fast non-stock clinic entries — billed, never create stock (consultation, labo, actes…).
const QUICK_ITEMS = ["Consultation", "Analyse / Labo", "Soin / Acte", "Pansement", "Injection", "Accouchement", "Hospitalisation", "Kit", "Carnet", "Échographie", "Divers"];

function dobFromAge(age: number): string { const d = new Date(); d.setFullYear(d.getFullYear() - age); return d.toISOString().slice(0, 10); }

export function DispensePrescription({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved?: () => void }) {
  const { user } = useAuth();
  const { lang } = useLang();
  const L = DICT[lang] || DICT.fr;
  const cid = () => localStorage.getItem("divinelink.clinicId") || undefined;
  const inClinic = (c?: string) => { const a = cid(); return !a || !c || String(c) === String(a); };
  const draftKey = () => `divinelink.ordoDraft.${cid() || "default"}`;

  const [patients, setPatients] = useState<Patient[]>([]);
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [patientId, setPatientId] = useState("");
  const [walkIn, setWalkIn] = useState(false);
  const [dispDate, setDispDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dispTime, setDispTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [restored, setRestored] = useState(false);
  const [qpOpen, setQpOpen] = useState(false);
  const [qp, setQp] = useState({ name: "", age: "", sex: "" as "M" | "F" | "", phone: "" });
  // Drug search box (type-to-filter + create new inline)
  const [drugQuery, setDrugQuery] = useState("");
  const [drugMenu, setDrugMenu] = useState(false);
  const [newDrug, setNewDrug] = useState<{ open: boolean; name: string; price: string; stock: string; unit: string; category: string }>({ open: false, name: "", price: "", stock: "", unit: "unité", category: "Médicament" });
  // In-progress stock corrections, keyed by drugId (so a wrong stock can be
  // fixed right while dispensing, without leaving the ordonnance).
  const [stockEdits, setStockEdits] = useState<Record<number, string>>({});
  // Prise en charge: cash (patient pays all) vs insurance (insurer covers a %).
  const [cov, setCov] = useState<{ mode: "cash" | "insurance"; insurer: string; policy: string; rate: string }>({ mode: "cash", insurer: "", policy: "", rate: "" });
  // Remise (discount) applied before coverage. type: fixed FCFA or percent of total.
  const [disc, setDisc] = useState<{ type: "amount" | "percent"; value: string }>({ type: "amount", value: "" });
  // Montant encaissé maintenant — empty = payé intégralement; moins que le dû = dette (reste).
  const [encaisse, setEncaisse] = useState("");

  const reload = async () => {
    setPatients((await decryptPatients(await db.patients.toArray())).filter(p => !p.deleted && inClinic(p.clinicId)));
    setDrugs((await db.drugs.toArray()).filter(d => inClinic(d.clinicId)));
  };

  const clearDraft = () => { try { localStorage.removeItem(draftKey()); } catch { /* noop */ } };
  const startFresh = () => { clearDraft(); setLines([]); setPatientId(""); setWalkIn(false); setDispDate(new Date().toISOString().slice(0, 10)); setStockEdits({}); setRestored(false); };

  // On open: reload data and restore an unfinished draft if one exists, so a
  // misclick / accidental close / reload never wipes work in progress.
  useEffect(() => {
    if (!open) return;
    reload();
    let d: any = null;
    try { const raw = localStorage.getItem(draftKey()); if (raw) d = JSON.parse(raw); } catch { /* noop */ }
    if (d && Array.isArray(d.lines) && d.lines.length) {
      setLines(d.lines);
      setPatientId(typeof d.patientId === "string" ? d.patientId : "");
      setWalkIn(!!d.walkIn);
      setDispDate(d.dispDate || new Date().toISOString().slice(0, 10));
      setDispTime(d.dispTime || new Date().toTimeString().slice(0, 5));
      setCov(d.cov && typeof d.cov === "object" ? d.cov : { mode: "cash", insurer: "", policy: "", rate: "" });
      setDisc(d.disc && typeof d.disc === "object" ? d.disc : { type: "amount", value: "" });
      setEncaisse("");
      setRestored(true);
    } else {
      setPatientId(""); setWalkIn(false); setLines([]); setDispDate(new Date().toISOString().slice(0, 10)); setDispTime(new Date().toTimeString().slice(0, 5));
      setCov({ mode: "cash", insurer: "", policy: "", rate: "" });
      setDisc({ type: "amount", value: "" });
      setEncaisse("");
      setRestored(false);
    }
    setStockEdits({});
  }, [open]);

  // Autosave the draft on every change while the dialog is open.
  useEffect(() => {
    if (!open) return;
    try {
      if (lines.length || patientId || walkIn) {
        localStorage.setItem(draftKey(), JSON.stringify({ lines, patientId, walkIn, dispDate, dispTime, cov, disc, ts: Date.now() }));
      }
    } catch { /* noop */ }
  }, [lines, patientId, walkIn, dispDate, dispTime, cov, disc, open]);

  const patient = patients.find(p => String(p.id) === patientId);
  const total = useMemo(() => lines.reduce((s, l) => s + lineAmt(l), 0), [lines]);
  // Remise first → net; insurance then splits the NET, not the gross.
  const discVal = Math.max(0, parseFloat(disc.value) || 0);
  const discountAmount = disc.type === "percent" ? Math.round(total * Math.min(100, discVal) / 100) : Math.min(discVal, total);
  const net = Math.max(0, total - discountAmount);
  const rateNum = Math.min(100, Math.max(0, parseFloat(cov.rate) || 0));
  const covered = cov.mode === "insurance" ? Math.round(net * rateNum / 100) : 0;
  const patientPart = Math.max(0, net - covered);
  // Encaissement du jour — ce que le payeur règle maintenant. Le reste est une dette.
  const useIns = cov.mode === "insurance" && covered > 0;
  const dueNow = useIns ? patientPart : net;              // ce que le patient doit régler
  const paidNow = encaisse.trim() === "" ? dueNow : Math.max(0, Math.min(dueNow, parseFloat(encaisse) || 0));
  const reste = Math.max(0, dueNow - paidNow);
  const payStatus: "paid" | "partial" | "unpaid" = reste <= 0 ? "paid" : (paidNow > 0 ? "partial" : "unpaid");

  // When a patient with insurance on file is picked, prefill the coverage.
  useEffect(() => {
    const p = patients.find(x => String(x.id) === patientId);
    if (!p) return;
    const isIns = p.coverageMode === "Assurance" || p.coverageMode === "Mutuelle" || !!p.insurerName || p.coverageRate != null;
    if (isIns) setCov(c => ({ mode: "insurance", insurer: p.insurerName || c.insurer, policy: p.insurancePolicy || c.policy, rate: p.coverageRate != null ? String(p.coverageRate) : c.rate }));
  }, [patientId]);

  const pickDrug = (d: Drug) => {
    setLines(ls => [...ls, { drugId: d.id, name: d.name, unitPrice: d.sellPrice || 0, qtyPrescribed: 1, qtyDispensed: d.stock > 0 ? 1 : 0, free: false }]);
    setDrugQuery(""); setDrugMenu(false);
  };
  // Free/manual line: a hand-typed item (carnet, kit infirmière, a one-off)
  // that is billed but tracks NO stock (no drugId).
  const addManualLine = (name: string) => {
    const n = name.trim(); if (!n) return;
    setLines(ls => [...ls, { name: n, unitPrice: 0, qtyPrescribed: 1, qtyDispensed: 1, free: false }]);
    setDrugQuery(""); setDrugMenu(false);
  };
  // Create a brand-new drug from the search box: real Drug record (asks
  // price/stock) + mirror into the Magasin, then add it as a line.
  const createNewDrug = async () => {
    const name = newDrug.name.trim(); if (!name) { toast.error(L.qpNameReq); return; }
    const now = new Date().toISOString();
    const c = cid();
    const price = parseFloat(newDrug.price) || 0;
    const stock = parseInt(newDrug.stock) || 0;
    const drug = {
      name, category: newDrug.category || "Médicament", stock, stockMagasin: 0, initialStock: stock,
      unit: newDrug.unit || "unité", buyPrice: 0, sellPrice: price, minStock: 5,
      status: stock > 0 ? "in_stock" : "out", clinicId: c, createdAt: now, updatedAt: now,
    } as Drug;
    const id = await db.drugs.add(drug);
    await logAudit("drug_create", user?.name || "—", { resource: "drug", resourceId: id, message: `${name} · stock=${stock} (ordonnance)` });
    // One-way model: a drug created on the Pharmacie counter stays here; it does
    // NOT create or change anything in the Magasin.
    await reload();
    setLines(ls => [...ls, { drugId: id, name, unitPrice: price, qtyPrescribed: 1, qtyDispensed: stock > 0 ? 1 : 0, free: false }]);
    setNewDrug({ open: false, name: "", price: "", stock: "", unit: "unité", category: "Médicament" });
    setDrugQuery(""); setDrugMenu(false);
    toast.success(L.drugCreated(name));
  };
  const upd = (i: number, patch: Partial<Line>) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const rm = (i: number) => setLines(ls => ls.filter((_, idx) => idx !== i));

  // Correct a drug's stock right from the ordonnance (writes immediately +
  // logs a stock-adjustment transaction, so the audit trail stays intact).
  const adjustStock = async (drugId: number) => {
    const raw = stockEdits[drugId];
    if (raw === undefined || raw.trim() === "") return;
    const newStock = parseInt(raw);
    if (isNaN(newStock) || newStock < 0) return;
    const d = await db.drugs.get(drugId); if (!d) return;
    const before = d.stock || 0;
    if (newStock === before) { setStockEdits(m => { const n = { ...m }; delete n[drugId]; return n; }); return; }
    const now = new Date().toISOString();
    const delta = newStock - before;
    await db.drugs.update(drugId, { stock: newStock, updatedAt: now, status: newStock > 0 ? "in_stock" : "out" });
    await db.drugTransactions.add({
      drugId, type: delta > 0 ? "in" : "out", quantity: Math.abs(delta), price: 0,
      exitReason: "adjustment", performedBy: user?.name, stockBefore: before, stockAfter: newStock,
      notes: `Ajustement stock (ordonnance): ${before}→${newStock}`, clinicId: cid(), createdAt: now,
    } as any);
    await logAudit("drug_adjust", user?.name || "—", { resource: "drug", resourceId: drugId, message: `${d.name} stock ${before}→${newStock}` });
    await reload();
    setStockEdits(m => { const n = { ...m }; delete n[drugId]; return n; });
    toast.success(L.stockSet(d.name, newStock));
  };

  const saveQuickPatient = async () => {
    if (!qp.name.trim()) { toast.error(L.qpNameReq); return; }
    const parts = qp.name.trim().split(/\s+/);
    const ageNum = qp.age ? parseInt(qp.age) : undefined;
    const now = new Date().toISOString();
    const payload = await encryptPatientForSave({ firstName: parts[0], lastName: parts.slice(1).join(" ") || "", phone: qp.phone.trim(), dob: ageNum !== undefined ? dobFromAge(ageNum) : "", address: "", medicalAlerts: "", ageYears: ageNum });
    const pid = await generatePatientId();
    const uid = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const newId = await db.patients.add({ ...(payload as any), uid, deleted: false, patientId: pid, anonCode: generateAnonCode(), clinicId: cid(), sex: qp.sex || undefined, registeredBy: user?.name || "—", registeredById: user?.id, registeredAt: now, visitType: "new_consultation", reasonForVisit: lang === "en" ? "Pharmacy" : "Pharmacie", createdAt: now, updatedAt: now }) as number;
    await logAudit("patient_create", user?.name || "—", { resource: "patient", resourceId: pid, message: `${qp.name.trim()} (pharmacie)` });
    await reload(); setPatientId(String(newId)); setQpOpen(false); setQp({ name: "", age: "", sex: "", phone: "" });
  };

  const doSave = async (receipt: "none" | "thermal" | "facture") => {
    if (!walkIn && !patient) { toast.error(L.pickPatient); return; }
    const pid = walkIn ? undefined : patient!.id;
    const pname = walkIn ? L.walkInName : `${patient!.firstName} ${patient!.lastName}`.trim();
    const pcode = walkIn ? undefined : patient!.patientId;
    const clean = lines.filter(l => l.name.trim() && (l.qtyPrescribed > 0 || l.qtyDispensed > 0));
    if (!clean.length) { toast.error(L.addLine); return; }
    const todayYmd = new Date().toISOString().slice(0, 10);
    const retro = !!dispDate && dispDate < todayYmd;
    setSaving(true);
    try {
      // Use the date + time the user set (defaults to now), so "when" is exact.
      const now = (() => { const d = new Date(`${dispDate}T${(dispTime || "12:00")}:00`); return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(); })();
      const c = cid();
      const invoiceNumber = String((await db.payments.count()) + 1).padStart(7, "0");
      // Deduct dispensed drugs + log each as a dispensing transaction (free still recorded).
      for (const l of clean) {
        if (l.qtyDispensed > 0 && l.drugId) {
          const d = await db.drugs.get(l.drugId); if (!d) continue;
          const before = d.stock || 0; const after = retro ? before : Math.max(0, before - l.qtyDispensed);
          if (!retro) await db.drugs.update(l.drugId, { stock: after, updatedAt: now });
          await db.drugTransactions.add({
            drugId: l.drugId, type: "out", quantity: l.qtyDispensed, price: l.free ? 0 : l.unitPrice,
            patientId: pid, paymentStatus: l.free ? "paid" : "paid", exitReason: "dispensed",
            performedBy: user?.name, stockBefore: before, stockAfter: after,
            notes: `Prescrit ${l.qtyPrescribed}, donné ${l.qtyDispensed}${l.free ? " · gratuit" : ""}${walkIn ? " · vente libre" : ""}${retro ? " · rétro" : ""}`, clinicId: c, createdAt: now,
          } as any);
          await logAudit("drug_dispense", user?.name || "—", { resource: "drug", resourceId: l.drugId, message: `${l.name} -${l.qtyDispensed} · ${pname}${l.free ? " (gratuit)" : ""}` });
        }
      }
      // Billable facture from non-free dispensed lines (drugs → Pharmacie; manual → Acte/Clinique).
      // When the charged amount overrides Qté×PU, bill it as a single line at that amount.
      const billItems = clean.filter(l => l.qtyDispensed > 0 && !l.free && lineAmt(l) > 0)
        .map(l => isOverride(l)
          ? { name: l.qtyDispensed > 1 ? `${l.name} (x${l.qtyDispensed})` : l.name, quantity: 1, unitPrice: lineAmt(l), drugId: l.drugId, category: l.drugId ? "Pharmacie" : "Acte" }
          : { name: l.name, quantity: l.qtyDispensed, unitPrice: l.unitPrice, drugId: l.drugId, category: l.drugId ? "Pharmacie" : "Acte" });
      const hasDisc = discountAmount > 0;
      if (billItems.length) {
        await db.payments.add({
          patientId: pid ?? 0, patientName: pname, invoiceNumber, items: billItems,
          label: billItems.map(i => i.name).slice(0, 3).join(", "),
          // amountDue is the NET (after remise). amountPaid = ce qui est encaissé maintenant ;
          // le reste (balance) est la dette du patient. L'assureur est tracé via insuranceCovered.
          amountDue: net, amountPaid: paidNow, balance: reste, status: payStatus,
          method: useIns ? "insurance" : "cash", paidAt: now,
          installments: paidNow > 0 ? [{ id: (globalThis.crypto?.randomUUID?.() || String(Date.now())), amount: paidNow, method: "cash", paidAt: now, receivedBy: user?.name }] : [],
          ...(hasDisc ? { discount: discVal, discountType: disc.type, grossTotal: total } : {}),
          ...(useIns ? { insurerName: cov.insurer || undefined, insurancePolicy: cov.policy || undefined, coverageRate: rateNum, insuranceCovered: covered, patientPart } : {}),
          clinicId: c, createdAt: now, updatedAt: now,
        } as any);
      }
      // Prescription record (prescribed vs given) for history/stats
      await db.prescriptions.add({
        uid: (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
        patientId: pid ?? 0, patientName: pname,
        lines: clean, total, invoiceNumber: billItems.length ? invoiceNumber : undefined,
        prescribedBy: user?.name, clinicId: c, createdAt: now, updatedAt: now,
      } as any);

      if (receipt !== "none" && billItems.length) {
        const items: ReceiptLineItem[] = clean.filter(l => l.qtyDispensed > 0 && !l.free && lineAmt(l) > 0).map(l => {
          const nm = l.posology ? `${l.name} — ${l.posology}` : l.name;
          return isOverride(l)
            ? { description: l.qtyDispensed > 1 ? `${nm} (x${l.qtyDispensed})` : nm, quantity: 1, unitPrice: lineAmt(l) }
            : { description: nm, quantity: l.qtyDispensed, unitPrice: l.unitPrice };
        });
        const common = {
          receiptNumber: invoiceNumber, date: new Date().toLocaleString("fr-FR"), patientName: pname, patientId: pcode, cashier: user?.name,
          items, paymentMethod: (useIns ? "insurance" : "cash"), status: payStatus, amountPaid: paidNow, amountDue: net,
          ...(hasDisc ? { discount: discVal, discountType: disc.type } : {}),
          insurerName: useIns ? (cov.insurer || undefined) : undefined, coverageRate: useIns ? rateNum : undefined, insuranceCovered: useIns ? covered : undefined,
        };
        if (receipt === "facture") {
          generateFacture({ ...common, patientAge: (patient as any)?.ageYears, patientSex: patient?.sex, patientPhone: patient?.phone });
        } else {
          generateThermalReceipt(common);
        }
      }
      clearDraft();
      toast.success(L.saved(clean.filter(l => l.qtyDispensed > 0).length));
      onSaved?.(); onOpenChange(false);
    } catch (e: any) { toast.error("Erreur: " + (e?.message || "échec")); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{walkIn ? L.walkInTitle : L.title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {restored && (
              <div className="flex items-center gap-2 rounded-md border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                <RotateCcw className="w-4 h-4 shrink-0" />
                <span className="flex-1">{L.draftRestored}</span>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={startFresh}>{L.fresh}</Button>
              </div>
            )}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">{L.patient}</label>
                <Button type="button" size="sm" variant={walkIn ? "default" : "outline"} className="h-7 gap-1 text-xs" onClick={() => setWalkIn(v => !v)}>
                  <ShoppingBag className="w-3.5 h-3.5" /> {L.walkIn}
                </Button>
              </div>
              {walkIn ? (
                <div className="mt-1 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm font-medium text-primary">{L.walkInName} — {L.walkInHint}</div>
              ) : (
                <div className="flex gap-2 mt-1">
                  <PatientPicker patients={patients} value={patientId} onPick={setPatientId} placeholder={L.choose} />
                  <Button type="button" variant="outline" className="gap-1 whitespace-nowrap shrink-0" onClick={() => { setQp({ name: "", age: "", sex: "", phone: "" }); setQpOpen(true); }}><UserPlus className="w-4 h-4" /> {L.quickNew}</Button>
                </div>
              )}
            </div>

            <div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm">{L.dispDate}</label>
                  <Input type="date" value={dispDate} max={new Date().toISOString().slice(0, 10)} onChange={e => setDispDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm">{L.dispTimeLbl}</label>
                  <Input type="time" value={dispTime} onChange={e => setDispTime(e.target.value)} />
                </div>
              </div>
              {dispDate < new Date().toISOString().slice(0, 10) && <p className="text-[11px] text-amber-600 mt-0.5">⏱ {L.retroNote}</p>}
            </div>

            {/* Drug search box — type to filter the whole catalogue, or create
                a new drug inline (mirrored to the Magasin). */}
            <div className="relative">
              <div className="flex items-center gap-2 rounded-md border px-2 h-9">
                <Pill className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  className="flex-1 bg-transparent outline-none text-sm min-w-0"
                  placeholder={L.searchDrug}
                  value={drugQuery}
                  onChange={e => { setDrugQuery(e.target.value); setDrugMenu(true); }}
                  onFocus={() => setDrugMenu(true)}
                  onBlur={() => setTimeout(() => setDrugMenu(false), 150)}
                />
              </div>
              {drugMenu && (() => {
                const q = drugQuery.trim().toLowerCase();
                const matches = drugs
                  .filter(d => !q || d.name.toLowerCase().includes(q))
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .slice(0, 40);
                const exact = !!q && drugs.some(d => d.name.trim().toLowerCase() === q);
                return (
                  <div className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-md border bg-popover shadow-md">
                    {matches.length === 0 && !q && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">{L.noDrug}</div>
                    )}
                    {matches.map(d => (
                      <button
                        key={d.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex justify-between gap-2"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => pickDrug(d)}
                      >
                        <span className="truncate">{d.name}</span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{(d.sellPrice || 0).toLocaleString()} F · {d.stock}</span>
                      </button>
                    ))}
                    {q && !exact && (
                      <>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm font-medium text-primary hover:bg-accent border-t"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => setNewDrug({ open: true, name: drugQuery.trim(), price: "", stock: "", unit: "unité", category: "Médicament" })}
                        >
                          {L.createDrug(drugQuery.trim())}
                        </button>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent border-t"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => addManualLine(drugQuery.trim())}
                        >
                          {L.freeItem(drugQuery.trim())}
                        </button>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Quick non-stock clinic entries — consultation, labo, actes… (no stock) */}
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[11px] text-muted-foreground w-full">{L.quickTitle}</span>
              {QUICK_ITEMS.map(q => (
                <Button key={q} type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => addManualLine(q)}>+ {q}</Button>
              ))}
            </div>

            {/* Scannable table of the prescription — one row per drug, columns
                aligned under a header so a multi-drug ordonnance reads at a glance. */}
            <div className="rounded-md border overflow-hidden">
              <div className="flex items-center gap-1.5 px-2 py-1.5 bg-muted/50 text-[10px] font-bold uppercase text-muted-foreground">
                <span className="flex-1 min-w-0">{L.thDrug}</span>
                <span className="w-16 text-center">{L.thPU}</span>
                {!walkIn && <span className="w-12 text-center">{L.thPresc}</span>}
                <span className="w-14 text-center">{L.thGiven}</span>
                <span className="w-16 text-right">{L.thTot}</span>
                <span className="w-7" />
              </div>
              {lines.length === 0 && <p className="text-sm text-muted-foreground px-2 py-3">{L.noLines}</p>}
              {lines.map((l, i) => {
                const lineComputed = l.qtyDispensed * l.unitPrice;
                const d = l.drugId ? drugs.find(x => x.id === l.drugId) : undefined;
                return (
                  <div key={i} className="border-t px-2 py-1.5 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="flex-1 min-w-0 text-sm font-medium truncate" title={l.name}>{l.name}</span>
                      <Input type="number" min={0} inputMode="numeric" className={`w-16 h-8 text-center px-1 ${!l.free && l.unitPrice <= 0 ? "border-destructive text-destructive" : ""}`} value={l.unitPrice} onChange={e => upd(i, { unitPrice: parseFloat(e.target.value) || 0 })} placeholder="0" />
                      {!walkIn && <Input type="number" min={0} inputMode="numeric" className="w-12 h-8 text-center px-1" value={l.qtyPrescribed} onChange={e => upd(i, { qtyPrescribed: parseInt(e.target.value) || 0 })} />}
                      <Input type="number" min={0} inputMode="numeric" className="w-14 h-8 text-center px-1" value={l.qtyDispensed} onChange={e => { const q = parseInt(e.target.value) || 0; if (walkIn) upd(i, { qtyDispensed: q, qtyPrescribed: q }); else upd(i, { qtyDispensed: q }); }} />
                      <Input type="number" min={0} inputMode="numeric" title="Montant facturé (modifiable)" className={`w-16 h-8 text-right px-1 font-semibold ${isOverride(l) ? "text-primary" : ""}`} disabled={l.free} value={l.free ? "" : (l.lineTotal != null ? l.lineTotal : lineComputed)} onChange={e => { const v = e.target.value; upd(i, { lineTotal: v === "" ? undefined : (parseFloat(v) || 0) }); }} />
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-7 shrink-0" onClick={() => rm(i)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                    {/* secondary strip: posologie + gratuit + correct the stock on the spot */}
                    <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="whitespace-nowrap">{L.posologyLbl}</span>
                        <Input className="h-7 w-32 px-2" placeholder={L.posologyPh} value={l.posology || ""} onChange={e => upd(i, { posology: e.target.value })} />
                      </span>
                      {!walkIn && <label className="flex items-center gap-1"><input type="checkbox" className="w-3.5 h-3.5" checked={l.free} onChange={e => upd(i, { free: e.target.checked })} /> {L.free}</label>}
                      {d && (
                        <span className="flex items-center gap-1">
                          {L.stockLabel}: <b className={d.stock <= 0 ? "text-destructive" : ""}>{d.stock}</b>
                          <Input type="number" min={0} inputMode="numeric" className="h-7 w-16 px-1" placeholder={String(d.stock)} value={stockEdits[l.drugId!] ?? ""} onChange={e => setStockEdits(m => ({ ...m, [l.drugId!]: e.target.value }))} />
                          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={(stockEdits[l.drugId!] ?? "") === ""} onClick={() => adjustStock(l.drugId!)}>{L.adjust}</Button>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Prise en charge — assurance / mutuelle splits the bill. */}
            <div className="rounded-md border p-2 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium flex-1">{L.cov}</span>
                <Button type="button" size="sm" variant={cov.mode === "cash" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setCov(c => ({ ...c, mode: "cash" }))}>{L.covCash}</Button>
                <Button type="button" size="sm" variant={cov.mode === "insurance" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setCov(c => ({ ...c, mode: "insurance" }))}>{L.covIns}</Button>
              </div>
              {cov.mode === "insurance" && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div><label className="text-[11px] text-muted-foreground block">{L.insurer}</label><Input className="h-8" value={cov.insurer} onChange={e => setCov(c => ({ ...c, insurer: e.target.value }))} /></div>
                  <div><label className="text-[11px] text-muted-foreground block">{L.policy}</label><Input className="h-8" value={cov.policy} onChange={e => setCov(c => ({ ...c, policy: e.target.value }))} /></div>
                  <div><label className="text-[11px] text-muted-foreground block">{L.rate}</label><Input type="number" min={0} max={100} inputMode="numeric" className="h-8" value={cov.rate} onChange={e => setCov(c => ({ ...c, rate: e.target.value }))} placeholder="80" /></div>
                </div>
              )}
            </div>

            {/* Remise (discount) — applied before coverage */}
            <div className="rounded-md border p-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium flex-1">{L.remise}</span>
                <Input type="number" inputMode="numeric" className="h-8 w-24" value={disc.value} onChange={e => setDisc(d => ({ ...d, value: e.target.value }))} placeholder="0" />
                <Button type="button" size="sm" variant={disc.type === "amount" ? "default" : "outline"} className="h-8 px-2 text-xs" onClick={() => setDisc(d => ({ ...d, type: "amount" }))}>{L.remiseFcfa}</Button>
                <Button type="button" size="sm" variant={disc.type === "percent" ? "default" : "outline"} className="h-8 px-2 text-xs" onClick={() => setDisc(d => ({ ...d, type: "percent" }))}>{L.remisePct}</Button>
                <Button type="button" size="sm" variant={total > 0 && discountAmount >= total ? "destructive" : "outline"} className="h-8 text-xs" onClick={() => setDisc({ type: "percent", value: "100" })}>{L.gratuit}</Button>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              {(discountAmount > 0 || covered > 0) ? (
                <>
                  <div className="flex justify-between items-center text-sm"><span>{L.totalBrut}</span><span className={discountAmount > 0 ? "line-through text-muted-foreground" : "font-semibold"}>{total.toLocaleString()} FCFA</span></div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between items-center text-sm text-destructive"><span>{L.remise}{disc.type === "percent" ? ` (${Math.min(100, discVal)}%)` : ""}</span><span>− {discountAmount.toLocaleString()} FCFA</span></div>
                  )}
                  {discountAmount > 0 && covered > 0 && (
                    <div className="flex justify-between items-center text-sm font-medium"><span>{L.net}</span><span>{net.toLocaleString()} FCFA</span></div>
                  )}
                  {covered > 0 ? (
                    <>
                      <div className="flex justify-between items-center text-sm text-muted-foreground"><span>{L.covered}{cov.insurer ? ` · ${cov.insurer}` : ""} ({rateNum}%)</span><span>− {covered.toLocaleString()} FCFA</span></div>
                      <div className="flex justify-between items-center text-base font-bold text-primary"><span>{L.patientPart}</span><span>{patientPart.toLocaleString()} FCFA</span></div>
                    </>
                  ) : (
                    <div className="flex justify-between items-center text-base font-bold text-primary"><span>{L.net}</span><span>{net.toLocaleString()} FCFA</span></div>
                  )}
                </>
              ) : (
                <div className="flex justify-between items-center"><span className="text-sm">{L.total}</span><span className="font-bold">{total.toLocaleString()} FCFA</span></div>
              )}
            </div>

            {/* Encaissement — ce qui est payé maintenant ; le reste devient une dette */}
            <div className="rounded-md border p-2 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium flex-1">{L.encaisseLbl}</span>
                <Input type="number" inputMode="numeric" className="h-8 w-28 text-right" value={encaisse} onChange={e => setEncaisse(e.target.value)} placeholder={dueNow.toLocaleString()} />
                <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setEncaisse("")}>{L.payeTout}</Button>
              </div>
              {reste > 0 && (
                <div className="flex justify-between items-center text-sm font-semibold text-destructive">
                  <span>{L.resteLbl}</span><span>{reste.toLocaleString()} FCFA</span>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{L.note}</p>
          </div>
          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{L.cancel}</Button>
            <Button variant="secondary" onClick={() => doSave("none")} disabled={saving}>{L.save}</Button>
            <Button variant="secondary" onClick={() => doSave("thermal")} disabled={saving} className="gap-1"><Printer className="w-4 h-4" /> {L.savePrint}</Button>
            <Button onClick={() => doSave("facture")} disabled={saving} className="gap-1"><Printer className="w-4 h-4" /> {L.saveFacture}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* quick patient */}
      <Dialog open={qpOpen} onOpenChange={setQpOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{L.qpTitle}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div><label className="text-sm">{L.qpName} *</label><Input value={qp.name} onChange={e => setQp(f => ({ ...f, name: e.target.value }))} autoFocus /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="text-sm">{L.qpAge}</label><Input type="number" value={qp.age} onChange={e => setQp(f => ({ ...f, age: e.target.value }))} /></div>
              <div className="col-span-2"><label className="text-sm">{L.qpSex}</label>
                <div className="flex gap-2">
                  <Button type="button" variant={qp.sex === "M" ? "default" : "outline"} className="flex-1" onClick={() => setQp(f => ({ ...f, sex: "M" }))}>M</Button>
                  <Button type="button" variant={qp.sex === "F" ? "default" : "outline"} className="flex-1" onClick={() => setQp(f => ({ ...f, sex: "F" }))}>F</Button>
                </div>
              </div>
            </div>
            <div><label className="text-sm">{L.qpPhone}</label><Input value={qp.phone} onChange={e => setQp(f => ({ ...f, phone: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setQpOpen(false)}>{L.cancel}</Button><Button onClick={saveQuickPatient}>{L.qpSave}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* new drug (created from the search box) */}
      <Dialog open={newDrug.open} onOpenChange={v => setNewDrug(n => ({ ...n, open: v }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{L.ndTitle}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div><label className="text-sm">{L.qpName} *</label><Input value={newDrug.name} onChange={e => setNewDrug(n => ({ ...n, name: e.target.value }))} autoFocus /></div>
            <div>
              <label className="text-sm">{L.ndCat}</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {ITEM_CATS.map(cat => (
                  <Button key={cat} type="button" size="sm" variant={newDrug.category === cat ? "default" : "outline"} className="h-7 text-xs" onClick={() => setNewDrug(n => ({ ...n, category: cat }))}>{cat}</Button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-sm">{L.ndPrice}</label><Input type="number" min={0} value={newDrug.price} onChange={e => setNewDrug(n => ({ ...n, price: e.target.value }))} /></div>
              <div><label className="text-sm">{L.ndStock}</label><Input type="number" min={0} value={newDrug.stock} onChange={e => setNewDrug(n => ({ ...n, stock: e.target.value }))} /></div>
            </div>
            <div><label className="text-sm">{L.ndUnit}</label><Input value={newDrug.unit} onChange={e => setNewDrug(n => ({ ...n, unit: e.target.value }))} /></div>
            <p className="text-xs text-muted-foreground">{L.drugCreated(newDrug.name || "…")}</p>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setNewDrug(n => ({ ...n, open: false }))}>{L.cancel}</Button><Button onClick={createNewDrug}>{L.ndSave}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
