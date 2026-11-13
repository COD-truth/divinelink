const express = require("express");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.set("trust proxy", 1);

// Rate limiting — blocks brute force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // max 10 login attempts per 15 min
  message: { error: 'Too many attempts. Try again in 15 minutes.' }
});
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100 // max 100 requests per minute per IP
});
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const pool = new Pool({
  user: "divinelink_user",
  host: "localhost",
  database: "divinelink",
  password: "DivineLink2026Cam",
  port: 5432,
});

const JWT_SECRET = process.env.JWT_SECRET || "efb6b20133c9e6a7c26c1cdb684e38c36edef986f25e906187cad7d07de891a2852e8b46a4988a0628113e28f0507317ac7faa00dfc6c037744956ffaa533960";

function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    try {
      req.user = jwt.verify(token, "divinelink-secret-2026-cameroun");
      next();
    } catch {
      res.status(401).json({ error: "Invalid token" });
    }
  }
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query("SELECT * FROM users WHERE email = $1 AND is_active = true", [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ id: user.id, clinic_id: user.clinic_id, role: user.role }, JWT_SECRET, { expiresIn: "8h" });
    res.json({ token, user: { id: user.id, name: user.full_name, role: user.role, clinic_id: user.clinic_id } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/patients", auth, async (req, res) => {
  try {
    const { since } = req.query;
    let query = "SELECT * FROM patients WHERE clinic_id = $1";
    const params = [req.user.clinic_id];
    if (since) { query += " AND updated_at > $2"; params.push(since); }
    query += " ORDER BY updated_at ASC";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/patients", auth, async (req, res) => {
  try {
    const p = req.body;
    if (!p.date_of_birth || isNaN(Date.parse(p.date_of_birth))) p.date_of_birth = null;
    const clinicId = req.user.clinic_id;
    const uid = p.uid || null;
    const updatedAt = (p.updated_at && !isNaN(Date.parse(p.updated_at))) ? p.updated_at : new Date().toISOString();
    const registeredAt = (p.registered_at && !isNaN(Date.parse(p.registered_at))) ? p.registered_at : null;
    const deleted = !!p.deleted;
    if (!uid) {
      const legacy = await pool.query(
        `INSERT INTO patients (clinic_id, patient_code, first_name, last_name, phone, date_of_birth, gender, address, blood_type, national_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
         ON CONFLICT (clinic_id, patient_code) DO UPDATE SET first_name=$3, last_name=$4, phone=$5
         RETURNING *`,
        [clinicId, p.patient_code, p.first_name, p.last_name, p.phone, p.date_of_birth, p.gender||null, p.address, p.blood_type||null, p.national_id||null]
      );
      return res.json(legacy.rows[0] || { ok: true });
    }
    // Reconcile legacy rows: adopt the client's uid onto a same-code row that
    // does not yet have it (and only if no row already owns this uid).
    await pool.query(
      `UPDATE patients SET uid=$1 WHERE clinic_id=$2 AND patient_code=$3 AND (uid IS NULL OR uid<>$1)
         AND NOT EXISTS (SELECT 1 FROM patients q WHERE q.clinic_id=$2 AND q.uid=$1)`,
      [uid, clinicId, p.patient_code]
    );
    const result = await pool.query(
      `INSERT INTO patients (clinic_id, uid, patient_code, first_name, last_name, phone, date_of_birth, gender, address, blood_type, national_id, medical_alerts, registered_by, registered_at, visit_type, reason_for_visit, deleted, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW(),$18)
       ON CONFLICT (clinic_id, uid) DO UPDATE SET
         patient_code=EXCLUDED.patient_code, first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name,
         phone=EXCLUDED.phone, date_of_birth=EXCLUDED.date_of_birth, address=EXCLUDED.address,
         medical_alerts=EXCLUDED.medical_alerts,
         registered_by=COALESCE(EXCLUDED.registered_by, patients.registered_by),
         registered_at=COALESCE(EXCLUDED.registered_at, patients.registered_at),
         visit_type=COALESCE(EXCLUDED.visit_type, patients.visit_type),
         reason_for_visit=COALESCE(EXCLUDED.reason_for_visit, patients.reason_for_visit),
         deleted=EXCLUDED.deleted, updated_at=EXCLUDED.updated_at
       WHERE patients.updated_at IS NULL OR patients.updated_at <= EXCLUDED.updated_at
       RETURNING *`,
      [clinicId, uid, p.patient_code, p.first_name, p.last_name, p.phone, p.date_of_birth, p.gender||null, p.address, p.blood_type||null, p.national_id||null, p.medical_alerts||null, p.registered_by||null, registeredAt, p.visit_type||null, p.reason_for_visit||null, deleted, updatedAt]
    );
    res.json(result.rows[0] || { ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/consultations", auth, async (req, res) => {
  try {
    const { since, patient_id } = req.query;
    let query = "SELECT * FROM consultations WHERE clinic_id = $1";
    const params = [req.user.clinic_id];
    if (patient_id) { query += " AND patient_id = $2"; params.push(patient_id); }
    if (since) { query += " AND created_at > $" + (params.length + 1); params.push(since); }
    query += " ORDER BY created_at DESC";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/consultations", auth, async (req, res) => {
  try {
    const c = req.body;
    const uid = c.uid || null;
    const updatedAt = (c.updated_at && !isNaN(Date.parse(c.updated_at))) ? c.updated_at : new Date().toISOString();
    const deleted = !!c.deleted;
    const localId = String(c.local_id || c.id || c.patient_id);
    if (!uid) {
      // Legacy path (old clients without uid). New clients always send a uid.
      const result = await pool.query(
        `INSERT INTO consultations (clinic_id, local_id, patient_id, doctor_id, specialty, chief_complaint, diagnosis, treatment, vital_signs, deleted, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
         RETURNING *`,
        [req.user.clinic_id, localId, c.patient_id, req.user.id || null, c.specialty, c.chief_complaint, c.diagnosis, c.treatment, JSON.stringify(c.vital_signs || {}), deleted]
      );
      return res.json(result.rows[0]);
    }
    const result = await pool.query(
      `INSERT INTO consultations (clinic_id, uid, local_id, patient_id, doctor_id, specialty, chief_complaint, diagnosis, treatment, vital_signs, deleted, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$12)
       ON CONFLICT (clinic_id, uid) DO UPDATE SET
         local_id=EXCLUDED.local_id, patient_id=EXCLUDED.patient_id, specialty=EXCLUDED.specialty,
         chief_complaint=EXCLUDED.chief_complaint, diagnosis=EXCLUDED.diagnosis, treatment=EXCLUDED.treatment,
         vital_signs=EXCLUDED.vital_signs, deleted=EXCLUDED.deleted, updated_at=EXCLUDED.updated_at
       WHERE consultations.updated_at IS NULL OR consultations.updated_at <= EXCLUDED.updated_at
       RETURNING *`,
      [req.user.clinic_id, uid, localId, c.patient_id, req.user.id || null, c.specialty, c.chief_complaint, c.diagnosis, c.treatment, JSON.stringify(c.vital_signs || {}), deleted, updatedAt]
    );
    res.json(result.rows[0] || { ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/documents", auth, async (req, res) => {
  try {
    const d = req.body;
    const uid = d.uid || null;
    const updatedAt = (d.updated_at && !isNaN(Date.parse(d.updated_at))) ? d.updated_at : new Date().toISOString();
    const deleted = !!d.deleted;
    if (!uid) {
      // Legacy path (old clients without uid). New clients always send a uid.
      const result = await pool.query(
        `INSERT INTO documents (clinic_id, patient_id, consult_id, type, name, data, source, deleted, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW()) RETURNING *`,
        [req.user.clinic_id, d.patient_id, d.consult_id, d.type, d.name, d.data, d.source, deleted]
      );
      return res.json(result.rows[0]);
    }
    const result = await pool.query(
      `INSERT INTO documents (clinic_id, uid, patient_id, consult_id, type, name, data, source, deleted, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),$10)
       ON CONFLICT (clinic_id, uid) DO UPDATE SET
         patient_id=EXCLUDED.patient_id, consult_id=EXCLUDED.consult_id, type=EXCLUDED.type,
         name=EXCLUDED.name, data=EXCLUDED.data, source=EXCLUDED.source,
         deleted=EXCLUDED.deleted, updated_at=EXCLUDED.updated_at
       WHERE documents.updated_at IS NULL OR documents.updated_at <= EXCLUDED.updated_at
       RETURNING *`,
      [req.user.clinic_id, uid, d.patient_id, d.consult_id, d.type, d.name, d.data, d.source, deleted, updatedAt]
    );
    res.json(result.rows[0] || { ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/documents", auth, async (req, res) => {
  try {
    const { since, patient_id } = req.query;
    let query = "SELECT id, uid, patient_id, consult_id, type, name, data, source, deleted, created_at, updated_at FROM documents WHERE clinic_id = $1";
    const params = [req.user.clinic_id];
    if (patient_id) { query += ` AND patient_id = $${params.length + 1}`; params.push(patient_id); }
    if (since) { query += ` AND COALESCE(updated_at, created_at) > $${params.length + 1}`; params.push(since); }
    query += " ORDER BY COALESCE(updated_at, created_at) ASC";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/audit", auth, async (req, res) => {
  try {
    const { action, resource, resource_id, details } = req.body;
    await pool.query(
      `INSERT INTO audit_logs (clinic_id, user_id, action, resource, resource_id, details, created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [req.user.clinic_id, req.user.id, action, resource, resource_id, JSON.stringify(details || {})]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


app.post("/api/clinic/register", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Name required" });
    function genCode() {
      const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
      let c = "";
      for (let i = 0; i < 3; i++) c += letters[Math.floor(Math.random() * letters.length)];
      c += "-" + Math.floor(1000 + Math.random() * 9000);
      return c;
    }
    let code, tries = 0;
    while (tries < 10) {
      code = genCode();
      const exists = await pool.query("SELECT id FROM clinics WHERE code = $1", [code]);
      if (exists.rows.length === 0) break;
      tries++;
    }
    const result = await pool.query(
      `INSERT INTO clinics (name, code, tier, self_registered, role_pins)
       VALUES ($1, $2, 'free', true, jsonb_build_object(
         'admin',        crypt('1111',  gen_salt('bf')),
         'doctor',       crypt('2222',   gen_salt('bf')),
         'receptionist', crypt('3333', gen_salt('bf'))
       )) RETURNING *`,
      [name.trim(), code]
    );
    const clinic = result.rows[0];
    const userRole = req.body.role || "admin";
    const token = jwt.sign({ clinic_id: clinic.id, role: userRole }, JWT_SECRET, { expiresIn: "365d" });
    res.json({ clinic_id: clinic.id, clinic_name: clinic.name, code: clinic.code, token });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
function normClinicName(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

app.post("/api/clinic/verify", authLimiter, async (req, res) => {
  try {
    const { code, pin, name } = req.body;
    if (!code || !pin) return res.status(400).json({ error: "Code and PIN required" });

    const result = await pool.query("SELECT * FROM clinics WHERE code = $1", [String(code).trim()]);
    const clinic = result.rows[0];
    if (!clinic) return res.status(404).json({ error: "Clinic not found" });

    if (name && normClinicName(name) !== normClinicName(clinic.name)) {
      return res.status(409).json({ error: "Name mismatch", clinic_name: clinic.name });
    }

    const pins = clinic.role_pins || {};
    let role = null;
    for (const r of ["admin", "doctor", "receptionist"]) {
      if (pins[r] && (await bcrypt.compare(String(pin), pins[r]))) { role = r; break; }
    }
    if (!role) return res.status(401).json({ error: "Invalid staff PIN" });

    const token = jwt.sign({ clinic_id: clinic.id, role }, JWT_SECRET, { expiresIn: "365d" });
    res.json({ clinic_id: clinic.id, clinic_name: clinic.name, role, token });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/admin/clinics", auth, async (req, res) => {
  if (req.user.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
  try {
    const result = await pool.query("SELECT c.id, c.name, c.code, c.created_at, (SELECT COUNT(*) FROM patients p WHERE p.clinic_id = c.id) AS patient_count, (SELECT COUNT(*) FROM consultations co WHERE co.clinic_id = c.id) AS consultation_count, (SELECT COUNT(*) FROM users u WHERE u.clinic_id = c.id) AS user_count FROM clinics c ORDER BY c.created_at DESC");
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/admin/clinics", auth, async (req, res) => {
  if (req.user.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
  try {
    const { name, code, address, phone } = req.body;
    const result = await pool.query("INSERT INTO clinics (name, code, address, phone) VALUES ($1,$2,$3,$4) RETURNING *", [name, code, address, phone]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ── Survey: register/update a survey (push from app) ──
app.post("/api/surveys", auth, async (req, res) => {
  try {
    const sv = req.body;
    const result = await pool.query(
      `INSERT INTO surveys (clinic_id, invite_code, title, description, survey_type, questions, status, anonymous, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (invite_code) DO UPDATE SET title=$3, description=$4, questions=$6, status=$7
       RETURNING *`,
      [req.user.clinic_id, sv.invite_code, sv.title, sv.description, sv.survey_type, JSON.stringify(sv.questions || []), sv.status || 'active', sv.anonymous || false]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Survey: list all surveys for a clinic
app.get("/api/surveys", auth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, invite_code, title, description, survey_type, status, anonymous, created_at FROM surveys WHERE clinic_id = $1 ORDER BY created_at DESC",
      [req.user.clinic_id]
    );
    res.json(result.rows);
  } catch(e) { res.status(500).json({error: String(e)}); }
});

// ── Survey: public fetch by invite code (for respondents, no auth) ──
app.get("/api/surveys/:code", async (req, res) => {
  try {
    const result = await pool.query("SELECT invite_code, title, description, questions, status, anonymous FROM surveys WHERE invite_code = $1", [req.params.code]);
    if (!result.rows[0]) return res.status(404).json({ error: "Survey not found" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Survey: submit a response (no auth so anyone with the link can answer) ──
app.post("/api/surveys/:code/responses", async (req, res) => {
  try {
    const r = req.body;
    const sv = await pool.query("SELECT clinic_id FROM surveys WHERE invite_code = $1", [req.params.code]);
    const clinicId = sv.rows[0] ? sv.rows[0].clinic_id : null;
    const result = await pool.query(
      `INSERT INTO survey_responses (survey_invite_code, clinic_id, local_id, respondent_name, respondent_phone, answers, started_at, completed_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (survey_invite_code, local_id) DO UPDATE SET answers=$6, completed_at=$8
       RETURNING id`,
      [req.params.code, clinicId, String(r.local_id || r.id || Math.random()), r.respondent_name, r.respondent_phone, JSON.stringify(r.answers || {}), r.started_at || null, r.completed_at || null]
    );
    res.json({ ok: true, id: result.rows[0].id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Survey: list responses for a survey (auth, for analytics) ──
app.get("/api/surveys/:code/responses", auth, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM survey_responses WHERE survey_invite_code = $1 ORDER BY created_at DESC", [req.params.code]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

require("./maternity_sync")(app, pool, auth);
app.listen(3000, () => console.log("DivineLink API running on port 3000"));


// ═══════════════════════════════════════════════════════════════
// DIVINELINK — PUSH NOTIFICATION API ENDPOINTS
// Add this ENTIRE block to /opt/divinelink-api/index.js
// Place it BEFORE the final app.listen() call
// ═══════════════════════════════════════════════════════════════

// At the TOP of index.js, add these two blocks:
const webpush = require('web-push');
try {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL}`,
    process.env.VAPID_PUBLIC,
    process.env.VAPID_PRIVATE
  );
} catch (e) {
  console.warn("[push] VAPID keys missing — push notifications disabled");
}

app.get('/api/push/vapid-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC });
});

app.post('/api/push/subscribe', auth, async (req, res) => {
  const { endpoint, keys, preferences = {} } = req.body;
  const clinic_id = req.user.clinicId;
  const user_name = req.user.name || 'unknown';
  if (!endpoint || !keys?.p256dh || !keys?.auth)
    return res.status(400).json({ error: 'Missing subscription data' });
  try {
    await pool.query(`
      INSERT INTO push_subscriptions (clinic_id, user_name, endpoint, p256dh, auth, preferences, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,NOW())
      ON CONFLICT (endpoint) DO UPDATE SET
        clinic_id=EXCLUDED.clinic_id, user_name=EXCLUDED.user_name,
        preferences=EXCLUDED.preferences, updated_at=NOW()
    `, [clinic_id, user_name, endpoint, keys.p256dh, keys.auth, JSON.stringify(preferences)]);
    res.json({ ok: true });
  } catch (err) { console.error('[push] subscribe:', err); res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/push/subscribe', auth, async (req, res) => {
  const { endpoint } = req.body;
  try {
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint=$1', [endpoint]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.patch('/api/push/preferences', auth, async (req, res) => {
  const { endpoint, preferences } = req.body;
  try {
    await pool.query('UPDATE push_subscriptions SET preferences=$1,updated_at=NOW() WHERE endpoint=$2',
      [JSON.stringify(preferences), endpoint]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/push/test', auth, async (req, res) => {
  const { endpoint } = req.body;
  try {
    const { rows } = await pool.query('SELECT * FROM push_subscriptions WHERE endpoint=$1', [endpoint]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const sub = { endpoint: rows[0].endpoint, keys: { p256dh: rows[0].p256dh, auth: rows[0].auth } };
    await webpush.sendNotification(sub, JSON.stringify({
      title: '✅ DivineLink',
      body: 'Notifications activées avec succès!',
      icon: '/icon-192.png',
      tag: 'test'
    }));
    res.json({ ok: true });
  } catch (err) { console.error('[push] test:', err); res.status(500).json({ error: 'Failed' }); }
});

async function sendToClinic(clinicId, payload, prefKey = null) {
  try {
    const { rows } = await pool.query('SELECT * FROM push_subscriptions WHERE clinic_id=$1', [clinicId]);
    const results = await Promise.allSettled(
      rows.filter(r => !prefKey || (r.preferences || {})[prefKey] !== false)
        .map(r => webpush.sendNotification(
          { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
          JSON.stringify(payload)
        ).catch(async e => {
          if (e.statusCode === 410 || e.statusCode === 404)
            await pool.query('DELETE FROM push_subscriptions WHERE endpoint=$1', [r.endpoint]);
          throw e;
        }))
    );
    return { sent: results.filter(r => r.status === 'fulfilled').length, total: rows.length };
  } catch (e) { return { sent: 0, total: 0 }; }
}

// ══════════════════════════════════════════
// EXPEDITION MODULE
// ══════════════════════════════════════════

// List all expeditions for a clinic
app.get('/api/expeditions', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM expeditions WHERE clinic_id=$1 ORDER BY date_start DESC',
      [req.user.clinic_id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({error: String(e)}); }
});

// Create expedition
app.post('/api/expeditions', auth, async (req, res) => {
  try {
    const { name, location, date_start, date_end, team, notes } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO expeditions (clinic_id, name, location, date_start, date_end, team, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.clinic_id, name, location, date_start, date_end||null,
       JSON.stringify(team||[]), notes||'', req.user.name||'admin']
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({error: String(e)}); }
});

// Update expedition status
app.patch('/api/expeditions/:id', auth, async (req, res) => {
  try {
    const { status, date_end, notes } = req.body;
    const { rows } = await pool.query(
      'UPDATE expeditions SET status=$1, date_end=$2, notes=$3 WHERE id=$4 AND clinic_id=$5 RETURNING *',
      [status, date_end||null, notes||'', req.params.id, req.user.clinic_id]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({error: String(e)}); }
});

// Get expedition patients
app.get('/api/expeditions/:id/patients', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM expedition_patients WHERE expedition_id=$1 AND clinic_id=$2 ORDER BY created_at DESC',
      [req.params.id, req.user.clinic_id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({error: String(e)}); }
});

// Add patient to expedition
app.post('/api/expeditions/:id/patients', auth, async (req, res) => {
  try {
    const { first_name, last_name, age, gender, village, phone,
            chief_complaint, diagnosis, procedures, treated_by,
            supervised_by, outcome, follow_up_needed, follow_up_date, notes } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO expedition_patients
       (expedition_id, clinic_id, first_name, last_name, age, gender, village, phone,
        chief_complaint, diagnosis, procedures, treated_by, supervised_by,
        outcome, follow_up_needed, follow_up_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [req.params.id, req.user.clinic_id, first_name, last_name, age||null,
       gender||'', village||'', phone||'', chief_complaint||'', diagnosis||'',
       JSON.stringify(procedures||[]), treated_by||'', supervised_by||'',
       outcome||'', follow_up_needed||false, follow_up_date||null, notes||'']
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({error: String(e)}); }
});

// Expedition report summary
app.get('/api/expeditions/:id/report', auth, async (req, res) => {
  try {
    const exp = await pool.query('SELECT * FROM expeditions WHERE id=$1', [req.params.id]);
    const patients = await pool.query(
      'SELECT * FROM expedition_patients WHERE expedition_id=$1', [req.params.id]
    );
    const p = patients.rows;
    const procedures = p.flatMap(pt => {
      try { return JSON.parse(pt.procedures||'[]'); } catch { return []; }
    });
    const procCount = {};
    procedures.forEach(pr => { procCount[pr.name||pr] = (procCount[pr.name||pr]||0)+1; });
    const byDoctor = {};
    p.forEach(pt => {
      const d = pt.treated_by||'Unknown';
      byDoctor[d] = (byDoctor[d]||0)+1;
    });
    res.json({
      expedition: exp.rows[0],
      totalPatients: p.length,
      byGender: {
        male: p.filter(x=>x.gender==='M'||x.gender==='male').length,
        female: p.filter(x=>x.gender==='F'||x.gender==='female').length,
      },
      procedures: procCount,
      byDoctor,
      followUps: p.filter(x=>x.follow_up_needed).length,
      outcomes: {
        treated: p.filter(x=>x.outcome==='treated').length,
        referred: p.filter(x=>x.outcome==='referred').length,
        pending: p.filter(x=>x.outcome==='pending').length,
      }
    });
  } catch(e) { res.status(500).json({error: String(e)}); }
});

// ── Staff join clinic ──
app.post("/api/staff/join", async (req, res) => {
  try {
    const { clinic_code, name, role, pin_hash } = req.body;
    if (!clinic_code || !name || !role || !pin_hash) {
      return res.status(400).json({ error: "Missing fields" });
    }
    // Find clinic by code
    const clinic = await pool.query(
      "SELECT id, name FROM clinics WHERE code=$1",
      [clinic_code.toUpperCase()]
    );
    if (!clinic.rows[0]) return res.status(404).json({ error: "Clinic not found" });
    const clinicId = clinic.rows[0].id;
    const clinicName = clinic.rows[0].name;
    // Create or update staff user
    const existing = await pool.query(
      "SELECT id FROM users WHERE clinic_id=$1 AND name=$2",
      [clinicId, name]
    );
    let userId;
    if (existing.rows[0]) {
      await pool.query(
        "UPDATE users SET role=$1, pin_hash=$2, is_active=true WHERE id=$3",
        [role, pin_hash, existing.rows[0].id]
      );
      userId = existing.rows[0].id;
    } else {
      const inserted = await pool.query(
        "INSERT INTO users (clinic_id, name, role, pin_hash, full_name, password_hash) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
        [clinicId, name, role, pin_hash, name, pin_hash]
      );
      userId = inserted.rows[0].id;
    }
    // Generate token
    const token = jwt.sign(
      { clinic_id: clinicId, role, user_id: userId, name },
      JWT_SECRET,
      { expiresIn: "365d" }
    );
    res.json({ token, clinic_id: clinicId, clinic_name: clinicName, user_id: userId });
  } catch(e) { res.status(500).json({ error: String(e) }); }
});

// ── Sync staff users from server ──
app.get("/api/staff", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, role, permissions, is_active FROM users WHERE clinic_id=$1",
      [req.user.clinic_id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: String(e) }); }
});

// ── Update staff permissions ──
app.patch("/api/staff/:id", auth, async (req, res) => {
  try {
    const { permissions, is_active } = req.body;
    await pool.query(
      "UPDATE users SET permissions=$1, is_active=$2 WHERE id=$3 AND clinic_id=$4",
      [JSON.stringify(permissions||[]), is_active!==false, req.params.id, req.user.clinic_id]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: String(e) }); }
});

// ── Delete patient ──
app.delete("/api/patients/:id", auth, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM patients WHERE patient_code=$1 AND clinic_id=$2 RETURNING id",
      [String(req.params.id), req.user.clinic_id]
    );
    if (result.rowCount === 0) {
      await pool.query(
        "DELETE FROM patients WHERE id::text=$1 AND clinic_id=$2",
        [String(req.params.id), req.user.clinic_id]
      );
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: String(e) }); }
});
