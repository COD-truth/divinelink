import React, { useState } from "react";
import { db } from "@/lib/db";
import { useLang } from "@/contexts/LangContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Upload, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";
import CryptoJS from "crypto-js";

export function BackupPage() {
  const { t } = useLang();
  const [exportPwd, setExportPwd] = useState("");
  const [importPwd, setImportPwd] = useState("");
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    if (!exportPwd) return;
    setExporting(true);
    try {
      const data = {
        users: await db.users.toArray(),
        patients: await db.patients.toArray(),
        appointments: await db.appointments.toArray(),
        consultations: await db.consultations.toArray(),
        documents: await db.documents.toArray(),
        exportedAt: new Date().toISOString(),
      };

      const json = JSON.stringify(data);
      const encrypted = CryptoJS.AES.encrypt(json, exportPwd).toString();

      const zip = new JSZip();
      zip.file("divinelink_backup.enc", encrypted);

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `divinelink_backup_${new Date().toISOString().split("T")[0]}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("backup.success"));
    } catch (e) {
      toast.error(String(e));
    }
    setExporting(false);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!importPwd || !e.target.files?.[0]) return;
    setImporting(true);
    try {
      const file = e.target.files[0];
      const zip = await JSZip.loadAsync(file);
      const encFile = zip.file("divinelink_backup.enc");
      if (!encFile) throw new Error("Invalid backup file");

      const encrypted = await encFile.async("string");
      const bytes = CryptoJS.AES.decrypt(encrypted, importPwd);
      const json = bytes.toString(CryptoJS.enc.Utf8);
      if (!json) throw new Error("Wrong password");

      const data = JSON.parse(json);

      // Clear and restore
      await db.transaction("rw", [db.users, db.patients, db.appointments, db.consultations, db.documents], async () => {
        await db.users.clear();
        await db.patients.clear();
        await db.appointments.clear();
        await db.consultations.clear();
        await db.documents.clear();

        if (data.users?.length) await db.users.bulkAdd(data.users);
        if (data.patients?.length) await db.patients.bulkAdd(data.patients);
        if (data.appointments?.length) await db.appointments.bulkAdd(data.appointments);
        if (data.consultations?.length) await db.consultations.bulkAdd(data.consultations);
        if (data.documents?.length) await db.documents.bulkAdd(data.documents);
      });

      toast.success(t("backup.success"));
    } catch (err) {
      toast.error(String(err));
    }
    setImporting(false);
    e.target.value = "";
  };

  return (
    <div className="grid gap-6 md:grid-cols-2 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Download className="w-5 h-5" />{t("backup.export")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>{t("backup.password")}</Label>
            <Input type="password" value={exportPwd} onChange={e => setExportPwd(e.target.value)} />
          </div>
          <Button onClick={handleExport} disabled={!exportPwd || exporting} className="w-full gap-2">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {exporting ? t("backup.exporting") : t("backup.export")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Upload className="w-5 h-5" />{t("backup.import")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-warning">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {t("backup.warning")}
          </div>
          <div>
            <Label>{t("backup.password")}</Label>
            <Input type="password" value={importPwd} onChange={e => setImportPwd(e.target.value)} />
          </div>
          <Button asChild variant="outline" disabled={!importPwd || importing} className="w-full gap-2">
            <label>
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {importing ? t("backup.importing") : t("backup.import")}
              <input type="file" accept=".zip" className="hidden" onChange={handleImport} disabled={!importPwd} />
            </label>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
