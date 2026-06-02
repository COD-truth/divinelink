# DivineLink — Survey Module + Upgrade Pack v5

This is a large scope (≈18–22h of work). I'll split it into two phases. Phase A = the 7 gap-fill changes on the existing EMR (lower risk, audit-first). Phase B = the new Survey Module. Confirm scope/order before I start.

## Phase A — Gap-fill (zero regression)

1. **Carnet de santé scanner on patient profile**
   - `MedicalBookletScanner.tsx` already exists — verify it's mounted at the bottom of `PatientProfile`/`PatientsPage` detail view. Add if missing.
   - Add `Carnet` filter tab in `DocumentsPage.tsx`; render `source: 'carnet_capture'` as full-width image card + lightbox.

2. **Remove `consultType` dropdown** in `ConsultationsPage.tsx` (field, state, label, persistence reads). Keep DB column for back-compat, just stop writing/reading in UI.

3. **Specialty selector reorder + drives observation form**
   - Reorder options exactly as specified (FR/EN via i18n keys).
   - On change, render matching observation form inline.

4. **Embed dental exam inside Dentistry consultation**
   - Extract tooth chart into `src/components/ToothChartEmbed.tsx` (props: `teeth`, `onChange`, `pediatric?`).
   - Render in `ConsultationsPage` when `specialty==='dentistry'`.
   - Remove "Examen Dentaire" from `AppLayout.tsx` nav + `Index.tsx` route. Keep `DentalExamPage.tsx` file on disk, unlinked.

5. **Full observation form** for all non-dental/non-ortho specialties: 12 fields as specified, fields 7–12 inside a collapsible "Suite de l'examen".

6. **Word document batch import → match by patient code**
   - New tab in `ImportPatientsPage.tsx`: "Dossiers Word".
   - Add `mammoth` dep. Extract text, regex for `Code(?:\s*patient)?\s*[:#]?\s*(P-\d+)` etc., fallback to filename, fallback to manual.
   - Preview table with status badges + manual override.
   - On import: save as `documents` row with `source:'word_import'`, `type:'historique'`, link to patient `id`, `logAudit`.

7. **Customizable nav order**
   - New "Navigation" tab in settings; drag list of user-visible nav items (use existing dnd-kit or add `@dnd-kit/sortable`).
   - Persist `navOrder_<userId>` in localStorage; `AppLayout.tsx` reads on mount.

**Cross-cutting:** every new string added to `src/lib/i18n.ts` (fr+en). Dexie schema: add only optional fields, bump version by 1.

## Phase B — Survey Module (new)

### Dexie tables (new, indexed)
- `surveys` (id++, clinicId, status, createdBy, createdAt) — questions inline JSON
- `surveyResponses` (id++, surveyId, respondentId, syncedAt, clinicId) — answers JSON
- `surveyInvites` (id++, surveyId, status)
- `voiceRecordings` (id++, responseId, questionId) — webm Blob + transcript

### Routes / pages
- `/surveys` — list + Create button (admin only)
- `/surveys/new` and `/surveys/:id/edit` — builder with dnd-kit question reorder, 8 question types incl. voice
- `/surveys/:id` — admin dashboard: metrics cards, per-question charts (recharts), response table, CSV + PDF (jsPDF+html2canvas), voice playback + editable transcript
- `/s/:code` — public/field-worker survey-taking flow (one Q per screen, progress bar, voice recorder with MediaRecorder + Web Speech fallback transcript, review screen, offline submit)
- QR code generation via `qrcode` lib

### Sync
- Extend `useServerSync.ts`: push unsynced `surveyResponses` → `POST /api/surveys/:id/responses`; upload voice blobs separately as multipart; mark `synced:true` on 2xx. All non-blocking, behind `navigator.onLine` + token check.
- Server endpoints + Deepgram are out-of-scope here (separate Node session per the brief).

### Voice
- `MediaRecorder` → webm blob in Dexie
- Live Web Speech API transcript (editable)
- Server transcript replaces on sync (when implemented server-side)

### Charts/export
- Recharts (already in deps) for pie/bar/histogram
- papaparse for CSV
- jsPDF + html2canvas for PDF report

### i18n
- All survey strings in `src/lib/i18n.ts` (fr+en)

## Open questions

1. **Order**: do Phase A first (1 message), then Phase B (multiple messages)? Or Survey Module first?
2. **Survey scope trim for first pass**: OK to ship v1 without skip-logic, geolocation, multi-language surveys, SMS reminders, webhooks (all listed as nice-to-have)?
3. **Admin role gate**: use existing `user.role === 'admin'` check to gate survey creation?
4. **DnD lib**: OK to standardize on `@dnd-kit` (modern, maintained) instead of the deprecated `react-beautiful-dnd`?

Reply with answers (or just "go") and I'll start with Phase A.
