import { db } from "@/lib/db";

/** Read a UI preference value, returning fallback if missing. */
export async function getUiPref<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await db.uiPreferences.get(key);
    if (!row) return fallback;
    return row.value as T;
  } catch {
    return fallback;
  }
}

/** Persist a UI preference. */
export async function setUiPref<T>(key: string, value: T): Promise<void> {
  try {
    await db.uiPreferences.put({ key, value, updatedAt: new Date().toISOString() });
  } catch { /* ignore */ }
}

/* ── Specialty preference keys (Consultations page) ── */
export const SPECIALTY_ORDER_KEY = "specialty.order";
export const SPECIALTY_HIDDEN_KEY = "specialty.hidden";

/** Bilingual treatment categories used for tagging patient documents. */
export const TREATMENT_CATEGORIES: { value: string; fr: string; en: string }[] = [
  { value: "general", fr: "Médecine générale", en: "General medicine" },
  { value: "dental", fr: "Dentisterie", en: "Dentistry" },
  { value: "ortho", fr: "Orthodontie", en: "Orthodontics" },
  { value: "prosthesis", fr: "Prothèse", en: "Prosthesis" },
  { value: "lab", fr: "Laboratoire", en: "Laboratory" },
  { value: "xray", fr: "Radiographie", en: "X-ray" },
  { value: "cardio", fr: "Cardiologie", en: "Cardiology" },
  { value: "derm", fr: "Dermatologie", en: "Dermatology" },
  { value: "ophtal", fr: "Ophtalmologie", en: "Ophthalmology" },
  { value: "pediatrie", fr: "Pédiatrie", en: "Pediatrics" },
  { value: "gyneco", fr: "Gynécologie", en: "Gynecology" },
  { value: "chirurgie", fr: "Chirurgie", en: "Surgery" },
  { value: "other", fr: "Autre", en: "Other" },
];

export function treatmentLabel(value: string | undefined, lang: string): string {
  if (!value) return "";
  const c = TREATMENT_CATEGORIES.find(c => c.value === value);
  if (!c) return value;
  return lang === "en" ? c.en : c.fr;
}
