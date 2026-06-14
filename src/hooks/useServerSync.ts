import { useCallback, useEffect, useRef } from "react";
import { db } from "@/lib/db";
import { api } from "@/lib/api";

export function useServerSync(intervalMinutes = 5, enabled = true) {
  const syncRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const syncNow = useCallback(async () => {
    if (!navigator.onLine) return;
    if (!localStorage.getItem("divinelink.apiToken")) return;

    try {
      // Sync patients
      const patients = await db.patients.toArray();
      for (const p of patients) {
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

      // Sync consultations
      const consultations = await db.consultations
        .filter(c => c.isLatest === true)
        .toArray();
      for (const c of consultations) {
        try {
          await api.saveConsultation({
            patient_id: c.patientId,
            specialty: c.consultType || "general",
            chief_complaint: c.chiefComplaint || c.symptoms,
            diagnosis: c.diagnosis,
            treatment: c.treatmentPlan,
            vital_signs: c.vitals || {},
          });
        } catch {}
      }

      // Sync documents
      const documents = await db.documents.toArray();
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

      // Sync survey responses (best-effort, marks synced=true on success)
      try {
        const unsynced = await db.surveyResponses.filter(r => !r.synced).toArray();
        for (const r of unsynced) {
          try {
            const survey = await db.surveys.get(r.surveyId);
            if (!survey) continue;
            const res = await fetch(`${(window as any).__DIVINELINK_API_BASE__ || "https://divinelink.mooo.com/api"}/surveys/${survey.serverId || survey.inviteCode}/responses`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(localStorage.getItem("divinelink.apiToken") ? { Authorization: `Bearer ${localStorage.getItem("divinelink.apiToken")}` } : {}),
              },
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
              // Upload voice blobs for this response
              const voices = await db.voiceRecordings.where("responseId").equals(r.id!).toArray();
              for (const v of voices.filter(vv => !vv.synced)) {
                try {
                  const fd = new FormData();
                  fd.append("audio", v.blob, `${v.questionId}.webm`);
                  fd.append("transcript", v.transcript || "");
                  const vres = await fetch(`${(window as any).__DIVINELINK_API_BASE__ || "https://divinelink.mooo.com/api"}/surveys/${survey.serverId || survey.inviteCode}/responses/${r.id}/voices/${v.questionId}`, {
                    method: "POST",
                    headers: localStorage.getItem("divinelink.apiToken") ? { Authorization: `Bearer ${localStorage.getItem("divinelink.apiToken")}` } : {},
                    body: fd,
                  });
                  if (vres.ok) await db.voiceRecordings.update(v.id!, { synced: true });
                } catch {}
              }
            }
          } catch {}
        }
      } catch {}
// PULL: download patients from server that this device doesn't have
      try {
        const token = localStorage.getItem("divinelink.apiToken");
        const res = await fetch("https://divinelink.mooo.com/api/patients", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const serverPatients = await res.json();
          for (const sp of serverPatients) {
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
                createdAt: sp.created_at || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
            }
          }
          console.log("Pulled", serverPatients.length, "patients from server");
        }
      } catch (e) { console.warn("Pull failed", e); }
      // PULL: download consultations from server that this device doesn't have
      try {
        const token = localStorage.getItem("divinelink.apiToken");
        const res = await fetch("https://divinelink.mooo.com/api/consultations", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const serverConsults = await res.json();
          for (const sc of serverConsults) {
            // map server patient code -> local patient numeric id
            const patient = await db.patients.where("patientId").equals(sc.patient_id).first();
            const localPatientId = patient?.id ?? null;
            // avoid duplicates: skip if a consultation with same diagnosis+patient already exists
            const dup = await db.consultations
              .where("patientId").equals(localPatientId ?? -1)
              .filter(c => c.diagnosis === (sc.diagnosis || "") && c.symptoms === (sc.chief_complaint || ""))
              .first();
            if (!dup && localPatientId !== null) {
              await db.consultations.add({
                patientId: localPatientId,
                doctorId: 0,
                date: sc.created_at || new Date().toISOString(),
                symptoms: sc.chief_complaint || "",
                diagnosis: sc.diagnosis || "",
                treatmentPlan: sc.treatment || "",
                prescription: "",
                notes: "",
                consultType: sc.specialty || "general",
                clinicId: String(sc.clinic_id || ""),
                createdAt: sc.created_at || new Date().toISOString(),
                isLatest: true,
              });
            }
          }
          console.log("Pulled", serverConsults.length, "consultations from server");
        }
      } catch (e) { console.warn("Consultation pull failed", e); }
      console.log("Server sync completed:", new Date().toISOString());
    } catch (err) {
      console.error("Server sync failed:", err);
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