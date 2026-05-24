import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Paperclip, X } from "lucide-react";
import { useLang } from "@/contexts/LangContext";

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
  accept?: string;
  label?: string;
  helper?: string;
}

/**
 * Reusable multi-file picker that stages files (does NOT save them).
 * Parent is responsible for persisting on submit.
 */
export function AttachmentsField({
  files, onChange, accept = ".pdf,.doc,.docx,.jpg,.jpeg,.png", label, helper,
}: Props) {
  const { lang } = useLang();
  const trLabel = label ?? (lang === "fr" ? "📎 Pièces jointes" : "📎 Attachments");
  const trHelp = helper ?? (lang === "fr"
    ? "Radiographies, photos, résultats…"
    : "X-rays, photos, results…");
  const trAdd = lang === "fr" ? "Ajouter des fichiers" : "Add files";

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const added = Array.from(e.target.files);
    onChange([...files, ...added]);
    e.target.value = "";
  };

  const remove = (idx: number) => onChange(files.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      <Label className="text-sm flex items-center gap-1.5">
        <Paperclip className="w-3.5 h-3.5" /> {trLabel}
      </Label>
      <p className="text-xs text-muted-foreground -mt-1">{trHelp}</p>
      <Button asChild size="sm" variant="outline" type="button">
        <label className="cursor-pointer">
          <Paperclip className="w-4 h-4 mr-1" />
          {trAdd}
          <input type="file" multiple accept={accept} className="hidden" onChange={onPick} />
        </label>
      </Button>
      {files.length > 0 && (
        <ul className="text-xs space-y-1 border rounded p-2 bg-muted/40 max-h-32 overflow-auto">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <span className="truncate">{f.name} <span className="text-muted-foreground">({Math.round(f.size / 1024)} KB)</span></span>
              <button type="button" onClick={() => remove(i)} className="text-destructive hover:text-destructive/80">
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Helper: read a File as base64 data URL. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
