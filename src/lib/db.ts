import Dexie, { type Table } from "dexie";

export interface Ward {
  id?: number;
  name: string;
  description?: string;
  clinicId?: string;
  createdAt: string;
}

export interface Bed {
  id?: number;
  wardId: number;
  label: string;
  status: "available" | "occupied" | "maintenance";
  clinicId?: string;
  createdAt: string;
}

export type AdmissionStatus = "active" | "discharged";
export interface Admission {
  id?: number;
  patientId: number;
  wardId: number;
  bedId: number;
  admittedAt: string;
  admittedBy?: string;
  reason: string;
  diagnosis?: string;
  status: AdmissionStatus;
  dischargedAt?: string;
  dischargeSummary?: string;
  clinicId?: string;
}

export interface CareNote {
  id?: number;
  admissionId: number;
  patientId: number;
  authorName: string;
  authorRole?: string;
  note: string;
  vitals?: { bp?: string; pulse?: string; temp?: string; spo2?: string };
  createdAt: string;
  clinicId?: string;
}


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
  /** External clinic ID (from Excel import) */
  externalId?: string;
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
  method: PaymentMethod;
  paidAt: string;
  receivedBy?: string;
  notes?: string;
}

export interface Payment {
  id?: number;
  patientId: number;
  consultationId?: number;
  label?: string;
  amountDue: number;
  amountPaid: number;
  balance?: number;
  status: PaymentStatus;
  method: PaymentMethod;
  paidAt?: string;
  dueDate?: string;
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

export type ConsultationType = "general" | "dental" | "orthodontic" | "prosthesis" | "other";

export interface ProsthesisRecord {
  type?: string;
  teeth?: string;
  material?: string;
  shade?: string;
  impressionDate?: string;
  impressionMethod?: string;
  steps?: { empreinte?: boolean; essayage?: boolean; pose?: boolean; controle?: boolean };
  lab?: string;
  estimatedCost?: number;
  notes?: string;
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
  /** Vital signs taken at consultation */
  vitals?: VitalSigns;
  /** Images attached to this consultation */
  images?: ConsultationImage[];
  /** Consultation type for dental module */
  consultType?: ConsultationType;
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
  /** Clinical history sections */
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  medicalHistory?: string;
  dentalHistory?: string;
  reviewOfSystems?: string;
  generalExam?: string;
  anthropometric?: { weight?: number; height?: number; bmi?: number };
  /** Short dental exam fields */
  oralFindings?: string;
  dentalCheckboxes?: {
    caries?: boolean;
    missingTeeth?: boolean;
    mobility?: boolean;
    pocketDepth?: boolean;
    prosthetics?: boolean;
    orthodonticAppliances?: boolean;
  };
  /** Observation template used for this consultation */
  templateId?: number;
  /** Custom fields filled in from the template (id -> value) */
  customFields?: Record<string, any>;
  /** Prosthesis details (when consultType = prosthesis) */
  prosthesis?: ProsthesisRecord;
}

/* ── Observation templates ── */
export type TemplateSpecialty = "general" | "dental" | "orthodontic" | "other";
export type TemplateFieldType =
  | "short_text" | "long_text" | "checkbox" | "select" | "vitals" | "anthropometric";

export interface TemplateField {
  id: string;
  type: TemplateFieldType;
  label: string;
  required?: boolean;
  options?: string[];
}

export interface ConsultationTemplate {
  id?: number;
  name: string;
  specialty: TemplateSpecialty;
  fieldsDefinition: TemplateField[];
  active: boolean;
  /** True for templates seeded by the app (Template A/B/C). Protected from deletion. */
  builtin?: boolean;
  /** Stable code for built-in templates: "general" | "dental" | "orthodontic" */
  builtinCode?: "general" | "dental" | "orthodontic";
  clinicId?: string;
  createdAt: string;
  updatedAt: string;
}

/* ── Imported Word documents (from clinic Excel/Word migration) ── */
export interface ImportedDocument {
  id?: number;
  patientId: number;
  filename: string;
  mimeType: string;
  /** base64 data URL (so it can be backed up with the rest) */
  data: string;
  size: number;
  source: "import" | "manual";
  convertedConsultationId?: number;
  clinicId?: string;
  uploadedAt: string;
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
export type ExitReason = "dispensed" | "expired" | "damaged" | "transferred" | "other";

export interface Drug {
  id?: number;
  name: string;
  category: string;
  stock: number;
  initialStock?: number;
  unit: string;
  buyPrice: number;
  sellPrice: number;
  expiration?: string;
  minStock: number;
  supplier?: string;
  batchNumber?: string;
  location?: string;
  status: DrugStatus;
  clinicId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DrugTransaction {
  id?: number;
  drugId: number;
  type: TransactionType;
  quantity: number;
  price: number;
  patientId?: number;
  paymentStatus?: PaymentStatus;
  exitReason?: ExitReason;
  batchNumber?: string;
  performedBy?: string;
  stockBefore?: number;
  stockAfter?: number;
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

export type DocumentSource =
  | "carnet_capture"
  | "registration_upload"
  | "consultation_upload"
  | "word_import"
  | "import";

export interface Document {
  id?: number;
  patientId: number;
  name: string;
  type: string;
  data: string; // base64
  size: number;
  /** Optional category tag */
  tag?: DocumentTag;
  /** Optional treatment category (e.g. "dental", "ortho", "cardio", "lab"...) */
  treatmentCategory?: string;
  /** Optional provenance / how this doc entered the system */
  source?: DocumentSource;
  /** Optional link to a consultation record */
  consultId?: number;
  clinicId?: string;
  createdAt: string;
  updatedAt?: string;
  updatedBy?: string;
}

/** Generic per-device UI preference store (specialty order/visibility, etc.) */
export interface UiPreference {
  key: string;
  value: any;
  updatedAt: string;
}

export interface EquipmentItem {
  id?: number;
  name: string;
  stock: number;
  lowStockThreshold: number;
  priority?: number;
  /** Optional unit (e.g. "boîte", "kit", "unité") */
  unit?: string;
  /** Optional box/category this item belongs to */
  boxId?: number;
  clinicId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EquipmentBox {
  id?: number;
  label: string;
  order?: number;
  clinicId?: string;
  createdAt: string;
  updatedAt: string;
}

/* ── Staff / Identity ── */
export interface StaffMember {
  id?: number;
  clinicId?: string;
  fullName: string;
  role: string;
  linkedUserId?: number;
  photo?: string;
  dob?: string;
  phone?: string;
  specialty?: string;
  license?: string;
  staffCode: string;
  active?: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ── Doctor's private space ── */
export interface PrivateNote {
  id?: number;
  clinicId?: string;
  ownerUserId: number;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrivateDoc {
  id?: number;
  clinicId?: string;
  ownerUserId: number;
  name: string;
  mime: string;
  data: string;
  size: number;
  createdAt: string;
}

export interface QuickTemplate {
  id?: number;
  clinicId?: string;
  ownerUserId: number;
  label: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

/* ── Custom document categories (admin-managed) ── */
export interface CustomCategory {
  id?: number;
  clinicId?: string;
  value: string;
  fr: string;
  en: string;
  createdAt: string;
}

export interface EquipmentMovement {
  id?: number;
  itemId: number;
  itemName: string;
  quantityChange: number;
  newStock: number;
  reason: string;
  patientId?: number;
  userName: string;
  clinicId?: string;
  createdAt: string;
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
  | "audit_export"
  | "payment_create" | "payment_update" | "payment_delete" | "payment_installment"
  | "drug_create" | "drug_update" | "drug_delete"
  | "drug_receive" | "drug_dispense";

export interface AuditLog {
  id?: number;
  timestamp: string;
  userName: string;
  type: AuditEventType;
  resource?: string;
  resourceId?: string;
  message?: string;
}

/* ── Sync conflict review (when two devices edit the same record offline) ── */
export type SyncConflictResource =
  | "patient" | "consultation" | "appointment" | "document" | "user" | "payment";
export type SyncConflictStatus = "pending" | "resolved_local" | "resolved_remote" | "resolved_merged";

export interface SyncConflict {
  id?: number;
  resource: SyncConflictResource;
  localId?: number;
  matchKey: string;
  localData: any;
  remoteData: any;
  label: string;
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
  detectedAt: string;
  status: SyncConflictStatus;
  resolvedAt?: string;
  resolvedBy?: string;
  clinicId?: string;
}

/* ── Survey module ── */
export type SurveyQuestionType =
  | "short_text" | "long_text" | "single_choice" | "multi_choice"
  | "rating" | "date" | "file" | "voice";

export interface SurveyQuestion {
  id: string;
  type: SurveyQuestionType;
  text: string;
  helpText?: string;
  required?: boolean;
  options?: string[];
  /** For rating: max value (e.g. 5 or 10) */
  ratingMax?: number;
  /** Allow voice note attachment on this question */
  allowVoice?: boolean;
  randomize?: boolean;
}

export type SurveyStatus = "draft" | "active" | "closed";

export interface Survey {
  id?: number;
  clinicId?: string;
  title: string;
  description?: string;
  surveyType?: string;
  /** Public short code used in QR / share URL */
  inviteCode: string;
  questions: SurveyQuestion[];
  status: SurveyStatus;
  anonymous?: boolean;
  createdBy?: number;
  createdAt: string;
  updatedAt: string;
  distributedAt?: string;
  closedAt?: string;
  /** Server-side ID after sync */
  serverId?: string;
  synced?: boolean;
}

export interface SurveyResponse {
  id?: number;
  surveyId: number;
  /** Optional respondent metadata */
  respondentName?: string;
  respondentPhone?: string;
  respondentId?: number;
  clinicId?: string;
  /** questionId -> value (string | string[] | number | dataUrl) */
  answers: Record<string, any>;
  startedAt: string;
  completedAt?: string;
  synced?: boolean;
  syncedAt?: string;
}

export interface SurveyInvite {
  id?: number;
  surveyId: number;
  email?: string;
  phone?: string;
  name?: string;
  status: "pending" | "opened" | "completed";
  sentAt: string;
  openedAt?: string;
  completedAt?: string;
  clinicId?: string;
}

export interface VoiceRecording {
  id?: number;
  responseId: number;
  questionId: string;
  /** webm blob */
  blob: Blob;
  /** local Web Speech transcript */
  transcript?: string;
  /** server (Deepgram) transcript, replaces local when available */
  serverTranscript?: string;
  /** admin-edited override */
  manualTranscript?: string;
  durationSeconds?: number;
  createdAt: string;
  synced?: boolean;
}

function ORTHODONTIC_DEFAULTS(now: string): Omit<Drug, "id">[] {
  const item = (name: string, category: string, stock: number, unit: string, minStock: number): Omit<Drug, "id"> => ({
    name, category, stock, initialStock: stock, unit,
    buyPrice: 0, sellPrice: 0, minStock,
    status: stock <= 0 ? "out" : stock <= minStock ? "low" : "in_stock",
    createdAt: now, updatedAt: now,
  });
  return [
    // ── Orthodontic consumables ─────────────────────────────────────────
    item("Brackets métal standard (Kit)", "Consommable ortho", 20, "kit", 5),
    item("Brackets céramique (Kit)", "Consommable ortho", 10, "kit", 3),
    item("Archwires NiTi (paquet 10)", "Consommable ortho", 15, "pkt", 5),
    item("Archwires acier (paquet 10)", "Consommable ortho", 15, "pkt", 5),
    item("Élastiques orthodontiques (poche 100)", "Consommable ortho", 30, "poche", 10),
    item("Bandes ortho (boîte 10)", "Consommable ortho", 20, "boîte", 5),
    item("Tubes buccaux (boîte 20)", "Consommable ortho", 10, "boîte", 3),
    item("Fils ligatures acier (rouleau)", "Consommable ortho", 10, "rouleau", 3),
    item("Séparateurs ortho (poche 100)", "Consommable ortho", 20, "poche", 5),
    item("Brosses/brossettes ortho (boîte)", "Consommable ortho", 15, "boîte", 5),
    item("Aligneurs blanchiment (poche)", "Consommable ortho", 10, "poche", 3),
    item("Fourre-tout ortho", "Consommable ortho", 10, "unité", 3),
    item("Seringue d'irrigation (unité)", "Consommable ortho", 25, "unité", 10),
    item("Localisateur d'apex (unité)", "Consommable ortho", 5, "unité", 2),
    item("Rouleaux salivaires (paquet)", "Consommable ortho", 20, "paquet", 5),
    // ── Infection control & PPE ─────────────────────────────────────────
    item("Masques chirurgicaux (boîte 50)", "Contrôle infection", 10, "boîte", 3),
    item("Gants latex (boîte 100)", "Contrôle infection", 10, "boîte", 3),
    item("Compresses stériles (paquet)", "Contrôle infection", 20, "paquet", 5),
    item("Blouses à usage unique", "Contrôle infection", 20, "unité", 5),
    item("Sabots de protection", "Contrôle infection", 10, "paire", 3),
    item("Mouchoirs/charlottes (paquet)", "Contrôle infection", 15, "paquet", 5),
    item("Sacs poubelles/canules (rouleau)", "Contrôle infection", 10, "rouleau", 3),
    item("Tablier de plomb", "Contrôle infection", 3, "unité", 1),
    item("Bavette/champ stérile (paquet)", "Contrôle infection", 10, "paquet", 3),
    item("Solution désinfectante surfaces (L)", "Contrôle infection", 5, "litre", 2),
    item("Désinfectant mains (flacon 500 ml)", "Contrôle infection", 8, "flacon", 2),
  ];
}

export const EQUIPMENT_LIST: string[] = [
  "Brosses/brossettes ortho",
  "Blouses/urgences",
  "Sabots",
  "Mouchoirs-charlottes",
  "Rouleaux salivaires",
  "Sacs poubelles-canules",
  "Aligneurs blanchiment",
  "Tablier de plomb",
  "Masque",
  "Consommable ortho",
  "Fourre-tout",
  "Gants-compresse",
  "Seringue d'irrigation",
  "Localisation d'apex",
  "Bandes orthodontiques",
  "Boîtiers/brackets métal",
  "Boîtiers/brackets céramique",
  "Fils orthodontiques NiTi",
  "Fils orthodontiques acier",
  "Élastiques/chaînes élastiques",
  "Bagues/anneaux",
  "Tubes molaires",
  "Boutons",
  "Ressorts",
  "Ligatures élastiques et métalliques",
  "Séparateurs",
  "Matériel de contention (fils, gaines, colle)",
  "Ciments orthodontiques",
  "Colles pour brackets",
];

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
  equipmentItems!: Table<EquipmentItem>;
  equipmentMovements!: Table<EquipmentMovement>;
  consultationTemplates!: Table<ConsultationTemplate>;
  importedDocuments!: Table<ImportedDocument>;
  syncConflicts!: Table<SyncConflict>;
  surveys!: Table<Survey>;
  surveyResponses!: Table<SurveyResponse>;
  surveyInvites!: Table<SurveyInvite>;
  voiceRecordings!: Table<VoiceRecording>;
  equipmentBoxes!: Table<EquipmentBox>;
  uiPreferences!: Table<UiPreference, string>;
  staff!: Table<StaffMember>;
  privateNotes!: Table<PrivateNote>;
  privateDocs!: Table<PrivateDoc>;
  quickTemplates!: Table<QuickTemplate>;
  customCategories!: Table<CustomCategory>;
  wards!: Table<Ward>;
  beds!: Table<Bed>;
  admissions!: Table<Admission>;
  careNotes!: Table<CareNote>;



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
    // v10: add label/balance/installments to payments, initialStock/batchNumber/location to drugs
    this.version(10).stores({
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
      await tx.table("drugs").toCollection().modify((d: any) => {
        if (d.initialStock === undefined) d.initialStock = d.stock;
      });
      await tx.table("payments").toCollection().modify((p: any) => {
        if (!p.label) p.label = "Consultation générale";
        if (p.balance === undefined) p.balance = Math.max(0, (p.amountDue || 0) - (p.amountPaid || 0));
        if (!p.installments) p.installments = [];
      });
    });
    // v11: replace drug/consumable list with orthodontic clinic inventory
    this.version(11).stores({
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
      // Only replace if all existing drugs look like generic pharmacy items (no ortho categories)
      const existing = await tx.table("drugs").toArray();
      const hasOrtho = existing.some((d: any) =>
        d.category === "Consommable ortho" || d.category === "Contrôle infection"
      );
      if (hasOrtho) return; // Already migrated

      // Clear old generic drug list and replace with orthodontic consumables
      await tx.table("drugs").clear();
      const now = new Date().toISOString();
      const items = ORTHODONTIC_DEFAULTS(now);
      for (const item of items) {
        await tx.table("drugs").add(item);
      }
    });
    // v12: equipment stock management tables
    this.version(12).stores({
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
      equipmentItems: "++id, name, clinicId",
      equipmentMovements: "++id, itemId, createdAt, clinicId",
    });
    // v13: observation templates + imported Word docs + external patient ID
    this.version(13).stores({
      users: "++id, name, role, pinHash, clinicId",
      patients: "++id, patientId, anonCode, externalId, firstName, lastName, phone, clinicId",
      appointments: "++id, patientId, doctorId, date, status, clinicId",
      consultations: "++id, patientId, doctorId, date, parentId, originalId, isLatest, templateId, clinicId",
      documents: "++id, patientId, name, tag, createdAt, updatedAt, clinicId",
      auditLogs: "++id, timestamp, userName, type, resource",
      payments: "++id, patientId, consultationId, status, createdAt, clinicId",
      drugs: "++id, name, category, status, clinicId",
      drugTransactions: "++id, drugId, type, patientId, createdAt, clinicId",
      generatedDocs: "++id, type, patientId, createdAt, clinicId",
      equipmentItems: "++id, name, clinicId",
      equipmentMovements: "++id, itemId, createdAt, clinicId",
      consultationTemplates: "++id, specialty, active, clinicId, createdAt",
      importedDocuments: "++id, patientId, filename, source, uploadedAt, clinicId",
    });
    // v14: sync conflict review queue
    this.version(14).stores({
      users: "++id, name, role, pinHash, clinicId",
      patients: "++id, patientId, anonCode, externalId, firstName, lastName, phone, clinicId",
      appointments: "++id, patientId, doctorId, date, status, clinicId",
      consultations: "++id, patientId, doctorId, date, parentId, originalId, isLatest, templateId, clinicId",
      documents: "++id, patientId, name, tag, createdAt, updatedAt, clinicId",
      auditLogs: "++id, timestamp, userName, type, resource",
      payments: "++id, patientId, consultationId, status, createdAt, clinicId",
      drugs: "++id, name, category, status, clinicId",
      drugTransactions: "++id, drugId, type, patientId, createdAt, clinicId",
      generatedDocs: "++id, type, patientId, createdAt, clinicId",
      equipmentItems: "++id, name, clinicId",
      equipmentMovements: "++id, itemId, createdAt, clinicId",
      consultationTemplates: "++id, specialty, active, clinicId, createdAt",
      importedDocuments: "++id, patientId, filename, source, uploadedAt, clinicId",
      syncConflicts: "++id, resource, status, matchKey, detectedAt, clinicId",
    });
    // v15: Survey module
    this.version(15).stores({
      users: "++id, name, role, pinHash, clinicId",
      patients: "++id, patientId, anonCode, externalId, firstName, lastName, phone, clinicId",
      appointments: "++id, patientId, doctorId, date, status, clinicId",
      consultations: "++id, patientId, doctorId, date, parentId, originalId, isLatest, templateId, clinicId",
      documents: "++id, patientId, name, tag, createdAt, updatedAt, clinicId",
      auditLogs: "++id, timestamp, userName, type, resource",
      payments: "++id, patientId, consultationId, status, createdAt, clinicId",
      drugs: "++id, name, category, status, clinicId",
      drugTransactions: "++id, drugId, type, patientId, createdAt, clinicId",
      generatedDocs: "++id, type, patientId, createdAt, clinicId",
      equipmentItems: "++id, name, clinicId",
      equipmentMovements: "++id, itemId, createdAt, clinicId",
      consultationTemplates: "++id, specialty, active, clinicId, createdAt",
      importedDocuments: "++id, patientId, filename, source, uploadedAt, clinicId",
      syncConflicts: "++id, resource, status, matchKey, detectedAt, clinicId",
      surveys: "++id, inviteCode, status, clinicId, createdAt, createdBy",
      surveyResponses: "++id, surveyId, synced, clinicId, completedAt",
      surveyInvites: "++id, surveyId, status, clinicId, sentAt",
      voiceRecordings: "++id, responseId, questionId, synced, createdAt",
    });
    // v16: equipment boxes (categories) + boxId index on equipmentItems
    this.version(16).stores({
      users: "++id, name, role, pinHash, clinicId",
      patients: "++id, patientId, anonCode, externalId, firstName, lastName, phone, clinicId",
      appointments: "++id, patientId, doctorId, date, status, clinicId",
      consultations: "++id, patientId, doctorId, date, parentId, originalId, isLatest, templateId, clinicId",
      documents: "++id, patientId, name, tag, createdAt, updatedAt, clinicId",
      auditLogs: "++id, timestamp, userName, type, resource",
      payments: "++id, patientId, consultationId, status, createdAt, clinicId",
      drugs: "++id, name, category, status, clinicId",
      drugTransactions: "++id, drugId, type, patientId, createdAt, clinicId",
      generatedDocs: "++id, type, patientId, createdAt, clinicId",
      equipmentItems: "++id, name, boxId, clinicId",
      equipmentMovements: "++id, itemId, createdAt, clinicId",
      consultationTemplates: "++id, specialty, active, clinicId, createdAt",
      importedDocuments: "++id, patientId, filename, source, uploadedAt, clinicId",
      syncConflicts: "++id, resource, status, matchKey, detectedAt, clinicId",
      surveys: "++id, inviteCode, status, clinicId, createdAt, createdBy",
      surveyResponses: "++id, surveyId, synced, clinicId, completedAt",
      surveyInvites: "++id, surveyId, status, clinicId, sentAt",
      voiceRecordings: "++id, responseId, questionId, synced, createdAt",
      equipmentBoxes: "++id, label, order, clinicId, createdAt",
    });
    // v17: document treatmentCategory index + uiPreferences (per-device key/value)
    this.version(17).stores({
      users: "++id, name, role, pinHash, clinicId",
      patients: "++id, patientId, anonCode, externalId, firstName, lastName, phone, clinicId",
      appointments: "++id, patientId, doctorId, date, status, clinicId",
      consultations: "++id, patientId, doctorId, date, parentId, originalId, isLatest, templateId, clinicId",
      documents: "++id, patientId, name, tag, treatmentCategory, createdAt, updatedAt, clinicId",
      auditLogs: "++id, timestamp, userName, type, resource",
      payments: "++id, patientId, consultationId, status, createdAt, clinicId",
      drugs: "++id, name, category, status, clinicId",
      drugTransactions: "++id, drugId, type, patientId, createdAt, clinicId",
      generatedDocs: "++id, type, patientId, createdAt, clinicId",
      equipmentItems: "++id, name, boxId, clinicId",
      equipmentMovements: "++id, itemId, createdAt, clinicId",
      consultationTemplates: "++id, specialty, active, clinicId, createdAt",
      importedDocuments: "++id, patientId, filename, source, uploadedAt, clinicId",
      syncConflicts: "++id, resource, status, matchKey, detectedAt, clinicId",
      surveys: "++id, inviteCode, status, clinicId, createdAt, createdBy",
      surveyResponses: "++id, surveyId, synced, clinicId, completedAt",
      surveyInvites: "++id, surveyId, status, clinicId, sentAt",
      voiceRecordings: "++id, responseId, questionId, synced, createdAt",
      equipmentBoxes: "++id, label, order, clinicId, createdAt",
      uiPreferences: "key, updatedAt",
    });
    // v18: staff identity, private space, custom document categories
    this.version(18).stores({
      users: "++id, name, role, pinHash, clinicId",
      patients: "++id, patientId, anonCode, externalId, firstName, lastName, phone, clinicId",
      appointments: "++id, patientId, doctorId, date, status, clinicId",
      consultations: "++id, patientId, doctorId, date, parentId, originalId, isLatest, templateId, clinicId",
      documents: "++id, patientId, name, tag, treatmentCategory, createdAt, updatedAt, clinicId",
      auditLogs: "++id, timestamp, userName, type, resource",
      payments: "++id, patientId, consultationId, status, createdAt, clinicId",
      drugs: "++id, name, category, status, clinicId",
      drugTransactions: "++id, drugId, type, patientId, createdAt, clinicId",
      generatedDocs: "++id, type, patientId, createdAt, clinicId",
      equipmentItems: "++id, name, boxId, clinicId",
      equipmentMovements: "++id, itemId, createdAt, clinicId",
      consultationTemplates: "++id, specialty, active, clinicId, createdAt",
      importedDocuments: "++id, patientId, filename, source, uploadedAt, clinicId",
      syncConflicts: "++id, resource, status, matchKey, detectedAt, clinicId",
      surveys: "++id, inviteCode, status, clinicId, createdAt, createdBy",
      surveyResponses: "++id, surveyId, synced, clinicId, completedAt",
      surveyInvites: "++id, surveyId, status, clinicId, sentAt",
      voiceRecordings: "++id, responseId, questionId, synced, createdAt",
      equipmentBoxes: "++id, label, order, clinicId, createdAt",
      uiPreferences: "key, updatedAt",
      staff: "++id, staffCode, fullName, role, linkedUserId, clinicId, createdAt",
      privateNotes: "++id, ownerUserId, updatedAt, clinicId",
      privateDocs: "++id, ownerUserId, createdAt, clinicId",
      quickTemplates: "++id, ownerUserId, label, clinicId",
      customCategories: "++id, value, clinicId, createdAt",
    });
    // v19: hospital admissions - wards, beds, admissions, care notes
    this.version(19).stores({
      wards: "++id, name, clinicId, createdAt",
      beds: "++id, wardId, label, status, clinicId, createdAt",
      admissions: "++id, patientId, wardId, bedId, status, admittedAt, dischargedAt, clinicId",
      careNotes: "++id, admissionId, patientId, createdAt, clinicId",
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

// PIN hashing — PBKDF2-SHA256 with per-user random salt.
// Storage format: "pbkdf2$<iterations>$<saltB64>$<hashB64>"
// Legacy format (64-char hex SHA-256 of pin+"dentacare-salt") is still
// recognized by verifyPin so existing accounts keep working and get
// transparently upgraded on next successful login.
const PIN_ITERATIONS = 150_000;
const LEGACY_PIN_SALT = "dentacare-salt";

function _b64encode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function _b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function _pbkdf2(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations, hash: "SHA-256" },
    baseKey,
    256
  );
  return new Uint8Array(bits);
}

/** Hash a PIN for storage. Returns a "pbkdf2$..." encoded string. */
export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await _pbkdf2(pin, salt, PIN_ITERATIONS);
  return `pbkdf2$${PIN_ITERATIONS}$${_b64encode(salt)}$${_b64encode(hash)}`;
}

/** Verify a PIN against a stored hash. Supports legacy SHA-256 hashes. */
export async function verifyPin(pin: string, stored: string | undefined | null): Promise<boolean> {
  if (!stored) return false;
  if (stored.startsWith("pbkdf2$")) {
    const parts = stored.split("$");
    if (parts.length !== 4) return false;
    const iter = parseInt(parts[1], 10);
    if (!iter || iter < 1000) return false;
    try {
      const salt = _b64decode(parts[2]);
      const expected = _b64decode(parts[3]);
      const got = await _pbkdf2(pin, salt, iter);
      if (got.length !== expected.length) return false;
      let diff = 0;
      for (let i = 0; i < got.length; i++) diff |= got[i] ^ expected[i];
      return diff === 0;
    } catch { return false; }
  }
  // Legacy SHA-256(pin + static-salt) — 64 hex chars.
  if (/^[0-9a-f]{64}$/i.test(stored)) {
    const data = new TextEncoder().encode(pin + LEGACY_PIN_SALT);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const hex = Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    return hex === stored.toLowerCase();
  }
  return false;
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
    const now = new Date().toISOString();
    const pin = await hashPin("1234");
    await db.users.bulkAdd([
      { name: "Admin",        role: "admin",        pinHash: pin, active: true, createdAt: now },
      { name: "Doctor",       role: "doctor",       pinHash: pin, active: true, createdAt: now },
      { name: "Receptionist", role: "receptionist", pinHash: pin, active: true, createdAt: now },
    ]);
  } else {
    // Backfill missing default doctor/receptionist accounts so all 3 roles can sign in.
    const now = new Date().toISOString();
    const pin = await hashPin("1234");
    const hasDoctor = await db.users.where("role").equals("doctor").count();
    if (!hasDoctor) await db.users.add({ name: "Doctor", role: "doctor", pinHash: pin, active: true, createdAt: now });
    const hasRecep = await db.users.where("role").equals("receptionist").count();
    if (!hasRecep) await db.users.add({ name: "Receptionist", role: "receptionist", pinHash: pin, active: true, createdAt: now });
    const hasAdmin = await db.users.where("role").equals("admin").count();
    if (!hasAdmin) await db.users.add({ name: "Admin", role: "admin", pinHash: pin, active: true, createdAt: now });
  }

  const drugCount = await db.drugs.count();

  const equipCount = await db.equipmentItems.count();
  if (equipCount === 0) {
    const now = new Date().toISOString();
    await db.equipmentItems.bulkAdd(
      EQUIPMENT_LIST.map(name => ({
        name,
        stock: 10,
        lowStockThreshold: 5,
        createdAt: now,
        updatedAt: now,
      }))
    );
  }

  await seedBuiltinTemplates();
}

// ─── Built-in consultation templates (A / B / C) ─────────────────────────────

function f(id: string, type: TemplateFieldType, label: string, opts?: { options?: string[]; required?: boolean }): TemplateField {
  return { id, type, label, ...(opts || {}) };
}

function BUILTIN_TEMPLATES(): Array<Omit<ConsultationTemplate, "id" | "clinicId">> {
  const now = new Date().toISOString();
  return [
    {
      name: "Médecine Générale & Spécialités",
      specialty: "general",
      builtin: true,
      builtinCode: "general",
      active: true,
      createdAt: now,
      updatedAt: now,
      // Template A is rendered by the existing hardcoded sections.
      // We keep fieldsDefinition empty so no duplicate UI appears.
      fieldsDefinition: [],
    },
    {
      name: "Dentisterie",
      specialty: "dental",
      builtin: true,
      builtinCode: "dental",
      active: true,
      createdAt: now,
      updatedAt: now,
      fieldsDefinition: [
        f("d_extraoral", "long_text", "Examen extra-oral"),
        f("d_intraoral", "long_text", "Examen intra-oral"),
        f("d_perio_bleeding", "checkbox", "Saignement gingival"),
        f("d_perio_pocket", "short_text", "Profondeur de poche (mm)"),
        f("d_perio_mobility", "select", "Mobilité dentaire", { options: ["0", "1", "2", "3"] }),
        f("d_perio_plaque", "short_text", "Indice de plaque"),
        f("d_radio", "long_text", "Résultats radiographiques"),
        f("d_dx", "long_text", "Diagnostic dentaire"),
        f("d_plan", "long_text", "Plan de traitement"),
        f("d_done", "long_text", "Traitement effectué aujourd'hui"),
        f("d_next", "short_text", "Prochain rendez-vous"),
      ],
    },
    {
      name: "Orthodontie",
      specialty: "orthodontic",
      builtin: true,
      builtinCode: "orthodontic",
      active: true,
      createdAt: now,
      updatedAt: now,
      fieldsDefinition: [
        f("o_concern", "long_text", "Motif principal"),
        f("o_history", "long_text", "Histoire"),
        f("o_face_profile", "select", "Profil sagittal", { options: ["Classe I", "Classe II", "Classe III"] }),
        f("o_face_symmetry", "short_text", "Symétrie faciale"),
        f("o_face_height", "short_text", "Hauteur faciale"),
        f("o_face_lips", "select", "Compétence labiale", { options: ["Compétente", "Incompétente"] }),
        f("o_overjet", "short_text", "Overjet (mm)"),
        f("o_overbite", "short_text", "Overbite (mm)"),
        f("o_crowding", "checkbox", "Encombrement"),
        f("o_spacing", "checkbox", "Diastèmes"),
        f("o_crossbite", "checkbox", "Occlusion croisée"),
        f("o_molar_l", "select", "Classe molaire gauche", { options: ["I", "II", "III"] }),
        f("o_molar_r", "select", "Classe molaire droite", { options: ["I", "II", "III"] }),
        f("o_appliances", "long_text", "Appareillages actuels"),
        f("o_radio", "long_text", "Résultats radiographiques"),
        f("o_dx", "long_text", "Synthèse diagnostique"),
        f("o_objectives", "long_text", "Objectifs de traitement"),
        f("o_plan", "long_text", "Plan de traitement"),
        f("o_today", "long_text", "Traitement effectué aujourd'hui"),
        f("o_next", "short_text", "Prochain rendez-vous"),
      ],
    },
  ];
}

async function seedBuiltinTemplates() {
  try {
    const cid = (() => { try { return localStorage.getItem("divinelink.clinicId") || undefined; } catch { return undefined; } })();
    const existing = await db.consultationTemplates.toArray();
    for (const tpl of BUILTIN_TEMPLATES()) {
      const match = existing.find(e => e.builtinCode === tpl.builtinCode);
      if (!match) {
        await db.consultationTemplates.add({ ...tpl, clinicId: cid });
      }
    }
  } catch { /* ignore */ }
}
