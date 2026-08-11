import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";
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
  items: ReceiptLineItem[];
  discount?: number;
  discountType?: "amount" | "percent";
  paymentMethod: string;
  status: "paid" | "partial" | "unpaid";
  amountPaid?: number;
  notes?: string;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Especes / Cash",
  mtn_momo: "MTN MoMo",
  orange_money: "Orange Money",
  insurance: "Assurance",
  other: "Autre / Other",
};

export function generateReceipt(data: ReceiptData) {
  import("jspdf").then(({ jsPDF }) => {
    const clinic = getClinicSettings();
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
    const W = 148;
    const margin = 12;
    const contentW = W - margin * 2;
    let y = 14;

    const TEAL: [number,number,number] = [13, 148, 136];
    const DARK: [number,number,number] = [15, 23, 42];
    const GREY: [number,number,number] = [100, 116, 139];

    doc.setFillColor(...TEAL);
    doc.rect(0, 0, W, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(clinic?.name || "DivineLink Clinic", margin, 10);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const clinicInfo = [clinic?.address, clinic?.phone].filter(Boolean).join(" - ");
    if (clinicInfo) doc.text(clinicInfo, margin, 16);
    doc.text("RECU / RECEIPT", W - margin, 10, { align: "right" });
    doc.text(`N ${data.receiptNumber}`, W - margin, 16, { align: "right" });
    y = 28;

    doc.setFillColor(240, 253, 250);
    doc.rect(margin, y, contentW, 16, "F");
    doc.setTextColor(...DARK);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Patient:", margin + 2, y + 5);
    doc.setFont("helvetica", "normal");
    doc.text(data.patientName, margin + 22, y + 5);
    doc.setFont("helvetica", "bold");
    doc.text("Date:", W - margin - 40, y + 5);
    doc.setFont("helvetica", "normal");
    doc.text(data.date, W - margin - 25, y + 5);
    y += 22;

    doc.setFillColor(...TEAL);
    doc.rect(margin, y, contentW, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Traitement", margin + 2, y + 5);
    doc.text("Dent", margin + 72, y + 5);
    doc.text("Qte", margin + 84, y + 5);
    doc.text("P.U", margin + 92, y + 5);
    doc.text("Total", W - margin - 2, y + 5, { align: "right" });
    y += 7;

    let subtotal = 0;
    data.items.forEach((item, i) => {
      const lineTotal = item.quantity * item.unitPrice;
      subtotal += lineTotal;
      if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(margin, y, contentW, 7, "F"); }
      doc.setTextColor(...DARK);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const name = item.description.length > 35 ? item.description.substring(0, 33) + "..." : item.description;
      doc.text(name, margin + 2, y + 5);
      doc.text(item.tooth || "-", margin + 72, y + 5);
      doc.text(String(item.quantity), margin + 84, y + 5);
      doc.text(item.unitPrice.toLocaleString(), margin + 92, y + 5);
      doc.text(lineTotal.toLocaleString(), W - margin - 2, y + 5, { align: "right" });
      y += 7;
    });

    y += 3;
    doc.setDrawColor(...TEAL);
    doc.setLineWidth(0.5);
    doc.line(margin, y, W - margin, y);
    y += 5;

    let discountAmt = 0;
    if (data.discount && data.discount > 0) {
      discountAmt = data.discountType === "percent" ? Math.round(subtotal * data.discount / 100) : data.discount;
      doc.setTextColor(220, 38, 38);
      doc.setFontSize(9);
      doc.text(`Remise:`, margin + 60, y);
      doc.text(`- ${discountAmt.toLocaleString()} FCFA`, W - margin, y, { align: "right" });
      y += 6;
    }

    const total = subtotal - discountAmt;
    doc.setFillColor(...TEAL);
    doc.rect(margin + 55, y - 2, contentW - 55, 9, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("TOTAL:", margin + 58, y + 5);
    doc.text(`${total.toLocaleString()} FCFA`, W - margin - 2, y + 5, { align: "right" });
    y += 14;

    doc.setFillColor(240, 253, 250);
    doc.rect(margin, y, contentW, 10, "F");
    doc.setTextColor(...DARK);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text(`Mode: ${METHOD_LABELS[data.paymentMethod] || data.paymentMethod}`, margin + 2, y + 6);
    y += 14;

    if (data.status === "paid") {
      doc.setFillColor(16, 185, 129);
      doc.roundedRect(margin, y, 35, 9, 2, 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("PAYE / PAID", margin + 17.5, y + 6, { align: "center" });
      y += 14;
    }

    y = Math.max(y, 175);
    doc.setDrawColor(...GREY);
    doc.line(W - margin - 40, y, W - margin, y);
    doc.setTextColor(...GREY);
    doc.setFontSize(7.5);
    doc.text("Signature du praticien", W - margin - 20, y + 4, { align: "center" });

    doc.setFillColor(...TEAL);
    doc.rect(0, 202, W, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.text(`Merci de votre confiance - ${clinic?.name || "DivineLink"}`, W / 2, 207, { align: "center" });

    const filename = `recu_${data.receiptNumber}_${data.patientName.replace(/\s/g, "_")}.pdf`;
    doc.save(filename);
  });
}

export function ReceiptGenerator({ data, className }: { data: ReceiptData; className?: string }) {
  const handleDownload = useCallback(() => generateReceipt(data), [data]);
  return (
    <div className={`flex gap-2 ${className || ""}`}>
      <Button size="sm" variant="outline" onClick={handleDownload} className="gap-1.5">
        <Printer className="w-4 h-4" />
        Imprimer / Telecharger recu
      </Button>
    </div>
  );
}
