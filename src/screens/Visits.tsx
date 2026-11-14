import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Pencil, Plane, Trash2 } from "lucide-react";
import { deleteVisit, formatDay, listVisits, saveVisit, type Visit } from "../lib/visits";
import { localDate } from "../lib/callWindow";
import { friendlyError } from "../lib/errors";
import { useSpace } from "../hooks/useSpace";
import { Button, Card, ErrorNote, Field, Spinner, inputCls } from "../components/ui";

type Draft = { id?: string; place: string; starts_on: string; ends_on: string; note: string };
const EMPTY: Draft = { place: "", starts_on: "", ends_on: "", note: "" };

/** Plan visits: either of you can add, change or remove them. */
export function Visits() {
  const { profile } = useSpace();
  const tz = profile?.timezone ?? "UTC";
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => listVisits().then(setVisits).catch((e) => { setVisits([]); setError(friendlyError(e)); }), []);
  useEffect(() => { void load(); }, [load]);

  const t = localDate(new Date(), tz);
  const today = `${t.y}-${String(t.m).padStart(2, "0")}-${String(t.d).padStart(2, "0")}`;
  const upcoming = (visits ?? []).filter((v) => (v.ends_on ?? v.starts_on) >= today);
  const past = (visits ?? []).filter((v) => (v.ends_on ?? v.starts_on) < today).reverse();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setError(null);
    if (!draft.place.trim()) return setError("Where are you meeting?");
    if (!draft.starts_on) return setError("Please choose the first day.");
    if (draft.ends_on && draft.ends_on < draft.starts_on) return setError("The last day can't be before the first day.");
    setBusy(true);
    try {
      await saveVisit({ id: draft.id, place: draft.place.trim(), starts_on: draft.starts_on, ends_on: draft.ends_on || null, note: draft.note.trim() });
      setDraft(null);
      await load();
    } catch (err) { setError(friendlyError(err)); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setBusy(true); setError(null);
    try { await deleteVisit(id); setConfirmDelete(null); await load(); }
    catch (err) { setError(friendlyError(err)); }
    finally { setBusy(false); }
  };

  if (visits === null) return <Spinner label="Opening your travel plans" />;

  const row = (v: Visit) => (
    <li key={v.id} className="flex items-start gap-3 px-5 py-4">
      <Plane size={16} className="mt-1 shrink-0 text-tomato" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg font-semibold">{v.place}</p>
        <p className="text-xs text-muted">{formatDay(v.starts_on)}{v.ends_on && v.ends_on !== v.starts_on ? ` → ${formatDay(v.ends_on)}` : ""}</p>
        {v.note && <p className="mt-1 text-sm text-muted">{v.note}</p>}
        {confirmDelete === v.id && (
          <div className="mt-2 flex gap-2">
            <Button variant="dark" onClick={() => void remove(v.id)} busy={busy} className="!min-h-[36px] !px-4 !py-1">Remove</Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)} className="!min-h-[36px] !px-4 !py-1">Keep</Button>
          </div>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        <button type="button" aria-label={`Edit ${v.place}`} className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-leaf-soft"
          onClick={() => setDraft({ id: v.id, place: v.place, starts_on: v.starts_on, ends_on: v.ends_on ?? "", note: v.note })}><Pencil size={15} /></button>
        <button type="button" aria-label={`Remove ${v.place}`} className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-tomato-soft"
          onClick={() => setConfirmDelete(v.id)}><Trash2 size={15} /></button>
      </div>
    </li>
  );

  return (
    <div className="fade-up space-y-6">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-leaf"><ArrowLeft size={16} aria-hidden="true" /> Home</Link>
      <header>
        <p className="font-hand text-2xl text-raspberry-deep">counting the sleeps</p>
        <h1 className="text-4xl">Our visits</h1>
      </header>
      <ErrorNote>{error}</ErrorNote>

      {draft ? (
        <Card>
          <form onSubmit={submit} className="space-y-4">
            <h2 className="text-xl">{draft.id ? "Edit visit" : "Add a visit"}</h2>
            <Field label="Where" htmlFor="v-place"><input id="v-place" className={inputCls} value={draft.place} maxLength={60} placeholder="e.g. Santiago" onChange={(e) => setDraft({ ...draft, place: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First day" htmlFor="v-start"><input id="v-start" type="date" className={inputCls} value={draft.starts_on} onChange={(e) => setDraft({ ...draft, starts_on: e.target.value })} /></Field>
              <Field label="Last day (optional)" htmlFor="v-end"><input id="v-end" type="date" className={inputCls} value={draft.ends_on} min={draft.starts_on || undefined} onChange={(e) => setDraft({ ...draft, ends_on: e.target.value })} /></Field>
            </div>
            <Field label="Note (optional)" htmlFor="v-note"><input id="v-note" className={inputCls} value={draft.note} maxLength={280} placeholder="Flight, plans, a little reminder…" onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></Field>
            <div className="flex gap-2">
              <Button type="submit" busy={busy}>Save</Button>
              <Button type="button" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            </div>
          </form>
        </Card>
      ) : (
        <Button onClick={() => setDraft(EMPTY)}><Plane size={16} aria-hidden="true" /> Add a visit</Button>
      )}

      <section>
        <h2 className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.16em] text-muted">Coming up</h2>
        {upcoming.length ? <ul className="divide-y divide-dashed divide-leaf/20 rounded-[20px] bg-paper shadow-card">{upcoming.map(row)}</ul>
          : <p className="rounded-[20px] border-2 border-dashed border-leaf/20 px-5 py-6 text-center font-hand text-xl text-muted">nothing booked yet — dreaming counts too</p>}
      </section>
      {past.length > 0 && (
        <section>
          <h2 className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.16em] text-muted">Been there together</h2>
          <ul className="divide-y divide-dashed divide-leaf/20 rounded-[20px] bg-paper shadow-card">{past.map(row)}</ul>
        </section>
      )}
    </div>
  );
}
