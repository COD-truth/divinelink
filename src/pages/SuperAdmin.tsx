import { useState } from "react";

const API = "https://divinelink.mooo.com/api";

export default function SuperAdmin() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clinics, setClinics] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");

  async function login() {
    setErr("");
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.token) {
        setToken(data.token);
        loadClinics(data.token);
      } else setErr("Identifiants invalides");
    } catch { setErr("Serveur injoignable"); }
  }

  async function loadClinics(t: string) {
    const res = await fetch(`${API}/admin/clinics`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (res.ok) setClinics(await res.json());
    else setErr("Accès refusé");
  }

  async function createClinic() {
    if (!newName || !newCode) return;
    await fetch(`${API}/admin/clinics`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: newName, code: newCode }),
    });
    setNewName(""); setNewCode("");
    if (token) loadClinics(token);
  }

  if (!token) {
    return (
      <div style={{ maxWidth: 360, margin: "80px auto", fontFamily: "sans-serif" }}>
        <h2>DivineLink — Super Admin</h2>
        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
          style={{ width: "100%", padding: 10, margin: "8px 0" }} />
        <input placeholder="Mot de passe" type="password" value={password} onChange={e => setPassword(e.target.value)}
          style={{ width: "100%", padding: 10, margin: "8px 0" }} />
        <button onClick={login} style={{ width: "100%", padding: 10, background: "#0d9488", color: "#fff", border: 0 }}>
          Se connecter
        </button>
        {err && <p style={{ color: "red" }}>{err}</p>}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h2>Toutes les cliniques</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
            <th style={{ padding: 8 }}>Nom</th>
            <th style={{ padding: 8 }}>Code</th>
            <th style={{ padding: 8 }}>Patients</th>
            <th style={{ padding: 8 }}>Consultations</th>
            <th style={{ padding: 8 }}>Utilisateurs</th>
          </tr>
        </thead>
        <tbody>
          {clinics.map(c => (
            <tr key={c.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: 8 }}>{c.name}</td>
              <td style={{ padding: 8, fontFamily: "monospace" }}>{c.code}</td>
              <td style={{ padding: 8 }}>{c.patient_count}</td>
              <td style={{ padding: 8 }}>{c.consultation_count}</td>
              <td style={{ padding: 8 }}>{c.user_count}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ marginTop: 32 }}>Nouvelle clinique</h3>
      <input placeholder="Nom" value={newName} onChange={e => setNewName(e.target.value)}
        style={{ padding: 8, marginRight: 8 }} />
      <input placeholder="Code" value={newCode} onChange={e => setNewCode(e.target.value)}
        style={{ padding: 8, marginRight: 8 }} />
      <button onClick={createClinic} style={{ padding: 8, background: "#0d9488", color: "#fff", border: 0 }}>
        Créer
      </button>
    </div>
  );
}
