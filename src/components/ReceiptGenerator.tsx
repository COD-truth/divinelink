import { getClinicSettings } from "@/lib/clinicSettings";

export interface ReceiptLineItem {
  description: string;
  tooth?: string;
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
      if (i % 2 === 0) {
        doc.setFillColor(248,250,252);
        doc.rect(mg, y, W-mg*2, 7, "F");
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
      y += 7;
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