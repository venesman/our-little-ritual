import { OurSoundtrack } from "../components/Soundtrack";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarHeart, Heart, MapPin, Paperclip, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Documents } from "../components/Documents";
import { Scene, sceneFor } from "../components/Passport";
import { fmtPrecise, listDocuments, removeDocumentsOf, type SupportingDoc } from "../lib/record";
import { useSpace } from "../hooks/useSpace";
import { usePeople } from "../hooks/usePeople";
import { updateMemberProfile, type Profile, type ProfilePatch } from "../lib/api";
import {
  addLifeUpdate, deleteLifeUpdate, deleteMilestone, getSharedProfile, listLifeUpdates, listMilestones, MILESTONE_LABEL, TAG_LABEL, PRECISION_LABEL, type MilestoneTag, type DatePrecision,
  saveMilestone, saveSharedProfile, type LifeUpdate, type Milestone, type MilestoneKind, type SharedProfile,
} from "../lib/story";
import { detectTimezone, isValidTimezone, listTimezones, suggestZones } from "../lib/time";
import { friendlyError } from "../lib/errors";
import { Button, Card, ErrorNote, Field, Spinner, inputCls } from "../components/ui";

/**
 * Our Story — three layers, every part editable by both partners:
 *   1. About each of us   (individual profiles)
 *   2. Right now          (what each is sharing + short life updates)
 *   3. Us                 (shared interests, what you enjoy, goals, milestones)
 * Just us activities read from here. Nothing is guessed: home country and
 * university are kept separate from where someone lives now.
 */
export function OurStory() {
  const { me, partner, myId } = usePeople();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="fade-up space-y-8">
      <header>
        <p className="font-hand text-2xl text-raspberry-deep">the little details that make it yours</p>
        <h1 className="text-4xl">Our Story</h1>
        <p className="mt-2 text-sm text-muted">
          Both of you can edit everything. Just us activities use these details.
        </p>
      </header>
      <ErrorNote>{error}</ErrorNote>

      <section className="space-y-3">
        <LayerTitle n={1} title="About each of us" />
        {me && <PersonCard person={me} isMe onError={setError} />}
        {partner ? <PersonCard person={partner} isMe={false} onError={setError} />
          : <p className="rounded-card border-2 border-dashed border-leaf/20 px-5 py-6 text-center font-hand text-xl text-muted">your partner's page appears once they join</p>}
      </section>

      <section className="space-y-3">
        <LayerTitle n={2} title="Right now" />
        <NowSection me={me} partner={partner} myId={myId} onError={setError} />
      </section>

      <section className="space-y-3">
        <LayerTitle n={3} title="Us" />
        <SharedSection onError={setError} />
        <MilestonesSection onError={setError} />
      </section>

      <OurSoundtrack />
    </div>
  );
}

function LayerTitle({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-mustard font-display text-sm text-leaf">{n}</span>
      <h2 className="text-2xl">{title}</h2>
    </div>
  );
}

/* ------------------------------------------------------- 1. individual */

function PersonCard({ person, isMe, onError }: { person: Profile; isMe: boolean; onError: (e: string | null) => void }) {
  const { refresh } = useSpace();
  const [editing, setEditing] = useState(false);
  const who = isMe ? "You" : person.display_name || "Your partner";
  const where = [person.current_city, person.current_country].filter(Boolean).join(", ");

  if (editing) return <PersonForm person={person} isMe={isMe} onDone={async (saved) => { setEditing(false); if (saved) await refresh(); }} onError={onError} />;

  const fields: [string, string | null | undefined][] = [
    ["Home country", person.home_country], ["Doing now", person.situation], ["School or workplace", person.institution],
    ["Time zone", person.timezone.replace(/_/g, " ")], ["Speaks", person.languages_spoken.join(", ")], ["Learning", person.languages_learning.join(", ")],
  ];
  const filled = fields.filter(([, v]) => v);
  const missing = fields.filter(([, v]) => !v).map(([l]) => l.toLowerCase());
  return (
    <div className={`relative space-y-3 overflow-hidden rounded-card p-5 pb-20 shadow-card ${isMe ? "-rotate-[0.6deg] bg-raspberry" : "rotate-[0.6deg] bg-peach"}`}>
      <Scene kind={sceneFor(where || person.timezone)} night={!isMe} className="pointer-events-none absolute -bottom-1 right-2 h-20 w-36" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em]">{who}</p>
          <h3 className="mt-2 text-2xl">{person.display_name || "—"}</h3>
          {where && <p className="mt-0.5 inline-flex items-center gap-1 text-sm"><MapPin size={13} aria-hidden="true" />{where}</p>}
        </div>
        <Button variant="outline" className="!min-h-[36px] !px-3 text-xs" onClick={() => setEditing(true)}><Pencil size={14} aria-hidden="true" /> Edit</Button>
      </div>
      {filled.length > 0 && (
        <dl className="relative grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {filled.map(([l, v]) => <Info key={l} label={l} value={v} />)}
        </dl>
      )}
      {person.interests.length > 0 && <div className="relative"><Chips items={person.interests} /></div>}
      {missing.length > 0 && (
        <button type="button" onClick={() => setEditing(true)} className="relative block max-w-[60%] text-left font-hand text-lg leading-tight text-raspberry-deep">
          + add {missing.length > 2 ? `${missing.slice(0, 2).join(", ")} and more` : missing.join(" and ")}{!where ? "" : ""}
        </button>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className={value ? "" : "text-faint"}>{value || "not set"}</dd>
    </div>
  );
}

function Chips({ items, tone = "leaf" }: { items: string[]; tone?: "leaf" | "raspberry" }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((i) => <li key={i} className={`rounded-full px-3 py-1 text-xs font-semibold ${tone === "leaf" ? "bg-leaf-soft text-leaf" : "bg-raspberry-soft text-raspberry-deep"}`}>{i}</li>)}
    </ul>
  );
}

/** Comma-separated label input that edits a string[]. */
function ListField({ id, label, hint, value, onChange }: { id: string; label: string; hint?: string; value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join(", "));
  return (
    <Field label={label} htmlFor={id} hint={hint ?? "Separate with commas"}>
      <input id={id} className={inputCls} value={text}
        onChange={(e) => { setText(e.target.value); onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean)); }} />
    </Field>
  );
}

function PersonForm({ person, isMe, onDone, onError }: { person: Profile; isMe: boolean; onDone: (saved: boolean) => void; onError: (e: string | null) => void }) {
  const [f, setF] = useState<ProfilePatch>({
    display_name: person.display_name, current_city: person.current_city ?? "", current_country: person.current_country ?? "",
    home_country: person.home_country ?? "", institution: person.institution ?? "", situation: person.situation ?? "",
    interests: person.interests, languages_spoken: person.languages_spoken, languages_learning: person.languages_learning, timezone: person.timezone,
  });
  const [busy, setBusy] = useState(false);
  const zones = useMemo(() => listTimezones(), []);
  const suggestions = suggestZones(f.current_city, f.current_country, zones).filter((z) => z !== f.timezone);
  const set = (k: keyof ProfilePatch) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const who = isMe ? "your" : `${person.display_name || "your partner"}'s`;

  const save = async () => {
    onError(null);
    if (!f.display_name?.trim()) return onError("Please keep a name.");
    if (!f.timezone || !isValidTimezone(f.timezone)) return onError("Please choose a valid time zone.");
    setBusy(true);
    try { await updateMemberProfile(person.id, f); onDone(true); }
    catch (e) { onError(friendlyError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Card className="space-y-4">
      <h3 className="text-xl">Edit {who} details</h3>
      <Field label="Name" htmlFor={`n-${person.id}`}><input id={`n-${person.id}`} className={inputCls} maxLength={40} value={f.display_name ?? ""} onChange={set("display_name")} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Current city" htmlFor={`cc-${person.id}`} hint="Where they live right now"><input id={`cc-${person.id}`} className={inputCls} maxLength={60} value={f.current_city ?? ""} onChange={set("current_city")} /></Field>
        <Field label="Current country" htmlFor={`co-${person.id}`}><input id={`co-${person.id}`} className={inputCls} maxLength={60} value={f.current_country ?? ""} onChange={set("current_country")} /></Field>
      </div>
      <Field label="Home country" htmlFor={`hc-${person.id}`} hint="Where they're from — kept separate from where they live now"><input id={`hc-${person.id}`} className={inputCls} maxLength={60} value={f.home_country ?? ""} onChange={set("home_country")} /></Field>
      <Field label="What they're doing now" htmlFor={`si-${person.id}`} hint="e.g. exchange year, working in events"><input id={`si-${person.id}`} className={inputCls} maxLength={80} value={f.situation ?? ""} onChange={set("situation")} /></Field>
      <Field label="School or workplace" htmlFor={`in-${person.id}`} hint="Optional"><input id={`in-${person.id}`} className={inputCls} maxLength={80} value={f.institution ?? ""} onChange={set("institution")} /></Field>
      <ListField id={`it-${person.id}`} label="Interests" value={f.interests ?? []} onChange={(v) => setF({ ...f, interests: v })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <ListField id={`ls-${person.id}`} label="Languages spoken" value={f.languages_spoken ?? []} onChange={(v) => setF({ ...f, languages_spoken: v })} />
        <ListField id={`ll-${person.id}`} label="Languages learning" value={f.languages_learning ?? []} onChange={(v) => setF({ ...f, languages_learning: v })} />
      </div>
      <Field label="Time zone" htmlFor={`tz-${person.id}`} hint="Used for release times and the best time to call">
        <select id={`tz-${person.id}`} className={inputCls} value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>
          {f.timezone && !zones.includes(f.timezone) && <option value={f.timezone}>{f.timezone}</option>}
          {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
        </select>
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((z) => (
          <button key={z} type="button" onClick={() => setF({ ...f, timezone: z })} className="rounded-full border-2 border-mustard px-3 py-1 text-xs font-semibold text-mustard-deep">
            Use {z.replace(/_/g, " ")}?
          </button>
        ))}
        {isMe && detectTimezone() !== f.timezone && (
          <button type="button" onClick={() => setF({ ...f, timezone: detectTimezone() })} className="rounded-full border-2 border-leaf/30 px-3 py-1 text-xs font-semibold text-leaf">
            Use this device's time zone
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <Button onClick={() => void save()} busy={busy}>Save</Button>
        <Button variant="ghost" onClick={() => onDone(false)}>Cancel</Button>
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------- 2. right now */

function NowSection({ me, partner, myId, onError }: { me: Profile | null; partner: Profile | null; myId: string | null; onError: (e: string | null) => void }) {
  const { refresh } = useSpace();
  const [updates, setUpdates] = useState<LifeUpdate[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => listLifeUpdates().then(setUpdates).catch(() => setUpdates([])), []);
  useEffect(() => { void load(); }, [load]);
  const nameOf = (uid: string) => (uid === myId ? "You" : partner?.display_name || "Your partner");

  return (
    <div className="space-y-3">
      {[me, partner].filter((p): p is Profile => !!p).map((p) => (
        <SharingNow key={p.id} person={p} isMe={p.id === myId} onSaved={refresh} onError={onError} />
      ))}
      <Card className="space-y-3">
        <h3 className="text-xl">Life updates</h3>
        <p className="text-xs text-muted">Little news from your week — a new class, a trip, a win, a worry.</p>
        <div className="flex gap-2">
          <input aria-label="New life update" className={inputCls} maxLength={500} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Share an update…" />
          <Button busy={busy === "add"} onClick={async () => {
            if (!draft.trim()) return;
            setBusy("add"); onError(null);
            try { await addLifeUpdate(draft); setDraft(""); await load(); } catch (e) { onError(friendlyError(e)); } finally { setBusy(null); }
          }}><Plus size={16} aria-hidden="true" /><span className="sr-only">Post</span></Button>
        </div>
        {updates === null ? <Spinner label="Loading" /> : updates.length === 0 ? <p className="font-hand text-lg text-muted">no updates yet</p> : (
          <ul className="divide-y divide-dashed divide-leaf/20">
            {updates.map((u) => (
              <li key={u.id} className="flex items-start gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-tomato-deep">
                    {nameOf(u.user_id)} · {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(u.created_at))}
                  </p>
                  <p className="mt-0.5">{u.body}</p>
                </div>
                {u.user_id === myId && (
                  <button type="button" aria-label="Remove update" onClick={async () => { try { await deleteLifeUpdate(u.id); await load(); } catch (e) { onError(friendlyError(e)); } }}
                    className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-tomato-soft"><Trash2 size={14} /></button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function SharingNow({ person, isMe, onSaved, onError }: { person: Profile; isMe: boolean; onSaved: () => Promise<void>; onError: (e: string | null) => void }) {
  const [text, setText] = useState(person.sharing_now);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => setText(person.sharing_now), [person.sharing_now]);
  const id = `now-${person.id}`;
  return (
    <Card className="space-y-2 !p-5">
      <Field label={isMe ? "What I'm into right now" : `What ${person.display_name ? `${person.display_name}'s` : "they're"} into right now`} htmlFor={id}>
        <textarea id={id} rows={2} maxLength={600} className={inputCls} value={text} onChange={(e) => { setText(e.target.value); setSaved(false); }}
          placeholder="A project, a show, a new hobby, what's on your mind…" />
      </Field>
      {text !== person.sharing_now || saved ? (
        <Button variant="outline" className="!min-h-[36px] !px-3 text-xs" busy={busy} onClick={async () => {
          setBusy(true); onError(null);
          try { await updateMemberProfile(person.id, { sharing_now: text }); await onSaved(); setSaved(true); } catch (e) { onError(friendlyError(e)); } finally { setBusy(false); }
        }}>{saved ? "Saved" : "Save"}</Button>
      ) : null}
    </Card>
  );
}

/* ----------------------------------------------------------------- 3. us */

function SharedSection({ onError }: { onError: (e: string | null) => void }) {
  const [p, setP] = useState<SharedProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SharedProfile>({ shared_interests: [], enjoy_together: [], shared_goals: "" });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => getSharedProfile().then(setP).catch(() => setP({ shared_interests: [], enjoy_together: [], shared_goals: "" })), []);
  useEffect(() => { void load(); }, [load]);
  if (!p) return <Spinner label="Loading" />;

  if (editing) {
    return (
      <Card className="space-y-4">
        <h3 className="text-xl">Edit our profile</h3>
        <ListField id="sh-int" label="Shared interests" value={draft.shared_interests} onChange={(v) => setDraft({ ...draft, shared_interests: v })} />
        <ListField id="sh-enj" label="Things we enjoy together" value={draft.enjoy_together} onChange={(v) => setDraft({ ...draft, enjoy_together: v })} />
        <Field label="Shared goals" htmlFor="sh-goals">
          <textarea id="sh-goals" rows={3} maxLength={1000} className={inputCls} value={draft.shared_goals} onChange={(e) => setDraft({ ...draft, shared_goals: e.target.value })} />
        </Field>
        <div className="flex gap-2">
          <Button busy={busy} onClick={async () => {
            setBusy(true); onError(null);
            try { await saveSharedProfile(draft); await load(); setEditing(false); } catch (e) { onError(friendlyError(e)); } finally { setBusy(false); }
          }}>Save</Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </Card>
    );
  }

  const empty = !p.shared_interests.length && !p.enjoy_together.length && !p.shared_goals;
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-xl"><Heart size={18} className="text-raspberry" aria-hidden="true" />Our profile</h3>
        <Button variant="outline" className="!min-h-[36px] !px-3 text-xs" onClick={() => { setDraft(p); setEditing(true); }}><Pencil size={14} aria-hidden="true" /> Edit</Button>
      </div>
      {empty ? <p className="font-hand text-lg text-muted">add what you love doing together</p> : (
        <>
          {p.shared_interests.length > 0 && <div><p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Shared interests</p><Chips items={p.shared_interests} tone="raspberry" /></div>}
          {p.enjoy_together.length > 0 && <div><p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">We enjoy</p><Chips items={p.enjoy_together} /></div>}
          {p.shared_goals && <div><p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Shared goals</p><p className="whitespace-pre-wrap">{p.shared_goals}</p></div>}
        </>
      )}
    </Card>
  );
}

type MsForm = { id?: string; kind: MilestoneKind; title: string; happened_on: string; note: string; tag: MilestoneTag | ""; date_precision: DatePrecision };
const EMPTY_MS: MsForm = { kind: "milestone", title: "", happened_on: "", note: "", tag: "", date_precision: "day" };
const todayIso = () => new Date().toISOString().slice(0, 10);
const SUGGESTED_TITLE: Partial<Record<MilestoneTag, string>> = {
  first_met: "We first met", relationship_start: "Our relationship began", first_visit: "First visit to ", met_family: "Meeting the family",
  engagement: "We got engaged", marriage: "Our wedding", moving: "Moving to be together",
};

function MilestonesSection({ onError }: { onError: (e: string | null) => void }) {
  const [items, setItems] = useState<Milestone[] | null>(null);
  const [form, setForm] = useState<null | MsForm>(null);
  const [docs, setDocs] = useState<SupportingDoc[] | null>(null);
  const [openDocs, setOpenDocs] = useState<string | null>(null);
  const loadDocs = useCallback(() => listDocuments().then(setDocs), []);
  useEffect(() => { void loadDocs(); }, [loadDocs]);
  const typed = (items ?? []).some((m) => m.date_precision !== undefined) || docs !== null;
  // Opened from the Timeline's "suggested milestones": /us?tab=story&add=first_met
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const tag = params.get("add") as MilestoneTag | null;
    if (tag && TAG_LABEL[tag]) {
      setForm({ ...EMPTY_MS, tag, title: SUGGESTED_TITLE[tag] ?? "" });
      setTimeout(() => document.getElementById("ms-form")?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
      params.delete("add"); setParams(params, { replace: true });
    }
  }, [params, setParams]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => listMilestones().then(setItems).catch(() => setItems([])), []);
  useEffect(() => { void load(); }, [load]);

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-xl"><CalendarHeart size={18} className="text-tomato" aria-hidden="true" />Milestones & memories</h3>
        {!form && <Button variant="outline" className="!min-h-[36px] !px-3 text-xs" onClick={() => setForm(EMPTY_MS)}><Plus size={14} aria-hidden="true" /> Add</Button>}
      </div>

      {form && (
        <div id="ms-form" className="space-y-3 rounded-2xl bg-cream p-4">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kind">
            {(Object.keys(MILESTONE_LABEL) as MilestoneKind[]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={form.kind === k} onClick={() => setForm({ ...form, kind: k })}
                className={`rounded-full border-2 px-3 py-1 text-xs font-semibold ${form.kind === k ? "border-leaf bg-mustard text-leaf" : "border-leaf/15 text-muted"}`}>{MILESTONE_LABEL[k]}</button>
            ))}
          </div>
          {typed && (
            <Field label="Type (optional)" htmlFor="ms-tag">
              <select id="ms-tag" className={inputCls} value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value as MilestoneTag | "" })}>
                <option value="">No particular type</option>
                {(Object.keys(TAG_LABEL) as MilestoneTag[]).map((k) => <option key={k} value={k}>{TAG_LABEL[k]}</option>)}
              </select>
            </Field>
          )}
          <Field label="Title" htmlFor="ms-title"><input id="ms-title" className={inputCls} maxLength={80} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Our first video call" /></Field>
          <Field label="Date (optional)" htmlFor="ms-date"><input id="ms-date" type="date" className={inputCls} value={form.happened_on} onChange={(e) => setForm({ ...form, happened_on: e.target.value })} /></Field>
          {typed && form.happened_on && (
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="How exact is the date">
              {(Object.keys(PRECISION_LABEL) as DatePrecision[]).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={form.date_precision === k} onClick={() => setForm({ ...form, date_precision: k })}
                  className={`rounded-full border-2 px-3 py-1 text-xs font-semibold ${form.date_precision === k ? "border-leaf bg-mustard text-leaf" : "border-leaf/15 text-muted"}`}>{PRECISION_LABEL[k]}</button>
              ))}
            </div>
          )}
          {typed && form.happened_on > todayIso() && <p className="text-xs text-muted">A future date shows as a plan on your Timeline.</p>}
          <Field label="Note (optional)" htmlFor="ms-note"><textarea id="ms-note" rows={2} maxLength={500} className={inputCls} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          <div className="flex gap-2">
            <Button busy={busy} onClick={async () => {
              setBusy(true); onError(null);
              try { await saveMilestone({ ...form, tag: form.tag || null }); setForm(null); await load(); } catch (e) { onError(friendlyError(e)); } finally { setBusy(false); }
            }}>Save</Button>
            <Button variant="ghost" onClick={() => setForm(null)}><X size={14} aria-hidden="true" /> Cancel</Button>
          </div>
        </div>
      )}

      {items === null ? <Spinner label="Loading" /> : items.length === 0 && !form ? <p className="font-hand text-lg text-muted">your story's first page is waiting</p> : (
        <ol className="space-y-2">
          {items.map((m) => (
            <li key={m.id} className="flex items-start gap-3 rounded-2xl border border-leaf/15 px-4 py-3">
              <Sparkles size={16} className="mt-1 shrink-0 text-mustard-deep" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
                  {m.tag ? TAG_LABEL[m.tag] : MILESTONE_LABEL[m.kind]}{m.happened_on ? ` · ${fmtPrecise(m.happened_on, m.date_precision)}` : ""}{m.happened_on && m.happened_on > todayIso() ? " · planned" : ""}
                </p>
                <p className="font-display text-lg">{m.title}</p>
                {m.note && <p className="text-sm text-muted">{m.note}</p>}
                {docs !== null && (() => { const n = docs.filter((d) => d.attached_kind === "milestone" && d.ref_id === m.id).length; return (
                  <button type="button" onClick={() => setOpenDocs(openDocs === m.id ? null : m.id)} className="mt-1 flex items-center gap-1 text-xs font-semibold text-leaf">
                    <Paperclip size={12} aria-hidden="true" /> {n ? `Documents (${n})` : "Attach a document"}
                  </button>); })()}
                {docs !== null && openDocs === m.id && <Documents kind="milestone" refId={m.id} docs={docs} onChange={() => void loadDocs()} />}
              </div>
              <button type="button" aria-label={`Edit ${m.title}`} onClick={() => setForm({ id: m.id, kind: m.kind, title: m.title, happened_on: m.happened_on ?? "", note: m.note, tag: m.tag ?? "", date_precision: m.date_precision ?? "day" })}
                className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-leaf-soft"><Pencil size={14} /></button>
              <button type="button" aria-label={`Remove ${m.title}`} onClick={async () => { try { await removeDocumentsOf(docs, "milestone", m.id); await deleteMilestone(m.id); await load(); void loadDocs(); } catch (e) { onError(friendlyError(e)); } }}
                className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-tomato-soft"><Trash2 size={14} /></button>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
