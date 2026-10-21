/**
 * Pharmacie ↔ Magasin drug mirroring.
 *
 * A medication exists as the SAME article on both desks but with SEPARATE
 * stock: the pharmacy counter (`Drug`) and the central store (`MagasinItem`,
 * type "Médicament"). When staff create a drug on one side we make sure the
 * matching article also exists on the other side — created once, with its
 * own stock starting at 0, so the two counts never merge.
 *
 * Guard against duplicates / loops: each mirror only CREATES when no article
 * of the same name exists in the same clinic. Because it checks existence
 * first and never calls the opposite mirror, there is no feedback loop.
 */
import { db, type Drug, type MagasinItem } from "@/lib/db";

const activeClinic = () => localStorage.getItem("divinelink.clinicId") || undefined;

/** Same clinic-scoping rule used across the app. */
const inClinic = (c?: string, active?: string) =>
  !active || !c || String(c) === String(active);

const norm = (s: string) => s.trim().toLowerCase();

/** Map a pharmacy drug category onto a Magasin section. */
const magasinTypeFor = (category?: string): string => {
  const c = norm(category || "");
  if (c.includes("consommable")) return "Consommable";
  if (c.includes("réactif") || c.includes("reactif")) return "Réactif";
  if (c.includes("équipement") || c.includes("equipement") || c.includes("matériel") || c.includes("materiel")) return "Équipement";
  return "Médicament";
};

/** Ensure a matching article exists in the Magasin for this drug (same name,
 *  SEPARATE stock starting at 0). The Magasin section is inferred from the
 *  pharmacy category so consommables don't land under Médicament. */
export async function mirrorDrugToMagasin(
  drug: Pick<Drug, "name" | "unit" | "buyPrice" | "sellPrice" | "category" | "clinicId">,
): Promise<void> {
  const active = activeClinic();
  const name = drug.name?.trim();
  if (!name) return;
  const all = await db.magasinItems.toArray();
  const exists = all.some(
    (m) => inClinic(m.clinicId, active) && norm(m.name) === norm(name),
  );
  if (exists) return;
  const now = new Date().toISOString();
  await db.magasinItems.add({
    name,
    type: magasinTypeFor(drug.category),
    unit: drug.unit || "unité",
    stockMagasin: 0, // separate stock — starts empty on the store side
    minStockMagasin: 0,
    buyPrice: drug.buyPrice || 0,
    sellPrice: drug.sellPrice || 0,
    clinicId: drug.clinicId ?? active,
    createdAt: now,
  } as MagasinItem);
}

/** Ensure a pharmacy Drug exists for this Magasin medication article. */
export async function mirrorMagasinToDrug(
  item: Pick<MagasinItem, "name" | "unit" | "buyPrice" | "sellPrice" | "type" | "clinicId">,
): Promise<void> {
  // Only medications mirror to the pharmacy counter — consommables / réactifs
  // / équipement have their own destinations and must NOT appear as drugs.
  if (item.type && norm(item.type) !== norm("Médicament")) return;
  const active = activeClinic();
  const name = item.name?.trim();
  if (!name) return;
  const all = await db.drugs.toArray();
  const exists = all.some(
    (d) => inClinic(d.clinicId, active) && norm(d.name) === norm(name),
  );
  if (exists) return;
  const now = new Date().toISOString();
  await db.drugs.add({
    name,
    category: "Médicament",
    stock: 0, // separate stock — starts empty on the counter side
    stockMagasin: 0,
    unit: item.unit || "unité",
    buyPrice: item.buyPrice || 0,
    sellPrice: item.sellPrice || 0,
    minStock: 5,
    status: "out",
    clinicId: item.clinicId ?? active,
    createdAt: now,
    updatedAt: now,
  } as Drug);
}
