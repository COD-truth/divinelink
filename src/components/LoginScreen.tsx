import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { LangToggle } from "@/components/LangToggle";
import { Loader as Loader2 } from "lucide-react";
import { db } from "@/lib/db";

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-700 border-red-300",
  doctor: "bg-blue-100 text-blue-700 border-blue-300",
  receptionist: "bg-emerald-100 text-emerald-700 border-emerald-300",
  assistant: "bg-amber-100 text-amber-700 border-amber-300",
};

export function LoginScreen() {
  const { login } = useAuth();
  const { t } = useLang();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [welcomeRole, setWelcomeRole] = useState<string | null>(null);
  const [joinMode, setJoinMode] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinRole, setJoinRole] = useState("receptionist");
  const [joinName, setJoinName] = useState("");
  const [joinPin, setJoinPin] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [welcomeName, setWelcomeName] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);
    setLoading(true);
    // Pre-resolve the user so we can show the role badge before navigating
    try {
      const all = await db.users.filter(u => !!u.active).toArray();
      const { verifyPin } = await import("@/lib/db");
      const q = username.trim().toLowerCase();
      const narrowed = q
        ? all.filter(u => u.name.toLowerCase() === q || u.name.toLowerCase().includes(q) || u.role.toLowerCase() === q)
        : all;
      let matched: any = null;
      for (const u of narrowed) { if (await verifyPin(pin, u.pinHash)) { matched = u; break; } }
      if (matched) {
        setWelcomeRole(matched.role);
        setWelcomeName(matched.name);
      }
    } catch { /* fall through */ }
    const ok = await login(pin, username);
    setLoading(false);
    if (!ok) {
      setError(true);
      setPin("");
      setWelcomeRole(null);
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim() || !joinName.trim() || joinPin.length < 4) {
      return;
    }
    setJoinLoading(true);
    try {
      const res = await fetch("https://divinelink.mooo.com/api/clinic/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: joinCode.trim(), role: joinRole }),
      });
      const data = await res.json();
      if (data.token) {
        localStorage.setItem("divinelink.apiToken", data.token);
        localStorage.setItem("divinelink.clinicId", String(data.clinic_id));
        // Create local user
        const { hashPin, db } = await import("@/lib/db");
        const pinHash = await hashPin(joinPin);
        await db.users.add({
          name: joinName,
          role: joinRole as any,
          pinHash,
          active: true,
          createdAt: new Date().toISOString(),
        });
        const { saveClinicSettings, generateClinicId, getClinicSettings } = await import("@/lib/clinicSettings");
        const cur = getClinicSettings();
        saveClinicSettings({
          ...(cur || {}),
          clinicId: cur?.clinicId || generateClinicId(),
          name: data.clinic_name || "Clinique",
          currency: "FCFA",
          createdAt: cur?.createdAt || new Date().toISOString(),
        });
        setJoinMode(false);
        alert("Compte cree! Connectez-vous avec: " + joinName + " / PIN: " + joinPin);
      } else {
        alert("Code clinique invalide");
      }
    } catch {
      alert("Erreur reseau");
    }
    setJoinLoading(false);
  };

  if (joinMode) return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #0a2540 0%, #0c4a6e 40%, #0e7490 70%, #0891b2 100%)" }}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, #0891b2, #0e7490, #0c4a6e)" }} />
        <div className="px-8 pt-6 pb-8 space-y-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setJoinMode(false)} className="text-gray-400 hover:text-gray-600">←</button>
            <h2 className="text-xl font-bold text-gray-900">Rejoindre une clinique</h2>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Code clinique</label>
            <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Ex: DL-7829"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-gray-50" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Votre nom complet</label>
            <input value={joinName} onChange={e => setJoinName(e.target.value)}
              placeholder="Ex: Dr. Kamga Jean"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-gray-50" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Votre role</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "admin", label: "Admin", emoji: "👑" },
                { value: "doctor", label: "Medecin", emoji: "🩺" },
                { value: "receptionist", label: "Secretaire", emoji: "💼" },
              ].map(r => (
                <button key={r.value} type="button" onClick={() => setJoinRole(r.value)}
                  className={"p-2 rounded-xl border text-center transition-colors " + (joinRole === r.value ? "border-cyan-500 bg-cyan-50 font-semibold" : "border-gray-200 hover:border-cyan-300")}>
                  <div className="text-xl">{r.emoji}</div>
                  <div className="text-xs mt-0.5 text-gray-700">{r.label}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Choisir votre PIN (4 chiffres)</label>
            <input type="password" inputMode="numeric" maxLength={6} value={joinPin}
              onChange={e => setJoinPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 text-center text-xl tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-gray-50" />
          </div>
          <button onClick={handleJoin} disabled={joinLoading || !joinCode || !joinName || joinPin.length < 4}
            className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-sm disabled:opacity-50 transition">
            {joinLoading ? "Connexion..." : "Rejoindre la clinique"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{
        background: "linear-gradient(135deg, #0a2540 0%, #0c4a6e 40%, #0e7490 70%, #0891b2 100%)",
      }}
    >
      {/* Language toggle top-right */}
      <div className="absolute top-4 right-4 z-10">
        <LangToggle />
      </div>

      {/* Decorative blurred circles */}
      <div
        className="absolute top-[-80px] left-[-80px] w-80 h-80 rounded-full opacity-20 pointer-events-none"
        style={{ background: "radial-gradient(circle, #22d3ee 0%, transparent 70%)" }}
      />
      <div
        className="absolute bottom-[-60px] right-[-60px] w-64 h-64 rounded-full opacity-15 pointer-events-none"
        style={{ background: "radial-gradient(circle, #0ea5e9 0%, transparent 70%)" }}
      />

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
        {/* Card top accent bar */}
        <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, #0891b2, #0e7490, #0c4a6e)" }} />

        <div className="px-8 pt-8 pb-8">
          {/* App icon */}
          <div className="flex justify-center mb-5">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg"
              style={{ background: "linear-gradient(135deg, #0891b2 0%, #0c4a6e 100%)" }}
            >
              {/* Medical cross icon */}
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="15" y="5" width="10" height="30" rx="3" fill="white" fillOpacity="0.95" />
                <rect x="5" y="15" width="30" height="10" rx="3" fill="white" fillOpacity="0.95" />
              </svg>
            </div>
          </div>

          {/* Title */}
          <div className="text-center mb-7">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">DivineLink</h1>
            <p className="text-sm text-gray-500 mt-1">Medical Clinic Management System</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username field */}
            <div>
              <label className="block text-xs font-bold text-gray-500 tracking-widest uppercase mb-1.5">
                {t("auth.username") || "Username"}
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition bg-gray-50"
                autoComplete="username"
              />
            </div>

            {/* PIN field */}
            <div>
              <label className="block text-xs font-bold text-gray-500 tracking-widest uppercase mb-1.5">
                {t("auth.pinLabel") || "PIN / Password"}
              </label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pin}
                onChange={e => { setPin(e.target.value.replace(/\D/g, "")); setError(false); }}
                placeholder="••••"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 text-center text-xl tracking-[0.5em] placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition bg-gray-50"
                autoFocus
                autoComplete="current-password"
              />
              <p className="text-[11px] text-gray-400 mt-1.5 text-center">
                Type <b>admin</b>, <b>doctor</b> or <b>receptionist</b> as username · default PIN <b>1234</b>
              </p>
            </div>

            {/* Role badge after successful PIN */}
            {welcomeRole && !error && (
              <div className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold ${ROLE_COLORS[welcomeRole] || "bg-gray-100 text-gray-700 border-gray-300"}`}>
                ✓ {welcomeName} — {welcomeRole.charAt(0).toUpperCase() + welcomeRole.slice(1)}
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="text-red-500 text-sm text-center font-medium">
                {t("auth.error")}
              </p>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={pin.length < 4 || loading}
              className="w-full py-3.5 rounded-xl text-white font-bold text-base flex items-center justify-center gap-2 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: pin.length >= 4 && !loading
                  ? "linear-gradient(135deg, #0891b2 0%, #0c4a6e 100%)"
                  : "linear-gradient(135deg, #94a3b8 0%, #64748b 100%)",
                boxShadow: pin.length >= 4 && !loading ? "0 4px 16px rgba(8,145,178,0.4)" : "none",
              }}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {t("auth.login")}
                  <span className="text-lg">→</span>
                </>
              )}
            </button>
          </form>
          <div className="mt-4 text-center">
            <button onClick={() => setJoinMode(true)} className="text-xs text-cyan-600 hover:text-cyan-800 font-medium underline">
              Rejoindre une clinique existante
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
