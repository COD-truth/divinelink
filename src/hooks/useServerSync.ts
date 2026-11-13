import { useCallback, useEffect, useRef } from "react";
import { db } from "@/lib/db";

// Demo-safe: do NOT pull server data down onto devices. Each device shows only
// what was entered on it (data still pushes UP to the server as backup). This
// prevents any stale/foreign server data from ever appearing on a device.
// Multi-device pull is part of the proper sync rework — turn on by setting
// localStorage "dl.pullEnabled" = "1".
const ENABLE_SERVER_PULL = false;
function pullEnabled(): boolean {
  try { return ENABLE_SERVER_PULL || localStorage.getItem("dl.pullEnabled") === "1"; } catch { return ENABLE_SERVER_PULL; }
}

// Reset on every page load. The FIRST patient pull after load does a FULL
// reconcile (since=1970) so a device always converges to the complete server
// set — never a stuck partial delta. Subsequent syncs are deltas.
let didFullReconcile = false;

export function useServerSync(intervalMinutes = 5, enabled = true) {
  const syncRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const syncNow = useCallback(async () => {
    if (!navigator.onLine) return;
    if (!localStorage.getItem("divinelink.apiToken")) return;

    try {
      // ── Clinic isolation guard ──
      // Only ever push records that belong to the clinic this device is linked
      // to right now. Without this, a device that holds another clinic's data
      // would upload it into the active clinic on the server.
      const activeClinic = localStorage.getItem("divinelink.clinicId");
      if (!activeClinic) { console.warn("[sync] no active clinic — skipping push"); return; }
      // CLINIC ISOLATION: only ever push records EXPLICITLY tagged to the active
      // clinic. We do NOT adopt untagged/foreign rows into the active clinic —
      // that step was uploading a previous clinic's leftover local data into the
      // clinic you just joined, polluting it on the server.
      const belongs = (rec: { clinicId?: string }) => String(rec.clinicId ?? "") === String(activeClinic);

      // ══ PATIENTS SYNC v2 — uid-keyed · delta · tombstone-aware · plaintext boundary ══
      const API_BASE = "https://divinelink.mooo.com/api";
      const authToken = localStorage.getItem("divinelink.apiToken");
      const authHeaders: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` };
      const { decryptStringSafe, encryptString, isCiphertext } = await import("@/lib/crypto");
      const patLastKey = `dl.lastSync.patients.${activeClinic}`;
      const patSince = localStorage.getItem(patLastKey) || "1970-01-01T00:00:00.000Z";
      let patCursor = patSince;

      // Build a server body from a local patient, DECRYPTING sensitive fields to
      // plaintext. Returns null when any non-empty sensitive field is unreadable
      // ciphertext — a foreign/old row this device's key cannot decode, which we
      // must NEVER publish (that is what spread garbage across devices before).
      const buildPatientBody = async (p: any): Promise<any | null> => {
        const ph = await decryptStringSafe(p.phone || "");
        const ad = await decryptStringSafe(p.address || "");
        const ma = await decryptStringSafe(p.medicalAlerts || "");
        if (!ph.readable || !ad.readable || !ma.readable) return null;
        return {
          uid: p.uid,
          patient_code: p.patientId,
          first_name: p.firstName,
          last_name: p.lastName,
          phone: ph.text,
          date_of_birth: p.dob || null,
          address: ad.text,
          medical_alerts: ma.text,
          registered_by: p.registeredBy || null,
          registered_at: p.registeredAt || null,
          visit_type: p.visitType || null,
          reason_for_visit: p.reasonForVisit || null,
          deleted: !!p.deleted,
          updated_at: p.updatedAt,
        };
      };

      // PUSH: this clinic's patients changed since last sync. Sensitive fields
      // are DECRYPTED here so the server (and every other device) gets plaintext.
      const patChanged = (await db.patients.toArray())
        .filter(p => belongs(p) && p.uid && String(p.updatedAt || "") > patSince);
      for (const p of patChanged) {
        try {
          const body = await buildPatientBody(p);
          if (!body) continue; // unreadable foreign row — never push garbage
          if (String(p.updatedAt || "") > patCursor) patCursor = String(p.updatedAt);
          await fetch(`${API_BASE}/patients`, { method: "POST", headers: authHeaders, body: JSON.stringify(body) });
        } catch { /* best-effort */ }
      }

      // ── HEAL (one-time per clinic) ──
      // Republish, as clean plaintext, every record THIS device can actually
      // read but that is still stored as ciphertext. After each clinic device
      // runs this once, the server holds real text for every recoverable record
      // and all devices display them correctly. Rows no device can read stay
      // hidden (shown as "—") until re-entered.
      const healKey = `dl.heal.plaintext.v2.${activeClinic}`;
      if (!localStorage.getItem(healKey)) {
        try {
          const nowIso = new Date().toISOString();
          const all = (await db.patients.toArray()).filter(p => belongs(p) && p.uid);
          let healed = 0;
          for (const p of all) {
            const hadCipher = isCiphertext(p.phone) || isCiphertext(p.address) || isCiphertext(p.medicalAlerts);
            if (!hadCipher) continue;
            const body = await buildPatientBody(p);
            if (!body) continue; // can't read it → leave it for its origin device
            body.updated_at = nowIso; // bump so last-write-wins republishes to all devices
            await fetch(`${API_BASE}/patients`, { method: "POST", headers: authHeaders, body: JSON.stringify(body) });
            healed++;
          }
          localStorage.setItem(healKey, "1");
          if (healed) console.log("[sync] healed plaintext for", healed, "patients");
        } catch (e) { console.warn("[sync] heal failed", e); }
      }

      // ══ CONSULTATIONS SYNC v2 — uid-keyed · delta · idempotent (push-only) ══
      // Each consultation carries a stable uid so the server UPSERTS by uid
      // instead of colliding on the device-local id (which overwrote other
      // devices' consultations). Push-only for now (no cross-device pull yet).
      const consLastKey = `dl.lastSync.consultations.${activeClinic}`;
      const consSince = localStorage.getItem(consLastKey) || "1970-01-01T00:00:00.000Z";
      let consCursor = consSince;
      const consAll = (await db.consultations.filter(c => c.isLatest !== false).toArray()).filter(belongs);
      for (const c of consAll) {
        try {
          // Ensure a stable uid (assign + persist once).
          let cuid = c.uid;
          if (!cuid) {
            cuid = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
            if (c.id) await db.consultations.update(c.id, { uid: cuid });
          }
          const cChanged = String((c as any).updatedAt || c.editedAt || c.date || c.createdAt || "");
          if (cChanged && cChanged <= consSince) continue; // delta: only changed
          if (cChanged > consCursor) consCursor = cChanged;
          // look up the patient's CODE from their numeric id so it matches on the server
          const cPatient = await db.patients.get(c.patientId);
          const patientCode = cPatient?.patientId || String(c.patientId);
          await fetch(`${API_BASE}/consultations`, {
            method: "POST", headers: authHeaders,
            body: JSON.stringify({
              uid: cuid,
              patient_id: patientCode,
              local_id: c.id,
              specialty: c.consultType || "general",
              chief_complaint: c.chiefComplaint || c.symptoms,
              diagnosis: c.diagnosis,
              treatment: c.treatmentPlan,
              vital_signs: c.vitals || {},
              deleted: !!c.deleted,
              updated_at: (c as any).updatedAt || c.editedAt || c.date || c.createdAt || new Date().toISOString(),
            }),
          });
        } catch { /* best-effort */ }
      }
      try { localStorage.setItem(consLastKey, consCursor); } catch {}

      // ══ DOCUMENTS SYNC v2 — uid-keyed · delta · idempotent (push-only) ══
      // Each document carries a stable uid so the server UPSERTS by uid instead
      // of inserting a fresh row every cycle. That blind insert was the cause of
      // pictures tripling. Push-only for now (no cross-device pull yet).
      const docLastKey = `dl.lastSync.documents.${activeClinic}`;
      const docSince = localStorage.getItem(docLastKey) || "1970-01-01T00:00:00.000Z";
      let docCursor = docSince;
      const allDocs = (await db.documents.toArray()).filter(belongs);
      for (const d of allDocs) {
        try {
          // Ensure a stable uid (assign + persist once).
          let uid = d.uid;
          if (!uid) {
            uid = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
            if (d.id) await db.documents.update(d.id, { uid });
          }
          const dUpdated = String(d.updatedAt || d.createdAt || "");
          if (dUpdated && dUpdated <= docSince) continue; // delta: only changed docs
          if (dUpdated > docCursor) docCursor = dUpdated;
          // Send the patient's CODE (stable across devices), not the local
          // numeric id — otherwise the doc can't be matched to the right
          // patient on another device.
          const dPatient = await db.patients.get(d.patientId);
          const dPatientCode = dPatient?.patientId || String(d.patientId);
          await fetch(`${API_BASE}/documents`, {
            method: "POST", headers: authHeaders,
            body: JSON.stringify({
              uid,
              patient_id: dPatientCode,
              consult_id: d.consultId ?? null,
              type: d.type,
              name: d.name,
              data: d.data,
              source: d.source,
              deleted: !!d.deleted,
              updated_at: d.updatedAt || d.createdAt || new Date().toISOString(),
            }),
          });
        } catch { /* best-effort */ }
      }
      try { localStorage.setItem(docLastKey, docCursor); } catch {}

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
      // PULL: apply the server's patient rows (delta, INCLUDING tombstones), keyed
      // by uid. Sensitive fields arrive plaintext and are RE-ENCRYPTED with this
      // device's own key so they display correctly here. Last-write-wins.
      try {
        // First sync after a page load = FULL reconcile (since=1970) so the
        // device converges to the complete server set. After that, deltas.
        const doFull = !didFullReconcile;
        const sinceParam = doFull ? "1970-01-01T00:00:00.000Z" : patSince;
        const res = await fetch(`${API_BASE}/patients?since=${encodeURIComponent(sinceParam)}`, { headers: authHeaders });
        if (res.ok) {
          const rows = await res.json();
          let applied = 0, skipped = 0;
          for (const sp of rows) {
            // Per-row guard: one bad record can NEVER abort the whole pull
            // (that was the "only N of 27 patients" bug).
            try {
              if (!sp.uid) continue;
              if (String(sp.updated_at || "") > patCursor) patCursor = String(sp.updated_at);
              const existing = await db.patients.where("uid").equals(sp.uid).first();
              if (sp.deleted) {
                if (existing?.id && !existing.deleted) await db.patients.update(existing.id, { deleted: true, updatedAt: sp.updated_at || new Date().toISOString() });
                continue;
              }
              const fields: any = {
                patientId: sp.patient_code,
                firstName: sp.first_name || "",
                lastName: sp.last_name || "",
                dob: sp.date_of_birth || "",
                registeredBy: sp.registered_by || undefined,
                registeredAt: sp.registered_at || undefined,
                visitType: sp.visit_type || undefined,
                reasonForVisit: sp.reason_for_visit || undefined,
                clinicId: activeClinic,
                uid: sp.uid,
                deleted: false,
                updatedAt: sp.updated_at || new Date().toISOString(),
              };
              // Only accept sensitive fields that arrive as PLAINTEXT. If the
              // server still holds old ciphertext, skip it so we never overwrite
              // a good local value; re-encrypt plaintext with THIS device's key.
              if (!isCiphertext(sp.phone)) fields.phone = await encryptString(sp.phone || "");
              if (!isCiphertext(sp.address)) fields.address = await encryptString(sp.address || "");
              if (!isCiphertext(sp.medical_alerts)) fields.medicalAlerts = await encryptString(sp.medical_alerts || "");
              if (existing?.id) {
                if (String(sp.updated_at || "") >= String(existing.updatedAt || "")) await db.patients.update(existing.id, fields);
              } else {
                await db.patients.add({ ...fields, createdAt: sp.created_at || new Date().toISOString() });
              }
              applied++;
            } catch (rowErr) {
              skipped++;
              console.warn("[sync] patient row skipped:", sp?.uid, rowErr);
            }
          }
          if (doFull) didFullReconcile = true;
          console.log(`[sync] patients v2: received ${rows.length}, applied ${applied}, skipped ${skipped}${doFull ? " (full reconcile)" : ""}`);
        }
        localStorage.setItem(patLastKey, patCursor);
      } catch (e) { console.warn("[sync] patient pull v2 failed", e); }

      // ══ DOCUMENTS PULL — delta-from-baseline · uid-keyed · idempotent ══
      // Performance-safe: the FIRST run sets the cursor to "now" and pulls
      // nothing historical (so a low-end phone never bulk-downloads thousands
      // of images). After that, only documents CHANGED since the last pull come
      // down — new snaps propagate quietly. A patient's existing images are
      // fetched on demand when their file is opened (lazy per-patient fetch).
      // Matched by uid → the UNIQUE(clinic_id, uid) identity means a document
      // can never land twice. Images are NOT encrypted (binary), so no key gym.
      try {
        const docPullKey = `dl.lastSync.documentsPull.${activeClinic}`;
        let docPullSince = localStorage.getItem(docPullKey);
        if (!docPullSince) {
          // First run on this device/clinic: baseline = now, skip history.
          docPullSince = new Date().toISOString();
          localStorage.setItem(docPullKey, docPullSince);
        } else {
          let docPullCursor = docPullSince;
          const res = await fetch(`${API_BASE}/documents?since=${encodeURIComponent(docPullSince)}`, { headers: authHeaders });
          if (res.ok) {
            const rows = await res.json();
            let applied = 0;
            for (const sd of rows) {
              try {
                if (!sd.uid) continue;
                const srvUpdated = String(sd.updated_at || sd.created_at || "");
                if (srvUpdated > docPullCursor) docPullCursor = srvUpdated;
                const existing = await db.documents.where("uid").equals(sd.uid).first();
                if (sd.deleted) {
                  if (existing?.id && !existing.deleted) await db.documents.update(existing.id, { deleted: true, updatedAt: srvUpdated });
                  continue;
                }
                // Map server patient CODE → local numeric patient id. Patients
                // pull ran just above, so the patient should already be here;
                // if not, skip — it'll arrive on a later cycle.
                const lp = await db.patients.where("patientId").equals(String(sd.patient_id)).first();
                if (!lp?.id) continue;
                const fields: any = {
                  uid: sd.uid,
                  patientId: lp.id,
                  consultId: sd.consult_id ? (Number(sd.consult_id) || undefined) : undefined,
                  type: sd.type || "",
                  name: sd.name || "",
                  data: sd.data || "",
                  size: sd.data ? String(sd.data).length : 0,
                  source: sd.source || undefined,
                  clinicId: activeClinic,
                  deleted: false,
                  updatedAt: srvUpdated,
                  createdAt: sd.created_at || srvUpdated,
                };
                if (existing?.id) {
                  if (srvUpdated >= String(existing.updatedAt || "")) await db.documents.update(existing.id, fields);
                } else {
                  await db.documents.add(fields);
                }
                applied++;
              } catch { /* per-row: one bad doc never aborts the pull */ }
            }
            localStorage.setItem(docPullKey, docPullCursor);
            if (applied) console.log(`[sync] documents pulled: ${applied} of ${rows.length}`);
          }
        }
      } catch (e) { console.warn("[sync] document pull failed", e); }

      // PULL: download consultations from server that this device doesn't have
      if (pullEnabled()) try {
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
                clinicId: activeClinic,
                createdAt: sc.created_at || new Date().toISOString(),
                isLatest: true,
              });
            }
          }
          console.log("Pulled", serverConsults.length, "consultations from server");
        }
      } catch (e) { console.warn("Consultation pull failed", e); }

      // ══ MATERNITÉ SYNC — files · accouchements · CPN · partogramme ══
      // JSONB-per-row on the server (uid-keyed, LWW, tombstones). Push AND pull.
      // Children (records/visits/partograph) carry their file's UID so the local
      // numeric fileId can be re-resolved per device (it differs across devices).
      try {
        const genUid = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
        const syncJson = async (table: any, endpoint: string, isChild: boolean) => {
          // ----- PUSH (delta) -----
          const pushKey = `dl.lastSync.${endpoint}.${activeClinic}`;
          const pushSince = localStorage.getItem(pushKey) || "1970-01-01T00:00:00.000Z";
          let pushCursor = pushSince;
          // Ascending by updatedAt so the cursor means "everything up to here is pushed".
          const all = (await table.toArray()).filter((r: any) => belongs(r))
            .sort((a: any, b: any) => String(a.updatedAt || a.createdAt || "").localeCompare(String(b.updatedAt || b.createdAt || "")));
          for (const rec of all) {
            let uid = rec.uid;
            if (!uid) { uid = genUid(); if (rec.id) await table.update(rec.id, { uid }); rec.uid = uid; }
            const upd = String(rec.updatedAt || rec.createdAt || "");
            if (upd && upd <= pushSince) continue; // delta: only changed
            const { id, ...rest } = rec;
            const data: any = { ...rest };
            if (isChild && rec.fileId != null) {
              const pf = await db.maternityFiles.get(rec.fileId);
              if (pf?.uid) data.fileUid = pf.uid; // stable cross-device link
            }
            try {
              const r = await fetch(`${API_BASE}${endpoint}`, {
                method: "POST", headers: authHeaders,
                body: JSON.stringify({ uid, data, deleted: !!rec.deleted, updated_at: rec.updatedAt || rec.createdAt || new Date().toISOString() }),
              });
              if (!r.ok) break;                 // rate-limited / server error → stop; resume next cycle from here
              if (upd > pushCursor) pushCursor = upd; // advance ONLY on success → no gaps
            } catch { break; }                  // network error → stop, keep cursor
          }
          try { localStorage.setItem(pushKey, pushCursor); } catch {}
          // ----- PULL (delta, LWW) -----
          try {
            const pullKey = `dl.lastSyncPull.${endpoint}.${activeClinic}`;
            const pullSince = localStorage.getItem(pullKey) || "1970-01-01T00:00:00.000Z";
            let pullCursor = pullSince;
            const res = await fetch(`${API_BASE}${endpoint}?since=${encodeURIComponent(pullSince)}`, { headers: authHeaders });
            if (res.ok) {
              const rows = await res.json();
              for (const row of rows) {
                try {
                  if (!row.uid) continue;
                  const srvUpd = String(row.updated_at || "");
                  if (srvUpd > pullCursor) pullCursor = srvUpd;
                  const existing = await table.where("uid").equals(row.uid).first();
                  if (row.deleted) { if (existing?.id && !existing.deleted) await table.update(existing.id, { deleted: true, updatedAt: srvUpd }); continue; }
                  const data: any = { ...(row.data || {}) };
                  delete data.id; // never carry the origin device's local id
                  data.uid = row.uid; data.clinicId = activeClinic; data.deleted = false; data.updatedAt = srvUpd;
                  if (isChild && data.fileUid) {
                    const lf = await db.maternityFiles.where("uid").equals(data.fileUid).first();
                    if (lf?.id) data.fileId = lf.id; // resolve to THIS device's file id
                  }
                  if (existing?.id) {
                    if (srvUpd >= String(existing.updatedAt || "")) await table.update(existing.id, data);
                  } else {
                    await table.add({ ...data, createdAt: (row.data && row.data.createdAt) || srvUpd });
                  }
                } catch { /* per-row: one bad row never aborts the pull */ }
              }
              localStorage.setItem(pullKey, pullCursor);
            }
          } catch (e) { console.warn(`[sync] ${endpoint} pull failed`, e); }
        };
        // Files FIRST so children resolve their fileUid → local fileId in the same cycle.
        await syncJson(db.maternityFiles, "/api/maternity-files", false);
        await syncJson(db.maternityRecords, "/api/maternity-records", true);
        await syncJson(db.ancVisits, "/api/anc-visits", true);
        await syncJson(db.partographEntries, "/api/partograph", true);
      } catch (e) { console.warn("[sync] maternity sync failed", e); }

      try { localStorage.setItem("dl.lastSyncAt", String(Date.now())); } catch {}
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