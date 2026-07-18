/**
 * Web-based appointment alarms.
 *
 * Scans Dexie appointments every 30s and fires a browser Notification
 * at configurable lead times (default 30min and 5min) before each
 * upcoming appointment. Dedupes per appointment+leadTime via localStorage
 * so notifications never fire twice for the same event.
 *
 * Uses the standard Notifications API (works on desktop + Android web).
 * iOS requires the app to be installed as PWA for notifications.
 */
import { db } from "@/lib/db";

const LEAD_MINUTES = [30, 5];
const FIRED_KEY = "dl.apptAlarms.fired.v1";

let timer: ReturnType<typeof setInterval> | null = null;

function loadFired(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(FIRED_KEY) || "{}"); } catch { return {}; }
}
function saveFired(m: Record<string, number>) {
  try { localStorage.setItem(FIRED_KEY, JSON.stringify(m)); } catch { /* */ }
}
function purgeOld(m: Record<string, number>) {
  const cutoff = Date.now() - 2 * 86400_000;
  for (const k of Object.keys(m)) if (m[k] < cutoff) delete m[k];
}

function notify(title: string, body: string, tag: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try { new Notification(title, { body, tag, icon: "/icon-192.png" }); } catch { /* */ }
  // vibrate if possible
  if ("vibrate" in navigator) { try { navigator.vibrate?.([200, 100, 200]); } catch { /* */ } }
}

async function tick() {
  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  const fired = loadFired();

  try {
    const appts = await db.appointments.where("date").equals(todayISO).toArray();
    for (const a of appts) {
      if (!a.id || !a.time) continue;
      if (a.status === "cancelled" || a.status === "completed") continue;
      const [hh, mm] = a.time.split(":").map(Number);
      if (isNaN(hh) || isNaN(mm)) continue;
      const at = new Date(now); at.setHours(hh, mm, 0, 0);
      const diffMin = (at.getTime() - now.getTime()) / 60_000;

      for (const lead of LEAD_MINUTES) {
        if (diffMin > lead || diffMin < lead - 1) continue; // 1-min window
        const key = `${a.id}-${todayISO}-${lead}`;
        if (fired[key]) continue;
        let name = "Patient";
        if (a.patientId) {
          const p = await db.patients.get(a.patientId).catch(() => null);
          if (p) name = `${p.firstName} ${p.lastName}`;
        }
        notify(
          "Rendez-vous à venir",
          `${name} — dans ${lead} min (${a.time})`,
          `appt-${a.id}-${lead}`
        );
        fired[key] = Date.now();
      }
    }
  } catch { /* */ }

  purgeOld(fired);
  saveFired(fired);
}

export function startAppointmentAlarms() {
  if (timer) return;
  tick();
  timer = setInterval(tick, 30_000);
}

export function stopAppointmentAlarms() {
  if (timer) { clearInterval(timer); timer = null; }
}
