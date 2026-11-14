"use client";

import { useId, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { exportData, importData } from "@/lib/storage";
import { BACKUP_MAX_BYTES, BackupError } from "@/lib/storage/backup";

type Message = { kind: "done" | "error"; text: string };

export function BackupBlock({ onRestored }: { onRestored: () => void }) {
  const { t } = useI18n();
  const ids = useId();
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);

  async function download() {
    setMessage(null);
    const backup = await exportData();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `tonight-movie-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage({ kind: "done", text: t.services.backupExported });
  }

  async function restore() {
    if (!file || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      if (file.size > BACKUP_MAX_BYTES) throw new BackupError("too_large");
      await importData(await file.text());
      onRestored();
      setMessage({ kind: "done", text: t.services.backupDone });
    } catch (reason) {
      const code = reason instanceof BackupError ? reason.code : "generic";
      setMessage({ kind: "error", text: t.services.backupErrors[code] });
    } finally {
      setFile(null);
      setBusy(false);
    }
  }

  return (
    <div className="backup" aria-labelledby={`${ids}-title`} role="group">
      <h3 id={`${ids}-title`}>{t.services.backupTitle}</h3>
      <p>{t.services.backupText}</p>
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept=".json,application/json"
        aria-label={t.services.backupImport}
        tabIndex={-1}
        onChange={(event) => {
          setMessage(null);
          setFile(event.currentTarget.files?.[0] ?? null);
          // Choosing the same file again must still trigger a change.
          event.currentTarget.value = "";
        }}
      />
      {file ? (
        <div role="alertdialog" aria-labelledby={`${ids}-confirm`} className="reset-confirm">
          <p id={`${ids}-confirm`}>{t.services.backupConfirm}</p>
          <button type="button" className="button danger" disabled={busy} onClick={restore}>
            {t.services.backupConfirmYes}
          </button>
          <button type="button" className="button ghost" onClick={() => setFile(null)}>
            {t.services.cancel}
          </button>
        </div>
      ) : (
        <div className="backup-actions">
          <button type="button" className="button" onClick={() => void download()}>
            {t.services.backupExport}
          </button>
          <button type="button" className="button" onClick={() => input.current?.click()}>
            {t.services.backupImport}
          </button>
        </div>
      )}
      {message && <p role={message.kind === "error" ? "alert" : "status"}>{message.text}</p>}
    </div>
  );
}
