import { beforeEach, describe, expect, it } from "vitest";
import { db, type Appointment, type Consultation, type Patient, type User } from "@/lib/db";
import { decryptPatient } from "@/lib/patientCrypto";
import { isEncrypted } from "@/lib/crypto";
import {
  buildSyncBundle, decryptSyncBundle, encryptSyncBundle, mergeSyncBundle, resolveConflict,
  type SyncBundle,
} from "@/lib/sync";

const T0 = "2026-01-01T08:00:00.000Z"; // record created
const T1 = "2026-01-02T08:00:00.000Z"; // last sync point
const T2 = "2026-01-03T08:00:00.000Z"; // edit after the sync point
const T3 = "2026-01-04T08:00:00.000Z"; // a later edit

function patient(over: Partial<Patient> = {}): Patient {
  return {
    patientId: "PAT-0001", firstName: "Awa", lastName: "Ngono",
    phone: "677000001", dob: "1990-05-01", address: "Bastos", medicalAlerts: "",
    createdAt: T0, updatedAt: T0, ...over,
  } as Patient;
}

function consultation(over: Partial<Consultation> = {}): Consultation {
  return {
    patientId: 1, doctorId: 1, date: "2026-01-01",
    symptoms: "fever", diagnosis: "malaria", treatmentPlan: "", prescription: "", notes: "",
    createdAt: T0, originalId: 1, versionNumber: 1, isLatest: true, ...over,
  } as Consultation;
}

function appointment(over: Partial<Appointment> = {}): Appointment {
  return {
    patientId: 1, doctorId: 1, date: "2026-02-01", time: "09:00",
    reason: "check-up", status: "scheduled", createdAt: T0, updatedAt: T0, ...over,
  };
}

function user(over: Partial<User> = {}): User {
  return { name: "Dr Fotso", role: "doctor", pinHash: "x", active: true, createdAt: T0, ...over };
}

function bundle(data: Partial<SyncBundle["data"]>, since: string | null = T1): SyncBundle {
  const full = { patients: [], consultations: [], appointments: [], documents: [], users: [], ...data };
  return {
    version: 1,
    generatedAt: T3,
    since,
    counts: {
      patients: full.patients.length, consultations: full.consultations.length,
      appointments: full.appointments.length, documents: full.documents.length, users: full.users.length,
    },
    data: full,
  };
}

beforeEach(async () => {
  await Promise.all([
    db.patients.clear(), db.consultations.clear(), db.appointments.clear(),
    db.documents.clear(), db.users.clear(), db.syncConflicts.clear(),
  ]);
});

describe("mergeSyncBundle", () => {
  it("adds records that do not exist locally", async () => {
    const report = await mergeSyncBundle(bundle({
      patients: [patient({ id: 7 })],
      users: [user({ id: 3 })],
    }));

    expect(report.patients).toEqual({ added: 1, updated: 0, conflicts: 0 });
    expect(report.users).toEqual({ added: 1, updated: 0, conflicts: 0 });
    expect(await db.patients.count()).toBe(1);
    expect(await db.users.count()).toBe(1);
  });

  it("stores imported sensitive fields encrypted and readable", async () => {
    await mergeSyncBundle(bundle({ patients: [patient({ medicalAlerts: "penicillin" })] }));

    const stored = (await db.patients.toArray())[0];
    expect(isEncrypted(stored.phone)).toBe(true);
    expect(isEncrypted(stored.medicalAlerts)).toBe(true);
    const plain = await decryptPatient(stored);
    expect(plain.phone).toBe("677000001");
    expect(plain.medicalAlerts).toBe("penicillin");
  });

  it("keeps the patient's id when an import updates it, so linked records stay attached", async () => {
    const localId = await db.patients.add(patient());
    await db.consultations.add(consultation({ patientId: localId as number }));
    await db.appointments.add(appointment({ patientId: localId as number }));

    // The other device knows this patient under a different numeric id.
    const report = await mergeSyncBundle(bundle({
      patients: [patient({ id: 42, firstName: "Awa Marie", updatedAt: T2 })],
    }));

    expect(report.patients).toEqual({ added: 0, updated: 1, conflicts: 0 });
    const all = await db.patients.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(localId);
    expect(all[0].firstName).toBe("Awa Marie");

    const linked = await db.consultations.where("patientId").equals(localId as number).first();
    expect(await db.patients.get(linked!.patientId)).toBeDefined();
    const appt = await db.appointments.where("patientId").equals(localId as number).first();
    expect(await db.patients.get(appt!.patientId)).toBeDefined();
  });

  it("keeps consultation, appointment and user ids when an import updates them", async () => {
    const pid = (await db.patients.add(patient())) as number;
    const cid = await db.consultations.add(consultation({ patientId: pid, originalId: 9 }));
    const aid = await db.appointments.add(appointment({ patientId: pid }));
    const uid = await db.users.add(user());

    const report = await mergeSyncBundle(bundle({
      consultations: [consultation({ id: 77, patientId: pid, originalId: 9, diagnosis: "typhoid", editedAt: T2 })],
      appointments: [appointment({ id: 78, patientId: pid, status: "confirmed", updatedAt: T2 })],
      users: [user({ id: 79, phone: "699111222", createdAt: T2 })],
    }));

    expect(report.consultations.updated).toBe(1);
    expect(report.appointments.updated).toBe(1);
    expect(report.users.updated).toBe(1);

    expect((await db.consultations.get(cid))?.diagnosis).toBe("typhoid");
    expect((await db.appointments.get(aid))?.status).toBe("confirmed");
    expect((await db.users.get(uid))?.phone).toBe("699111222");
    expect(await db.consultations.count()).toBe(1);
    expect(await db.appointments.count()).toBe(1);
    expect(await db.users.count()).toBe(1);
  });

  it("does not duplicate or change anything when the same bundle is imported twice", async () => {
    const b = bundle({ patients: [patient({ id: 5 })], users: [user({ id: 6 })] });
    await mergeSyncBundle(b);
    const before = await db.patients.toArray();

    const report = await mergeSyncBundle(b);

    expect(report.patients).toEqual({ added: 0, updated: 0, conflicts: 0 });
    expect(report.users).toEqual({ added: 0, updated: 0, conflicts: 0 });
    expect(await db.patients.toArray()).toEqual(before);
  });

  it("ignores an incoming record that is older than the local one", async () => {
    const localId = await db.patients.add(patient({ firstName: "Local", updatedAt: T3 }));

    const report = await mergeSyncBundle(bundle(
      { patients: [patient({ firstName: "Stale", updatedAt: T0 })] },
      T3,
    ));

    expect(report.patients).toEqual({ added: 0, updated: 0, conflicts: 0 });
    expect((await db.patients.get(localId))?.firstName).toBe("Local");
  });

  it("queues a conflict and leaves the local record alone when both sides changed since the last sync", async () => {
    const localId = await db.patients.add(patient({ firstName: "Local edit", updatedAt: T2 }));

    const report = await mergeSyncBundle(bundle({
      patients: [patient({ id: 42, firstName: "Remote edit", updatedAt: T3 })],
    }));

    expect(report.patients).toEqual({ added: 0, updated: 0, conflicts: 1 });
    expect((await db.patients.get(localId))?.firstName).toBe("Local edit");
    const conflicts = await db.syncConflicts.toArray();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ resource: "patient", localId, matchKey: "PAT-0001", status: "pending" });
  });

  it("does not stack a second pending conflict for the same record", async () => {
    await db.patients.add(patient({ firstName: "Local edit", updatedAt: T2 }));
    const b = bundle({ patients: [patient({ firstName: "Remote edit", updatedAt: T3 })] });

    await mergeSyncBundle(b);
    await mergeSyncBundle(b);

    expect(await db.syncConflicts.count()).toBe(1);
  });
});

describe("resolveConflict", () => {
  async function seedConflict() {
    const localId = (await db.patients.add(patient({ firstName: "Local edit", updatedAt: T2 }))) as number;
    await db.consultations.add(consultation({ patientId: localId }));
    await mergeSyncBundle(bundle({
      patients: [patient({ id: 42, firstName: "Remote edit", phone: "699999999", updatedAt: T3 })],
    }));
    const conflict = (await db.syncConflicts.toArray())[0];
    return { localId, conflictId: conflict.id! };
  }

  it("applies the remote version without changing the patient's id", async () => {
    const { localId, conflictId } = await seedConflict();

    await resolveConflict(conflictId, "remote", "admin");

    const all = await db.patients.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(localId);
    expect(all[0].firstName).toBe("Remote edit");
    expect((await decryptPatient(all[0])).phone).toBe("699999999");
    const linked = await db.consultations.where("patientId").equals(localId).first();
    expect(linked).toBeDefined();
    expect(await db.syncConflicts.get(conflictId)).toMatchObject({ status: "resolved_remote", resolvedBy: "admin" });
  });

  it("applies a manual merge without changing the patient's id", async () => {
    const { localId, conflictId } = await seedConflict();

    await resolveConflict(conflictId, "merged", "admin", patient({ id: 42, firstName: "Merged", updatedAt: T3 }));

    const stored = await db.patients.get(localId);
    expect(stored?.firstName).toBe("Merged");
    expect(await db.patients.count()).toBe(1);
    expect((await db.syncConflicts.get(conflictId))?.status).toBe("resolved_merged");
  });

  it("keeps the local version when asked to", async () => {
    const { localId, conflictId } = await seedConflict();

    await resolveConflict(conflictId, "local", "admin");

    expect((await db.patients.get(localId))?.firstName).toBe("Local edit");
    expect((await db.syncConflicts.get(conflictId))?.status).toBe("resolved_local");
  });
});

describe("sync bundle file", () => {
  it("round-trips through encryption with the right passphrase", () => {
    const b = bundle({ patients: [patient({ id: 1 })] });
    const cipher = encryptSyncBundle(b, "4321");

    expect(cipher).not.toContain("Ngono");
    expect(decryptSyncBundle(cipher, "4321")).toEqual(b);
  });

  it("rejects a wrong passphrase", () => {
    const cipher = encryptSyncBundle(bundle({}), "4321");
    expect(() => decryptSyncBundle(cipher, "0000")).toThrow();
  });

  it("rejects content that is not a version 1 bundle", () => {
    const cipher = encryptSyncBundle({ version: 2, data: {} } as unknown as SyncBundle, "4321");
    expect(() => decryptSyncBundle(cipher, "4321")).toThrow("invalid bundle");
  });

  it("exports patients with sensitive fields decrypted so another device can read them", async () => {
    await mergeSyncBundle(bundle({ patients: [patient()] }));
    localStorage.removeItem("dl.sync.lastExport.v1");

    const out = await buildSyncBundle();

    expect(out.counts.patients).toBe(1);
    expect(out.data.patients[0].phone).toBe("677000001");
    expect(out.data.patients[0].address).toBe("Bastos");
  });
});
