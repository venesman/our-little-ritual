import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Camera, FileDown, ImagePlus, MapPin, Mic, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { usePeople } from "../hooks/usePeople";
import { useSpace } from "../hooks/useSpace";
import {
  addMomentPhoto, deleteMoment, getFeed, hasVoice, imagesOf, KIND_LABEL, listRemoved, matchesType, monthKey, removeMomentPhoto,
  saveMoment, setEntry, signedUrl, TYPE_FILTERS, BUCKET, type Memory, type TypeFilter,
} from "../lib/scrapbook";
import { CATEGORY, type Category } from "../lib/rituals";
import { KIND as LETTER_KIND, type LetterKind } from "../lib/mailbox";
import { friendlyError } from "../lib/errors";
import { Button, Card, ErrorNote, Field, Spinner, Ticket, inputCls } from "../components/ui";
import { VoicePlayer } from "../components/Voice";

const fmtDay = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: iso.length === 10 ? "UTC" : undefined }).format(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso));
const fmtMonth = (key: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`));
export const memoryDate = (m: Memory) =>
  m.kind === "moment" && m.starts_on ? (m.ends_on && m.ends_on !== m.starts_on ? `${fmtDay(m.starts_on)} – ${fmtDay(m.ends_on)}` : fmtDay(m.starts_on)) : fmtDay(m.at);

/** "by Vee", "by Mateo", "by both of you" */
export function useAuthorLabel() {
  const { myId, me, partner } = usePeople();
  return (authors: string[] | null | undefined) => {
    const a = [...new Set((authors ?? []).filter(Boolean))];
    if (a.length >= 2) return "by both of you";
    if (a.length === 0) return "";
    return a[0] === myId ? `by ${me?.display_name || "you"}` : `by ${partner?.display_name || "your partner"}`;
  };
}

function useSigned(bucket: string | undefined, path: string | undefined | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (bucket && path) void signedUrl(bucket, path).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [bucket, path]);
  return url;
}

/* ============================================================== gallery */

export function Scrapbook() {
  const { space } = useSpace();
  const [feed, setFeed] = useState<Memory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<TypeFilter>("all");
  const [category, setCategory] = useState<Category | "">("");
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [open, setOpen] = useState<Memory | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);

  const load = useCallback(async () => {
    try { setFeed(await getFeed()); setError(null); } catch (e) { setError(friendlyError(e)); setFeed([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const years = useMemo(() => [...new Set((feed ?? []).map((m) => (m.starts_on ?? m.at).slice(0, 4)))].sort().reverse(), [feed]);
  const shown = (feed ?? []).filter((m) =>
    matchesType(m, type)
    && (!category || m.category === category)
    && (!year || (m.starts_on ?? m.at).startsWith(year))
    && (!month || (m.starts_on ?? m.at).slice(5, 7) === month));
  const groups = shown.reduce<Record<string, Memory[]>>((acc, m) => {
    const k = monthKey(m.starts_on ?? m.at); (acc[k] ??= []).push(m); return acc;
  }, {});

  if (space?.relationship.status !== "active") return <p className="font-hand text-xl text-muted">your scrapbook opens once your partner has joined</p>;

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="font-hand text-2xl text-raspberry-deep">the little things we keep</p>
          <h1 className="text-4xl">Our Scrapbook</h1>
        </div>
      </header>
      <div className="grid grid-cols-2 gap-2">
        <Link to="/us/moment/new" className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border-2 border-leaf bg-mustard px-4 text-sm font-semibold text-leaf shadow-print">
          <Plus size={16} aria-hidden="true" /> Add a trip or moment
        </Link>
        <Link to="/us/export" className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border-2 border-leaf/80 px-4 text-sm font-semibold text-leaf">
          <FileDown size={16} aria-hidden="true" /> Export our story
        </Link>
      </div>
      <ErrorNote>{error}</ErrorNote>

      <section className="space-y-2" aria-label="Filters">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {TYPE_FILTERS.map((f) => (
            <button key={f.value} type="button" aria-pressed={type === f.value} onClick={() => setType(f.value)}
              className={`shrink-0 rounded-full border-2 px-3 py-1 text-sm font-semibold ${type === f.value ? "border-leaf bg-mustard text-leaf" : "border-leaf/15 text-muted"}`}>{f.label}</button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <select aria-label="Category" className={`${inputCls} !py-2 text-sm`} value={category} onChange={(e) => setCategory(e.target.value as Category | "")}>
            <option value="">Category</option>
            {(Object.keys(CATEGORY) as Category[]).map((c) => <option key={c} value={c}>{CATEGORY[c].label}</option>)}
          </select>
          <select aria-label="Month" className={`${inputCls} !py-2 text-sm`} value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">Month</option>
            {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => (
              <option key={m} value={m}>{new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(new Date(`2026-${m}-01T00:00:00Z`))}</option>
            ))}
          </select>
          <select aria-label="Year" className={`${inputCls} !py-2 text-sm`} value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">Year</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </section>

      {feed === null ? <Spinner label="Opening the scrapbook" /> : shown.length === 0 ? (
        <div className="rounded-[20px] border-2 border-dashed border-leaf/20 px-5 py-8 text-center">
          <p className="font-hand text-xl text-muted">{feed.length ? "nothing matches these filters" : "your scrapbook is waiting for its first page"}</p>
          {!feed.length && <p className="mt-2 text-sm text-muted">Save a revealed ritual, love a letter, or add a trip with your photos.</p>}
        </div>
      ) : (
        Object.entries(groups).sort(([a], [b]) => b.localeCompare(a)).map(([k, items]) => (
          <section key={k} className="space-y-3">
            <h2 className="font-hand text-2xl text-raspberry-deep">{fmtMonth(k)}</h2>
            <ul className="grid grid-cols-2 gap-3">
              {items.map((m, i) => <li key={m.kind + m.ref_id}><Polaroid m={m} tilt={i % 2 ? 1.5 : -1.5} onOpen={() => setOpen(m)} /></li>)}
            </ul>
          </section>
        ))
      )}

      <button type="button" onClick={() => setShowRemoved((v) => !v)} className="text-sm font-semibold text-muted underline-offset-4 hover:underline">
        {showRemoved ? "Hide removed memories" : "Removed memories"}
      </button>
      {showRemoved && <RemovedList onRestored={load} />}

      {open && <MemorySheet m={open} onClose={() => setOpen(null)} onChanged={async () => { await load(); }} />}
    </div>
  );
}

function Polaroid({ m, tilt, onOpen }: { m: Memory; tilt: number; onOpen: () => void }) {
  const first = imagesOf(m)[0];
  const url = useSigned(first?.bucket, first?.path);
  const author = useAuthorLabel();
  const words = m.parts?.find((p) => p.body?.trim())?.body ?? m.caption;
  return (
    <button type="button" onClick={onOpen} style={{ transform: `rotate(${tilt}deg)` }}
      className="block w-full rounded-sm bg-paper p-2 pb-3 text-left shadow-card transition hover:rotate-0 hover:-translate-y-0.5">
      <div className="relative aspect-square overflow-hidden rounded-sm bg-cream">
        {first ? (url ? <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="h-full w-full animate-pulse bg-leaf-soft" />)
          : <p className="line-clamp-6 p-3 font-hand text-lg leading-snug text-leaf">{words || m.title}</p>}
        {hasVoice(m) && <span className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-paper/90 text-raspberry-deep"><Mic size={13} aria-label="Has a voice note" /></span>}
        {imagesOf(m).length > 1 && <span className="absolute bottom-1.5 right-1.5 rounded-full bg-paper/90 px-2 text-[11px] font-bold text-leaf">+{imagesOf(m).length - 1}</span>}
      </div>
      <p className="mt-2 truncate font-display text-sm font-semibold">{m.title || KIND_LABEL[m.kind]}</p>
      <p className="truncate text-[11px] text-muted">{memoryDate(m)} · {author(m.authors)}</p>
    </button>
  );
}

/* ========================================================= one memory */

function MemorySheet({ m, onClose, onChanged }: { m: Memory; onClose: () => void; onChanged: () => Promise<void> }) {
  const author = useAuthorLabel();
  const { myId, partner, me } = usePeople();
  const [caption, setCaption] = useState(m.caption);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameOf = (id: string | null) => (id === myId ? me?.display_name || "You" : partner?.display_name || "Partner");
  const label = m.kind === "ritual" && m.category ? CATEGORY[m.category]?.label
    : m.kind === "letter" && m.letter_kind ? LETTER_KIND[m.letter_kind as LetterKind]?.label : KIND_LABEL[m.kind];

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-leaf/40 sm:items-center" role="dialog" aria-modal="true" aria-label={m.title} onClick={onClose}>
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-cream p-5 pb-10 sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Ticket tone="raspberry">{label}</Ticket>
            <h2 className="mt-2 text-2xl leading-tight">{m.title || KIND_LABEL[m.kind]}</h2>
            <p className="text-sm text-muted">{memoryDate(m)} · {author(m.authors)}</p>
            {m.place && <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-muted"><MapPin size={13} aria-hidden="true" />{m.place}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-paper shadow-card"><X size={16} /></button>
        </div>
        <ErrorNote>{error}</ErrorNote>

        <div className="mt-4 space-y-3">
          {m.kind === "moment" && m.caption && <p className="whitespace-pre-wrap">{m.caption}</p>}
          {(m.photos ?? []).map((p) => <SignedImage key={p.id} bucket={BUCKET.moment} path={p.path} note={p.taken_at ? `Taken ${fmtDay(p.taken_at)}` : undefined} />)}
          {(m.parts ?? []).map((p, i) => (
            <div key={i} className="rounded-2xl bg-paper p-4 shadow-card">
              {p.user_id && (m.parts?.length ?? 0) > 1 && <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{nameOf(p.user_id)}</p>}
              {p.answers?.filter((a) => a.answer).map((a, j) => (
                <div key={j} className="mb-2"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{a.prompt}</p><p className="font-display font-semibold">{a.answer}</p></div>
              ))}
              {p.body && <p className={`whitespace-pre-wrap ${m.kind === "letter" ? "font-hand text-xl" : ""}`}>{p.body}</p>}
              {p.image_path && <SignedImage bucket={BUCKET[m.kind]} path={p.image_path} />}
              {p.voice_path && <VoicePlayer bucket={BUCKET[m.kind]} path={p.voice_path} seconds={p.voice_seconds} />}
              {p.link_url && <a href={p.link_url} target="_blank" rel="noopener noreferrer" className="mt-2 block truncate text-sm font-semibold text-leaf underline">{p.link_url.replace(/^https:\/\//, "")}</a>}
            </div>
          ))}
        </div>

        {m.kind !== "moment" && (
          <div className="mt-4 space-y-2">
            <Field label="Caption" htmlFor="mem-caption">
              <input id="mem-caption" className={inputCls} maxLength={300} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="A few words about this memory" />
            </Field>
            {caption !== m.caption && (
              <Button variant="outline" className="!min-h-[36px] !px-3 text-xs" busy={busy === "cap"} onClick={async () => {
                setBusy("cap"); try { await setEntry(m.kind, m.ref_id, null, caption); await onChanged(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
              }}>Save caption</Button>
            )}
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-2 border-t border-dashed border-leaf/25 pt-4">
          {m.kind === "moment" && <Link to={`/us/moment/${m.ref_id}`} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border-2 border-leaf/80 px-4 text-sm font-semibold text-leaf"><Pencil size={14} aria-hidden="true" /> Edit</Link>}
          <Button variant="ghost" busy={busy === "rm"} onClick={async () => {
            setBusy("rm"); try { await setEntry(m.kind, m.ref_id, false); await onChanged(); onClose(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
          }}><Trash2 size={14} aria-hidden="true" /> Remove from scrapbook</Button>
        </div>
        <p className="mt-1 text-xs text-muted">Removing never deletes the original — you can put it back from "Removed memories".</p>
      </div>
    </div>
  );
}

function SignedImage({ bucket, path, note }: { bucket: string; path: string; note?: string }) {
  const url = useSigned(bucket, path);
  return (
    <figure>
      {url ? <img src={url} alt="" className="w-full rounded-xl bg-paper object-contain" /> : <div className="h-48 animate-pulse rounded-xl bg-leaf-soft" />}
      {note && <figcaption className="mt-1 text-xs text-muted">{note}</figcaption>}
    </figure>
  );
}

function RemovedList({ onRestored }: { onRestored: () => Promise<void> }) {
  const [rows, setRows] = useState<{ kind: Memory["kind"]; ref_id: string; updated_at: string }[] | null>(null);
  const load = () => listRemoved().then(setRows).catch(() => setRows([]));
  useEffect(() => { void load(); }, []);
  if (!rows) return <Spinner label="Loading" />;
  if (!rows.length) return <p className="text-sm text-muted">Nothing removed.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.kind + r.ref_id} className="flex items-center justify-between gap-3 rounded-2xl bg-paper px-4 py-2.5 shadow-card">
          <span className="text-sm">{KIND_LABEL[r.kind]} · removed {fmtDay(r.updated_at)}</span>
          <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-leaf" onClick={async () => { await setEntry(r.kind, r.ref_id, true); await load(); await onRestored(); }}>
            <RotateCcw size={14} aria-hidden="true" /> Put back
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ===================================================== trip / moment editor */

export function MomentEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { space } = useSpace();
  const { myId } = usePeople();
  const [title, setTitle] = useState("");
  const [place, setPlace] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [caption, setCaption] = useState("");
  const [photos, setPhotos] = useState<{ id: string; path: string; taken_at: string | null }[]>([]);
  const [pending, setPending] = useState<File[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!id);
  const input = useRef<HTMLInputElement>(null);

  const loadMoment = useCallback(async () => {
    if (!id) return;
    const feed = await getFeed();
    const m = feed.find((x) => x.kind === "moment" && x.ref_id === id);
    if (m) {
      setTitle(m.title); setPlace(m.place ?? ""); setStartsOn(m.starts_on ?? ""); setEndsOn(m.ends_on ?? ""); setCaption(m.caption); setPhotos(m.photos ?? []);
    }
    setLoading(false);
  }, [id]);
  useEffect(() => { void loadMoment().catch((e) => { setError(friendlyError(e)); setLoading(false); }); }, [loadMoment]);

  if (loading) return <Spinner label="Opening" />;
  const today = new Date().toISOString().slice(0, 10);
  const room = 12 - photos.length;

  const save = async () => {
    setError(null);
    if (!title.trim()) return setError("Please give it a title — e.g. 'Summer in Sweden'.");
    if (!startsOn) return setError("Please choose the date (or the first day of the trip).");
    setBusy("save");
    try {
      const mid = await saveMoment({ id, title, place, starts_on: startsOn, ends_on: endsOn || null, caption });
      const files = pending.slice(0, Math.max(0, room));
      for (let i = 0; i < files.length; i++) {
        setProgress(`Adding photo ${i + 1} of ${files.length}…`);
        await addMomentPhoto(space!.relationship.id, mid, myId!, files[i]);
      }
      setPending([]); setProgress(null);
      navigate("/us", { replace: true });
    } catch (e) { setError(friendlyError(e)); setProgress(null); }
    finally { setBusy(null); }
  };

  return (
    <div className="fade-up space-y-5">
      <Link to="/us" className="inline-flex items-center gap-1.5 text-sm font-semibold text-leaf"><ArrowLeft size={15} aria-hidden="true" /> Scrapbook</Link>
      <h1 className="text-3xl">{id ? "Edit trip or moment" : "Add a trip or moment"}</h1>
      <p className="text-sm text-muted">For photos from your time together — any date, including trips before you started using the app.</p>
      <ErrorNote>{error}</ErrorNote>
      <Card className="space-y-4">
        <Field label="Title" htmlFor="mo-title"><input id="mo-title" className={inputCls} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Summer in Sweden" /></Field>
        <Field label="Place(s)" htmlFor="mo-place" hint="e.g. Lund · Stockholm"><input id="mo-place" className={inputCls} maxLength={120} value={place} onChange={(e) => setPlace(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" htmlFor="mo-from"><input id="mo-from" type="date" max={today} className={inputCls} value={startsOn} onChange={(e) => setStartsOn(e.target.value)} /></Field>
          <Field label="To (optional)" htmlFor="mo-to"><input id="mo-to" type="date" min={startsOn || undefined} max={today} className={inputCls} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} /></Field>
        </div>
        <Field label="Caption" htmlFor="mo-cap"><textarea id="mo-cap" rows={3} maxLength={1000} className={inputCls} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="What you did, who you met, what you'll remember" /></Field>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-xl">Photos <span className="text-sm font-normal text-muted">({photos.length + pending.length}/12)</span></h2>
        <p className="text-xs text-muted">The date each photo was taken is kept when your phone saved it in the file.</p>
        {photos.length > 0 && (
          <ul className="grid grid-cols-3 gap-2">
            {photos.map((p) => <li key={p.id}><StoredThumb p={p} busy={busy === p.id} onRemove={async () => {
              setBusy(p.id); try { await removeMomentPhoto(p.id); setPhotos(photos.filter((x) => x.id !== p.id)); } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
            }} /></li>)}
          </ul>
        )}
        {pending.length > 0 && (
          <ul className="grid grid-cols-3 gap-2">
            {pending.map((f, i) => <li key={i}><PendingThumb file={f} onRemove={() => setPending(pending.filter((_, j) => j !== i))} /></li>)}
          </ul>
        )}
        <input ref={input} type="file" accept="image/*" multiple className="sr-only"
          onChange={(e) => { const fs = Array.from(e.target.files ?? []); setPending((p) => [...p, ...fs].slice(0, Math.max(0, room))); e.target.value = ""; }} />
        {photos.length + pending.length < 12 && (
          <Button variant="outline" className="!min-h-[38px] !px-3 text-xs" onClick={() => input.current?.click()}>
            {photos.length + pending.length ? <ImagePlus size={15} aria-hidden="true" /> : <Camera size={15} aria-hidden="true" />} Choose photos
          </Button>
        )}
      </Card>

      {progress && <p className="text-sm text-muted" aria-live="polite">{progress}</p>}
      <div className="flex flex-wrap gap-2">
        <Button busy={busy === "save"} onClick={() => void save()}>{id ? "Save changes" : "Add to scrapbook"}</Button>
        {id && (
          <Button variant="ghost" busy={busy === "del"} onClick={async () => {
            setBusy("del"); try { await deleteMoment(id, photos.map((p) => p.id)); navigate("/us", { replace: true }); } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
          }}><Trash2 size={14} aria-hidden="true" /> Delete</Button>
        )}
      </div>
    </div>
  );
}

function StoredThumb({ p, busy, onRemove }: { p: { path: string; taken_at: string | null }; busy: boolean; onRemove: () => void }) {
  const url = useSigned(BUCKET.moment, p.path);
  return (
    <div className="relative">
      {url ? <img src={url} alt="" className="aspect-square w-full rounded-lg object-cover" /> : <div className="aspect-square animate-pulse rounded-lg bg-leaf-soft" />}
      <button type="button" aria-label="Remove photo" disabled={busy} onClick={onRemove} className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-paper shadow-card"><X size={13} /></button>
      {p.taken_at && <p className="mt-0.5 truncate text-[10px] text-muted">{fmtDay(p.taken_at)}</p>}
    </div>
  );
}
function PendingThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { const u = URL.createObjectURL(file); setUrl(u); return () => URL.revokeObjectURL(u); }, [file]);
  return (
    <div className="relative">
      {url && <img src={url} alt="" className="aspect-square w-full rounded-lg object-cover opacity-80" />}
      <button type="button" aria-label="Don't add this photo" onClick={onRemove} className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-paper shadow-card"><X size={13} /></button>
      <p className="mt-0.5 text-[10px] text-muted">to add</p>
    </div>
  );
}
