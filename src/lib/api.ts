/**
 * Thin REST client for the DivineLink server (Node.js/Express on the VPS).
 *
 * - Reads JWT from localStorage("divinelink.apiToken").
 * - All calls are best-effort: they throw on network/HTTP errors so callers
 *   can swallow them (offline-first; server sync is non-blocking).
 */

const API_BASE =
  (typeof window !== "undefined" && (window as any).__DIVINELINK_API_BASE__) ||
  "https://102.220.19.214/api";

const TOKEN_KEY = "divinelink.apiToken";

function authHeaders(): Record<string, string> {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T = any>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status} ${res.statusText} on ${path}`);
  }
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("application/json") ? await res.json() : (await res.text() as any)) as T;
}

export interface PatientPayload {
  patient_code: string;
  first_name: string;
  last_name: string;
  phone?: string;
  date_of_birth?: string;
  gender?: string | null;
  address?: string;
  blood_type?: string | null;
  national_id?: string | null;
}

export interface ConsultationPayload {
  patient_id: string | number;
  specialty?: string;
  chief_complaint?: string;
  diagnosis?: string;
  treatment?: string;
  vital_signs?: Record<string, any>;
}

export const api = {
  health: () => request("/health"),

  login: (email: string, password: string) =>
    request<{ token?: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  savePatient: (p: PatientPayload) =>
    request("/patients", { method: "POST", body: JSON.stringify(p) }),

  saveConsultation: (c: ConsultationPayload) =>
    request("/consultations", { method: "POST", body: JSON.stringify(c) }),
};
