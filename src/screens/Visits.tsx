import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Camera, Paperclip, Pencil, Plane, Trash2 } from "lucide-react";
import { deleteVisit, formatDay, hasTimeTogether, listVisits, saveVisit, STAY_HINT, STAY_LABEL, type StayType, type Visit, type VisitDraft } from "../lib/visits";
import { daysInclusive, togetherDays, listDocuments, removeDocumentsOf, type SupportingDoc } from "../lib/record";
import { getFeed, type Memory } from "../lib/scrapbook";
import { usePeople } from "../hooks/usePeople";
import { Documents } from "../components/Documents";
import { localDate } from "../lib/callWindow";
import { friendlyError } from "../lib/errors";
import { useSpace } from "../hooks/useSpace";
import { Button, Card, ErrorNote, Field, Spinner, inputCls } from "../components/ui";

type Draft = Required<Omit<VisitDraft, "id" | "ends_on" | "travelled_by" | "moment_id">> & { id?: string; ends_on: string; travelled_by: string; moment_id: string };
const EMPTY: Draft = { place: "", starts_on: "", ends_on: "", note: "", title: "", country: "", city: "", stay_type: "visit", travel: "unset", travelled_by: "", with_family: false, family_note: "", moment_id: "" };
const toDraft = (v: Visit): Draft => ({
  id: v.id, place: v.place, starts_on: v.starts_on, ends_on: v.ends_on ?? "", note: v.note, title: v.title ?? "", country: v.country ?? "", city: v.city ?? "",
  stay_type: v.stay_type ?? "visit", travel: v.travel ?? "unset", travelled_by: v.travelled_by ?? "", with_family: v.with_family ?? false, family_note: v.family_note ?? "", moment_id: v.moment_id ?? "",
});
const chip = (on: boolean) => `rounded-full border-2 px-3 py-1 text-xs font-semibold ${on ? "border-leaf bg-mustard text-leaf" : "border-leaf/15 text-muted"}`;

/** Plan visits and record time together: either of you can add, change or remove them. */
export function Visits() {
  const { profile } = useSpace();
  const { me, partner, myId } = usePeople();
  const tz = profile?.timezone ?? "UTC";
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [docs, setDocs] = useState<SupportingDoc[] | null>(null);
  const [trips, setTrips] = useState<Memory[]>([]);
  const [openDocs, setOpenDocs] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => listVisits().then(setVisits).catch((e) => { setVisits([]); setError(friendlyError(e)); }), []);
  const loadDocs = useCallback(() => listDocuments().then(setDocs), []);
  useEffect(() => { void load(); void loadDocs(); }, [load, loadDocs]);
  useEffect(() => { if (draft && !trips.length) getFeed().then((f) => setTrips(f.filter((m) => m.kind === "moment"))).catch(() => {}); }, [draft, trips.length]);

  const full = visits !== null && hasTimeTogether(visits);
  const t = localDate(new Date(), tz);
  const today = `${t.y}-${String(t.m).padStart(2, "0")}-${String(t.d).padStart(2, "0")}`;
  const upcoming = (visits ?? []).filter((v) => (v.ends_on ?? v.starts_on) >= today);
  const past = (visits ?? []).filter((v) => (v.ends_on ?? v.starts_on) < today).reverse();
  const nameOf = (id: string | null | undefined) => (id === myId ? me?.display_name : partner?.display_name) ?? "";
  const otherOf = (id: string | null | undefined) => (id === myId ? partner?.display_name : me?.display_name) ?? "";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setError(null);
    if (!draft.place.trim()) return setError("Where were you? Add the place.");
    if (!draft.starts_on) return setError("Please choose the first day.");
    if (draft.ends_on && draft.ends_on < draft.starts_on) return setError("The last day can't be before the first day.");
    if (full && draft.travel === "one" && !draft.travelled_by) return setError("Please choose who travelled.");
    setBusy(true);
    try {
      const base = { id: draft.id, place: draft.place.trim(), starts_on: draft.starts_on, ends_on: draft.ends_on || null, note: draft.note.trim() };
      await saveVisit(full ? {
        ...base, title: draft.title.trim(), country: draft.country.trim(), city: draft.city.trim(), stay_type: draft.stay_type, travel: draft.travel,
        travelled_by: draft.travel === "one" ? draft.travelled_by : null, with_family: draft.with_family, family_note: draft.with_family ? draft.family_note.trim() : "",
        moment_id: draft.moment_id || null,
      } : base);
      setDraft(null);
      await load();
    } catch (err) { setError(friendlyError(err)); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setBusy(true); setError(null);
    try { await removeDocumentsOf(docs, "visit", id); await deleteVisit(id); setConfirmDelete(null); await load(); await loadDocs(); }
    catch (err) { setError(friendlyError(err)); }
    finally { setBusy(false); }
  };

  if (visits === null) return <Spinner label="Opening your travel plans" />;

  const row = (v: Visit) => {
    const where = [v.city, v.country].filter(Boolean).join(", ");
    const nDocs = (docs ?? []).filter((d) => d.attached_kind === "visit" && d.ref_id === v.id).length;
    const trip = v.moment_id ? trips.find((m) => m.ref_id === v.moment_id) : null;
    return (
    <li key={v.id} className="flex items-start gap-3 px-5 py-4">
      <Plane size={16} className="mt-1 shrink-0 text-tomato" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {full && <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{STAY_LABEL[v.stay_type ?? "visit"]} · {daysInclusive(v.starts_on, v.ends_on)} {daysInclusive(v.starts_on, v.ends_on) === 1 ? "day" : "days"}</p>}
        <p className="font-display text-lg">{v.title || v.place}</p>
        <p className="text-xs text-muted">{formatDay(v.starts_on)}{v.ends_on && v.ends_on !== v.starts_on ? ` → ${formatDay(v.ends_on)}` : ""}</p>
        {(v.title || where) && <p className="text-xs text-muted">{[v.title ? v.place : "", where].filter(Boolean).join(" · ")}</p>}
        {v.travel === "one" && v.travelled_by && <p className="mt-1 text-sm">{nameOf(v.travelled_by)} travelled to {otherOf(v.travelled_by)}</p>}
        {v.travel === "both" && <p className="mt-1 text-sm">We both travelled to meet</p>}
        {v.with_family && <p className="mt-1 text-sm">With family{v.family_note ? ` — ${v.family_note}` : ""}</p>}
        {v.note && <p className="mt-1 text-sm text-muted">{v.note}</p>}
        {trip && <Link to={`/us/moment/${trip.ref_id}`} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-leaf"><Camera size={12} aria-hidden="true" /> Photos: {trip.title}</Link>}
        {docs !== null && (
          <button type="button" onClick={() => setOpenDocs(openDocs === v.id ? null : v.id)} className="mt-1 flex items-center gap-1 text-xs font-semibold text-leaf">
            <Paperclip size={12} aria-hidden="true" /> {nDocs ? `Documents (${nDocs})` : "Attach a document"}
          </button>
        )}
        {docs !== null && openDocs === v.id && <Documents kind="visit" refId={v.id} docs={docs} onChange={() => void loadDocs()} />}
        {confirmDelete === v.id && (
          <div className="mt-2 flex gap-2">
            <Button variant="dark" onClick={() => void remove(v.id)} busy={busy} className="!min-h-[36px] !px-4 !py-1">Remove</Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)} className="!min-h-[36px] !px-4 !py-1">Keep</Button>
          </div>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        <button type="button" aria-label={`Edit ${v.title || v.place}`} className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-leaf-soft"
          onClick={() => setDraft(toDraft(v))}><Pencil size={15} /></button>
        <button type="button" aria-label={`Remove ${v.title || v.place}`} className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-tomato-soft"
          onClick={() => setConfirmDelete(v.id)}><Trash2 size={15} /></button>
      </div>
    </li>
    );
  };

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
            {!draft.id && <p className="-mt-2 text-sm text-muted">Coming up or in the past — both are fine.</p>}
            {full && (
              <>
                <Field label="Occasion (optional)" htmlFor="v-title"><input id="v-title" className={inputCls} value={draft.title} maxLength={80} placeholder="e.g. Christmas with my family" onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
                <fieldset>
                  <legend className="mb-1.5 text-sm font-semibold text-leaf">What kind of time together</legend>
                  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="What kind of time together">
                    {(Object.keys(STAY_LABEL) as StayType[]).map((k) => (
                      <button key={k} type="button" role="radio" aria-checked={draft.stay_type === k} className={chip(draft.stay_type === k)} onClick={() => setDraft({ ...draft, stay_type: k })}>{STAY_LABEL[k]}</button>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-muted">{STAY_HINT[draft.stay_type]}</p>
                </fieldset>
              </>
            )}
            <Field label={full ? "Place" : "Where"} htmlFor="v-place"><input id="v-place" className={inputCls} value={draft.place} maxLength={60} placeholder={full ? "e.g. My family home, or a hotel in Munich" : "e.g. Santiago"} onChange={(e) => setDraft({ ...draft, place: e.target.value })} /></Field>
            {full && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="City" htmlFor="v-city"><input id="v-city" className={inputCls} value={draft.city} maxLength={60} placeholder="e.g. Kuching" onChange={(e) => setDraft({ ...draft, city: e.target.value })} /></Field>
                <Field label="Country" htmlFor="v-country"><input id="v-country" className={inputCls} value={draft.country} maxLength={60} placeholder="e.g. Malaysia" onChange={(e) => setDraft({ ...draft, country: e.target.value })} /></Field>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="First day" htmlFor="v-start"><input id="v-start" type="date" className={inputCls} value={draft.starts_on} onChange={(e) => setDraft({ ...draft, starts_on: e.target.value })} /></Field>
              <Field label="Last day (optional)" htmlFor="v-end"><input id="v-end" type="date" className={inputCls} value={draft.ends_on} min={draft.starts_on || undefined} onChange={(e) => setDraft({ ...draft, ends_on: e.target.value })} /></Field>
            </div>
            {full && draft.starts_on && (!draft.ends_on || draft.ends_on >= draft.starts_on) && (
              <p className="-mt-2 text-xs text-muted">{daysInclusive(draft.starts_on, draft.ends_on)} {daysInclusive(draft.starts_on, draft.ends_on) === 1 ? "day" : "days"} together (first and last day included)</p>
            )}
            {full && (
              <fieldset>
                <legend className="mb-1.5 text-sm font-semibold text-leaf">Who travelled</legend>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Who travelled">
                  {[me, partner].filter(Boolean).map((p) => (
                    <button key={p!.id} type="button" role="radio" aria-checked={draft.travel === "one" && draft.travelled_by === p!.id} className={chip(draft.travel === "one" && draft.travelled_by === p!.id)}
                      onClick={() => setDraft({ ...draft, travel: "one", travelled_by: p!.id })}>{p!.display_name} → {otherOf(p!.id) || "partner"}</button>
                  ))}
                  <button type="button" role="radio" aria-checked={draft.travel === "both"} className={chip(draft.travel === "both")} onClick={() => setDraft({ ...draft, travel: "both", travelled_by: "" })}>We both travelled</button>
                  <button type="button" role="radio" aria-checked={draft.travel === "unset"} className={chip(draft.travel === "unset")} onClick={() => setDraft({ ...draft, travel: "unset", travelled_by: "" })}>Skip</button>
                </div>
              </fieldset>
            )}
            {full && (
              <div className="space-y-2">
                <label className="flex items-center gap-3 text-sm">
                  <input type="checkbox" className="h-5 w-5 accent-[#0C1020]" checked={draft.with_family} onChange={(e) => setDraft({ ...draft, with_family: e.target.checked })} />
                  We spent time with family
                </label>
                {draft.with_family && <input aria-label="About the family time" className={inputCls} value={draft.family_note} maxLength={280} placeholder="e.g. Stayed at my parents' home, met my grandmother" onChange={(e) => setDraft({ ...draft, family_note: e.target.value })} />}
              </div>
            )}
            <Field label="Note (optional)" htmlFor="v-note"><input id="v-note" className={inputCls} value={draft.note} maxLength={280} placeholder="Flight, plans, a little reminder…" onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></Field>
            {full && (
              <Field label="Photos (optional)" htmlFor="v-trip" hint="Link a trip or moment from your Scrapbook to use its photos.">
                <select id="v-trip" className={inputCls} value={draft.moment_id} onChange={(e) => setDraft({ ...draft, moment_id: e.target.value })}>
                  <option value="">No photos linked</option>
                  {trips.map((m) => <option key={m.ref_id} value={m.ref_id}>{m.title} · {m.starts_on}</option>)}
                </select>
              </Field>
            )}
            {full && draft.id && <p className="text-xs text-muted">Attach flight bookings or boarding passes from the visit's <strong>Attach a document</strong> link after saving.</p>}
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
        {upcoming.length ? <ul className="divide-y divide-dashed divide-leaf/20 rounded-card bg-paper shadow-card">{upcoming.map(row)}</ul>
          : <p className="rounded-card border-2 border-dashed border-leaf/20 px-5 py-6 text-center font-hand text-xl text-muted">nothing booked yet — dreaming counts too</p>}
      </section>
      {past.length > 0 && (
        <section>
          <h2 className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.16em] text-muted">Been there together</h2>
          {full && <p className="-mt-2 mb-3 text-xs text-muted">{past.length} {past.length === 1 ? "time" : "times"} together · {togetherDays(past.map((v) => ({ from: v.starts_on, until: v.ends_on }))).size} days (overlaps counted once)</p>}
          <ul className="divide-y divide-dashed divide-leaf/20 rounded-card bg-paper shadow-card">{past.map(row)}</ul>
        </section>
      )}
    </div>
  );
}
