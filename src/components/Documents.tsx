import { useRef, useState } from "react";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import { DOC_ACCEPT, DOC_TYPE_LABEL, openDocument, removeDocument, uploadDocument, type DocType, type SupportingDoc } from "../lib/record";
import { friendlyError } from "../lib/errors";
import { useSpace } from "../hooks/useSpace";
import { usePeople } from "../hooks/usePeople";
import { inputCls } from "./ui";

/**
 * Supporting documents on one visit or milestone (flight bookings, boarding
 * passes…). Private to the two of you; the app doesn't read or check them.
 */
export function Documents({ kind, refId, docs, onChange }: {
  kind: "visit" | "milestone"; refId: string; docs: SupportingDoc[]; onChange: () => void;
}) {
  const { space } = useSpace();
  const { myId, me, partner } = usePeople();
  const [type, setType] = useState<DocType>("travel_booking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const mine = docs.filter((d) => d.attached_kind === kind && d.ref_id === refId);
  const who = (id: string | null) => (id === myId ? me?.display_name : partner?.display_name) ?? "";

  const pick = async (file: File | undefined) => {
    if (!file || !space || !myId) return;
    setBusy(true); setError(null);
    try { await uploadDocument(space.relationship.id, myId, kind, refId, file, type); onChange(); }
    catch (e) { setError(friendlyError(e, "We couldn't attach that file. Please try again.")); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };

  return (
    <div className="mt-2 space-y-2 rounded-2xl bg-cream px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Supporting documents</p>
      {mine.length > 0 && (
        <ul className="space-y-1">
          {mine.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <FileText size={14} className="shrink-0 text-leaf" aria-hidden="true" />
              <button type="button" className="min-w-0 flex-1 truncate text-left font-semibold text-leaf underline-offset-2 hover:underline" onClick={() => void openDocument(d.path)}>
                {d.file_name}
              </button>
              <span className="hidden text-xs text-muted sm:inline">{DOC_TYPE_LABEL[d.doc_type]}{who(d.added_by) ? ` · ${who(d.added_by)}` : ""}</span>
              {confirm === d.id ? (
                <span className="flex gap-1">
                  <button type="button" className="rounded-full bg-leaf px-2 py-0.5 text-xs font-semibold text-cream" onClick={async () => {
                    try { await removeDocument(d.id); setConfirm(null); onChange(); } catch (e) { setError(friendlyError(e)); }
                  }}>Remove</button>
                  <button type="button" className="px-2 py-0.5 text-xs text-muted" onClick={() => setConfirm(null)}>Keep</button>
                </span>
              ) : (
                <button type="button" aria-label={`Remove ${d.file_name}`} className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-tomato-soft" onClick={() => setConfirm(d.id)}><Trash2 size={13} /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Kind of document" className={`${inputCls} !min-h-[36px] !w-auto !py-1 text-xs`} value={type} onChange={(e) => setType(e.target.value as DocType)}>
          {(Object.keys(DOC_TYPE_LABEL) as DocType[]).map((k) => <option key={k} value={k}>{DOC_TYPE_LABEL[k]}</option>)}
        </select>
        <button type="button" disabled={busy} onClick={() => input.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-full border-2 border-leaf/20 px-3 py-1 text-xs font-semibold text-leaf disabled:opacity-50">
          <Paperclip size={13} aria-hidden="true" /> {busy ? "Attaching…" : "Attach a file"}
        </button>
        <input ref={input} type="file" accept={DOC_ACCEPT} className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      </div>
      {error && <p className="text-xs text-tomato">{error}</p>}
      <p className="text-[11px] text-muted">PDF or photo, up to 10 MB. Only the two of you can open these.</p>
    </div>
  );
}
