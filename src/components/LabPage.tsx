import { useEffect, useMemo, useState } from "react";
import { db, type Patient, type LabResult, type LabReagent, type LabTest, generatePatientId, generateAnonCode } from "@/lib/db";
import { decryptPatients, encryptPatientForSave } from "@/lib/patientCrypto";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { LAB_CATALOGUE } from "./LabResultsPage";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FlaskConical, Search, Plus, Trash2, FileText, FlaskRound, ClipboardList, UserPlus, Pencil, Check, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { LabReagents } from "./LabReagents";
import { ProfitReport } from "./ProfitReport";
import { generateThermalReceipt, type ReceiptLineItem } from "./ReceiptGenerator";
import { Printer, Download } from "lucide-react";
import clinicLabDH from "@/lib/clinicLabDH.json";

const DICT = {
  fr: {
    title: "Laboratoire", newOrder: "Nouvelle demande", analyses: "Analyses", reagents: "Réactifs", tests: "Tests", benefices: "Saisie / Bénéfices",
    pending: "En attente", done: "Terminés", all: "Tous", searchPh: "Rechercher patient ou examen…",
    none: "Aucune analyse.", enter: "Saisir", view: "Voir", newOrderTitle: "Nouvelle demande d'analyse",
    patient: "Patient", choose: "Choisir…", selectTests: "Sélectionnez le(s) test(s)",
    cancel: "Annuler", create: "Créer la demande", notes: "Notes / interprétation…",
    close: "Fermer", update: "Mettre à jour", save: "Enregistrer le résultat",
    needPatient: "Patient requis", needTest: "Choisissez au moins un test", created: "Demande(s) créée(s)", saved: "Résultat enregistré",
    doneBadge: "Terminé", pendingBadge: "En attente",
    customName: "Autre analyse (préciser)",
    freeResultPh: "Résultat / compte-rendu…", reagentsUsed: "Réactifs utilisés (déduit du stock)",
    addReagent: "Ajouter un réactif", qty: "Qté", pickReagent: "Choisir un réactif…", noReagents: "Aucun réactif en stock. Ajoutez-en dans l'onglet Réactifs.",
    deductedAtOrder: "Réactifs déduits à la commande.",
    // tests catalogue
    newTest: "Nouveau test", editTest: "Modifier le test", testName: "Nom du test",
    analysesLabel: "Analyses incluses (une par ligne)", recipeLabel: "Réactifs consommés par test", testSaved: "Test enregistré",
    priceLabel: "Prix (FCFA)", total: "Total à payer", createReceipt: "Créer & reçu", reprint: "Réimprimer le reçu",
    importDH: "Importer (DH)", importNote: "Les doublons sont ignorés. Prix, stocks et péremptions modifiables ensuite.",
    walkIn: "Vente libre", walkInName: "Vente libre / Client comptant", orderDate: "Date de l'analyse", retroNote: "Date passée : enregistré sans toucher le stock de réactifs.",
    noTests: "Aucun test. Créez-en un (ex: Bilan hépatique) avec ses analyses et ses réactifs.",
    deleteTest: "Supprimer ce test ?", recipeHint: "Cherchez un réactif et indiquez la quantité par test.",
    // quick patient
    quickNew: "＋ Nouveau", qpTitle: "Nouveau patient (rapide)", qpName: "Nom complet", qpAge: "Âge", qpSex: "Sexe", qpPhone: "Téléphone", qpSave: "Créer", qpNameReq: "Nom requis", qpCreated: "Patient créé",
    recette: "Recette du jour", todayBtn: "Aujourd'hui", analysesDone: "analyses", costLabel: "Coût", marginLabel: "Marge", searchTestPh: "Rechercher un test ou une analyse…",
  },
  en: {
    title: "Laboratory", newOrder: "New request", analyses: "Analyses", reagents: "Reagents", tests: "Tests", benefices: "Entry / Profit",
    pending: "Pending", done: "Completed", all: "All", searchPh: "Search patient or exam…",
    none: "No analyses.", enter: "Enter", view: "View", newOrderTitle: "New analysis request",
    patient: "Patient", choose: "Select…", selectTests: "Select test(s)",
    cancel: "Cancel", create: "Create request", notes: "Notes / interpretation…",
    close: "Close", update: "Update", save: "Save result",
    needPatient: "Patient required", needTest: "Choose at least one test", created: "Request(s) created", saved: "Result saved",
    doneBadge: "Completed", pendingBadge: "Pending",
    customName: "Other analysis (specify)",
    freeResultPh: "Result / report…", reagentsUsed: "Reagents used (deducted from stock)",
    addReagent: "Add a reagent", qty: "Qty", pickReagent: "Select a reagent…", noReagents: "No reagent in stock. Add some in the Reagents tab.",
    deductedAtOrder: "Reagents deducted at order.",
    newTest: "New test", editTest: "Edit test", testName: "Test name",
    analysesLabel: "Analyses included (one per line)", recipeLabel: "Reagents consumed per test", testSaved: "Test saved",
    priceLabel: "Price (FCFA)", total: "Total due", createReceipt: "Create & receipt", reprint: "Reprint receipt",
    importDH: "Import (DH)", importNote: "Duplicates skipped. Prices, stock and expiry editable afterwards.",
    walkIn: "Walk-in", walkInName: "Walk-in / Over-the-counter", orderDate: "Analysis date", retroNote: "Past date: recorded without touching reagent stock.",
    noTests: "No test. Create one (e.g. Liver panel) with its analyses and reagents.",
    deleteTest: "Delete this test?", recipeHint: "Search a reagent and set the quantity per test.",
    quickNew: "＋ New", qpTitle: "New patient (quick)", qpName: "Full name", qpAge: "Age", qpSex: "Sex", qpPhone: "Phone", qpSave: "Create", qpNameReq: "Name required", qpCreated: "Patient created",
    recette: "Today's revenue", todayBtn: "Today", analysesDone: "analyses", costLabel: "Cost", marginLabel: "Margin", searchTestPh: "Search a test or analysis…",
  },
};

const ALL_EXAMS = LAB_CATALOGUE.flatMap((c: any) => c.exams.map((e: any) => ({ ...e, category: c.category })));
const examById = (id: string) => ALL_EXAMS.find((e: any) => e.id === id);

function dobFromAge(age: number): string { const d = new Date(); d.setFullYear(d.getFullYear() - age); return d.toISOString().slice(0, 10); }

export function LabPage() {
  const { user } = useAuth();
  const { lang } = useLang();
  const L = DICT[lang] || DICT.fr;
  const cid = () => localStorage.getItem("divinelink.clinicId") || undefined;
  const inClinic = (c?: string) => { const a = cid(); return !a || !c || String(c) === String(a); };
  const [patients, setPatients] = useState<Patient[]>([]);
  const [rows, setRows] = useState<LabResult[]>([]);
  const [reagents, setReagents] = useState<LabReagent[]>([]);
  const [tests, setTests] = useState<LabTest[]>([]);
  const [view, setView] = useState<"results" | "reagents" | "tests" | "benefices">("results");
  const [tab, setTab] = useState("ordered");
  const [search, setSearch] = useState("");
  const [testSearch, setTestSearch] = useState("");
  const [revDate, setRevDate] = useState(() => new Date().toISOString().slice(0, 10));

  // order dialog
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderPatient, setOrderPatient] = useState("");
  const [orderWalkIn, setOrderWalkIn] = useState(false);
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customName, setCustomName] = useState("");

  // result dialog
  const [result, setResult] = useState<LabResult | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [freeResult, setFreeResult] = useState("");
  const [used, setUsed] = useState<{ reagentId: number; name: string; qty: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [labImportOpen, setLabImportOpen] = useState(false);
  const [labImporting, setLabImporting] = useState(false);

  // test catalogue editor
  const [testEdit, setTestEdit] = useState<LabTest | "new" | null>(null);
  const [tForm, setTForm] = useState<{ name: string; analyses: string; price: string; recipe: { reagentId: number; name: string; qty: number }[] }>({ name: "", analyses: "", price: "", recipe: [] });
  const [delTest, setDelTest] = useState<LabTest | null>(null);

  // quick patient
  const [qpOpen, setQpOpen] = useState(false);
  const [qp, setQp] = useState({ name: "", age: "", sex: "" as "M" | "F" | "", phone: "" });

  const load = async () => {
    setPatients((await decryptPatients(await db.patients.toArray())).filter(p => !p.deleted && inClinic(p.clinicId)));
    setRows((await db.labResults.toArray()).filter(r => !r.deleted && inClinic(r.clinicId)).sort((a, b) => (b.orderedAt || "").localeCompare(a.orderedAt || "")));
    setReagents((await db.labReagents.toArray()).filter(r => inClinic(r.clinicId)).sort((a, b) => a.name.localeCompare(b.name)));
    setTests((await db.labTests.toArray()).filter(t => !t.deleted && inClinic(t.clinicId)).sort((a, b) => a.name.localeCompare(b.name)));
  };
  useEffect(() => { load(); }, []);

  const pName = (id: number) => { const p = patients.find(x => x.id === id); return p ? `${p.firstName} ${p.lastName}` : "—"; };
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => (tab === "all" || r.status === tab) && (!q || pName(r.patientId).toLowerCase().includes(q) || r.examName.toLowerCase().includes(q)));
  }, [rows, tab, search, patients]);
  const orderedCount = rows.filter(r => r.status === "ordered").length;
  const doneCount = rows.filter(r => r.status === "completed").length;

  // Daily lab revenue — sum of priced orders for the selected day (by order date).
  const nf = (n: number) => Math.round(n).toLocaleString("fr-FR").replace(/ | /g, " ");
  const dayStats = useMemo(() => {
    const dayRows = rows.filter(r => (r.orderedAt || r.createdAt || "").slice(0, 10) === revDate);
    return { revenue: dayRows.reduce((s, r) => s + (r.price || 0), 0), count: dayRows.length };
  }, [rows, revDate]);
  const shiftDay = (delta: number) => { const d = new Date(revDate + "T00:00:00"); d.setDate(d.getDate() + delta); setRevDate(d.toISOString().slice(0, 10)); };
  const isToday = revDate === new Date().toISOString().slice(0, 10);
  // Reagent cost of a test recipe (for margin display).
  const recipeCost = (recipe?: { reagentId: number; name: string; qty: number }[]) =>
    (recipe || []).reduce((s, u) => s + (reagents.find(r => r.id === u.reagentId)?.unitCost || 0) * u.qty, 0);
  const filteredTests = useMemo(() => {
    const q = testSearch.trim().toLowerCase();
    return tests.filter(t => !q || t.name.toLowerCase().includes(q) || (t.analyses || []).some(a => a.toLowerCase().includes(q)));
  }, [tests, testSearch]);

  const toggle = (key: string) => setSelected(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const openOrder = () => { setOrderPatient(""); setOrderWalkIn(false); setOrderDate(new Date().toISOString().slice(0, 10)); setSelected(new Set()); setCustomName(""); setOrderOpen(true); };

  // Total of the current selection (test prices; built-in exams have none).
  const orderTotal = useMemo(() => {
    let sum = 0;
    for (const k of selected) {
      if (k.startsWith("test:")) { const t = tests.find(x => String(x.id) === k.slice(5)); sum += t?.price || 0; }
    }
    return sum;
  }, [selected, tests]);

  const createOrders = async (withReceipt = false) => {
    if (!orderWalkIn && !orderPatient) { toast.error(L.needPatient); return; }
    const keys = Array.from(selected);
    if (keys.length === 0 && !customName.trim()) { toast.error(L.needTest); return; }
    setBusy(true);
    try {
      const pid = orderWalkIn ? 0 : Number(orderPatient);
      const pdisplay = orderWalkIn ? L.walkInName : pName(pid);
      const todayYmd = new Date().toISOString().slice(0, 10);
      const retro = !!orderDate && orderDate < todayYmd;
      const now = retro ? new Date(orderDate + "T12:00:00").toISOString() : new Date().toISOString();
      const c = cid();
      const created: { id: number; name: string; price: number }[] = [];
      const addOrder = async (examId: string, examName: string, category: string, price: number, recipe?: { reagentId: number; name: string; qty: number }[]) => {
        let reagentsUsed: { reagentId: number; name: string; qty: number }[] | undefined;
        let reagentsDeducted = false;
        const rec = (recipe || []).filter(x => x.reagentId && x.qty > 0);
        if (!retro && rec.length) {
          for (const u of rec) {
            const rg = reagents.find(r => r.id === u.reagentId); if (!rg) continue;
            const newStock = Math.max(0, (rg.stock || 0) - u.qty);
            await db.labReagents.update(u.reagentId, { stock: newStock, updatedAt: now });
            await db.labReagentMovements.add({ reagentId: u.reagentId, reagentName: rg.name, type: "out", quantity: u.qty, reason: `Test: ${examName} · ${pdisplay}`, patientId: pid, performedBy: user?.name, clinicId: c, createdAt: now } as any);
            await logAudit("reagent_out", user?.name || "—", { resource: "reagent", resourceId: u.reagentId, message: `${rg.name} -${u.qty} (${examName})` });
          }
          reagentsUsed = rec; reagentsDeducted = true;
        }
        const newId = await db.labResults.add({
          uid: (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
          patientId: pid, examId, examName, category, price, reagentsUsed, reagentsDeducted,
          status: "ordered", orderedBy: user?.name, orderedAt: now, clinicId: c, createdAt: now, updatedAt: now,
        } as any) as number;
        created.push({ id: newId, name: examName, price });
        await logAudit("lab_order", user?.name || "—", { resource: "lab", resourceId: examId, message: `${examName} · ${pdisplay}` });
      };
      for (const k of keys) {
        if (k.startsWith("exam:")) { const e = examById(k.slice(5)); if (e) await addOrder(e.id, e.name, e.category, 0); }
        else if (k.startsWith("test:")) { const t = tests.find(x => String(x.id) === k.slice(5)); if (t) await addOrder("test:" + t.id, t.name, t.category || "Test", t.price || 0, t.recipe); }
      }
      if (customName.trim()) await addOrder("custom", customName.trim(), "Autre", 0);

      // Bill the priced lines as one facture so it lands in the caisse.
      const billable = created.filter(x => x.price > 0);
      const total = billable.reduce((s, x) => s + x.price, 0);
      let invoiceNumber: string | undefined;
      if (total > 0) {
        invoiceNumber = String((await db.payments.count()) + 1).padStart(7, "0");
        const items = billable.map(x => ({ name: x.name, quantity: 1, unitPrice: x.price, category: "Laboratoire" }));
        await db.payments.add({
          patientId: pid, invoiceNumber, items,
          label: billable.map(x => x.name).slice(0, 3).join(", "),
          amountDue: total, amountPaid: total, balance: 0, status: "paid", method: "cash", paidAt: now,
          installments: [{ id: (globalThis.crypto?.randomUUID?.() || String(Date.now())), amount: total, method: "cash", paidAt: now, receivedBy: user?.name }],
          clinicId: c, createdAt: now, updatedAt: now,
        } as any);
        for (const x of billable) await db.labResults.update(x.id, { invoiceNumber });
        await logAudit("invoice_create", user?.name || "—", { resource: "invoice", resourceId: invoiceNumber, message: `Labo ${total} F · ${pdisplay}` });
      }

      if (withReceipt && total > 0) {
        const p = patients.find(x => x.id === pid);
        const items: ReceiptLineItem[] = billable.map(x => ({ description: x.name, quantity: 1, unitPrice: x.price }));
        generateThermalReceipt({ receiptNumber: invoiceNumber || "LAB", date: new Date().toLocaleString("fr-FR"), patientName: p ? `${p.firstName} ${p.lastName}`.trim() : pdisplay, patientId: p?.patientId, cashier: user?.name, items, paymentMethod: "cash", status: "paid", amountPaid: total, amountDue: total });
      }
      toast.success(L.created);
      setOrderOpen(false); setOrderPatient(""); setSelected(new Set()); setCustomName(""); await load();
    } finally { setBusy(false); }
  };

  // Reprint a receipt for an already-created lab order (uses its stored price).
  const reprint = (r: LabResult) => {
    const price = r.price || 0;
    if (price <= 0) { toast.error(lang === "en" ? "No price on this order." : "Aucun prix sur cette analyse."); return; }
    const p = patients.find(x => x.id === r.patientId);
    const items: ReceiptLineItem[] = [{ description: r.examName, quantity: 1, unitPrice: price }];
    generateThermalReceipt({ receiptNumber: r.invoiceNumber || "LAB", date: new Date(r.orderedAt || r.createdAt).toLocaleString("fr-FR"), patientName: p ? `${p.firstName} ${p.lastName}`.trim() : pName(r.patientId), patientId: p?.patientId, cashier: r.orderedBy || user?.name, items, paymentMethod: "cash", status: "paid", amountPaid: price, amountDue: price });
  };

  const openResult = (r: LabResult) => { setResult(r); setValues(r.values || {}); setNotes(r.notes || ""); setFreeResult(r.freeResult || ""); setUsed(r.reagentsUsed || []); };
  const saveResult = async () => {
    if (!result) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const alreadyCompleted = result.status === "completed";
      const cleanUsed = used.filter(u => u.reagentId && u.qty > 0);
      // If reagents were already deducted at order time, don't deduct again — just persist.
      const deductNow = !alreadyCompleted && !result.reagentsDeducted;
      await db.labResults.update(result.id!, { values, notes, freeResult, reagentsUsed: cleanUsed, reagentsDeducted: result.reagentsDeducted || (deductNow && cleanUsed.length > 0), status: "completed", resultBy: user?.name, resultAt: now, updatedAt: now });
      await logAudit("lab_result", user?.name || "—", { resource: "lab", resourceId: result.id, message: `${result.examName} · ${pName(result.patientId)}` });
      if (deductNow) {
        for (const u of cleanUsed) {
          const rg = reagents.find(r => r.id === u.reagentId); if (!rg) continue;
          const newStock = Math.max(0, (rg.stock || 0) - u.qty);
          await db.labReagents.update(u.reagentId, { stock: newStock, updatedAt: now });
          await db.labReagentMovements.add({ reagentId: u.reagentId, reagentName: rg.name, type: "out", quantity: u.qty, reason: `Analyse: ${result.examName} · ${pName(result.patientId)}`, performedBy: user?.name, clinicId: cid(), createdAt: now } as any);
          await logAudit("reagent_out", user?.name || "—", { resource: "reagent", resourceId: u.reagentId, message: `${rg.name} -${u.qty} (${result.examName})` });
        }
      }
      toast.success(L.saved);
      setResult(null); setUsed([]); setFreeResult(""); await load();
    } finally { setBusy(false); }
  };

  // Delete an order — if its reagents were deducted at order time, RESTORE them to stock.
  const remove = async (r: LabResult) => {
    const now = new Date().toISOString();
    if (r.reagentsDeducted && r.reagentsUsed?.length) {
      for (const u of r.reagentsUsed) {
        const rg = (await db.labReagents.toArray()).find(x => x.id === u.reagentId); if (!rg) continue;
        await db.labReagents.update(u.reagentId, { stock: (rg.stock || 0) + u.qty, updatedAt: now });
        await db.labReagentMovements.add({ reagentId: u.reagentId, reagentName: rg.name, type: "in", quantity: u.qty, reason: `Annulation test: ${r.examName}`, performedBy: user?.name, clinicId: cid(), createdAt: now } as any);
        await logAudit("reagent_in", user?.name || "—", { resource: "reagent", resourceId: u.reagentId, message: `${rg.name} +${u.qty} (annulation ${r.examName})` });
      }
    }
    await db.labResults.update(r.id!, { deleted: true, reagentsDeducted: false, updatedAt: now });
    await logAudit("lab_delete", user?.name || "—", { resource: "lab", resourceId: r.id, message: `${r.examName} · ${pName(r.patientId)}` });
    await load();
  };

  // ── Test catalogue ──
  const openTestEditor = (t?: LabTest) => {
    if (t) setTForm({ name: t.name, analyses: (t.analyses || []).join("\n"), price: t.price ? String(t.price) : "", recipe: t.recipe || [] });
    else setTForm({ name: "", analyses: "", price: "", recipe: [] });
    setTestEdit(t || "new");
  };
  const saveTest = async () => {
    if (!tForm.name.trim()) { toast.error(L.qpNameReq); return; }
    const now = new Date().toISOString();
    const data = {
      name: tForm.name.trim(),
      analyses: tForm.analyses.split("\n").map(s => s.trim()).filter(Boolean),
      price: parseFloat(tForm.price) || 0,
      recipe: tForm.recipe.filter(x => x.reagentId && x.qty > 0),
      updatedAt: now,
    };
    if (testEdit && testEdit !== "new" && testEdit.id) { await db.labTests.update(testEdit.id, data); await logAudit("lab_order", user?.name || "—", { resource: "lab_test", resourceId: testEdit.id, message: `Test modifié: ${data.name}` }); }
    else { const id = await db.labTests.add({ ...data, uid: (globalThis.crypto?.randomUUID?.() || String(Date.now())), clinicId: cid(), createdAt: now } as any); await logAudit("lab_order", user?.name || "—", { resource: "lab_test", resourceId: id as any, message: `Test créé: ${data.name}` }); }
    setTestEdit(null); await load(); toast.success(L.testSaved);
  };
  const removeTest = async () => { if (delTest?.id) { await db.labTests.update(delTest.id, { deleted: true, updatedAt: new Date().toISOString() }); setDelTest(null); await load(); } };

  // ── Quick patient ──
  const saveQuickPatient = async () => {
    if (!qp.name.trim()) { toast.error(L.qpNameReq); return; }
    const parts = qp.name.trim().split(/\s+/);
    const ageNum = qp.age ? parseInt(qp.age) : undefined;
    const now = new Date().toISOString();
    const payload = await encryptPatientForSave({ firstName: parts[0], lastName: parts.slice(1).join(" ") || "", phone: qp.phone.trim(), dob: ageNum !== undefined ? dobFromAge(ageNum) : "", address: "", medicalAlerts: "", ageYears: ageNum });
    const patientId = await generatePatientId();
    const uid = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const newId = await db.patients.add({ ...(payload as any), uid, deleted: false, patientId, anonCode: generateAnonCode(), clinicId: cid(), sex: qp.sex || undefined, registeredBy: user?.name || "—", registeredById: user?.id, registeredAt: now, visitType: "new_consultation", reasonForVisit: lang === "en" ? "Lab" : "Laboratoire", createdAt: now, updatedAt: now }) as number;
    await logAudit("patient_create", user?.name || "—", { resource: "patient", resourceId: patientId, message: `${qp.name.trim()} (labo)` });
    await load();
    setOrderPatient(String(newId));
    setQpOpen(false); setQp({ name: "", age: "", sex: "", phone: "" });
    toast.success(L.qpCreated);
  };

  const statusBadge = (s: string) => s === "completed"
    ? <Badge className="bg-green-100 text-green-700 border-green-300">{L.doneBadge}</Badge>
    : <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300">{L.pendingBadge}</Badge>;

  const resultExam = result ? examById(result.examId) : null;
  const abnormal = (f: any, v: string) => {
    if (f.isSelect || f.isText || !v || (f.min === 0 && f.max === 0)) return false;
    const n = parseFloat(v); return !isNaN(n) && (n < f.min || n > f.max);
  };

  const doLabImport = async () => {
    setLabImporting(true);
    try {
      const c = cid();
      const now = new Date().toISOString();
      const norm = (s: string) => s.trim().toLowerCase();
      // Exams → test catalogue
      const haveTests = new Set((await db.labTests.toArray()).filter(t => !t.deleted && inClinic(t.clinicId)).map(t => norm(t.name)));
      let tAdded = 0, tSkip = 0;
      for (const e of ((clinicLabDH as any).exams as any[])) {
        if (haveTests.has(norm(e.name))) { tSkip++; continue; }
        await db.labTests.add({ uid: (globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random()), name: e.name, category: e.category, analyses: [], recipe: [], price: e.price || 0, clinicId: c, createdAt: now } as any);
        haveTests.add(norm(e.name)); tAdded++;
      }
      // Reagents → réactif stock
      const haveReag = new Set((await db.labReagents.toArray()).filter(r => inClinic(r.clinicId)).map(r => norm(r.name)));
      let rAdded = 0, rSkip = 0;
      for (const rg of ((clinicLabDH as any).reagents as any[])) {
        if (haveReag.has(norm(rg.name))) { rSkip++; continue; }
        await db.labReagents.add({ name: rg.name, unit: "test", stock: rg.stock || 0, minStock: 0, unitCost: rg.unitCost || 0, expiration: rg.expiration || undefined, clinicId: c, createdAt: now, updatedAt: now } as any);
        haveReag.add(norm(rg.name)); rAdded++;
      }
      await logAudit("lab_order", user?.name || "—", { resource: "lab", message: `Import labo: ${tAdded} examens, ${rAdded} réactifs` });
      toast.success(`${tAdded} examen(s) + ${rAdded} réactif(s) importés` + ((tSkip + rSkip) ? ` · ${tSkip + rSkip} déjà présents` : ""));
      setLabImportOpen(false); await load();
    } catch (e: any) { toast.error("Import: " + (e?.message || "échec")); }
    finally { setLabImporting(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-bold flex items-center gap-2"><FlaskConical className="w-5 h-5" /> {L.title}</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setLabImportOpen(true)} className="gap-1"><Download className="w-4 h-4" /> {L.importDH}</Button>
          {view === "results" && <Button size="sm" onClick={openOrder} className="gap-1"><Plus className="w-4 h-4" /> {L.newOrder}</Button>}
          {view === "tests" && <Button size="sm" onClick={() => openTestEditor()} className="gap-1"><Plus className="w-4 h-4" /> {L.newTest}</Button>}
        </div>
      </div>

      <Dialog open={labImportOpen} onOpenChange={setLabImportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{L.importDH}</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <p>{(clinicLabDH as any).clinic}</p>
            <p className="text-muted-foreground">{((clinicLabDH as any).exams as any[]).length} examens · {((clinicLabDH as any).reagents as any[]).length} réactifs. {L.importNote}</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setLabImportOpen(false)} disabled={labImporting}>{L.cancel}</Button>
            <Button onClick={doLabImport} disabled={labImporting} className="gap-1"><Download className="w-4 h-4" /> {L.importDH}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant={view === "results" ? "default" : "outline"} className="gap-1" onClick={() => setView("results")}><FlaskConical className="w-4 h-4" /> {L.analyses}</Button>
        <Button size="sm" variant={view === "tests" ? "default" : "outline"} className="gap-1" onClick={() => setView("tests")}><ClipboardList className="w-4 h-4" /> {L.tests}</Button>
        <Button size="sm" variant={view === "reagents" ? "default" : "outline"} className="gap-1" onClick={() => setView("reagents")}><FlaskRound className="w-4 h-4" /> {L.reagents}</Button>
        <Button size="sm" variant={view === "benefices" ? "default" : "outline"} className="gap-1" onClick={() => setView("benefices")}><TrendingUp className="w-4 h-4" /> {L.benefices}</Button>
      </div>

      {view === "reagents" && <LabReagents />}
      {view === "benefices" && <ProfitReport />}

      {/* TESTS CATALOGUE */}
      {view === "tests" && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder={L.searchTestPh} value={testSearch} onChange={e => setTestSearch(e.target.value)} />
          </div>
          {filteredTests.length === 0 && <p className="text-sm text-muted-foreground">{L.noTests}</p>}
          {filteredTests.map(t => {
            const cost = recipeCost(t.recipe);
            const margin = (t.price || 0) - cost;
            return (
            <Card key={t.id}><CardContent className="p-3 flex items-start gap-3">
              <ClipboardList className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-medium">{t.name}{t.price ? <span className="ml-2 text-xs text-primary font-semibold">{t.price.toLocaleString()} F</span> : null}</p>
                {t.analyses?.length ? <p className="text-xs text-muted-foreground">{t.analyses.join(", ")}</p> : null}
                {t.recipe?.length ? <p className="text-[11px] text-muted-foreground mt-0.5">🧪 {t.recipe.map(r => `${r.name} ×${r.qty}`).join(" · ")}</p> : null}
                {(t.price || cost) ? <p className="text-[11px] mt-0.5"><span className="text-muted-foreground">{L.costLabel}: {nf(cost)} F · {L.marginLabel}: </span><span className={margin >= 0 ? "text-green-600 font-medium" : "text-destructive font-medium"}>{nf(margin)} F</span></p> : null}
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openTestEditor(t)}><Pencil className="w-3.5 h-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDelTest(t)}><Trash2 className="w-3.5 h-3.5" /></Button>
            </CardContent></Card>
          );})}
        </div>
      )}

      {view === "results" && (<>
      <Card className="bg-primary/5 border-primary/30">
        <CardContent className="p-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">{L.recette}</p>
            <p className="text-2xl font-bold text-primary">{nf(dayStats.revenue)} <span className="text-sm font-normal">FCFA</span></p>
            <p className="text-[11px] text-muted-foreground">{dayStats.count} {L.analysesDone} · {new Date(revDate + "T00:00:00").toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR")}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => shiftDay(-1)}>‹</Button>
            {!isToday && <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setRevDate(new Date().toISOString().slice(0, 10))}>{L.todayBtn}</Button>}
            <Button size="icon" variant="outline" className="h-8 w-8" disabled={isToday} onClick={() => shiftDay(1)}>›</Button>
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{L.pending}</p><p className="text-2xl font-bold text-yellow-600">{orderedCount}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{L.done}</p><p className="text-2xl font-bold text-green-600">{doneCount}</p></CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="ordered">{L.pending}</TabsTrigger>
          <TabsTrigger value="completed">{L.done}</TabsTrigger>
          <TabsTrigger value="all">{L.all}</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder={L.searchPh} value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-sm text-muted-foreground">{L.none}</p>}
        {filtered.map(r => (
          <Card key={r.id}><CardContent className="p-3 flex items-center gap-3">
            <FlaskConical className="w-4 h-4 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{r.examName}{r.price ? <span className="ml-2 text-xs text-primary font-semibold">{r.price.toLocaleString()} F</span> : null}</p>
              <p className="text-xs text-muted-foreground">{pName(r.patientId)} · {new Date(r.orderedAt).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR")}</p>
            </div>
            {statusBadge(r.status)}
            {r.status === "ordered"
              ? <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => openResult(r)}><FileText className="w-3.5 h-3.5" /> {L.enter}</Button>
              : <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => openResult(r)}>{L.view}</Button>}
            {(r.price || 0) > 0 && <Button size="icon" variant="ghost" className="h-8 w-8" title={L.reprint} onClick={() => reprint(r)}><Printer className="w-3.5 h-3.5" /></Button>}
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(r)}><Trash2 className="w-3.5 h-3.5" /></Button>
          </CardContent></Card>
        ))}
      </div>
      </>)}

      {/* New order — multi-select */}
      <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{L.newOrderTitle}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm">{L.patient}</label>
                <Button type="button" size="sm" variant={orderWalkIn ? "default" : "outline"} className="h-7 text-xs" onClick={() => setOrderWalkIn(v => !v)}>{L.walkIn}</Button>
              </div>
              {orderWalkIn ? (
                <div className="mt-1 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm font-medium text-primary">{L.walkInName}</div>
              ) : (
                <div className="flex gap-2 mt-1">
                  <Select value={orderPatient} onValueChange={setOrderPatient}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder={L.choose} /></SelectTrigger>
                    <SelectContent>{patients.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.firstName} {p.lastName}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button type="button" variant="outline" className="gap-1 whitespace-nowrap" onClick={() => { setQp({ name: "", age: "", sex: "", phone: "" }); setQpOpen(true); }}><UserPlus className="w-4 h-4" /> {L.quickNew}</Button>
                </div>
              )}
            </div>

            <div>
              <label className="text-sm">{L.orderDate}</label>
              <Input type="date" value={orderDate} max={new Date().toISOString().slice(0, 10)} onChange={e => setOrderDate(e.target.value)} />
              {orderDate < new Date().toISOString().slice(0, 10) && <p className="text-[11px] text-amber-600 mt-0.5">⏱ {L.retroNote}</p>}
            </div>

            <div>
              <label className="text-sm">{L.selectTests}</label>
              <div className="border rounded-md max-h-64 overflow-y-auto p-1 mt-1">
                {tests.length > 0 && (
                  <div className="mb-1">
                    <p className="px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">{L.tests}</p>
                    {tests.map(t => {
                      const key = "test:" + t.id;
                      return (
                        <button key={key} type="button" onClick={() => toggle(key)} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm ${selected.has(key) ? "bg-primary/10" : "hover:bg-accent"}`}>
                          <span className={`w-4 h-4 rounded border flex items-center justify-center ${selected.has(key) ? "bg-primary border-primary text-primary-foreground" : ""}`}>{selected.has(key) && <Check className="w-3 h-3" />}</span>
                          <span className="flex-1">{t.name}{t.recipe?.length ? <span className="text-[10px] text-muted-foreground"> · 🧪{t.recipe.length}</span> : null}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {LAB_CATALOGUE.map((c: any) => (
                  <div key={c.category}>
                    <p className="px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">{c.category}</p>
                    {c.exams.map((e: any) => {
                      const key = "exam:" + e.id;
                      return (
                        <button key={key} type="button" onClick={() => toggle(key)} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm ${selected.has(key) ? "bg-primary/10" : "hover:bg-accent"}`}>
                          <span className={`w-4 h-4 rounded border flex items-center justify-center ${selected.has(key) ? "bg-primary border-primary text-primary-foreground" : ""}`}>{selected.has(key) && <Check className="w-3 h-3" />}</span>
                          <span className="flex-1">{e.name}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div><label className="text-sm">{L.customName}</label><Input value={customName} onChange={e => setCustomName(e.target.value)} placeholder={L.customName} /></div>
            {orderTotal > 0 && (
              <div className="rounded-lg border p-2 flex justify-between items-center bg-muted/30 text-sm">
                <span>{L.total}</span><span className="font-bold">{orderTotal.toLocaleString()} FCFA</span>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOrderOpen(false)}>{L.cancel}</Button>
            <Button variant="secondary" onClick={() => createOrders(false)} disabled={busy}>{L.create} ({selected.size + (customName.trim() ? 1 : 0)})</Button>
            <Button onClick={() => createOrders(true)} disabled={busy} className="gap-1"><Printer className="w-4 h-4" /> {L.createReceipt}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick patient */}
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

      {/* Test editor */}
      <Dialog open={!!testEdit} onOpenChange={v => { if (!v) setTestEdit(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{testEdit && testEdit !== "new" ? L.editTest : L.newTest}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-sm">{L.testName} *</label><Input value={tForm.name} onChange={e => setTForm(f => ({ ...f, name: e.target.value }))} placeholder="Bilan hépatique…" /></div>
            <div><label className="text-sm">{L.analysesLabel}</label><Textarea rows={4} value={tForm.analyses} onChange={e => setTForm(f => ({ ...f, analyses: e.target.value }))} placeholder={"ASAT\nALAT\nGGT\nBilirubine"} /></div>
            <div><label className="text-sm">{L.priceLabel}</label><Input type="number" min={0} value={tForm.price} onChange={e => setTForm(f => ({ ...f, price: e.target.value }))} placeholder="0" /></div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">{L.recipeLabel}</label>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={reagents.length === 0} onClick={() => setTForm(f => ({ ...f, recipe: [...f.recipe, { reagentId: 0, name: "", qty: 1 }] }))}>+ {L.addReagent}</Button>
              </div>
              <p className="text-[11px] text-muted-foreground">{L.recipeHint}</p>
              {reagents.length === 0 && <p className="text-xs text-muted-foreground mt-1">{L.noReagents}</p>}
              {tForm.recipe.map((u, i) => (
                <div key={i} className="flex items-center gap-2 mt-1.5">
                  <Select value={u.reagentId ? String(u.reagentId) : ""} onValueChange={v => { const rg = reagents.find(r => r.id === Number(v)); setTForm(f => ({ ...f, recipe: f.recipe.map((x, idx) => idx === i ? { reagentId: Number(v), name: rg?.name || "", qty: x.qty } : x) })); }}>
                    <SelectTrigger className="flex-1 h-8"><SelectValue placeholder={L.pickReagent} /></SelectTrigger>
                    <SelectContent>{reagents.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.name} ({r.stock} {r.unit})</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="number" min={1} className="w-16 h-8" value={u.qty} onChange={e => setTForm(f => ({ ...f, recipe: f.recipe.map((x, idx) => idx === i ? { ...x, qty: parseInt(e.target.value) || 1 } : x) }))} title={L.qty} />
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setTForm(f => ({ ...f, recipe: f.recipe.filter((_, idx) => idx !== i) }))}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setTestEdit(null)}>{L.cancel}</Button><Button onClick={saveTest}>{lang === "en" ? "Save" : "Enregistrer"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete test */}
      <Dialog open={!!delTest} onOpenChange={v => { if (!v) setDelTest(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{L.deleteTest}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{delTest?.name}</p>
          <DialogFooter><Button variant="outline" onClick={() => setDelTest(null)}>{L.cancel}</Button><Button variant="destructive" onClick={removeTest}>{lang === "en" ? "Delete" : "Supprimer"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enter / view result */}
      <Dialog open={!!result} onOpenChange={v => { if (!v) setResult(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{result?.examName}</DialogTitle></DialogHeader>
          {result && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{pName(result.patientId)}</p>
              {resultExam ? resultExam.fields.map((f: any) => {
                const v = values[f.key] || "";
                const bad = abnormal(f, v);
                return (
                  <div key={f.key} className="flex items-center gap-2">
                    <label className="text-sm flex-1">{f.label}{f.unit ? ` (${f.unit})` : ""}{!f.isSelect && !f.isText && (f.min || f.max) ? <span className="text-[10px] text-muted-foreground ml-1">[{f.min}–{f.max}]</span> : null}</label>
                    {f.isSelect ? (
                      <Select value={v} onValueChange={val => setValues(s => ({ ...s, [f.key]: val }))}>
                        <SelectTrigger className="w-44"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{f.options.map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <Input className={`w-44 ${bad ? "border-red-500 text-red-600 font-semibold" : ""}`} value={v} onChange={e => setValues(s => ({ ...s, [f.key]: e.target.value }))} />
                    )}
                  </div>
                );
              }) : (
                <Textarea rows={4} placeholder={L.freeResultPh} value={freeResult} onChange={e => setFreeResult(e.target.value)} />
              )}
              <Textarea placeholder={L.notes} value={notes} onChange={e => setNotes(e.target.value)} />

              {/* Reagents — if already deducted at order, show read-only note; else manual */}
              <div className="border-t pt-2 mt-1">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">{L.reagentsUsed}</label>
                  {!result.reagentsDeducted && <Button size="sm" variant="outline" className="h-7 text-xs" disabled={reagents.length === 0 || result.status === "completed"} onClick={() => setUsed(u => [...u, { reagentId: 0, name: "", qty: 1 }])}>+ {L.addReagent}</Button>}
                </div>
                {result.reagentsDeducted ? (
                  <p className="text-xs text-muted-foreground mt-1">{L.deductedAtOrder} {used.map(u => `${u.name} ×${u.qty}`).join(" · ")}</p>
                ) : (<>
                  {reagents.length === 0 && <p className="text-xs text-muted-foreground mt-1">{L.noReagents}</p>}
                  {used.map((u, i) => (
                    <div key={i} className="flex items-center gap-2 mt-1.5">
                      <Select value={u.reagentId ? String(u.reagentId) : ""} onValueChange={v => { const rg = reagents.find(r => r.id === Number(v)); setUsed(arr => arr.map((x, idx) => idx === i ? { reagentId: Number(v), name: rg?.name || "", qty: x.qty } : x)); }}>
                        <SelectTrigger className="flex-1 h-8"><SelectValue placeholder={L.pickReagent} /></SelectTrigger>
                        <SelectContent>{reagents.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.name} ({r.stock} {r.unit})</SelectItem>)}</SelectContent>
                      </Select>
                      <Input type="number" min={1} className="w-16 h-8" value={u.qty} onChange={e => setUsed(arr => arr.map((x, idx) => idx === i ? { ...x, qty: parseInt(e.target.value) || 1 } : x))} title={L.qty} />
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setUsed(arr => arr.filter((_, idx) => idx !== i))}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  ))}
                  {result.status === "completed" && used.length > 0 && <p className="text-[10px] text-muted-foreground mt-1">{L.deductedAtOrder}</p>}
                </>)}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResult(null)}>{L.close}</Button>
            <Button onClick={saveResult} disabled={busy}>{result?.status === "completed" ? L.update : L.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
