import { getClinicSettings } from "@/lib/clinicSettings";
import { DOH_LOGO, DOH_HEADER } from "@/lib/dohHeader";

export interface ReceiptLineItem {
  description: string;
  tooth?: string;
  lot?: string;
  quantity: number;
  unitPrice: number;
}

export interface ReceiptData {
  receiptNumber: string;
  date: string;
  patientName: string;
  patientDob?: string;
  patientId?: string;
  items: ReceiptLineItem[];
  discount?: number;
  discountType?: "amount" | "percent";
  paymentMethod: string;
  status: "paid" | "partial" | "unpaid";
  amountPaid?: number;
  amountDue?: number;
  notes?: string;
  isProforma?: boolean;
  cashier?: string;
  /** Insurance split (tiers payant), shown when the insurer covers part. */
  insurerName?: string;
  coverageRate?: number;
  insuranceCovered?: number;
  /** Extra patient identity for the full A4 facture. */
  patientAge?: string | number;
  patientSex?: string;
  patientPhone?: string;
}

/** Montant en toutes lettres (français) — up to a few millions. */
export function montantEnLettres(n: number): string {
  n = Math.round(n);
  if (n === 0) return "zéro";
  const u = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
  const d = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"];
  const b100 = (x: number): string => {
    if (x < 20) return u[x];
    const t = Math.floor(x / 10), r = x % 10;
    if (t === 7 || t === 9) return d[t] + (r + 10 === 10 ? "-dix" : "-" + u[r + 10]);
    let s = t === 8 && r === 0 ? "quatre-vingts" : d[t];
    if (r === 1 && t >= 2 && t <= 6) s += "-et-un";
    else if (r > 0) s += "-" + u[r];
    return s;
  };
  const b1000 = (x: number): string => {
    const h = Math.floor(x / 100), r = x % 100;
    let s = "";
    if (h > 0) s += (h > 1 ? u[h] + " " : "") + "cent" + (h > 1 && r === 0 ? "s" : "");
    if (r > 0) s += (s ? " " : "") + b100(r);
    return s;
  };
  const parts: string[] = [];
  const mil = Math.floor(n / 1000000); n %= 1000000;
  const k = Math.floor(n / 1000); const rest = n % 1000;
  if (mil > 0) parts.push((mil > 1 ? b1000(mil) + " " : "un ") + (mil > 1 ? "millions" : "million"));
  if (k > 0) parts.push((k > 1 ? b1000(k) + " " : "") + "mille");
  if (rest > 0) parts.push(b1000(rest));
  return parts.join(" ").trim();
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Especes / Cash",
  mtn_momo: "MTN Mobile Money",
  orange_money: "Orange Money",
  insurance: "Assurance / Insurance",
  other: "Autre / Other",
};

export function generateReceipt(data: ReceiptData) {
  import("jspdf").then(({ jsPDF }) => {
    const clinic = getClinicSettings();
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
    const W = 148;
    const mg = 12;
    let y = 14;
    const TEAL: [number,number,number] = [13,148,136];
    const DARK: [number,number,number] = [15,23,42];
    const GREY: [number,number,number] = [100,116,139];
    const RED: [number,number,number] = [220,38,38];
    const GREEN: [number,number,number] = [22,163,74];

    // ── HEADER ──────────────────────────────────────────────
    doc.setFillColor(...TEAL);
    doc.rect(0, 0, W, 28, "F");
    doc.setTextColor(255,255,255);
    doc.setFontSize(13);
    doc.setFont("helvetica","bold");
    doc.text(clinic?.name || "Cabinet Medical", W/2, 9, {align:"center"});
    doc.setFontSize(7.5);
    doc.setFont("helvetica","normal");
    if (clinic?.address) doc.text(clinic.address + (clinic.city ? ", " + clinic.city : ""), W/2, 14, {align:"center"});
    if (clinic?.phone) doc.text("Tel: " + clinic.phone, W/2, 18, {align:"center"});
    if (clinic?.licenseNumber) doc.text("N° Agrément: " + clinic.licenseNumber, W/2, 22, {align:"center"});
    y = 32;

    // ── DOCUMENT TITLE ───────────────────────────────────────
    const title = data.isProforma ? "FACTURE PROFORMA" : data.status === "paid" ? "RECU DE PAIEMENT" : "FACTURE";
    doc.setFillColor(240,253,250);
    doc.rect(mg, y, W-mg*2, 10, "F");
    doc.setDrawColor(...TEAL);
    doc.rect(mg, y, W-mg*2, 10, "S");
    doc.setTextColor(...TEAL);
    doc.setFontSize(12);
    doc.setFont("helvetica","bold");
    doc.text(title, W/2, y+7, {align:"center"});
    y += 14;

    // ── RECEIPT INFO ─────────────────────────────────────────
    doc.setFontSize(8);
    doc.setTextColor(...DARK);
    doc.setFont("helvetica","normal");
    
    // Two-column info block
    const col1x = mg;
    const col2x = W/2 + 2;
    
    doc.setFont("helvetica","bold");
    doc.text("N° Document:", col1x, y);
    doc.setFont("helvetica","normal");
    doc.text(data.receiptNumber, col1x + 28, y);
    
    doc.setFont("helvetica","bold");
    doc.text("Date:", col2x, y);
    doc.setFont("helvetica","normal");
    doc.text(data.date, col2x + 12, y);
    y += 5;

    doc.setFont("helvetica","bold");
    doc.text("Patient:", col1x, y);
    doc.setFont("helvetica","normal");
    doc.text(data.patientName, col1x + 28, y);

    if (data.patientDob) {
      doc.setFont("helvetica","bold");
      doc.text("DDN:", col2x, y);
      doc.setFont("helvetica","normal");
      doc.text(data.patientDob, col2x + 12, y);
    }
    y += 5;

    if (data.patientId) {
      doc.setFont("helvetica","bold");
      doc.text("ID Patient:", col1x, y);
      doc.setFont("helvetica","normal");
      doc.text(data.patientId, col1x + 28, y);
      y += 5;
    }

    doc.setFont("helvetica","bold");
    doc.text("Mode paiement:", col1x, y);
    doc.setFont("helvetica","normal");
    doc.text(METHOD_LABELS[data.paymentMethod] || data.paymentMethod, col1x + 35, y);
    y += 8;

    // ── DIVIDER ──────────────────────────────────────────────
    doc.setDrawColor(...TEAL);
    doc.setLineWidth(0.5);
    doc.line(mg, y, W-mg, y);
    y += 4;

    // ── LINE ITEMS TABLE ─────────────────────────────────────
    // Header
    doc.setFillColor(...TEAL);
    doc.rect(mg, y, W-mg*2, 7, "F");
    doc.setTextColor(255,255,255);
    doc.setFontSize(7.5);
    doc.setFont("helvetica","bold");
    doc.text("Designation", mg+2, y+5);
    doc.text("Dent", mg+62, y+5, {align:"center"});
    doc.text("Qte", mg+78, y+5, {align:"center"});
    doc.text("P.U (FCFA)", mg+95, y+5, {align:"center"});
    doc.text("Total (FCFA)", W-mg-2, y+5, {align:"right"});
    y += 7;

    // Rows
    let subtotal = 0;
    data.items.forEach((item, i) => {
      const total = item.quantity * item.unitPrice;
      subtotal += total;
      const rowH = item.lot ? 11 : 7;
      if (i % 2 === 0) {
        doc.setFillColor(248,250,252);
        doc.rect(mg, y, W-mg*2, rowH, "F");
      }
      doc.setTextColor(...DARK);
      doc.setFont("helvetica","normal");
      doc.setFontSize(7.5);

      // Truncate long descriptions
      const desc = item.description.length > 30 ? item.description.substring(0,28)+"..." : item.description;
      doc.text(desc, mg+2, y+5);
      doc.text(item.tooth || "-", mg+62, y+5, {align:"center"});
      doc.text(String(item.quantity), mg+78, y+5, {align:"center"});
      doc.text(item.unitPrice.toLocaleString(), mg+95, y+5, {align:"center"});
      doc.setFont("helvetica","bold");
      doc.text(total.toLocaleString(), W-mg-2, y+5, {align:"right"});
      // LOT number line under the designation (matches local clinic receipts)
      if (item.lot) {
        doc.setFont("helvetica","normal");
        doc.setFontSize(6.5);
        doc.setTextColor(...GREY);
        doc.text("N: " + item.lot, mg+4, y+9);
        doc.setTextColor(...DARK);
        doc.setFontSize(7.5);
      }
      y += rowH;
    });
    y += 2;

    // ── TOTALS ───────────────────────────────────────────────
    doc.setDrawColor(...GREY);
    doc.setLineWidth(0.3);
    doc.line(mg, y, W-mg, y);
    y += 4;

    const totalsX = W - mg - 50;
    const valX = W - mg - 2;

    // Subtotal
    doc.setFontSize(8);
    doc.setFont("helvetica","normal");
    doc.setTextColor(...DARK);
    doc.text("Sous-total:", totalsX, y);
    doc.setFont("helvetica","bold");
    doc.text(subtotal.toLocaleString() + " FCFA", valX, y, {align:"right"});
    y += 5;

    // Discount
    let discountAmount = 0;
    if (data.discount && data.discount > 0) {
      discountAmount = data.discountType === "percent" ? Math.round(subtotal * data.discount / 100) : data.discount;
      doc.setFont("helvetica","normal");
      doc.setTextColor(...DARK);
      doc.text("Remise" + (data.discountType === "percent" ? " (" + data.discount + "%)" : "") + ":", totalsX, y);
      doc.setFont("helvetica","bold");
      doc.setTextColor(...RED);
      doc.text("-" + discountAmount.toLocaleString() + " FCFA", valX, y, {align:"right"});
      y += 5;
    }

    // Total
    const totalDue = subtotal - discountAmount;
    doc.setFillColor(...TEAL);
    doc.rect(totalsX-4, y-3, W-mg-(totalsX-4), 9, "F");
    doc.setTextColor(255,255,255);
    doc.setFont("helvetica","bold");
    doc.setFontSize(9);
    doc.text("TOTAL DU:", totalsX, y+4);
    doc.text(totalDue.toLocaleString() + " FCFA", valX, y+4, {align:"right"});
    y += 12;

    // Amount paid / balance
    if (data.amountPaid !== undefined && data.amountPaid !== null) {
      doc.setFontSize(8);
      doc.setFont("helvetica","normal");
      doc.setTextColor(...DARK);
      doc.text("Montant regle:", totalsX, y);
      doc.setFont("helvetica","bold");
      doc.setTextColor(...GREEN);
      doc.text(data.amountPaid.toLocaleString() + " FCFA", valX, y, {align:"right"});
      y += 5;

      const balance = totalDue - data.amountPaid;
      if (balance > 0) {
        doc.setFont("helvetica","normal");
        doc.setTextColor(...DARK);
        doc.text("Reste a payer:", totalsX, y);
        doc.setFont("helvetica","bold");
        doc.setTextColor(...RED);
        doc.text(balance.toLocaleString() + " FCFA", valX, y, {align:"right"});
        y += 5;
      }
    }
    y += 3;

    // ── STATUS BADGE ─────────────────────────────────────────
    const statusColors: Record<string,[number,number,number]> = {
      paid: GREEN, partial: [234,179,8], unpaid: RED
    };
    const statusLabels: Record<string,string> = {
      paid: "PAYE / PAID", partial: "PAIEMENT PARTIEL", unpaid: "IMPAYE / UNPAID"
    };
    const sc = statusColors[data.status] || GREY;
    doc.setFillColor(...sc);
    doc.roundedRect(mg, y, 40, 8, 2, 2, "F");
    doc.setTextColor(255,255,255);
    doc.setFontSize(7);
    doc.setFont("helvetica","bold");
    doc.text(statusLabels[data.status] || data.status.toUpperCase(), mg+20, y+5.5, {align:"center"});
    y += 12;

    // ── NOTES ────────────────────────────────────────────────
    if (data.notes) {
      doc.setFontSize(7.5);
      doc.setFont("helvetica","normal");
      doc.setTextColor(...GREY);
      doc.text("Note: " + data.notes, mg, y);
      y += 6;
    }

    // ── SIGNATURES ───────────────────────────────────────────
    y = Math.max(y, 175);
    doc.setDrawColor(...GREY);
    doc.setLineWidth(0.3);
    doc.line(mg, y, mg+45, y);
    doc.line(W-mg-45, y, W-mg, y);
    doc.setTextColor(...GREY);
    doc.setFontSize(7);
    doc.text("Signature du Responsable", mg+22, y+4, {align:"center"});
    doc.text("Signature du Patient", W-mg-22, y+4, {align:"center"});
    y += 10;

    // ── FOOTER ───────────────────────────────────────────────
    doc.setFillColor(...TEAL);
    doc.rect(0, 205, W, 8, "F");
    doc.setTextColor(255,255,255);
    doc.setFontSize(6.5);
    doc.text("Genere par DivineLink  |  " + (clinic?.name || "Cabinet Medical") + "  |  " + data.date, W/2, 210, {align:"center"});

    const filename = (data.isProforma ? "proforma" : "recu") + "_" + data.receiptNumber + ".pdf";
    doc.save(filename);
  });
}
// ─────────────────────────────────────────────────────────────────────────────
// THERMAL 80mm RECEIPT — faithful to local clinic receipts (CENTRE MÉDICAL…)
// Black & white, narrow roll, QTÉ / NOM / PT.TTC, LOT lines, Net à Payer /
// Acompte / Reste, status box, and a scannable Code 39 barcode of the invoice №.
// ─────────────────────────────────────────────────────────────────────────────
const CODE39: Record<string, string> = {
  "0":"000110100","1":"100100001","2":"001100001","3":"101100000","4":"000110001",
  "5":"100110000","6":"001110000","7":"000100101","8":"100100100","9":"001100100",
  "*":"010010100",
};

export function generateThermalReceipt(data: ReceiptData) {
  import("jspdf").then(({ jsPDF }) => {
    const clinic = getClinicSettings();
    const W = 80;                 // 80mm thermal roll
    const mg = 4;
    const CW = W - mg * 2;        // content width
    const cur = clinic?.currency || "FCFA";

    // Pre-compute height from the number of items so the roll is the right length.
    let bodyH = 0;
    data.items.forEach(it => { bodyH += it.lot ? 8 : 5; });
    const H = 86 + bodyH + 34;    // header + items + totals/barcode/footer

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [W, H] });
    const line = (y: number) => { doc.setLineDashPattern([0.6, 0.6], 0); doc.setDrawColor(0); doc.setLineWidth(0.2); doc.line(mg, y, W - mg, y); doc.setLineDashPattern([], 0); };
    // Plain thousands separator (a regular space) — the fr-FR locale uses a
    // narrow no-break space that renders as "/" in the jsPDF core font.
    const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    const money = (n: number) => fmt(n) + " " + cur;
    let y = 7;

    // ── Header ──
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text((clinic?.name || "CENTRE MÉDICAL").toUpperCase(), W / 2, y, { align: "center" }); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    if (clinic?.phone) { doc.text("Contacts: " + clinic.phone, W / 2, y, { align: "center" }); y += 3.5; }
    if (clinic?.address) { doc.text("Adresse: " + clinic.address + (clinic.city ? ", " + clinic.city : ""), W / 2, y, { align: "center" }); y += 3.5; }
    y += 1; line(y); y += 5;

    // ── Title + meta ──
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(data.isProforma ? "FACTURE PROFORMA" : "FACTURE", W / 2, y, { align: "center" }); y += 5;
    doc.setFontSize(8);
    doc.text("Facture N° : " + data.receiptNumber, W / 2, y, { align: "center" }); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    doc.text("Client : " + data.patientName, mg, y); y += 3.6;
    if (data.cashier) { doc.text("Caissier : " + data.cashier, mg, y); y += 3.6; }
    doc.text("FACTURE DU : " + data.date, mg, y); y += 3;
    line(y); y += 4;

    // ── Column header ──
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
    doc.text("QTÉ", mg, y);
    doc.text("NOM", mg + 10, y);
    doc.text("PT.TTC", W - mg, y, { align: "right" });
    y += 1.5; line(y); y += 4;

    // ── Items ──
    let subtotal = 0;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    data.items.forEach(it => {
      const total = it.quantity * it.unitPrice;
      subtotal += total;
      doc.text(String(it.quantity), mg + 1, y, { align: "center" });
      const name = it.description.length > 26 ? it.description.slice(0, 25) + "…" : it.description;
      doc.text(name.toUpperCase(), mg + 10, y);
      doc.text(fmt(total), W - mg, y, { align: "right" });
      y += 4;
      if (it.lot) { doc.setFontSize(6.3); doc.setTextColor(90); doc.text("N:" + it.lot, mg + 10, y); doc.setTextColor(0); doc.setFontSize(7.5); y += 4; }
    });
    y += 1; line(y); y += 5;

    // ── Totals ──
    const paid = data.amountPaid ?? 0;
    const due = data.amountDue ?? subtotal;
    const reste = Math.max(0, due - paid);
    const rowR = (label: string, val: string, bold = false, size = 8) => {
      doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size);
      doc.text(label, mg, y); doc.text(val, W - mg, y, { align: "right" }); y += bold ? 5.5 : 4.2;
    };
    rowR("Sous-total HT:", money(subtotal));
    const discAmt = (data.discount && data.discount > 0)
      ? (data.discountType === "percent" ? Math.round(subtotal * data.discount / 100) : Math.min(data.discount, subtotal))
      : 0;
    if (discAmt > 0) rowR("Remise" + (data.discountType === "percent" ? " (" + data.discount + "%)" : "") + ":", "-" + money(discAmt));
    rowR("TVA 0%:", money(0));
    line(y); y += 4;
    rowR("Net À Payer:", money(due), true, 10);
    const covered = data.insuranceCovered ?? 0;
    if (covered > 0) {
      const insurerLbl = `Assurance${data.insurerName ? " " + data.insurerName : ""}${data.coverageRate ? ` ${data.coverageRate}%` : ""}:`;
      rowR(insurerLbl, "-" + money(covered));
      rowR("Part patient:", money(Math.max(0, due - covered)), true, 9);
    }
    rowR("Acompte:", money(paid));
    rowR("Reste:", money(reste), true, 9);
    y += 2;

    // ── Status box ──
    const label = data.status === "paid" ? "Payée" : data.status === "partial" ? "Acompte" : "Non payée";
    doc.setDrawColor(0); doc.setLineWidth(0.3);
    const bw = 34, bx = (W - bw) / 2;
    doc.roundedRect(bx, y, bw, 7, 1, 1, "S");
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text(label, W / 2, y + 4.8, { align: "center" });
    y += 12;

    // ── Code 39 barcode of the invoice number ──
    const code = "*" + data.receiptNumber.replace(/[^0-9]/g, "") + "*";
    const narrow = 0.33, wide = narrow * 2.3, barH = 11;
    let totalW = 0;
    for (const ch of code) { const p = CODE39[ch] || CODE39["0"]; for (let i = 0; i < 9; i++) totalW += (p[i] === "1" ? wide : narrow); totalW += narrow; }
    let cx = (W - totalW) / 2;
    doc.setFillColor(0,0,0);
    for (const ch of code) {
      const p = CODE39[ch] || CODE39["0"];
      for (let i = 0; i < 9; i++) { const w = p[i] === "1" ? wide : narrow; if (i % 2 === 0) doc.rect(cx, y, w, barH, "F"); cx += w; }
      cx += narrow;
    }
    y += barH + 3;
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(90);
    doc.text("Généré par DivineLink", W / 2, y, { align: "center" });

    doc.save("facture_" + data.receiptNumber + ".pdf");
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// FERMETURE DE CAISSE — thermal daily cash-close report (80mm)
// ─────────────────────────────────────────────────────────────────────────────
export interface CaisseReportData {
  from: string; to: string; cashier?: string;
  totalFacture: number; totalRecette: number; impayees: number;
  byMethod: Record<string, number>;
  topSold: { name: string; qty: number; revenue: number }[];
  topProfit: { name: string; qty: number; profit: number }[];
  soldByCategory?: { category: string; items: { name: string; qty: number; pu: number; total: number }[] }[];
  soldTotal?: number;
  recouvrements?: { client: string; invoice: string; method: string; amount: number }[];
  recouvrementTotal?: number;
  fond: number; reel: number; theorique: number; ecart: number;
}

export function generateCaisseReport(d: CaisseReportData) {
  import("jspdf").then(({ jsPDF }) => {
    const clinic = getClinicSettings();
    const W = 80, mg = 4, cur = clinic?.currency || "FCFA";
    const methodsShown = Object.values(d.byMethod).filter(v => v > 0).length;
    const profitShown = d.topProfit.filter(r => r.profit > 0).length;
    const catRows = (d.soldByCategory || []).reduce((s, c) => s + 1 + c.items.length, 0);
    const recoRows = (d.recouvrements || []).length;
    const H = 100 + (d.topSold.length + profitShown) * 4 + methodsShown * 4.2
      + (catRows ? catRows * 4 + 8 : 0)
      + (recoRows ? recoRows * 4 + 10 : 0);
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [W, H] });
    const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    const money = (n: number) => fmt(n) + " " + cur;
    const line = (y: number) => { doc.setLineDashPattern([0.6, 0.6], 0); doc.setDrawColor(0); doc.setLineWidth(0.2); doc.line(mg, y, W - mg, y); doc.setLineDashPattern([], 0); };
    const L: Record<string, string> = { cash: "Espèces", orange_money: "Orange Money", mtn_momo: "MTN MoMo", other: "Autre" };
    const fmtDate = (s: string) => { try { return new Date(s).toLocaleString("fr-FR"); } catch { return s; } };
    let y = 7;
    doc.setTextColor(0); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text((clinic?.name || "CENTRE MÉDICAL").toUpperCase(), W / 2, y, { align: "center" }); y += 5;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("RAPPORT DE FERMETURE CAISSE", W / 2, y, { align: "center" }); y += 4.5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); doc.setTextColor(80);
    doc.text("Du " + fmtDate(d.from) + "  au " + fmtDate(d.to), W / 2, y, { align: "center" }); y += 3.4;
    if (d.cashier) { doc.text("Caissier: " + d.cashier, W / 2, y, { align: "center" }); y += 3; }
    doc.setTextColor(0); line(y); y += 5;

    const row = (label: string, val: string, bold = false, size = 8) => {
      doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size);
      doc.text(label, mg, y); doc.text(val, W - mg, y, { align: "right" }); y += bold ? 5 : 4.2;
    };
    row("Total facturé:", money(d.totalFacture));
    row("Recette totale:", money(d.totalRecette), true, 9);
    for (const [m, v] of Object.entries(d.byMethod)) if (v > 0) { doc.setTextColor(80); row("  " + (L[m] || m) + ":", money(v)); doc.setTextColor(0); }
    row("Impayées:", money(d.impayees));
    line(y); y += 4;
    row("Fond de caisse:", money(d.fond));
    row("Théorique (espèces):", money(d.theorique));
    row("Réel compté:", money(d.reel));
    row("Écart:", (d.ecart >= 0 ? "+" : "") + money(d.ecart), true, 9);
    line(y); y += 4;

    const section = (title: string, rows: { name: string; right: string }[]) => {
      if (!rows.length) return;
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.text(title, mg, y); y += 4;
      doc.setFont("helvetica", "normal"); doc.setFontSize(7);
      rows.forEach(r => { const n = r.name.length > 24 ? r.name.slice(0, 23) + "…" : r.name; doc.text(n.toUpperCase(), mg, y); doc.text(r.right, W - mg, y, { align: "right" }); y += 4; });
      y += 1.5;
    };
    section("DÉSIGNATION LA PLUS VENDUE", d.topSold.map(r => ({ name: r.name, right: `${r.qty} · ${fmt(r.revenue)}` })));
    section("DÉSIGNATION LA PLUS RENTABLE", d.topProfit.filter(r => r.profit > 0).map(r => ({ name: r.name, right: `+${fmt(r.profit)}` })));

    // ── Full list of everything sold, grouped by category ──
    if (d.soldByCategory && d.soldByCategory.length) {
      line(y); y += 4;
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text("DÉSIGNATION VENDUE", mg, y); y += 4.5;
      doc.setFontSize(5.8); doc.setTextColor(110);
      doc.text("Nom", mg, y); doc.text("Qté", W - 30, y, { align: "right" }); doc.text("PU", W - 17, y, { align: "right" }); doc.text("Total", W - mg, y, { align: "right" }); y += 3;
      doc.setTextColor(0);
      for (const cat of d.soldByCategory) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(6.8); doc.text(cat.category.toUpperCase(), mg, y); y += 3.6;
        doc.setFont("helvetica", "normal"); doc.setFontSize(6.8);
        for (const it of cat.items) {
          const n = it.name.length > 20 ? it.name.slice(0, 19) + "…" : it.name;
          doc.text(n, mg + 1, y); doc.text(String(it.qty), W - 30, y, { align: "right" });
          doc.text(fmt(it.pu), W - 17, y, { align: "right" }); doc.text(fmt(it.total), W - mg, y, { align: "right" }); y += 3.8;
        }
      }
      y += 1;
      doc.setFont("helvetica", "bold"); doc.setFontSize(8);
      doc.text("TOTAL PRODUITS VENDUS:", mg, y); doc.text(money(d.soldTotal || 0), W - mg, y, { align: "right" }); y += 5;
    }

    // ── Recouvrements (old debts cleared during the day) ──
    if (d.recouvrements && d.recouvrements.length) {
      line(y); y += 4;
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text("RECOUVREMENTS", mg, y); y += 4.5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.8);
      for (const r of d.recouvrements) {
        const nm = r.client.length > 18 ? r.client.slice(0, 17) + "…" : r.client;
        doc.text(`${nm} ${r.invoice}`, mg, y); doc.text(fmt(r.amount), W - mg, y, { align: "right" }); y += 3.8;
      }
      y += 0.5;
      doc.setFont("helvetica", "bold"); doc.setFontSize(8);
      doc.text("TOTAL RECOUVREMENTS:", mg, y); doc.text(money(d.recouvrementTotal || 0), W - mg, y, { align: "right" }); y += 5;
    }

    line(y); y += 4;
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(90);
    doc.text("Généré par DivineLink · " + new Date().toLocaleString("fr-FR"), W / 2, y, { align: "center" });
    doc.save("fermeture_caisse_" + new Date().toISOString().slice(0, 10) + ".pdf");
  });
}

/**
 * Full-page A4 "facture" modeled on the DOH'S Diagnostic Center layout:
 * clinic header, patient block, a Désignation/Prix unitaire/Quantité/Total
 * table, grand total, the amount written out in words, and a signature line.
 * Header fields come from the clinic's own settings, so each clinic prints
 * its own facture.
 */
export function generateFacture(data: ReceiptData) {
  import("jspdf").then(({ jsPDF }) => {
    const c = getClinicSettings();
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = 210, mg = 14, right = W - mg;
    const money = (n: number) => Math.round(n).toLocaleString("fr-FR").replace(/ /g, " ") + " FCFA";
    const money0 = (n: number) => Math.round(n).toLocaleString("fr-FR").replace(/ /g, " ");
    let y = 14;

    // ── Header: full DOH'S identity (logo + every line), centered, always. ──
    const lw = 21, lh = 25;
    // logo centered at top
    const logoX = (W - lw) / 2;
    try { doc.addImage(DOH_LOGO, "JPEG", logoX, y, lw, lh); } catch { /* ignore bad logo */ }
    y += lh + 4;
    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(20);
    doc.text(DOH_HEADER.name, W / 2, y, { align: "center" }); y += 5;
    doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(90);
    doc.text(DOH_HEADER.slogan, W / 2, y, { align: "center" }); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(70);
    doc.text(`${DOH_HEADER.address1}`, W / 2, y, { align: "center" }); y += 3.8;
    doc.text(`${DOH_HEADER.address2}`, W / 2, y, { align: "center" }); y += 3.8;
    doc.text(`${DOH_HEADER.arrete}     ·     ${DOH_HEADER.taxId}`, W / 2, y, { align: "center" }); y += 3.8;
    doc.text(`${DOH_HEADER.phone}     ·     Email: ${DOH_HEADER.email}`, W / 2, y, { align: "center" }); y += 3;
    y += 2;

    // ── FACTURE title band ──
    doc.setDrawColor(30); doc.setLineWidth(0.5); doc.line(mg, y, right, y); y += 7;
    doc.setFillColor(30, 41, 59); doc.rect(mg, y - 5, 46, 9, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(255);
    doc.text("FACTURE", mg + 23, y + 1.3, { align: "center" });
    doc.setTextColor(20); doc.setFontSize(9); doc.setFont("helvetica", "normal");
    if (data.receiptNumber) doc.text("N° " + data.receiptNumber, right, y - 1, { align: "right" });
    doc.text(data.date, right, y + 4, { align: "right" });
    y += 12;

    // ── Patient block ──
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(20);
    doc.text("Nom: " + (data.patientName || "—"), mg, y); y += 5.5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
    const idLine = [data.patientAge ? "Âge: " + data.patientAge : "", data.patientSex ? "Sexe: " + data.patientSex : "", data.patientPhone ? "Tél: " + data.patientPhone : ""].filter(Boolean).join("     ");
    if (idLine) { doc.text(idLine, mg, y); y += 5.5; }
    if (data.patientId) { doc.text("Dossier: " + data.patientId, mg, y); y += 5.5; }
    y += 2;

    // ── Items table ──
    const xDes = mg, xPU = 126, xQte = 152, xTot = right; // right edges for numeric cols
    const rowH = 7.5;
    const header = () => {
      doc.setFillColor(238, 242, 247); doc.rect(mg, y, right - mg, rowH, "F");
      doc.setDrawColor(200); doc.setLineWidth(0.2); doc.rect(mg, y, right - mg, rowH);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(40);
      const ty = y + 5;
      doc.text("Désignation", xDes + 2, ty);
      doc.text("Prix unitaire", xPU, ty, { align: "right" });
      doc.text("Qté", xQte, ty, { align: "center" });
      doc.text("Total", xTot - 2, ty, { align: "right" });
      y += rowH;
    };
    header();
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(30);
    (data.items || []).forEach((it, i) => {
      if (y > 262) { doc.addPage(); y = 16; header(); doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(30); }
      const lineTot = it.quantity * it.unitPrice;
      if (i % 2 === 1) { doc.setFillColor(249, 250, 252); doc.rect(mg, y, right - mg, rowH, "F"); }
      doc.setDrawColor(225); doc.setLineWidth(0.1); doc.rect(mg, y, right - mg, rowH);
      const ty = y + 5;
      const name = it.description.length > 52 ? it.description.slice(0, 51) + "…" : it.description;
      doc.text(name, xDes + 2, ty);
      doc.text(money0(it.unitPrice), xPU, ty, { align: "right" });
      doc.text(String(it.quantity), xQte, ty, { align: "center" });
      doc.text(money0(lineTot), xTot - 2, ty, { align: "right" });
      y += rowH;
    });

    // ── Totals ──
    const subtotal = (data.items || []).reduce((s, it) => s + it.quantity * it.unitPrice, 0);
    const discountAmount = (data.discount && data.discount > 0)
      ? (data.discountType === "percent" ? Math.round(subtotal * data.discount / 100) : Math.min(data.discount, subtotal))
      : 0;
    const due = data.amountDue ?? (subtotal - discountAmount);
    const covered = data.insuranceCovered ?? 0;
    // Sous-total + Remise lines (only when a remise applies)
    if (discountAmount > 0) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(60);
      doc.text("Sous-total:", xDes + 2, y); doc.text(money(subtotal), xTot - 2, y, { align: "right" }); y += 5;
      doc.text("Remise" + (data.discountType === "percent" ? " (" + data.discount + "%)" : "") + ":", xDes + 2, y);
      doc.text("- " + money(discountAmount), xTot - 2, y, { align: "right" }); y += 6;
    }
    doc.setFillColor(30, 41, 59); doc.rect(mg, y, right - mg, rowH + 1, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(255);
    doc.text("TOTAL", xDes + 2, y + 5.5);
    doc.text(money(due), xTot - 2, y + 5.5, { align: "right" });
    y += rowH + 5;

    if (covered > 0) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(60);
      const insLbl = "Pris en charge" + (data.insurerName ? " (" + data.insurerName : " (assureur") + (data.coverageRate ? " " + data.coverageRate + "%" : "") + ")";
      doc.text(insLbl + ":", xDes + 2, y); doc.text("- " + money(covered), xTot - 2, y, { align: "right" }); y += 5;
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(20);
      doc.text("Part patient:", xDes + 2, y); doc.text(money(Math.max(0, due - covered)), xTot - 2, y, { align: "right" }); y += 7;
    }

    // ── Amount in words ──
    doc.setFont("helvetica", "italic"); doc.setFontSize(9.5); doc.setTextColor(30);
    const words = montantEnLettres(covered > 0 ? Math.max(0, due - covered) : due).toUpperCase();
    const sentence = `Arrêtée la présente facture à la somme de ${words} FRANCS CFA.`;
    doc.text(doc.splitTextToSize(sentence, right - mg), mg, y + 2); y += 14;

    // ── Signature ──
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(20);
    doc.text("Le Responsable", right - 10, y, { align: "right" });
    if (c?.doctorName) { doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(90); doc.text(c.doctorName, right - 10, y + 5, { align: "right" }); }

    // ── Footer ──
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(130);
    doc.text("Généré par DivineLink · " + new Date().toLocaleString("fr-FR"), W / 2, 288, { align: "center" });

    doc.save("facture_" + (data.receiptNumber || "sans-num") + ".pdf");
  });
}
