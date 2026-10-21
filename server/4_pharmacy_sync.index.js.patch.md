# Server patch — pharmacy sync endpoints (`/opt/divinelink-api/index.js`)

Adds 4 routes, all scoped to `req.user.clinic_id` from the JWT (same `auth`
middleware the other routes use). A device can therefore only ever read/write
its OWN clinic's rows — no cross-clinic bleed.

Prereq: run `3_pharmacy_sync.sql` first (creates the two tables).

Paste these near the other `app.post("/api/...")` routes. `pool` and `auth`
are the same objects the existing routes use.

```js
// ───────────────────────── Pharmacy sync ─────────────────────────
// Drugs: upsert by (clinic_id, uid). Catalogue fields update by updated_at;
// the sync BASELINE (sync_base_stock/at) is FIRST-WRITER-WINS so every device
// converges to one baseline and stock stays derivable from the event log.
app.post("/api/drugs", auth, async (req, res) => {
  try {
    const c = req.user.clinic_id; const b = req.body || {};
    if (!b.uid) return res.status(400).json({ error: "uid required" });
    await pool.query(
      `INSERT INTO drugs (clinic_id, uid, name, category, unit, pack_size, buy_price, sell_price,
         min_stock, initial_stock, stock_magasin, min_stock_magasin, supplier, expiration,
         batch_number, location, status, sync_base_stock, sync_base_at, deleted, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
               COALESCE($21::timestamptz, now()), COALESCE($22::timestamptz, now()))
       ON CONFLICT (clinic_id, uid) DO UPDATE SET
         name=EXCLUDED.name, category=EXCLUDED.category, unit=EXCLUDED.unit, pack_size=EXCLUDED.pack_size,
         buy_price=EXCLUDED.buy_price, sell_price=EXCLUDED.sell_price, min_stock=EXCLUDED.min_stock,
         initial_stock=EXCLUDED.initial_stock, stock_magasin=EXCLUDED.stock_magasin,
         min_stock_magasin=EXCLUDED.min_stock_magasin, supplier=EXCLUDED.supplier, expiration=EXCLUDED.expiration,
         batch_number=EXCLUDED.batch_number, location=EXCLUDED.location, status=EXCLUDED.status,
         sync_base_stock=COALESCE(drugs.sync_base_stock, EXCLUDED.sync_base_stock),
         sync_base_at=COALESCE(drugs.sync_base_at, EXCLUDED.sync_base_at),
         deleted=EXCLUDED.deleted, updated_at=EXCLUDED.updated_at
       WHERE EXCLUDED.updated_at >= drugs.updated_at`,
      [c, b.uid, b.name, b.category, b.unit, b.pack_size, b.buy_price, b.sell_price, b.min_stock,
       b.initial_stock, b.stock_magasin, b.min_stock_magasin, b.supplier, b.expiration, b.batch_number,
       b.location, b.status, b.sync_base_stock, b.sync_base_at, b.deleted, b.created_at, b.updated_at]
    );
    res.json({ ok: true });
  } catch (e) { console.error("POST /api/drugs", e); res.status(500).json({ error: "server" }); }
});

app.get("/api/drugs", auth, async (req, res) => {
  try {
    const c = req.user.clinic_id; const since = req.query.since || "1970-01-01";
    const r = await pool.query(
      "SELECT * FROM drugs WHERE clinic_id=$1 AND updated_at > $2 ORDER BY updated_at ASC LIMIT 5000",
      [c, since]);
    res.json(r.rows);
  } catch (e) { console.error("GET /api/drugs", e); res.status(500).json({ error: "server" }); }
});

// Drug transactions: append-only, idempotent on (clinic_id, uid).
app.post("/api/drug-transactions", auth, async (req, res) => {
  try {
    const c = req.user.clinic_id; const b = req.body || {};
    if (!b.uid) return res.status(400).json({ error: "uid required" });
    await pool.query(
      `INSERT INTO drug_transactions (clinic_id, uid, drug_uid, type, quantity, price, patient_id,
         payment_status, exit_reason, batch_number, performed_by, notes, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, COALESCE($13::timestamptz, now()))
       ON CONFLICT (clinic_id, uid) DO NOTHING`,
      [c, b.uid, b.drug_uid, b.type, b.quantity, b.price, b.patient_id, b.payment_status,
       b.exit_reason, b.batch_number, b.performed_by, b.notes, b.created_at]
    );
    res.json({ ok: true });
  } catch (e) { console.error("POST /api/drug-transactions", e); res.status(500).json({ error: "server" }); }
});

app.get("/api/drug-transactions", auth, async (req, res) => {
  try {
    const c = req.user.clinic_id; const since = req.query.since || "1970-01-01";
    const r = await pool.query(
      "SELECT * FROM drug_transactions WHERE clinic_id=$1 AND created_at > $2 ORDER BY created_at ASC LIMIT 10000",
      [c, since]);
    res.json(r.rows);
  } catch (e) { console.error("GET /api/drug-transactions", e); res.status(500).json({ error: "server" }); }
});
```

Then restart the API: `systemctl restart divinelink-api` (or `pm2 restart divinelink-api`).

Notes:
- node-postgres returns timestamptz columns as JS Dates → `res.json` serialises
  them to ISO strings, which is what the client's `since` cursor compares against.
  No extra formatting needed.
- Nothing here touches patients/consultations/documents sync — it's additive.
