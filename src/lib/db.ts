import Dexie, { type Table } from "dexie";

export type UserRole = "admin" | "doctor" | "receptionist";
export type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "noshow";

export interface User {
  id?: number;
  name: string;
  role: UserRole;
  pinHash: string;
  active: boolean;
  /** Optional WhatsApp / phone number for doctor reminders */
  phone?: string;
  createdAt: string;
}

export interface Patient {
  id?: number;
  patientId: string;
  /** Anonymous shareable code, e.g. DL-2026-KRTM-047 */
  anonCode?: string;
  firstName: string;
  lastName: string;
  phone: string;
  dob: string;
  address: string;
  medicalAlerts: string;
  /** Optional profile photo as base64 data URL */
  photo?: string;
  createdAt: string;
  updatedAt: string;
}

/** Image attached to a consultation */
export type ConsultationImageType = "before" | "after" | "other" | "annotation";

export interface ConsultationImage {
  id: string;
  filename: string;
  /** base64 data URL */
  data: string;
  uploadedAt: string;
  caption?: string;
  /** before / after / other / annotation */
  imgType?: ConsultationImageType;
  /** id of the image this one is paired with (before<->after) */
  pairedWith?: string;
  /** id of the source image when this one is an annotation overlay */
  annotationOf?: string;
}

export interface Appointment {
  id?: number;
  patientId: number;
  doctorId: number;
  date: string;
  time: string;
  reason: string;
  status: AppointmentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Consultation {
  id?: number;
  patientId: number;
  doctorId: number;
  date: string;
  symptoms: string;
  diagnosis: string;
  treatmentPlan: string;
  prescription: string;
  notes: string;
  /** Images attached to this consultation */
  images?: ConsultationImage[];
  createdAt: string;
  parentId?: number;
  originalId?: number;
  isLatest?: boolean;
  versionNumber?: number;
  editedAt?: string;
  editedBy?: string;
}

export type DocumentTag = "lab" | "referral" | "xray" | "other";

export interface Document {
  id?: number;
  patientId: number;
  name: string;
  type: string;
  data: string; // base64
  size: number;
  /** Optional category tag */
  tag?: DocumentTag;
  createdAt: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type AuditEventType =
  | "login" | "login_fail" | "logout"
  | "patient_create" | "patient_update" | "patient_delete" | "patient_view"
  | "consult_create" | "consult_update" | "consult_delete" | "consult_view"
  | "prescription_print"
  | "appointment_create" | "appointment_update" | "appointment_delete"
  | "user_create" | "user_update" | "user_delete"
  | "backup_export" | "backup_import"
  | "wipe_secret_generated" | "wipe_secret_changed"
  | "master_pin_changed"
  | "audit_export";

export interface AuditLog {
  id?: number;
  timestamp: string;
  userName: string;
  type: AuditEventType;
  resource?: string;
  resourceId?: string;
  message?: string;
}

class DentaDB extends Dexie {
  users!: Table<User>;
  patients!: Table<Patient>;
  appointments!: Table<Appointment>;
  consultations!: Table<Consultation>;
  documents!: Table<Document>;
  auditLogs!: Table<AuditLog>;

  constructor() {
    super("DivineLinkDB");
    this.version(1).stores({
      users: "++id, name, role, pinHash",
      patients: "++id, patientId, firstName, lastName, phone",
      appointments: "++id, patientId, dentistId, date, status",
      consultations: "++id, patientId, dentistId, date",
      documents: "++id, patientId, name",
    });
    this.version(2).stores({
      users: "++id, name, role, pinHash",
      patients: "++id, patientId, firstName, lastName, phone",
      appointments: "++id, patientId, dentistId, date, status",
      consultations: "++id, patientId, dentistId, date, parentId, originalId, isLatest",
      documents: "++id, patientId, name",
    }).upgrade(tx => {
      return tx.table("consultations").toCollection().modify(c => {
        c.isLatest = true;
      });
    });
    this.version(3).stores({
      users: "++id, name, role, pinHash",
      patients: "++id, patientId, firstName, lastName, phone",
      appointments: "++id, patientId, doctorId, date, status",
      consultations: "++id, patientId, doctorId, date, parentId, originalId, isLatest",
      documents: "++id, patientId, name",
    }).upgrade(tx => {
      // Rename dentistId to doctorId
      tx.table("appointments").toCollection().modify(a => {
        if (a.dentistId !== undefined) {
          a.doctorId = a.dentistId;
          delete a.dentistId;
        }
      });
      tx.table("consultations").toCollection().modify(c => {
        if (c.dentistId !== undefined) {
          c.doctorId = c.dentistId;
          delete c.dentistId;
        }
        // Remove toothChart
        delete c.toothChart;
        // Add versionNumber to existing
        if (!c.versionNumber) c.versionNumber = 1;
      });
      // Rename dentist role to doctor
      tx.table("users").toCollection().modify(u => {
        if (u.role === "dentist") u.role = "doctor";
      });
    });
    // v4: add tag index for documents (for filtering)
    this.version(4).stores({
      users: "++id, name, role, pinHash",
      patients: "++id, patientId, firstName, lastName, phone",
      appointments: "++id, patientId, doctorId, date, status",
      consultations: "++id, patientId, doctorId, date, parentId, originalId, isLatest",
      documents: "++id, patientId, name, tag, createdAt",
    });
    // v5: audit log table
    this.version(5).stores({
      users: "++id, name, role, pinHash",
      patients: "++id, patientId, firstName, lastName, phone",
      appointments: "++id, patientId, doctorId, date, status",
      consultations: "++id, patientId, doctorId, date, parentId, originalId, isLatest",
      documents: "++id, patientId, name, tag, createdAt",
      auditLogs: "++id, timestamp, userName, type, resource",
    });
    // v6: anon patient code + doc updatedAt
    this.version(6).stores({
      users: "++id, name, role, pinHash",
      patients: "++id, patientId, anonCode, firstName, lastName, phone",
      appointments: "++id, patientId, doctorId, date, status",
      consultations: "++id, patientId, doctorId, date, parentId, originalId, isLatest",
      documents: "++id, patientId, name, tag, createdAt, updatedAt",
      auditLogs: "++id, timestamp, userName, type, resource",
    }).upgrade(async tx => {
      await tx.table("patients").toCollection().modify(p => {
        if (!p.anonCode) p.anonCode = generateAnonCodeSync();
      });
    });
  }
}

/** Synchronous anon code generator used at upgrade time. */
function generateAnonCodeSync(): string {
  const year = new Date().getFullYear();
  const letters = Array.from({ length: 4 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
  const digits = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  return `DL-${year}-${letters}-${digits}`;
}

export function generateAnonCode(): string {
  return generateAnonCodeSync();
}

export const db = new DentaDB();

// Hash PIN using simple SHA-256
export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + "dentacare-salt");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Generate next patient ID
export async function generatePatientId(): Promise<string> {
  const count = await db.patients.count();
  return `PAT-${String(count + 1).padStart(4, "0")}`;
}

// Seed default admin user
export async function seedDatabase() {
  const userCount = await db.users.count();
  if (userCount === 0) {
    const pin = await hashPin("1234");
    await db.users.add({
      name: "Admin",
      role: "admin",
      pinHash: pin,
      active: true,
      createdAt: new Date().toISOString(),
    });
  }
}
