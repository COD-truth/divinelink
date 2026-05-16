/**
 * Supabase cloud sync engine.
 * - Pushes local IndexedDB changes to Supabase (upsert).
 * - Pulls remote changes back for the same clinicId.
 * - Runs automatically every 5 min and on window.online events.
 * - Never throws uncaught errors; failures are reported via status callbacks.
 * - When VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set, the module
 *   stays in 'unconfigured' status and does nothing.
 */

import { supabase, isConfigured } from '@/lib/supabase';
import { db } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'success'
  | 'error'
  | 'offline'
  | 'unconfigured';

type StatusListener = (status: SyncStatus) => void;

// ─── Status pub/sub ───────────────────────────────────────────────────────────

let _status: SyncStatus = isConfigured() ? 'idle' : 'unconfigured';
const _listeners: Set<StatusListener> = new Set();

function setStatus(s: SyncStatus) {
  _status = s;
  _listeners.forEach(cb => {
    try { cb(s); } catch { /* ignore listener errors */ }
  });
}

/** Subscribe to sync status changes. Returns an unsubscribe function. */
export function onSyncStatus(cb: StatusListener): () => void {
  _listeners.add(cb);
  // Immediately emit current status to new subscriber
  try { cb(_status); } catch { /* ignore */ }
  return () => _listeners.delete(cb);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getClinicId(): string | null {
  try { return localStorage.getItem('divinelink.clinicId'); } catch { return null; }
}

const LAST_SYNC_KEY = 'divinelink.lastSyncAt';

function getLastSyncAt(): string | null {
  try { return localStorage.getItem(LAST_SYNC_KEY); } catch { return null; }
}

function setLastSyncAt(iso: string) {
  try { localStorage.setItem(LAST_SYNC_KEY, iso); } catch { /* ignore */ }
}

function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

function newerTimestamp(a: string | undefined, b: string | undefined): boolean {
  if (!a) return false;
  if (!b) return true;
  return a > b;
}

// ─── Table definitions ────────────────────────────────────────────────────────

interface TableConfig {
  /** Dexie table name */
  local: string;
  /** Supabase table name */
  remote: string;
  /** Field used as the "last modified" timestamp */
  tsField: string;
  /** If true, only push — never pull (append-only tables) */
  appendOnly: boolean;
}

const TABLES: TableConfig[] = [
  { local: 'patients',           remote: 'patients',            tsField: 'updatedAt',  appendOnly: false },
  { local: 'consultations',      remote: 'consultations',       tsField: 'editedAt',   appendOnly: false },
  { local: 'appointments',       remote: 'appointments',        tsField: 'updatedAt',  appendOnly: false },
  { local: 'payments',           remote: 'payments',            tsField: 'updatedAt',  appendOnly: false },
  { local: 'drugs',              remote: 'drugs',               tsField: 'updatedAt',  appendOnly: false },
  { local: 'equipmentItems',     remote: 'equipment_items',     tsField: 'updatedAt',  appendOnly: false },
  { local: 'equipmentMovements', remote: 'equipment_movements', tsField: 'createdAt',  appendOnly: true  },
  { local: 'drugTransactions',   remote: 'drug_transactions',   tsField: 'createdAt',  appendOnly: true  },
];

// ─── Sync logic ───────────────────────────────────────────────────────────────

/** Push all local records modified since lastSyncAt to Supabase. */
async function pushTable(cfg: TableConfig, clinicId: string, lastSyncAt: string | null): Promise<void> {
  const client = supabase!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = (db as any)[cfg.local];
  if (!table) return;

  const allRecords: any[] = await table.toArray();

  const changed = allRecords.filter((r: any) => {
    if (!lastSyncAt) return true; // first sync: push everything
    // For consultations, fall back to createdAt when editedAt is absent
    const ts = r[cfg.tsField] ?? (cfg.tsField === 'editedAt' ? r.createdAt : undefined);
    if (!ts) return true;
    return ts > lastSyncAt;
  });

  if (changed.length === 0) return;

  const rows = changed.map((r: any) => {
    const localId = r.id;
    // Strip images from consultations to avoid huge base64 payloads
    const { images: _images, ...rest } = (r.images !== undefined ? r : { ...r, images: undefined });
    return {
      ...rest,
      _pk: `${clinicId}_${localId}`,
      _clinic_id: clinicId,
      _local_id: localId,
    };
  });

  // Upsert in batches of 100
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await client.from(cfg.remote).upsert(batch, { onConflict: '_pk' });
    if (error) throw new Error(`push ${cfg.remote}: ${error.message}`);
  }
}

/** Pull remote records modified since lastSyncAt and merge into local DB. */
async function pullTable(cfg: TableConfig, clinicId: string, lastSyncAt: string | null): Promise<void> {
  const client = supabase!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = (db as any)[cfg.local];
  if (!table) return;

  let query = client
    .from(cfg.remote)
    .select('*')
    .eq('_clinic_id', clinicId);

  if (lastSyncAt) {
    query = query.gt(cfg.tsField, lastSyncAt);
  }

  const { data, error } = await query;
  if (error) throw new Error(`pull ${cfg.remote}: ${error.message}`);
  if (!data || data.length === 0) return;

  for (const row of data) {
    const { _pk: _pk, _clinic_id: _cid, _local_id: localId, ...fields } = row;
    if (!localId) continue;

    // Check if this record exists locally
    const existing: any = await table.get(localId).catch(() => null);

    if (!existing) {
      // Record doesn't exist locally — insert it preserving the remote id
      try {
        await table.put({ ...fields, id: localId });
      } catch { /* ignore put errors (e.g. duplicate key race) */ }
    } else {
      // Only overwrite if remote is strictly newer
      const remoteTs: string | undefined = fields[cfg.tsField] ?? (cfg.tsField === 'editedAt' ? fields.createdAt : undefined);
      const localTs: string | undefined = existing[cfg.tsField] ?? (cfg.tsField === 'editedAt' ? existing.createdAt : undefined);
      if (newerTimestamp(remoteTs, localTs)) {
        try {
          await table.update(localId, fields);
        } catch { /* ignore */ }
      }
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

let _syncing = false;

/** Perform a full push + pull sync cycle. Safe to call at any time. */
export async function syncNow(): Promise<void> {
  if (!isConfigured()) {
    setStatus('unconfigured');
    return;
  }

  if (_syncing) return; // Prevent concurrent runs

  if (!isOnline()) {
    setStatus('offline');
    return;
  }

  const clinicId = getClinicId();
  if (!clinicId) {
    // No clinic configured yet — silently skip
    return;
  }

  _syncing = true;
  setStatus('syncing');

  try {
    const lastSyncAt = getLastSyncAt();
    const nowIso = new Date().toISOString();

    for (const cfg of TABLES) {
      await pushTable(cfg, clinicId, lastSyncAt);
      if (!cfg.appendOnly) {
        await pullTable(cfg, clinicId, lastSyncAt);
      }
    }

    setLastSyncAt(nowIso);
    setStatus('success');

    // Auto-reset to idle after 3 s so the UI doesn't stay green forever
    setTimeout(() => {
      if (_status === 'success') setStatus('idle');
    }, 3000);
  } catch (err) {
    console.error('[supabaseSync] syncNow error:', err);
    setStatus('error');
  } finally {
    _syncing = false;
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

let _intervalId: ReturnType<typeof setInterval> | null = null;
let _onlineHandler: (() => void) | null = null;
let _offlineHandler: (() => void) | null = null;

/** Start automatic background syncing. Call once on app startup. */
export function initSync(): void {
  if (!isConfigured()) {
    setStatus('unconfigured');
    return;
  }

  // Listen for connectivity changes
  _onlineHandler = () => {
    setStatus('idle');
    syncNow().catch(() => { /* already handled inside */ });
  };
  _offlineHandler = () => setStatus('offline');

  window.addEventListener('online', _onlineHandler);
  window.addEventListener('offline', _offlineHandler);

  // Sync every 5 minutes
  _intervalId = setInterval(() => {
    syncNow().catch(() => { /* already handled inside */ });
  }, 5 * 60 * 1000);

  // Initial sync after a short delay to let the app finish booting
  if (isOnline()) {
    setTimeout(() => {
      syncNow().catch(() => { /* already handled inside */ });
    }, 2000);
  } else {
    setStatus('offline');
  }
}

/** Stop automatic syncing and clean up event listeners. */
export function stopSync(): void {
  if (_intervalId !== null) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
  if (_onlineHandler) {
    window.removeEventListener('online', _onlineHandler);
    _onlineHandler = null;
  }
  if (_offlineHandler) {
    window.removeEventListener('offline', _offlineHandler);
    _offlineHandler = null;
  }
}
