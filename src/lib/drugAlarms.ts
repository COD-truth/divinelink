import { db } from "@/lib/db";
const FIRED_KEY = "dl.drugAlarms.fired.v1";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;
function loadFired(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(FIRED_KEY) || "{}"); } catch { return {}; }
}
function saveFired(m: Record<string, number>) {
  try { localStorage.setItem(FIRED_KEY, JSON.stringify(m)); } catch {} }
function purgeOld(m: Record<string, number>) {
  const cutoff = Date.now() - 7 * 86_400_000;
  for (const k of Object.keys(m)) if (m[k] < cutoff) delete m[k];
}
function notify(title: string, body: string, tag: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try { new Notification(title, { body, tag, icon: "/icon-192.png" }); } catch {}
  if ("vibrate" in navigator) { try { navigator.vibrate?.([300, 100, 300]); } catch {} }
}
async function checkDrugs() {
  const fired = loadFired();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const in30Days = new Date(today);
  in30Days.setDate(in30Days.getDate() + 30);
  const in30Str = in30Days.toISOString().slice(0, 10);
  try {
    const drugs = await db.drugs.toArray();
    for (const drug of drugs) {
      if (!drug.id) continue;
      const minStock = drug.minStock ?? 5;
      if (typeof drug.stock === "number" && drug.stock <= minStock) {
        const key = `low-stock-${drug.id}-${todayStr}`;
        if (!fired[key]) {
          const level = drug.stock === 0 ? "EPUISE / OUT OF STOCK" : `Stock faible: ${drug.stock} ${drug.unit || "unites"} restant(s)`;
          notify(`Pharmacie - ${drug.name}`, `${level} (minimum: ${minStock})`, `drug-low-${drug.id}`);
          fired[key] = Date.now();
        }
      }
      if (drug.expiration) {
        const expStr = drug.expiration.slice(0, 10);
        if (expStr < todayStr) {
          const key = `expired-${drug.id}-${todayStr}`;
          if (!fired[key]) {
            notify(`Medicament expire - ${drug.name}`, `Expire depuis le ${expStr}. Retirer du stock.`, `drug-expired-${drug.id}`);
            fired[key] = Date.now();
          }
        } else if (expStr <= in30Str) {
          const daysLeft = Math.ceil((new Date(expStr).getTime() - today.getTime()) / 86_400_000);
          const key = `expiring-soon-${drug.id}-${todayStr}`;
          if (!fired[key]) {
            notify(`Expiration proche - ${drug.name}`, `Expire dans ${daysLeft} jour(s) (${expStr})`, `drug-expiring-${drug.id}`);
            fired[key] = Date.now();
          }
        }
      }
    }
  } catch (e) { console.warn("[drugAlarms] check failed:", e); }
  purgeOld(fired);
  saveFired(fired);
}
export async function startDrugAlarms() {
  if ("Notification" in window && Notification.permission === "default") {
    await Notification.requestPermission();
  }
  await checkDrugs();
  if (!timer) timer = setInterval(checkDrugs, CHECK_INTERVAL_MS);
}
export function stopDrugAlarms() {
  if (timer) { clearInterval(timer); timer = null; }
}
export function triggerDrugCheck() { checkDrugs(); }
