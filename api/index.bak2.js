const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const pool = new Pool({
  user: "divinelink_user",
  host: "localhost",
  database: "divinelink",
  password: "DivineLink2026Cam",
  port: 5432,
});

const JWT_SECRET = "divinelink-secret-2026-cameroun";

function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
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
    if (since) { query += " AND created_at > $2"; params.push(since); }
    query += " ORDER BY created_at DESC";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/patients", auth, async (req, res) => {
  try {
    const p = req.body;
    if (!p.date_of_birth || isNaN(Date.parse(p.date_of_birth))) p.date_of_birth = null;
    const result = await pool.query(
      `INSERT INTO patients (clinic_id, patient_code, first_name, last_name, phone, date_of_birth, gender, address, blood_type, national_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (clinic_id, patient_code) DO UPDATE SET first_name=$3, last_name=$4, phone=$5
       RETURNING *`,
      [req.user.clinic_id, p.patient_code, p.first_name, p.last_name, p.phone, p.date_of_birth, p.gender, p.address, p.blood_type, p.national_id]
    );
    res.json(result.rows[0]);
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
    const result = await pool.query(
      `INSERT INTO consultations (clinic_id, patient_id, doctor_id, specialty, chief_complaint, diagnosis, treatment, vital_signs, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING *`,
      [req.user.clinic_id, c.patient_id, req.user.id, c.specialty, c.chief_complaint, c.diagnosis, c.treatment, JSON.stringify(c.vital_signs || {})]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/documents", auth, async (req, res) => {
  try {
    const d = req.body;
    const result = await pool.query(
      `INSERT INTO documents (clinic_id, patient_id, consult_id, type, name, data, source, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *`,
      [req.user.clinic_id, d.patient_id, d.consult_id, d.type, d.name, d.data, d.source]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/documents", auth, async (req, res) => {
  try {
    const { patient_id } = req.query;
    let query = "SELECT id, patient_id, name, type, source, created_at FROM documents WHERE clinic_id = $1";
    const params = [req.user.clinic_id];
    if (patient_id) { query += " AND patient_id = $2"; params.push(patient_id); }
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


app.post("/api/clinic/verify", async (req, res) => {
  try {
    const { code } = req.body;
    const result = await pool.query("SELECT * FROM clinics WHERE code = $1", [code]);
    const clinic = result.rows[0];
    if (!clinic) return res.status(404).json({ error: "Clinic not found" });
    const token = jwt.sign({ clinic_id: clinic.id, role: "staff" }, "divinelink-secret-2026-cameroun", { expiresIn: "30d" });
    res.json({ clinic_id: clinic.id, clinic_name: clinic.name, token });
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

app.listen(3000, () => console.log("DivineLink API running on port 3000"));


