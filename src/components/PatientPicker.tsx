import { useState } from "react";
import { type Patient } from "@/lib/db";
import { Search } from "lucide-react";

/** Type-to-search patient selector (replaces a long <Select> dropdown). */
export function PatientPicker({ patients, value, onPick, placeholder }: { patients: Patient[]; value: string; onPick: (id: string) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const selected = patients.find(p => String(p.id) === value);
  const show = open ? q : (selected ? `${selected.firstName} ${selected.lastName}`.trim() : q);
  const ql = q.trim().toLowerCase();
  const matches = patients
    .filter(p => !ql || `${p.firstName} ${p.lastName}`.toLowerCase().includes(ql) || (p.patientId || "").toLowerCase().includes(ql) || (p.phone || "").toLowerCase().includes(ql))
    .slice(0, 40);
  return (
    <div className="relative flex-1 min-w-0">
      <div className="flex items-center gap-2 rounded-md border px-2 h-10">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          className="flex-1 bg-transparent outline-none text-sm min-w-0"
          placeholder={placeholder || "Rechercher…"}
          value={show}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => { setQ(""); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border bg-popover shadow-md">
          {matches.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">—</div>}
          {matches.map(p => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onPick(String(p.id)); setQ(`${p.firstName} ${p.lastName}`.trim()); setOpen(false); }}
            >
              {p.firstName} {p.lastName}{p.patientId ? ` · ${p.patientId}` : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
