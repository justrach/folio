"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import type { EvaluationRun } from "@/lib/evals";
import { evaluationRequest } from "./evaluation-workspace";

export function DeleteEvaluation({ run, onDeleted }: {
  run: EvaluationRun;
  onDeleted: (id: string) => void;
}) {
  const { data: session } = useSession();
  const ownerId = session?.user.id ?? null;
  const account = useRef(ownerId);
  account.current = ownerId;
  const currentRun = useRef(run.id);
  currentRun.current = run.id;
  const mounted = useRef(true);
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const terminal = ["completed", "failed", "cancelled"].includes(run.status);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    dialog.current?.close();
    setBusy(false);
    setError("");
  }, [ownerId, run.id]);

  async function remove() {
    if (!ownerId || !terminal || busy) return;
    const requestOwner = ownerId;
    const runId = run.id;
    const currentRequest = () => mounted.current && account.current === requestOwner && currentRun.current === runId;
    setBusy(true);
    setError("");
    try {
      await evaluationRequest(`/api/evaluations/${encodeURIComponent(runId)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: run.revision }),
      });
      if (!currentRequest()) return;
      dialog.current?.close();
      onDeleted(runId);
    } catch (failure) {
      if (currentRequest())
        setError(failure instanceof Error ? failure.message : "The evidence could not be deleted.");
    } finally {
      if (currentRequest()) setBusy(false);
    }
  }

  return <>
    <button type="button" className="button secondary" disabled={!terminal || !ownerId}
      title={terminal ? "Delete this run's saved evidence from Folio" : "Cancel the active run and refresh before deleting evidence"}
      onClick={() => { setError(""); dialog.current?.showModal(); }}>
      <Trash2 size={13} />Delete saved evidence
    </button>
    <dialog ref={dialog} className="dialog" aria-labelledby={headingId} style={{ maxWidth: 540 }}
      onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <div className="dialog-header"><div><Trash2 size={19} /><h2 id={headingId}>Delete saved evidence?</h2></div>
        <button className="icon-button" type="button" aria-label="Close deletion dialog" disabled={busy} onClick={() => dialog.current?.close()}><X size={18} /></button>
      </div>
      <div className="dialog-body">
        <p>Remove this run’s captured pages, returned output, reference facts, verification report, and activity from Folio. This cannot be undone.</p>
        <p style={{ marginTop: 14 }}>OpenAI may still retain evidence submitted to its session. This action does not delete that remote session, existing downloads, or provider backups.</p>
        <p style={{ marginTop: 14 }}>Folio keeps a minimal run record for usage limits, without your website URL or evidence.</p>
        {error && <p className="eval-alert" role="alert" style={{ marginTop: 14 }}>{error}</p>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 22 }}>
          <button className="button secondary" type="button" disabled={busy} onClick={() => dialog.current?.close()}>Keep evidence</button>
          <button className="button primary" type="button" disabled={busy} onClick={() => void remove()}>
            {busy ? <Loader2 size={13} className="eval-spin" /> : <Trash2 size={13} />}{busy ? "Deleting…" : "Delete from Folio"}
          </button>
        </div>
      </div>
    </dialog>
  </>;
}
