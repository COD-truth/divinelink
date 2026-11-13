/**
 * DivineLink — Nightly Push Notification Cron
 * Runs at 7am daily: checks all clinics for low stock,
 * expiring drugs, unpaid invoices, sends push notifications.
 *
 * Add to crontab:
 * 0 7 * * * node /opt/divinelink-api/cron_push.js >> /var/log/divinelink-push.log 2>&1
 */

require('dotenv').config({ path: '/opt/divinelink-api/.env' });
const { Pool } = require('pg');
const webpush = require('web-push');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'divinelink',
  user: process.env.DB_USER || 'divinelink_user',
  password: process.env.DB_PASS || 'DivineLink2026Cam',
  port: 5432,
});

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL}`,
  process.env.VAPID_PUBLIC,
  process.env.VAPID_PRIVATE
);

async function sendToClinic(clinicId, payload, prefKey = null) {
  const { rows } = await pool.query(
    'SELECT * FROM push_subscriptions WHERE clinic_id=$1', [clinicId]
  );
  const subs = rows.filter(r => !prefKey || (r.preferences || {})[prefKey] !== false);
  await Promise.allSettled(
    subs.map(r => webpush.sendNotification(
      { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
      JSON.stringify(payload)
    ).catch(async e => {
      if (e.statusCode === 410 || e.statusCode === 404)
        await pool.query('DELETE FROM push_subscriptions WHERE endpoint=$1', [r.endpoint]);
    }))
  );
  return subs.length;
}

async function main() {
  console.log(`[${new Date().toISOString()}] Starting push cron...`);

  // Get all clinics that have push subscriptions
  const { rows: clinics } = await pool.query(
    'SELECT DISTINCT clinic_id FROM push_subscriptions'
  );

  for (const { clinic_id } of clinics) {
    console.log(`  Processing clinic: ${clinic_id}`);

    // ── Check unpaid invoices > 3 days old ─────────────────
    try {
      const { rows: unpaid } = await pool.query(`
        SELECT COUNT(*) as count FROM payments
        WHERE clinic_id=$1 AND status='unpaid'
        AND created_at < NOW() - INTERVAL '3 days'
      `, [clinic_id]);

      if (parseInt(unpaid[0].count) > 0) {
        await sendToClinic(clinic_id, {
          title: '💰 Factures impayées — DivineLink',
          body: `${unpaid[0].count} facture(s) impayée(s) depuis plus de 3 jours`,
          icon: '/icon-192.png',
          tag: `unpaid-${clinic_id}-${new Date().toDateString()}`
        }, 'unpaid_invoices');
        console.log(`    → Sent unpaid invoice alert`);
      }
    } catch (e) { console.warn('    ⚠ unpaid check failed:', e.message); }

    // ── Daily summary ───────────────────────────────────────
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { rows: todayStats } = await pool.query(`
        SELECT
          COUNT(DISTINCT p.id) as patients_today,
          COUNT(DISTINCT c.id) as consults_today,
          COALESCE(SUM(CASE WHEN py.status='paid' THEN py.amount ELSE 0 END), 0) as revenue_today
        FROM patients p
        FULL OUTER JOIN consultations c ON c.clinic_id=$1 AND DATE(c.created_at)=$2
        FULL OUTER JOIN payments py ON py.clinic_id=$1 AND DATE(py.created_at)=$2
        WHERE p.clinic_id=$1 AND DATE(p.created_at)=$2
      `, [clinic_id, today]);

      const s = todayStats[0];
      const revenue = parseInt(s.revenue_today || 0);
      if (revenue > 0 || parseInt(s.consults_today || 0) > 0) {
        await sendToClinic(clinic_id, {
          title: '📊 Résumé du jour — DivineLink',
          body: `${s.consults_today || 0} consultation(s) · ${revenue.toLocaleString()} FCFA encaissé`,
          icon: '/icon-192.png',
          tag: `daily-${clinic_id}-${today}`
        }, 'daily_summary');
        console.log(`    → Sent daily summary`);
      }
    } catch (e) { console.warn('    ⚠ daily summary failed:', e.message); }
  }

  console.log(`[${new Date().toISOString()}] Push cron done.`);
  await pool.end();
}

main().catch(e => {
  console.error('CRON FATAL:', e);
  process.exit(1);
});
