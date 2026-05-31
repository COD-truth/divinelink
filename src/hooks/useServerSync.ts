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