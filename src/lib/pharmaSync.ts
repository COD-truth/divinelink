/**
 * Pharmacy multi-device sync — event-sourced, clinic-scoped, DORMANT by default.
 *
 * Model (why it's correct for concurrent selling):
 *  - Stock is NEVER synced as an absolute number. Each drug carries a baseline
 *    (syncBaseStock @ syncBaseAt) captured when the clinic is enrolled.
 *  - Every sale / receipt / transfer is an append-only DrugTransaction with a
 *    stable uid + drugUid. These never conflict between devices.
 *  - Derived stock = syncBaseStock + Σ(signed qty of txs AFTER syncBaseAt).
 *    Two devices selling at once each log their own event; once both have pulled
 *    the other's events, both converge to the same number. No lost decrements.
 *
 * Safety:
 *  - Off unless localStorage "dl.pharmaSync" === "1" (per device).
 *  - Server already scopes every query to req.user.clinic_id (JWT), so a device
 *    only ever receives its OWN clinic's rows. We still tag + guard client-side.
 *  - When off, nothing here runs and stored stock behaves exactly as before.
 */
import { db, type Drug, type DrugTransaction } from "@/lib/db";

const API_BASE = "https://divinelink.mooo.com/api";

export function pharmaSyncEnabled(): boolean {
  try { return localStorage.getItem("dl.pharmaSync") === "1"; } catch { return false; }
}
export function setPharmaSyncEnabled(on: boolean) {
  try { on ? localStorage.setItem("dl.pharmaSync", "1") : localStorage.removeItem("dl.pharmaSync"); } catch { /* */ }
}

const uuid = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const activeClinic = () => localStorage.getItem("divinelink.clinicId") || "";
const belongs = (c?: string) => { const a = activeClinic(); return !!a && String(c ?? "") === String(a); };
const token = () => localStorage.getItem("divinelink.apiToken") || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

/** Signed quantity of an event. */
const signed = (t: DrugTransaction) => (t.type === "out" ? -1 : 1) * (t.quantity || 0);

/** Derived stock for one drug from its baseline + later events. */
export async function derivedStock(drug: Drug): Promise<number> {
  if (!drug.uid) return drug.stock;
  const base = drug.syncBaseStock ?? drug.stock;
  const baseAt = drug.syncBaseAt ?? "1970-01-01T00:00:00.000Z";
  const txs = await db.drugTransactions.where("drugUid").equals(drug.uid).toArray();
  let net = 0;
  for (const t of txs) if ((t.createdAt || "") > baseAt) net += signed(t);
  return Math.max(0, base + net);
}

/** Backfill uid on drugs and uid+drugUid on transactions (idempotent, additive). */
export async function ensureUids(): Promise<void> {
  const now = new Date().toISOString();
  const drugs = await db.drugs.toArray();
  const byId = new Map<number, Drug>();
  for (const d of drugs) {
    byId.set(d.id!, d);
    if (!d.uid) { const u = uuid(); await db.drugs.update(d.id!, { uid: u, updatedAt: now }); d.uid = u; }
  }
  const txs = await db.drugTransactions.toArray();
  for (const t of txs) {
    const patch: Partial<DrugTransaction> = {};
    if (!t.uid) patch.uid = uuid();
    if (!t.drugUid) { const d = byId.get(t.drugId); if (d?.uid) patch.drugUid = d.uid; }
    if (Object.keys(patch).length) await db.drugTransactions.update(t.id!, patch);
  }
}

/** Capture the current stock as the sync baseline for drugs that lack one. */
export async function enrollClinic(): Promise<void> {
  const now = new Date().toISOString();
  const drugs = (await db.drugs.toArray()).filter(d => belongs(d.clinicId));
  for (const d of drugs) {
    if (d.syncBaseStock == null) await db.drugs.update(d.id!, { syncBaseStock: d.stock, syncBaseAt: now });
  }
}

const drugToBody = (d: Drug) => ({
  uid: d.uid, name: d.name, category: d.category, unit: d.unit, pack_size: d.packSize ?? null,
  buy_price: d.buyPrice ?? 0, sell_price: d.sellPrice ?? 0, min_stock: d.minStock ?? 0,
  initial_stock: d.initialStock ?? 0, stock_magasin: d.stockMagasin ?? 0, min_stock_magasin: d.minStockMagasin ?? 0,
  supplier: d.supplier ?? null, expiration: d.expiration ?? null, batch_number: d.batchNumber ?? null,
  location: d.location ?? null, status: d.status, sync_base_stock: d.syncBaseStock ?? d.stock,
  sync_base_at: d.syncBaseAt ?? null, deleted: !!(d as any).deleted,
  created_at: d.createdAt, updated_at: d.updatedAt || d.createdAt,
});

const txToBody = (t: DrugTransaction) => ({
  uid: t.uid, drug_uid: t.drugUid, type: t.type, quantity: t.quantity, price: t.price ?? 0,
  patient_id: t.patientId ?? null, payment_status: t.paymentStatus ?? null, exit_reason: t.exitReason ?? null,
  batch_number: t.batchNumber ?? null, performed_by: t.performedBy ?? null, notes: t.notes ?? null,
  created_at: t.createdAt,
});

async function pushPharmacy(clinic: string) {
  let pushedDrugs = 0, pushedTx = 0;
  // Drugs: push those changed since last push cursor.
  const dCurKey = `dl.pharmaPush.drugs.${clinic}`;
  const dCur = localStorage.getItem(dCurKey) || "1970-01-01T00:00:00.000Z";
  let dMax = dCur;
  for (const d of (await db.drugs.toArray()).filter(x => belongs(x.clinicId) && x.uid)) {
    const upd = d.updatedAt || d.createdAt;
    if (String(upd) <= dCur) continue;
    try { await fetch(`${API_BASE}/drugs`, { method: "POST", headers: headers(), body: JSON.stringify(drugToBody(d)) }); pushedDrugs++; if (String(upd) > dMax) dMax = String(upd); } catch { /* */ }
  }
  localStorage.setItem(dCurKey, dMax);

  // Transactions: append-only, push those created since last push cursor.
  const tCurKey = `dl.pharmaPush.tx.${clinic}`;
  const tCur = localStorage.getItem(tCurKey) || "1970-01-01T00:00:00.000Z";
  let tMax = tCur;
  for (const t of (await db.drugTransactions.toArray()).filter(x => belongs(x.clinicId) && x.uid && x.drugUid)) {
    if (String(t.createdAt) <= tCur) continue;
    try { await fetch(`${API_BASE}/drug-transactions`, { method: "POST", headers: headers(), body: JSON.stringify(txToBody(t)) }); pushedTx++; if (String(t.createdAt) > tMax) tMax = String(t.createdAt); } catch { /* */ }
  }
  localStorage.setItem(tCurKey, tMax);
  return { pushedDrugs, pushedTx };
}

async function pullPharmacy(clinic: string) {
  let pulledDrugs = 0, pulledTx = 0;
  const affected = new Set<string>();

  // Drugs (catalogue + baseline; NOT absolute stock).
  const dSinceKey = `dl.pharmaPull.drugs.${clinic}`;
  const dSince = localStorage.getItem(dSinceKey) || "1970-01-01T00:00:00.000Z";
  try {
    const res = await fetch(`${API_BASE}/drugs?since=${encodeURIComponent(dSince)}`, { headers: headers() });
    if (res.ok) {
      const rows: any[] = await res.json();
      let max = dSince;
      for (const r of rows) {
        if (!r.uid) continue;
        if (String(r.updated_at || "") > max) max = String(r.updated_at || "");
        const fields: Partial<Drug> = {
          uid: r.uid, name: r.name, category: r.category, unit: r.unit,
          packSize: r.pack_size ?? undefined, buyPrice: r.buy_price ?? 0, sellPrice: r.sell_price ?? 0,
          minStock: r.min_stock ?? 0, initialStock: r.initial_stock ?? 0,
          stockMagasin: r.stock_magasin ?? 0, minStockMagasin: r.min_stock_magasin ?? 0,
          supplier: r.supplier ?? undefined, expiration: r.expiration ?? undefined,
          batchNumber: r.batch_number ?? undefined, location: r.location ?? undefined,
          status: r.status, syncBaseStock: r.sync_base_stock ?? 0, syncBaseAt: r.sync_base_at ?? undefined,
          deleted: !!r.deleted, clinicId: clinic, updatedAt: r.updated_at,
        } as any;
        const existing = await db.drugs.where("uid").equals(r.uid).first();
        if (existing?.id) { await db.drugs.update(existing.id, fields); }
        else { await db.drugs.add({ ...(fields as any), stock: r.sync_base_stock ?? 0, createdAt: r.created_at || new Date().toISOString() }); pulledDrugs++; }
        affected.add(r.uid);
      }
      localStorage.setItem(dSinceKey, max);
    }
  } catch { /* */ }

  // Transactions (append-only; insert unseen by uid).
  const tSinceKey = `dl.pharmaPull.tx.${clinic}`;
  const tSince = localStorage.getItem(tSinceKey) || "1970-01-01T00:00:00.000Z";
  try {
    const res = await fetch(`${API_BASE}/drug-transactions?since=${encodeURIComponent(tSince)}`, { headers: headers() });
    if (res.ok) {
      const rows: any[] = await res.json();
      let max = tSince;
      for (const r of rows) {
        if (!r.uid) continue;
        if (String(r.created_at || "") > max) max = String(r.created_at || "");
        const seen = await db.drugTransactions.where("uid").equals(r.uid).first();
        if (seen) continue;
        const drug = r.drug_uid ? await db.drugs.where("uid").equals(r.drug_uid).first() : undefined;
        await db.drugTransactions.add({
          uid: r.uid, drugUid: r.drug_uid, drugId: drug?.id || 0, type: r.type, quantity: r.quantity,
          price: r.price ?? 0, patientId: r.patient_id ?? undefined, paymentStatus: r.payment_status ?? undefined,
          exitReason: r.exit_reason ?? undefined, batchNumber: r.batch_number ?? undefined,
          performedBy: r.performed_by ?? undefined, notes: r.notes ?? undefined,
          clinicId: clinic, createdAt: r.created_at || new Date().toISOString(),
        } as DrugTransaction);
        pulledTx++;
        if (r.drug_uid) affected.add(r.drug_uid);
      }
      localStorage.setItem(tSinceKey, max);
    }
  } catch { /* */ }

  // Recompute stored stock for every affected drug from baseline + events.
  for (const uidv of affected) {
    const d = await db.drugs.where("uid").equals(uidv).first();
    if (d?.id) { const s = await derivedStock(d); if (s !== d.stock) await db.drugs.update(d.id, { stock: s }); }
  }
  return { pulledDrugs, pulledTx };
}

/** One full pharmacy sync pass (push then pull). Returns counts for the toast. */
export async function syncPharmacy(): Promise<{ pushedDrugs: number; pushedTx: number; pulledDrugs: number; pulledTx: number } | null> {
  if (!pharmaSyncEnabled()) return null;
  if (!navigator.onLine || !token()) return null;
  const clinic = activeClinic();
  if (!clinic) return null;
  await ensureUids();
  await enrollClinic();
  const up = await pushPharmacy(clinic);
  const down = await pullPharmacy(clinic);
  return { ...up, ...down };
}
