import { useEffect, useRef } from "react";
import { db } from "@/lib/db";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export function useServerSync(intervalMinutes = 5) {
  const { user } = useAuth();
  const syncRef = useRef<NodeJS.Timeout | null>(null);

  async function syncNow() {
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
  }

  useEffect(() => {
    if (!user) return;
    syncNow();
    syncRef.current = setInterval(syncNow, intervalMinutes * 60 * 1000);
    return () => {
      if (syncRef.current) clearInterval(syncRef.current);
    };
  }, [user]);

  return { syncNow };
}