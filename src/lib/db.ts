import Dexie, { type Table } from "dexie";

export type UserRole = "admin" | "dentist" | "receptionist";
export type ToothCondition = "healthy" | "caries" | "filled" | "extracted" | "crown";
export type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "noshow";

export interface User {
  id?: number;
  name: string;
  role: UserRole;
  pinHash: string;
  active: boolean;
  createdAt: string;
}

export interface Patient {
  id?: number;
  patientId: string;
  firstName: string;
  lastName: string;
  phone: string;
  dob: string;
  address: string;
  medicalAlerts: string;
  createdAt: string;
  updatedAt: string;
}

export interface Appointment {
  id?: number;
  patientId: number;
  dentistId: number;
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
  dentistId: number;
  date: string;
  symptoms: string;
  diagnosis: string;
  treatmentPlan: string;
  prescription: string;
  notes: string;
  toothChart: Record<string, ToothCondition>;
  createdAt: string;
}

export interface Document {
  id?: number;
  patientId: number;
  name: string;
  type: string;
  data: string; // base64
  size: number;
  createdAt: string;
}

class DentaDB extends Dexie {
  users!: Table<User>;
  patients!: Table<Patient>;
  appointments!: Table<Appointment>;
  consultations!: Table<Consultation>;
  documents!: Table<Document>;

  constructor() {
    super("DivineLinkDB");
    this.version(1).stores({
      users: "++id, name, role, pinHash",
      patients: "++id, patientId, firstName, lastName, phone",
      appointments: "++id, patientId, dentistId, date, status",
      consultations: "++id, patientId, dentistId, date",
      documents: "++id, patientId, name",
    });
  }
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
