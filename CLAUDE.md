# DivineLink — engineering context for Claude Code

Offline-first clinical management PWA for clinics in Cameroon. Read this fully
before changing anything. **This is LIVE patient data — be careful.**

## Where everything lives (all on this VPS)
- **Frontend** (this repo): `/var/www/divinelink` — Vite + React + TypeScript + shadcn/ui, Dexie (IndexedDB) offline store. Built with `npm run build` (Vite/esbuild; it does NOT typecheck, so pre-existing TS errors don't block builds). nginx serves `dist/`.
- **API**: `/opt/divinelink-api/index.js` — single-file Node/Express, managed by `pm2` (app name `divinelink-api`, port 3000). nginx reverse-proxies `/api` to it.
- **Database**: PostgreSQL, db name `divinelink` (`sudo -u postgres psql -d divinelink`).
- **Public URL**: https://divinelink.mooo.com
- **DB backup** (made 2026-09-19): `/root/divinelink-backup-*.sql.gz`. **Take a fresh `pg_dump` before any schema migration.**

## How to deploy (do these yourself — don't hand the user commands)
- **Frontend**: edit files in `/var/www/divinelink/src`, then:
  ```bash
  cd /var/www/divinelink
  VERSION=$(date +%Y%m%d%H%M%S)
  sed -i "s/divinelink-BUILD_VERSION/divinelink-$VERSION/g" public/sw.js
  npm run build
  sed -i "s/divinelink-$VERSION/divinelink-BUILD_VERSION/g" public/sw.js
  systemctl restart nginx
  ```
  (The sw.js version bump busts the PWA cache so devices get the new build.)
- **API**: edit `/opt/divinelink-api/index.js`, `node --check` it, then `pm2 restart divinelink-api`. Back it up first (`cp index.js index.js.bak_...`).
- **DB migration**: `sudo -u postgres psql -d divinelink -f file.sql`.
- Note: the repo is also a git checkout; `deploy.sh` does `git pull`. We've been editing on-server directly, so the server is AHEAD of GitHub — commit/push when convenient or a future `git pull` may clash.

## The architecture we're building (server-authoritative offline sync)
Root principle: **the server (Postgres) is the source of truth.** Devices are
synced caches. Fixes the three problems that plagued this app:

1. **Cross-clinic contamination** → every record carries `clinic_id` + a stable
   `uid` (UUID); sync only pushes the *active clinic's* rows, keyed by `uid`.
2. **Deletes that resurrect** → **soft-delete tombstones**: a `deleted` flag +
   `updated_at` that propagate up and down. Never hard-delete synced rows. UI
   hides `deleted` rows.
3. **Illegible/garbled fields** → sensitive fields (phone, address,
   medical_alerts) are encrypted at rest LOCALLY with a **per-device** key
   (random salt in localStorage — see `src/lib/crypto.ts`). That key can't
   travel, so ciphertext synced across devices is garbage. Fix: **sync as
   PLAINTEXT** — decrypt on push, re-encrypt with the local key on pull. The
   server holds plaintext (protect it with server-side/at-rest encryption).

Sync engine rules (see `src/hooks/useServerSync.ts`):
- Delta by `updated_at > lastSync` (per clinic cursor in localStorage key `dl.lastSync.<entity>.<clinicId>`).
- Upsert by `(clinic_id, uid)`. Last-write-wins by `updated_at`.
- Pull includes tombstones (rows where `deleted=true`) and applies them.

## STATUS — what's done vs left
**DONE (Phase 1 — patients, deployed & working):**
- DB: `patients` has `uid` (UNIQUE per clinic), `updated_at`, `deleted`, `medical_alerts`. Indexes `patients_clinic_uid_uidx`, `patients_clinic_updated_idx`.
- API `POST /api/patients`: upsert by `(clinic_id, uid)` with legacy reconcile (adopts client uid onto a same-`patient_code` row), last-write-wins, stores plaintext + `medical_alerts` + `deleted`.
- API `GET /api/patients?since=`: delta by `updated_at`, INCLUDES tombstones.
- Client: `db.ts` v21 adds `uid`/`deleted` to patients; `PatientsPage.tsx` sets `uid` on create, soft-deletes (tombstone) on delete, hides deleted in the list; `useServerSync.ts` does the patients push (decrypt→plaintext) + pull (uid-keyed, tombstone-aware, re-encrypt) with a per-clinic cursor. Patient pull is ON; consultations pull still gated by `ENABLE_SERVER_PULL`/`dl.pullEnabled`.

**LEFT:**
- **Phase 2 — consultations & documents**: same pattern (uid, updated_at, deleted, delta sync, tombstones). Server: migrate `consultations` and `documents` tables + rewrite their endpoints. Client: bump `uid`/`deleted` on those tables, soft-delete, rewrite their push/pull in `useServerSync.ts` (currently the old `api.saveConsultation`/`saveDocument` push + gated legacy pull with a brittle dup-by-diagnosis heuristic — replace it).
- **Patient EDITS don't bump `updatedAt` yet.** Create + delete are wired; find the edit path (likely `src/components/PatientProfile.tsx`) and set `updatedAt = new Date().toISOString()` on every patient update so edits sync.
- **Phase 3 — server at-rest encryption**: enable Postgres/disk encryption for PII (phone/address/medical_alerts now stored plaintext).
- **Retire the localStorage auto-restore** (`src/lib/emergencyBackup.ts`): it repopulates IndexedDB from a localStorage snapshot on load and fought every wipe. Now that the server is authoritative, remove/limit it (currently it only restores rows whose `clinicId` matches the active clinic — a stopgap).
- **Tombstone GC**: a periodic server job to hard-delete rows `deleted=true AND updated_at < now()-30d`.
- **Security debts** (separate from sync): `index.js` still has a hardcoded DB password + JWT secret — rotate them into `.env`. Numeric role PINs live in `clinics.role_pins` (bcrypt), default admin 1111 / doctor 2222 / receptionist 3333, changeable in User Management.

## Traps learned the hard way (don't repeat)
- The `patient_code` (PAT-0001) is generated per-device by count → collides across devices. `uid` is the real key; never upsert on `patient_code` for new rows.
- `src/lib/emergencyBackup.ts` auto-restores on startup when IndexedDB looks empty — it will silently undo a wipe. Account for it.
- Clearing browser site data wipes the encryption salt (`dl.enc.salt.v1`) → the device can't read its own old ciphertext. That's why "clear site data" made garbled data "disappear."
- Test with a FRESH clinic + cleared devices; there are ~49 clinics, most are test junk, a few are real/paying — never bulk-delete without checking `SELECT c.id,c.code,c.name,COUNT(p.id) FROM clinics c LEFT JOIN patients p ON p.clinic_id=c.id GROUP BY c.id`.

## How to verify sync works (server-side, deterministic)
Register a throwaway clinic, POST a patient with a `uid`, `GET /api/patients?since=1970-01-01` (should show plaintext phone + `deleted:false`), POST same uid with `deleted:true`, GET again (should show `deleted:true`). Then the two-device UI test: add on device A → legible on device B → delete on A → gone on B and stays gone.
