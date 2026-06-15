# DivineLink Dental & Identity Features — Implementation Plan

This is a large multi-feature build (~6 features + 4 smart additions). Proposing a phased approach so each phase ships working, testable code.

## Constraints (locked)
- No edits to `useServerSync.ts` or `api.ts`.
- No edits to auth/PIN/clinic-code logic.
- Dexie changes only via new `.version(N+1)` upgrade — never modify prior versions.
- Bilingual FR/EN via existing `useLang()`.
- Tailwind + shadcn/ui, match existing style.
- All new records tagged with `clinicId`.

## Schema changes (single new Dexie version bump)

Add to `src/lib/db.ts` as `.version(16)` (current is 15):

```text
equipmentBoxes:   ++id, clinicId, label, order, createdAt
equipmentItems:   add optional boxId, minThreshold        (existing table — add fields only)
documents:        add optional treatmentCategory          (existing table — field only)
consultations:    add optional prosthesis: {...}          (extend ConsultationType union)
staff:            ++id, clinicId, fullName, role, photo, dob, phone, specialty, license, staffCode
privateNotes:     ++id, clinicId, ownerStaffId, title, body, updatedAt, private=true
privateDocs:      ++id, clinicId, ownerStaffId, name, dataUrl, mime, createdAt
quickTemplates:   ++id, clinicId, ownerStaffId, label, body
uiPreferences:    key (string PK) — stores specialty order/visibility per device
```

## Phase A — Dental + Stock (features 1, 2, smart #1, #2)
1. Extend `ConsultationType` with `"prosthesis"` and add prosthesis form section in `ConsultationsPage.tsx`.
2. New `ToothChartFDI.tsx` reusable component (adult chart, tap-to-toggle, FDI numbers). Used in prosthesis form + extractions.
3. `EquipmentPage.tsx`: add boxes (collapsible groups), per-box item list, min-threshold + low-stock badge.
4. Sidebar low-stock red badge (count of items below threshold) in `AppLayout.tsx`.

## Phase B — Documents + Specialty Settings (features 3, 4)
5. `DocumentsPage.tsx`: add `treatmentCategory` on upload, tab/dropdown filter with counts.
6. New `SpecialtySettingsPage.tsx`: dnd-kit list to reorder + toggle-hide consultation specialties. Persist to `uiPreferences` (Dexie + localStorage mirror). Reset button. Consumed by consultation type picker + nav.

## Phase C — Identity, ID cards, QR (feature 5, smart #4)
7. New `staff` table + `StaffPage.tsx` (list/CRUD with photo via existing image compression).
8. `IDCardView.tsx` — printable card layout (clinic logo+name, photo, name, ID, role, QR via `qrcode.react`). Used for both patients (reuse `patientId`) and staff.
9. `IDCardScanner.tsx` — scanner using `html5-qrcode` (already-light lib) → resolves to patient or staff and navigates to profile.

## Phase D — Doctor's private space (feature 6)
10. New `MySpacePage.tsx` with tabs: Notes, Mes patients, Mes stats (recharts), Documents privés, Modèles rapides.
11. All queries scoped by `ownerStaffId = currentUser.staffId` and `private: true`. Hidden from shared views.
12. Add "Mon espace / My space" nav entry.

## Phase E — Onboarding clarity (smart #3)
13. Redesign `ClinicOnboarding.tsx`: two distinct visually-separated cards — "J'ai un code" (primary, top) vs "Créer un nouvel espace" (secondary, below, with explanatory note). No accidental misclicks.

## Dependencies to add
- `@dnd-kit/core` + `@dnd-kit/sortable` (already added in survey phase — reuse)
- `qrcode.react` (QR rendering)
- `html5-qrcode` (camera QR scan)

## Files NOT touched
`useServerSync.ts`, `api.ts`, `AuthContext.tsx`, `crypto.ts`, `audit.ts`, `sw.js`, `manifest.json`.

## Question before I start
This is roughly 15–20 files of new code + edits. Do you want me to:
- **(a)** ship all 5 phases in one go (long single turn, no intermediate testing), or
- **(b)** ship Phase A+E first (dental form, tooth chart, stock boxes, onboarding fix — the highest-impact daily-use items), then B/C/D in follow-up turns so you can test as we go?

I recommend **(b)**.