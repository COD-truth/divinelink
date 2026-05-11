import Dexie, { type Table } from "dexie";

export type UserRole = "admin" | "doctor" | "receptionist";
export type AppointmentStatus = "scheduled" | "confirmed" | "arrived" | "in_consultation" | "completed" | "cancelled" | "noshow";

export interface User {
  id?: number;
  name: string;
  role: UserRole;
  pinHash: string;
  active: boolean;
  /** Optional WhatsApp / phone number for doctor reminders */
  phone?: string;
  clinicId?: string;
  createdAt: string;
}

export type AllergySeverity = "mild" | "moderate" | "severe" | "fatal";
export interface Allergy { name: string; severity: AllergySeverity; notes?: string }
export interface Vaccination { name: string; date?: string; notes?: string }
export interface Antecedents {
  allergies?: Allergy[];
  chronicDiseases?: string[];
  bloodType?: string;
  vaccinations?: Vaccination[];
  diabetic?: boolean;
  hypertensive?: boolean;
  smoker?: boolean;
  familyHistory?: string;
  surgeries?: string;
}

export interface Patient {
  id?: number;
  patientId: string;
  /** Anonymous shareable code */
  anonCode?: string;
  firstName: string;
  lastName: string;
  phone: string;
  dob: string;
  /** Optional explicit age in years (when DOB unknown) */
  ageYears?: number;
  address: string;
  medicalAlerts: string;
  /** Optional profile photo as base64 data URL */
  photo?: string;
  antecedents?: Antecedents;
  clinicId?: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentStatus = "paid" | "partial" | "unpaid";
export type PaymentMethod = "cash" | "mtn_momo" | "orange_money" | "other";
export interface PaymentInstallment {
  id: string;
  amount: number;
  date: string;
  /** Alias for date — when the installment was paid */
  paidAt?: string;
  method: PaymentMethod;
  notes?: string;
}
export interface Payment {
  id?: number;
  patientId: number;
  consultationId?: number;
  /** Free label / description (e.g. "Consultation 12/05") */
  label?: string;
  amountDue: number;
  amountPaid: number;
  /** Outstanding balance (auto-maintained) */
  balance?: number;
  status: PaymentStatus;
  method: PaymentMethod;
  /** Optional due date for unpaid balances */
  dueDate?: string;
  /** Timestamp when fully paid */
  paidAt?: string;
  /** Optional payment installments history */
  installments?: PaymentInstallment[];
  notes?: string;
  clinicId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VitalSigns {
  bp?: string;       // Tension e.g. "120/80"
  temperature?: number; // °C
  weight?: number;   // kg
  height?: number;   // cm
  bmi?: number;      // auto
  pulse?: number;    // bpm
  spo2?: number;     // %
  respRate?: number; // /min
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

export type ReminderOffset = "15min" | "30min" | "1h" | "1day";

export interface Appointment {
  id?: number;
  patientId: number;
  doctorId: number;
  date: string;
  time: string;
  reason: string;
  status: AppointmentStatus;
  reminder?: boolean;
  reminderOffset?: ReminderOffset;
  clinicId?: string;
  createdAt: string;
  updatedAt: string;
}

export type ConsultationType = "general" | "dental";

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
  /** Vital signs taken at consultation */
  vitals?: VitalSigns;
  /** Images attached to this consultation */
  images?: ConsultationImage[];
  /** Consultation type for dental module */
  consultType?: ConsultationType;
  /** Structured medical observation (free-form JSON blob) */
  observation?: any;
  /** Template used */
  template?: string;
  /** Dental record (when consultType = dental) */
  dental?: DentalRecord;
  clinicId?: string;
  createdAt: string;
  parentId?: number;
  originalId?: number;
  isLatest?: boolean;
  versionNumber?: number;
  editedAt?: string;
  editedBy?: string;
}

/* Dental module types */
export type ToothCondition = "healthy" | "decayed" | "missing" | "crowned" | "filled" | "fractured" | "to_extract" | "mobile";
export type DentalTreatment = "filling_amalgam" | "filling_composite" | "filling_gi" | "pulpectomy" | "extraction_simple" | "extraction_surgical" | "crown" | "scaling" | "root_canal" | "other";
export type DentalMaterial = "amalgam" | "composite" | "gi" | "ceramic" | "gold";

export interface ToothRecord {
  number: number;
  condition: ToothCondition;
  treatmentDone?: DentalTreatment;
  material?: DentalMaterial;
  notes?: string;
}

export interface DentalRecord {
  teeth: ToothRecord[];
  /** Periodontal data (simplified for MVP) */
  bleeding?: boolean;
  pocketDepth?: string;
  recession?: string;
  mobility?: 0 | 1 | 2 | 3;
  plaqueIndex?: number;
  gingivalIndex?: number;
  /** Clinical form */
  motif?: string;
  painType?: string;
  painIntensity?: number;
  painDuration?: string;
  findings?: string;
  dentalDiagnosis?: string;
  treatmentPlan?: string;
  treatmentDone?: string;
  nextAppointment?: string;
}

/* Pharmacy types */
export type DrugStatus = "in_stock" | "low" | "out" | "expiring_soon";
export type TransactionType = "in" | "out";

export interface Drug {
  id?: number;
  name: string;
  category: string;
  stock: number;
  unit: string;
  buyPrice: number;
  sellPrice: number;
  expiration?: string;
  minStock: number;
  supplier?: string;
  /** Batch / lot number */
  batchNumber?: string;
  /** Storage location e.g. shelf A2 */
  location?: string;
  /** Initial stock at creation (for analytics) */
  initialStock?: number;
  status: DrugStatus;
  clinicId?: string;
  createdAt: string;
  updatedAt: string;
}

export type DispenseReason = "dispensed" | "expired" | "damaged" | "transferred" | "other";

export interface DrugTransaction {
  id?: number;
  drugId: number;
  type: TransactionType;
  quantity: number;
  price: number;
  patientId?: number;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  reason?: DispenseReason;
  batchNumber?: string;
  stockBefore?: number;
  stockAfter?: number;
  performedBy?: string;
  notes?: string;
  clinicId?: string;
  createdAt: string;
}

/* Document generation types */
export type DocGenType = "prescription" | "cert_medical" | "cert_rest" | "cert_aptitude" | "referral" | "consent" | "patient_export";

export interface GeneratedDoc {
  id?: number;
  type: DocGenType;
  patientId: number;
  consultationId?: number;
  number: string;
  data: string;
  clinicId?: string;
  createdAt: string;
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
  clinicId?: string;
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
  payments!: Table<Payment>;
  drugs!: Table<Drug>;
  drugTransactions!: Table<DrugTransaction>;
  generatedDocs!: Table<GeneratedDoc>;

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
    // v7: add clinicId to all tables, stamp existing records with bootstrap clinicId
    this.version(7).stores({
      users: "++id, name, role, pinHash, clinicId",
      patients: "++id, patientId, anonCode, firstName, lastName, phone, clinicId",
      appointments: "++id, patientId, doctorId, date, status, clinicId",
      consultations: "++id, patientId, doctorId, date, parentId, originalId, isLatest, clinicId",
      documents: "++id, patientId, name, tag, createdAt, updatedAt, clinicId",
      auditLogs: "++id, timestamp, userName, type, resource",
    }).upgrade(async tx => {
      const cid = (() => {
        try {
          const cached = localStorage.getItem("divinelink.clinicId");
          if (cached) return cached;
          const letters = Array.from({ length: 4 }, () =>
            String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
          const id = `CLINIC-GEN-${letters}-${new Date().getFullYear()}`;
          localStorage.setItem("divinelink.clinicId", id);
          return id;
        } catch { return "CLINIC-DEFAULT"; }
      })();
      const stamp = (rec: any) => { if (!rec.clinicId) rec.clinicId = cid; };
      await tx.table("users").toCollection().modify(stamp);
      await tx.table("patients").toCollection().modify(stamp);
      await tx.table("appointments").toCollection().modify(stamp);
      await tx.table("consultations").toCollection().modify(stamp);
      await tx.table("documents").toCollection().modify(stamp);
    });
    // v8: payments table + patient antecedents/ageYears (no schema change for nested fields)
    this.version(8).stores({
      users: "++id, name, role, pinHash, clinicId",
      patients: "++id, patientId, anonCode, firstName, lastName, phone, clinicId",
      appointments: "++id, patientId, doctorId, date, status, clinicId",
      consultations: "++id, patientId, doctorId, date, parentId, originalId, isLatest, clinicId",
      documents: "++id, patientId, name, tag, createdAt, updatedAt, clinicId",
      auditLogs: "++id, timestamp, userName, type, resource",
      payments: "++id, patientId, consultationId, status, createdAt, clinicId",
    });
    // v9: pharmacy (drugs, drugTransactions), generated docs, dental fields on consultation
    this.version(9).stores({
      users: "++id, name, role, pinHash, clinicId",
      patients: "++id, patientId, anonCode, firstName, lastName, phone, clinicId",
      appointments: "++id, patientId, doctorId, date, status, clinicId",
      consultations: "++id, patientId, doctorId, date, parentId, originalId, isLatest, clinicId",
      documents: "++id, patientId, name, tag, createdAt, updatedAt, clinicId",
      auditLogs: "++id, timestamp, userName, type, resource",
      payments: "++id, patientId, consultationId, status, createdAt, clinicId",
      drugs: "++id, name, category, status, clinicId",
      drugTransactions: "++id, drugId, type, patientId, createdAt, clinicId",
      generatedDocs: "++id, type, patientId, createdAt, clinicId",
    }).upgrade(async tx => {
      // Add consultType to existing consultations (default: general)
      await tx.table("consultations").toCollection().modify(c => {
        if (!c.consultType) c.consultType = "general";
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
