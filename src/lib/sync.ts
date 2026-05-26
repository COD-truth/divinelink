/**
 * Manual offline sync via .divinesync files.
 * - Export: collect all records modified since the last successful export,
 *   bundle as JSON, encrypt with the master PIN (AES via CryptoJS), download.
 * - Import: decrypt, merge each record with last-modified-wins.
 *
 * No network calls. Files are exchanged manually (WhatsApp / USB / email).
 */
import CryptoJS from "crypto-js";
import { db, type Patient, type Consultation, type Appointment, type Document, type User } from "@/lib/db";
import { decryptPatients, encryptPatientForSave } from "@/lib/patientCrypto";

const LAST_SYNC_KEY = "dl.sync.lastExport.v1";
export const SYNC_EXTENSION = ".divinesync";

export interface SyncBundle {
  version: 1;
  generatedAt: string;
  since: string | null;
  counts: { patients: number; consultations: number; appointments: number; documents: number; users: number };
  data: {
    patients: Patient[];
    consultations: Consultation[];
    appointments: Appointment[];
    documents: Document[];
    users: User[];
  };
}

export function getLastSyncTime(): string | null {
  return localStorage.getItem(LAST_SYNC_KEY);
}

export function setLastSyncTime(iso: string): void {
  localStorage.setItem(LAST_SYNC_KEY, iso);
}

function modifiedSince(rec: { updatedAt?: string; createdAt?: string; date?: string; editedAt?: string }, since: string | null): boolean {
  if (!since) return true;
  const t = rec.updatedAt || rec.editedAt || rec.createdAt || rec.date;
  if (!t) return true;
  return t > since;
}

/** Build an unencrypted sync bundle of records changed since the last export. */
export async function buildSyncBundle(): Promise<SyncBundle> {
  const since = getLastSyncTime();
  const patientsRaw = await decryptPatients(await db.patients.toArray());
  const patients = patientsRaw.filter(p => modifiedSince(p, since));
  const consultations = (await db.consultations.toArray()).filter(c => modifiedSince(c, since));
  const appointments = (await db.appointments.toArray()).filter(a => modifiedSince(a, since));
  const documents = (await db.documents.toArray()).filter(d => modifiedSince(d, since));
  const users = (await db.users.toArray()).filter(u => modifiedSince(u, since));

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    since,
    counts: {
      patients: patients.length,
      consultations: consultations.length,
      appointments: appointments.length,
      documents: documents.length,
      users: users.length,
    },
    data: { patients, consultations, appointments, documents, users },
  };
}

/** Encrypt a sync bundle with the master PIN (or any passphrase). */
export function encryptSyncBundle(bundle: SyncBundle, passphrase: string): string {
  const json = JSON.stringify(bundle);
  return CryptoJS.AES.encrypt(json, passphrase).toString();
}

/** Decrypt a .divinesync file content. Throws on wrong passphrase or bad format. */
export function decryptSyncBundle(cipher: string, passphrase: string): SyncBundle {
  const bytes = CryptoJS.AES.decrypt(cipher, passphrase);
  const json = bytes.toString(CryptoJS.enc.Utf8);
  if (!json) throw new Error("invalid passphrase");
  const parsed = JSON.parse(json);
  if (!parsed || parsed.version !== 1 || !parsed.data) throw new Error("invalid bundle");
  return parsed as SyncBundle;
}

export interface MergeReport {
  patients: { added: number; updated: number; conflicts: number };
  consultations: { added: number; updated: number; conflicts: number };
  appointments: { added: number; updated: number; conflicts: number };
  documents: { added: number; updated: number; conflicts: number };
  users: { added: number; updated: number; conflicts: number };
}

function recTime(r: any): number {
  return new Date(r?.updatedAt || r?.editedAt || r?.createdAt || r?.date || 0).getTime();
}

function recTimeIso(r: any): string | undefined {
  return r?.updatedAt || r?.editedAt || r?.createdAt || r?.date;
}

/** Did the local record change after the remote's last-known sync point? If yes, it's a conflict. */
function isConflict(localRec: any, remoteRec: any, since: string | null): boolean {
  if (!localRec) return false;
  const localT = recTime(localRec);
  const remoteT = recTime(remoteRec);
  if (!localT || !remoteT) return false;
  // Same content? not a conflict.
  if (localT === remoteT) return false;
  const sinceT = since ? new Date(since).getTime() : 0;
  // Both sides edited after the last sync — true conflict.
  return localT > sinceT && remoteT > sinceT;
}

async function queueConflict(args: {
  resource: import("@/lib/db").SyncConflictResource;
  localId?: number;
  matchKey: string;
  localData: any;
  remoteData: any;
  label: string;
}): Promise<void> {
  // Avoid stacking duplicate pending conflicts for the same record
  const existing = await db.syncConflicts
    .where("matchKey").equals(args.matchKey)
    .and(c => c.resource === args.resource && c.status === "pending")
    .first();
  const payload = {
    resource: args.resource,
    localId: args.localId,
    matchKey: args.matchKey,
    localData: args.localData,
    remoteData: args.remoteData,
    label: args.label,
    localUpdatedAt: recTimeIso(args.localData),
    remoteUpdatedAt: recTimeIso(args.remoteData),
    detectedAt: new Date().toISOString(),
    status: "pending" as const,
  };
  if (existing) {
    await db.syncConflicts.update(existing.id!, payload);
  } else {
    await db.syncConflicts.add(payload);
  }
}

/** Merge a decrypted sync bundle into local IndexedDB.
 *  Last-modified wins, EXCEPT when both sides changed after `bundle.since`
 *  (true conflict) → both versions are queued for admin review and the
 *  local record is left untouched. */
export async function mergeSyncBundle(bundle: SyncBundle): Promise<MergeReport> {
  const since = bundle.since;
  const report: MergeReport = {
    patients: { added: 0, updated: 0, conflicts: 0 },
    consultations: { added: 0, updated: 0, conflicts: 0 },
    appointments: { added: 0, updated: 0, conflicts: 0 },
    documents: { added: 0, updated: 0, conflicts: 0 },
    users: { added: 0, updated: 0, conflicts: 0 },
  };

  // Patients
  for (const incoming of bundle.data.patients) {
    const existing = incoming.patientId
      ? await db.patients.where("patientId").equals(incoming.patientId).first()
      : null;
    const encrypted = await encryptPatientForSave({ ...incoming, id: undefined as any });
    if (!existing) {
      await db.patients.add({ ...(encrypted as Patient), id: undefined as any });
      report.patients.added++;
    } else if (isConflict(existing, incoming, since)) {
      await queueConflict({
        resource: "patient",
        localId: existing.id,
        matchKey: incoming.patientId,
        localData: existing,
        remoteData: incoming,
        label: `${incoming.firstName ?? ""} ${incoming.lastName ?? ""} (${incoming.patientId})`.trim(),
      });
      report.patients.conflicts++;
    } else if (recTime(incoming) > recTime(existing)) {
      await db.patients.update(existing.id!, { ...(encrypted as Patient), id: undefined as any });
      report.patients.updated++;
    }
  }

  // Consultations
  for (const incoming of bundle.data.consultations) {
    let existing: Consultation | undefined;
    if (incoming.originalId && incoming.versionNumber) {
      existing = await db.consultations
        .where("originalId").equals(incoming.originalId)
        .and(c => c.versionNumber === incoming.versionNumber)
        .first();
    }
    if (!existing) {
      await db.consultations.add({ ...incoming, id: undefined as any });
      report.consultations.added++;
    } else if (isConflict(existing, incoming, since)) {
      await queueConflict({
        resource: "consultation",
        localId: existing.id,
        matchKey: `${incoming.originalId ?? incoming.patientId}-${incoming.versionNumber ?? incoming.date}`,
        localData: existing,
        remoteData: incoming,
        label: `Consultation ${incoming.date}`,
      });
      report.consultations.conflicts++;
    } else if (recTime(incoming) > recTime(existing)) {
      await db.consultations.update(existing.id!, { ...incoming, id: undefined as any });
      report.consultations.updated++;
    }
  }

  // Appointments
  for (const incoming of bundle.data.appointments) {
    const existing = await db.appointments
      .where("patientId").equals(incoming.patientId)
      .and(a => a.date === incoming.date && a.time === incoming.time)
      .first();
    if (!existing) {
      await db.appointments.add({ ...incoming, id: undefined as any });
      report.appointments.added++;
    } else if (isConflict(existing, incoming, since)) {
      await queueConflict({
        resource: "appointment",
        localId: existing.id,
        matchKey: `${incoming.patientId}-${incoming.date}-${incoming.time}`,
        localData: existing,
        remoteData: incoming,
        label: `RDV ${incoming.date} ${incoming.time}`,
      });
      report.appointments.conflicts++;
    } else if (recTime(incoming) > recTime(existing)) {
      await db.appointments.update(existing.id!, { ...incoming, id: undefined as any });
      report.appointments.updated++;
    }
  }

  // Documents — match by patient+name+createdAt; documents are append-only so no conflict
  for (const incoming of bundle.data.documents) {
    const existing = await db.documents
      .where("patientId").equals(incoming.patientId)
      .and(d => d.name === incoming.name && d.createdAt === incoming.createdAt)
      .first();
    if (!existing) {
      await db.documents.add({ ...incoming, id: undefined as any });
      report.documents.added++;
    }
  }

  // Users
  for (const incoming of bundle.data.users) {
    const existing = await db.users
      .where("name").equals(incoming.name)
      .and(u => u.role === incoming.role)
      .first();
    if (!existing) {
      await db.users.add({ ...incoming, id: undefined as any });
      report.users.added++;
    } else if (isConflict(existing, incoming, since)) {
      await queueConflict({
        resource: "user",
        localId: existing.id,
        matchKey: `${incoming.name}-${incoming.role}`,
        localData: existing,
        remoteData: incoming,
        label: `${incoming.name} (${incoming.role})`,
      });
      report.users.conflicts++;
    } else if (recTime(incoming) > recTime(existing)) {
      await db.users.update(existing.id!, { ...incoming, id: undefined as any });
      report.users.updated++;
    }
  }

  return report;
}

/** Resolve a queued conflict by keeping one side, the other, or a manual merge. */
export async function resolveConflict(
  conflictId: number,
  choice: "local" | "remote" | "merged",
  resolvedBy: string,
  mergedData?: any,
): Promise<void> {
  const c = await db.syncConflicts.get(conflictId);
  if (!c) return;

  const apply = async (data: any) => {
    const stripId = { ...data, id: undefined as any };
    switch (c.resource) {
      case "patient": {
        const encrypted = await encryptPatientForSave(stripId);
        if (c.localId) await db.patients.update(c.localId, encrypted);
        break;
      }
      case "consultation":
        if (c.localId) await db.consultations.update(c.localId, stripId);
        break;
      case "appointment":
        if (c.localId) await db.appointments.update(c.localId, stripId);
        break;
      case "user":
        if (c.localId) await db.users.update(c.localId, stripId);
        break;
      case "payment":
        if (c.localId) await db.payments.update(c.localId, stripId);
        break;
    }
  };

  if (choice === "local") {
    // keep local — no change to data
  } else if (choice === "remote") {
    await apply(c.remoteData);
  } else if (choice === "merged" && mergedData) {
    await apply(mergedData);
  }

  await db.syncConflicts.update(conflictId, {
    status: choice === "local" ? "resolved_local" : choice === "remote" ? "resolved_remote" : "resolved_merged",
    resolvedAt: new Date().toISOString(),
    resolvedBy,
  });
}

