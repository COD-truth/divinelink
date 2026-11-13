// DivineLink — maternity multi-device sync routes.
// Mirrors the patients/documents endpoints: uid-keyed, clinic-scoped (from JWT),
// last-write-wins, `since` deltas, tombstone-aware. Records stored as JSONB.
//
// INSTALL:
//   1) place this file in /opt/divinelink-api/maternity_sync.js
//   2) run maternity_migration.sql once
//   3) in index.js, ONE line before `app.listen(3000...)`:
//        require("./maternity_sync")(app, pool, auth);
//   4) pm2 restart divinelink-api

module.exports = function registerMaternitySync(app, pool, auth) {
  const TABLES = {
    "/api/maternity-files":   "maternity_files",
    "/api/maternity-records": "maternity_records",
    "/api/anc-visits":        "anc_visits",
    "/api/partograph":        "partograph_entries",
  };

  for (const [path, table] of Object.entries(TABLES)) {
    // table is a hardcoded constant (not user input) → safe to interpolate.

    // GET — rows for this clinic changed since ?since (tombstones included)
    app.get(path, auth, async (req, res) => {
      try {
        const { since } = req.query;
        let q = `SELECT uid, data, deleted, created_at, updated_at FROM ${table} WHERE clinic_id = $1`;
        const params = [req.user.clinic_id];
        if (since) { q += ` AND updated_at > $2`; params.push(since); }
        q += ` ORDER BY updated_at ASC`;
        const r = await pool.query(q, params);
        res.json(r.rows);
      } catch (e) { res.status(500).json({ error: String(e) }); }
    });

    // POST — upsert one record by (clinic_id, uid), last-write-wins
    app.post(path, auth, async (req, res) => {
      try {
        const b = req.body || {};
        const uid = b.uid;
        if (!uid) return res.status(400).json({ error: "uid required" });
        const updatedAt = (b.updated_at && !isNaN(Date.parse(b.updated_at))) ? b.updated_at : new Date().toISOString();
        const deleted = !!b.deleted;
        const data = b.data || {};
        const r = await pool.query(
          `INSERT INTO ${table} (clinic_id, uid, data, deleted, created_at, updated_at)
           VALUES ($1,$2,$3,$4,NOW(),$5)
           ON CONFLICT (clinic_id, uid) DO UPDATE SET
             data=EXCLUDED.data, deleted=EXCLUDED.deleted, updated_at=EXCLUDED.updated_at
           WHERE ${table}.updated_at IS NULL OR ${table}.updated_at <= EXCLUDED.updated_at
           RETURNING uid`,
          [req.user.clinic_id, uid, JSON.stringify(data), deleted, updatedAt]
        );
        res.json(r.rows[0] || { ok: true });
      } catch (e) { res.status(500).json({ error: String(e) }); }
    });
  }

  console.log("[maternity-sync] routes registered");
};
