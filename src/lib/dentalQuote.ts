export interface DentalQuoteLine { id: string; label: string; tooth: string; quantity: number; unitPrice: number }
export const DENTAL_SERVICES = [
  "Consultation dentaire", "Détartrage", "Restauration composite", "Dévitalisation incisive/canine",
  "Dévitalisation prémolaire", "Dévitalisation molaire", "Extraction simple", "Extraction chirurgicale",
  "Radiographie rétro-alvéolaire", "Couronne provisoire", "Couronne céramique", "Bridge", "Prothèse amovible", "Autre acte"
] as const;
export const calculateDentalQuote = (lines: DentalQuoteLine[], discountPercent: number, insurancePercent: number) => {
  const subtotal = lines.reduce((sum, line) => sum + Math.max(0, line.quantity) * Math.max(0, line.unitPrice), 0);
  const discount = Math.round(subtotal * Math.min(100, Math.max(0, discountPercent)) / 100);
  const net = subtotal - discount;
  const insurance = Math.round(net * Math.min(100, Math.max(0, insurancePercent)) / 100);
  return { subtotal, discount, insurance, patientDue: net - insurance, net };
};
