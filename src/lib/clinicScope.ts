/**
 * Clinic scoping — the single source of truth for "which clinic does this
 * device belong to right now", plus the guards that stop data from one clinic
 * leaking into another.
 *
 * Rules enforced here:
 *  1. Nothing is ever pushed to the server unless it belongs to the ACTIVE clinic.
 *  2. Nothing pulled from the server is kept unless it belongs to the ACTIVE clinic.
 *  3. Anything deleted locally leaves a tombstone, so a later pull cannot resurrect it.
 *  4. Joining another clinic requires an explicit choice about the existing local data.
 */
import { db } from "@/lib/db";

const CLINIC_KEY = "divinelink.clinicId";
const TOKEN_KEY = "divinelink.apiToken";

/** Clinic this device is currently linked to (server clinic id), or null. */
export function activeClinicId(): string | null {
  const v = localStorage.getItem(CLINIC_KEY);
  return v && v !== "null" && v !== "undefined" ? String(v) : null;
}

export function activeToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/** True when a record may be pushed/displayed for the active clinic. */
export function belongsToActiveClinic(rec: { clinicId?: string | null }): boolean {
  const active = activeClinicId();
  if (!active) return false;
  if (!rec.clinicId) return false; // untagged legacy data stays local-only
  return String(rec.clinicId) === active;
}

/** Stamp the active clinic onto a record being created locally. */
export function stampClinic<T extends { clinicId?: string }>(rec: T): T {
  const active = activeClinicId();
  if (active && !rec.clinicId) rec.clinicId = active;
  return rec;
}

// ─── Tombstones ────────────────────────────────────────────────────────────

export async function addTombstone(entity: string, key: string): Promise<void> {
  if (!key) return;
  try {
    const existing = await db.tombstones.where("[entity+key]").equals([entity, key]).first();
    if (existing) return;
    await db.tombstones.add({
      entity,
      key: String(key),
      clinicId: activeClinicId() || undefined,
      deletedAt: new Date().toISOString(),
      pushed: false,
    });
  } catch (e) {
    console.warn("[clinicScope] tombstone failed", e);
  }
}

export async function isTombstoned(entity: string, key: string): Promise<boolean> {
  if (!key) return false;
  try {
    return !!(await db.tombstones.where("[entity+key]").equals([entity, String(key)]).first());
  } catch {
    return false;
  }
}

/** Set of tombstoned keys for an entity — cheap lookup during a pull. */
export async function tombstoneKeys(entity: string): Promise<Set<string>> {
  try {
    const rows = await db.tombstones.where("entity").equals(entity).toArray();
    return new Set(rows.map(r => String(r.key)));
  } catch {
    return new Set();
  }
}

// ─── Local cleanup ─────────────────────────────────────────────────────────

const CLINIC_TABLES = [
  "patients", "consultations", "appointments", "documents", "payments",
  "importedDocuments", "admissions", "careNotes", "wards", "beds",
  "surveys", "surveyResponses", "surveyInvites",
] as const;

/** Count local records that do NOT belong to the active clinic. */
export async function countForeignRecords(): Promise<number> {
  const active = activeClinicId();
  let n = 0;
  for (const name of CLINIC_TABLES) {
    const table = (db as any)[name];
    if (!table) continue;
    try {
      const rows = await table.toArray();
      n += rows.filter((r: any) => !active || !r.clinicId || String(r.clinicId) !== active).length;
    } catch {}
  }
  return n;
}

/** Delete every clinical record that is not tagged with the active clinic. */
export async function purgeForeignRecords(): Promise<number> {
  const active = activeClinicId();
  let removed = 0;
  for (const name of CLINIC_TABLES) {
    const table = (db as any)[name];
    if (!table) continue;
    try {
      const rows = await table.toArray();
      const ids = rows
        .filter((r: any) => !active || !r.clinicId || String(r.clinicId) !== active)
        .map((r: any) => r.id)
        .filter((id: any) => id !== undefined);
      if (ids.length) {
        await table.bulkDelete(ids);
        removed += ids.length;
      }
    } catch {}
  }
  return removed;
}

/** Wipe every clinical record on this device (keeps users/settings). */
export async function clearAllClinicalData(): Promise<void> {
  for (const name of CLINIC_TABLES) {
    const table = (db as any)[name];
    if (!table) continue;
    try { await table.clear(); } catch {}
  }
  try { await db.tombstones.clear(); } catch {}
}

// ─── Joining a clinic ──────────────────────────────────────────────────────

export interface JoinResult {
  ok: boolean;
  clinicId?: string;
  clinicName?: string;
  error?: string;
}

const API_BASE =
  (typeof window !== "undefined" && (window as any).__DIVINELINK_API_BASE__) ||
  "https://divinelink.mooo.com/api";

/**
 * Verify a clinic code and link this device.
 *
 * `mode`:
 *  - "fresh"  → wipe local clinical data first (recommended when the device
 *               holds data from another clinic; nothing old gets uploaded).
 *  - "keep"   → keep local data, but it stays local-only: it is never pushed
 *               because it carries a different clinicId.
 */
export async function joinClinic(
  code: string,
  role: string | undefined,
  mode: "fresh" | "keep"
): Promise<JoinResult> {
  try {
    const res = await fetch(`${API_BASE}/clinic/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim(), ...(role ? { role } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data?.token) return { ok: false, error: "invalid" };

    if (mode === "fresh") await clearAllClinicalData();

    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(CLINIC_KEY, String(data.clinic_id));
    localStorage.removeItem("dl.lastSyncAt");
    return { ok: true, clinicId: String(data.clinic_id), clinicName: data.clinic_name };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** Unlink this device from the server clinic (local data untouched). */
export function leaveClinic(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CLINIC_KEY);
  localStorage.removeItem("dl.lastSyncAt");
}
