import { useCallback, useEffect, useRef } from "react";
import { db } from "@/lib/db";
import { api } from "@/lib/api";
import { activeClinicId, activeToken, belongsToActiveClinic, tombstoneKeys } from "@/lib/clinicScope";

const API_BASE =
  (typeof window !== "undefined" && (window as any).__DIVINELINK_API_BASE__) ||
  "https://divinelink.mooo.com/api";

export function useServerSync(intervalMinutes = 5, enabled = true) {
  const syncRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(false);

  const syncNow = useCallback(async () => {
    if (!navigator.onLine) return;
    const token = activeToken();
    const clinicId = activeClinicId();
    // Hard guard: no clinic linked → this device is local-only, never sync.
    if (!token || !clinicId) return;
    if (runningRef.current) return;
    runningRef.current = true;

    try {
      const deletedPatients = await tombstoneKeys("patient");
      const deletedConsults = await tombstoneKeys("consultation");

      // ── PUSH deletions first, so the server stops sending them back ──────
      try {
        const pending = await db.tombstones.filter(t => !t.pushed && t.clinicId === clinicId).toArray();
        for (const t of pending) {
          const path =
            t.entity === "patient" ? `/patients/${encodeURIComponent(t.key)}` :
            t.entity === "consultation" ? `/consultations/${encodeURIComponent(t.key)}` :
            t.entity === "document" ? `/documents/${encodeURIComponent(t.key)}` : null;
          if (!path) continue;
          try {
            const res = await fetch(`${API_BASE}${path}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok || res.status === 404) await db.tombstones.update(t.id!, { pushed: true });
          } catch {}
        }
      } catch {}

      // ── PUSH patients (active clinic only) ───────────────────────────────
      const patients = (await db.patients.toArray()).filter(belongsToActiveClinic);
      for (const p of patients) {
        if (deletedPatients.has(String(p.patientId))) continue;
        try {
          await api.savePatient({
            patient_code: p.patientId,
            first_name: p.firstName,
            last_name: p.lastName,
            phone: p.phone,
            date_of_birth: p.dob,
            gender: null,
            address: p.address,
            blood_type: p.antecedents?.bloodType || null,
            national_id: null,
          });
        } catch {}
      }

      // ── PUSH consultations (active clinic only) ──────────────────────────
      const consultations = (await db.consultations.toArray())
        .filter(c => c.isLatest !== false)
        .filter(belongsToActiveClinic);
      for (const c of consultations) {
        if (deletedConsults.has(String(c.id))) continue;
        try {
          const cPatient = await db.patients.get(c.patientId);
          if (!cPatient || !belongsToActiveClinic(cPatient)) continue;
          await api.saveConsultation({
            patient_id: cPatient.patientId,
            local_id: c.id,
            specialty: c.consultType || "general",
            chief_complaint: c.chiefComplaint || c.symptoms,
            diagnosis: c.diagnosis,
            treatment: c.treatmentPlan,
            vital_signs: c.vitals || {},
          });
        } catch {}
      }

      // ── PUSH documents (active clinic only) ──────────────────────────────
      const documents = (await db.documents.toArray()).filter(belongsToActiveClinic);
      for (const d of documents) {
        try {
          await api.saveDocument({
            patient_id: d.patientId,
            name: d.name,
            mime_type: d.type,
            data: d.data,
            size: d.size,
            tag: d.tag,
            consult_id: d.consultId ?? null,
          });
        } catch {}
      }

      // ── PUSH survey responses ────────────────────────────────────────────
      try {
        const unsynced = await db.surveyResponses.filter(r => !r.synced).toArray();
        for (const r of unsynced) {
          try {
            const survey = await db.surveys.get(r.surveyId);
            if (!survey) continue;
            if (survey.clinicId && String(survey.clinicId) !== clinicId) continue;
            const res = await fetch(`${API_BASE}/surveys/${survey.serverId || survey.inviteCode}/responses`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                respondent_name: r.respondentName,
                respondent_phone: r.respondentPhone,
                answers: r.answers,
                started_at: r.startedAt,
                completed_at: r.completedAt,
              }),
            });
            if (res.ok) {
              await db.surveyResponses.update(r.id!, { synced: true, syncedAt: new Date().toISOString() });
              const voices = await db.voiceRecordings.where("responseId").equals(r.id!).toArray();
              for (const v of voices.filter(vv => !vv.synced)) {
                try {
                  const fd = new FormData();
                  fd.append("audio", v.blob, `${v.questionId}.webm`);
                  fd.append("transcript", v.transcript || "");
                  const vres = await fetch(
                    `${API_BASE}/surveys/${survey.serverId || survey.inviteCode}/responses/${r.id}/voices/${v.questionId}`,
                    { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd }
                  );
                  if (vres.ok) await db.voiceRecordings.update(v.id!, { synced: true });
                } catch {}
              }
            }
          } catch {}
        }
      } catch {}

      // ── PULL patients (active clinic only, tombstones respected) ─────────
      try {
        const res = await fetch(`${API_BASE}/patients`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const serverPatients = await res.json();
          for (const sp of Array.isArray(serverPatients) ? serverPatients : []) {
            if (sp.clinic_id != null && String(sp.clinic_id) !== clinicId) continue;
            if (deletedPatients.has(String(sp.patient_code))) continue;
            const existing = await db.patients.where("patientId").equals(sp.patient_code).first();
            if (!existing) {
              await db.patients.add({
                patientId: sp.patient_code,
                firstName: sp.first_name,
                lastName: sp.last_name || "",
                phone: sp.phone || "",
                dob: sp.date_of_birth || "",
                address: sp.address || "",
                medicalAlerts: "",
                clinicId,
                createdAt: sp.created_at || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              } as any);
            } else if (!existing.clinicId) {
              await db.patients.update(existing.id!, { clinicId });
            }
          }
        }
      } catch (e) { console.warn("Pull patients failed", e); }

      // ── PULL consultations (active clinic only) ──────────────────────────
      try {
        const res = await fetch(`${API_BASE}/consultations`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const serverConsults = await res.json();
          for (const sc of Array.isArray(serverConsults) ? serverConsults : []) {
            if (sc.clinic_id != null && String(sc.clinic_id) !== clinicId) continue;
            if (sc.local_id && deletedConsults.has(String(sc.local_id))) continue;
            if (deletedPatients.has(String(sc.patient_id))) continue;
            const patient = await db.patients.where("patientId").equals(sc.patient_id).first();
            if (!patient || !belongsToActiveClinic(patient)) continue;
            const dup = await db.consultations
              .where("patientId").equals(patient.id!)
              .filter(c => c.diagnosis === (sc.diagnosis || "") && c.symptoms === (sc.chief_complaint || ""))
              .first();
            if (!dup) {
              await db.consultations.add({
                patientId: patient.id!,
                doctorId: 0,
                date: sc.created_at || new Date().toISOString(),
                symptoms: sc.chief_complaint || "",
                diagnosis: sc.diagnosis || "",
                treatmentPlan: sc.treatment || "",
                prescription: "",
                notes: "",
                consultType: sc.specialty || "general",
                clinicId,
                createdAt: sc.created_at || new Date().toISOString(),
                isLatest: true,
              } as any);
            }
          }
        }
      } catch (e) { console.warn("Pull consultations failed", e); }

      try { localStorage.setItem("dl.lastSyncAt", String(Date.now())); } catch {}

      // ── PUSH audit logs ──────────────────────────────────────────────────
      try {
        const logs = await db.auditLogs.toArray();
        if (logs.length > 0) {
          const res = await fetch(`${API_BASE}/audit`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ logs: logs.slice(0, 50) }),
          });
          if (res.ok) {
            const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
            await db.auditLogs.where("timestamp").below(cutoff).delete();
          }
        }
      } catch {}
    } catch (err) {
      console.error("Server sync failed:", err);
    } finally {
      runningRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    syncNow();
    syncRef.current = setInterval(syncNow, intervalMinutes * 60 * 1000);
    return () => {
      if (syncRef.current) clearInterval(syncRef.current);
    };
  }, [enabled, intervalMinutes, syncNow]);

  return { syncNow };
}
