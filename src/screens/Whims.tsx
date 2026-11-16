import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Archive, Camera, ExternalLink, Gift, Pencil, Plus, Sparkles, Trash2, Undo2, X } from "lucide-react";
import { usePeople } from "../hooks/usePeople";
import { useSpace } from "../hooks/useSpace";
import { markSeen, useForYou } from "../hooks/useForYou";
import {
  archiveWhim, cameTrue, CURRENCIES, deleteWhim, formatPrice, KIND_INFO, LITTLE_WANT_ANSWERS, listWhims, removeWhimPhoto, revealWhim, saveWhim,
  setWhimStatus, SHARED_WISH_STATUSES, STATUS_LABEL, uploadWhimPhoto, WHIM_BUCKET, type Currency, type Whim, type WhimKind, type WhimStatus,
} from "../lib/whims";
import { signedUrl } from "../lib/scrapbook";
import { friendlyError } from "../lib/errors";
import { Button, ErrorNote, Field, Spinner, inputCls } from "../components/ui";
import { SaveToScrapbook } from "../components/ScrapbookBits";

const shortDate = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

function useSigned(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { setUrl(null); if (path) void signedUrl(WHIM_BUCKET, path).then(setUrl); }, [path]);
  return url;
}

/* ================================================================== list */

/** Mailbox → Whims: little wants and shared wishes. No reminders, no dots, no shopping. */
export function Whims() {
  const { myId, partner } = usePeople();
  const { refresh } = useForYou();
  const pName = partner?.display_name || "your partner";
  const [whims, setWhims] = useState<Whim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPutAway, setShowPutAway] = useState(false);

  const load = useCallback(async () => {
    try { setWhims(await listWhims()); setError(null); } catch (e) { setError(friendlyError(e)); setWhims([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // Seeing the list counts as "seen" for the For you line (kept on this phone only).
  useEffect(() => { if (myId && whims) { markSeen(myId, "whims"); refresh(); } }, [myId, whims, refresh]);

  if (whims === null) return <Spinner label="Opening the wish jar" />;
  const active = whims.filter((w) => !w.archived && !cameTrue(w));
  const trueOnes = whims.filter((w) => !w.archived && cameTrue(w));
  const putAway = whims.filter((w) => w.archived);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Little wants and shared wishes — no pressure, ever.</p>
        <Link to="/mailbox/whims/new" className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border-[1.5px] border-leaf/15 bg-mustard px-4 text-sm font-semibold text-leaf shadow-print">
          <Plus size={16} aria-hidden="true" /> Add a whim
        </Link>
      </div>
      <ErrorNote>{error}</ErrorNote>

      {active.length === 0 ? (
        <p className="rounded-card border-2 border-dashed border-leaf/20 px-5 py-8 text-center font-hand text-xl text-muted">the wish jar is empty — add a little whim any time</p>
      ) : (
        <ul className="space-y-3">{active.map((w) => <li key={w.id}><WhimCard w={w} myId={myId} pName={pName} onChange={load} /></li>)}</ul>
      )}

      {trueOnes.length > 0 && (
        <section className="space-y-3" aria-label="Wishes come true">
          <p className="font-hand text-2xl text-raspberry-deep">wishes come true ✦</p>
          <ul className="space-y-3">{trueOnes.map((w) => <li key={w.id}><WhimCard w={w} myId={myId} pName={pName} onChange={load} /></li>)}</ul>
        </section>
      )}

      {putAway.length > 0 && (
        <section className="space-y-2">
          <button type="button" onClick={() => setShowPutAway((v) => !v)} className="text-sm font-semibold text-muted underline underline-offset-4">
            {showPutAway ? "Hide put-away whims" : `Put away (${putAway.length})`}
          </button>
          {showPutAway && <ul className="space-y-3">{putAway.map((w) => <li key={w.id}><WhimCard w={w} myId={myId} pName={pName} onChange={load} /></li>)}</ul>}
        </section>
      )}
      <p className="text-xs text-muted">Only the two of you can see your whims. Prices are just for you two — nothing here buys anything.</p>
    </div>
  );
}

function WhimCard({ w, myId, pName, onChange }: { w: Whim; myId: string | null | undefined; pName: string; onChange: () => Promise<void> }) {
  const url = useSigned(w.photo_path);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const mine = w.created_by === myId;
  const price = formatPrice(w.price, w.currency);
  const done = cameTrue(w);
  const iAnswer = w.kind === "little_want" && !mine;
  const giverSurprise = iAnswer && w.surprise;
  const choices: WhimStatus[] = w.kind === "shared_wish" ? SHARED_WISH_STATUSES
    : giverSurprise ? (w.status === "bought" ? [] : ["bought"]) : LITTLE_WANT_ANSWERS;
  const canChoose = !w.archived && (w.kind === "shared_wish" || (iAnswer && !done));
  const editable = mine && !w.surprise && !done && w.status !== "in_the_works" && !w.archived;

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(null);
    try { await fn(); await onChange(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
  };
  const by = w.kind === "little_want" ? (mine ? "Your little want" : `${pName}'s little want`) : (mine ? "Shared wish · added by you" : `Shared wish · added by ${pName}`);
  const statusText = w.status === "new" && iAnswer ? "New for you to answer" : STATUS_LABEL[w.status];

  return (
    <article className={`postcard space-y-3 !p-4 ${w.status === "new" && iAnswer ? "ring-2 ring-raspberry" : ""}`}>
      <div className="flex gap-3">
        {w.photo_path && (
          <div className="h-20 w-20 shrink-0 -rotate-2 overflow-hidden rounded-sm bg-cream p-1 shadow-card">
            {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full animate-pulse bg-leaf-soft" />}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{by}</p>
          <h3 className="font-display text-lg leading-tight">{w.name}</h3>
          <p className="mt-0.5 text-xs text-muted">{[price, `added ${shortDate(w.created_at)}`].filter(Boolean).join(" · ")}</p>
          {w.link && (
            <a href={w.link} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-flex max-w-full items-center gap-1 text-xs font-semibold text-leaf underline underline-offset-4">
              <ExternalLink size={12} aria-hidden="true" /><span className="truncate">{new URL(w.link).hostname.replace(/^www\./, "")}</span>
            </a>
          )}
        </div>
      </div>
      {w.message && <p className="whitespace-pre-wrap font-hand text-lg leading-snug">{w.message}</p>}

      <div className={`rounded-xl px-3 py-2 text-sm font-semibold ${done ? "bg-leaf text-cream" : w.status === "in_the_works" || w.surprise ? "bg-raspberry-soft text-raspberry-deep" : "bg-leaf-soft text-leaf"}`}>
        {done ? <Gift size={14} className="mr-1.5 inline" aria-hidden="true" /> : w.status === "in_the_works" ? <Sparkles size={14} className="mr-1.5 inline" aria-hidden="true" /> : null}
        {giverSurprise ? `${STATUS_LABEL[w.status]} · secret until you reveal it` : statusText}
        {w.response_note && <span className="mt-0.5 block font-hand text-base font-normal">“{w.response_note}”</span>}
      </div>

      {canChoose && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={w.kind === "shared_wish" ? "Move it along" : "Your answer"}>
            {choices.map((s) => (
              <button key={s} type="button" disabled={!!busy} aria-pressed={w.status === s && !giverSurprise}
                onClick={() => void act(s, () => setWhimStatus(w.id, s, noteOpen ? note : null))}
                className={`min-h-[36px] rounded-full border-2 px-3 text-xs font-semibold ${w.status === s && !giverSurprise ? "border-leaf/20 bg-mustard text-leaf" : "border-leaf/40 bg-paper text-leaf"}`}>
                {giverSurprise && s === "bought" ? "Bought it (still secret)" : STATUS_LABEL[s]}
              </button>
            ))}
            {giverSurprise && (
              <button type="button" disabled={!!busy} onClick={() => void act("reveal", () => revealWhim(w.id))}
                className="min-h-[36px] rounded-full border-[1.5px] border-leaf/15 bg-mustard px-3 text-xs font-semibold text-leaf shadow-print-sm">
                <Sparkles size={12} className="mr-1 inline" aria-hidden="true" />Reveal the surprise
              </button>
            )}
          </div>
          {noteOpen ? (
            <input className={inputCls} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="A little note with your answer (optional)" aria-label="Note with your answer" />
          ) : (
            <button type="button" onClick={() => setNoteOpen(true)} className="text-xs font-semibold text-muted underline underline-offset-4">Add a note with your answer</button>
          )}
        </div>
      )}

      {done && !w.archived && <SaveToScrapbook kind="whim" refId={w.id} prompt />}
      {error && <p className="text-xs text-tomato-deep">{error}</p>}

      <div className="flex flex-wrap gap-3 text-xs font-semibold text-muted">
        {editable && <Link to={`/mailbox/whims/${w.id}/edit`} className="inline-flex items-center gap-1 underline underline-offset-4"><Pencil size={12} aria-hidden="true" />Edit</Link>}
        {!(mine && w.status === "in_the_works") && (
          <button type="button" disabled={!!busy} onClick={() => void act("archive", () => archiveWhim(w.id, !w.archived))} className="inline-flex items-center gap-1 underline underline-offset-4">
            {w.archived ? <><Undo2 size={12} aria-hidden="true" />Bring back</> : <><Archive size={12} aria-hidden="true" />Put away</>}
          </button>
        )}
        {mine && !w.surprise && !done && w.status !== "in_the_works" && (
          <button type="button" disabled={!!busy} onClick={() => { if (window.confirm(`Delete “${w.name}”?`)) void act("delete", () => deleteWhim(w.id)); }} className="inline-flex items-center gap-1 underline underline-offset-4">
            <Trash2 size={12} aria-hidden="true" />Delete
          </button>
        )}
      </div>
    </article>
  );
}

/* ================================================================ editor */

export function WhimEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const { space } = useSpace();
  const { myId } = usePeople();
  const [loaded, setLoaded] = useState(!id);
  const [kind, setKind] = useState<WhimKind>("little_want");
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<Currency>("RM");
  const [message, setMessage] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewUrl = useSigned(file ? null : photo);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  useEffect(() => { if (!file) { setLocalUrl(null); return; } const u = URL.createObjectURL(file); setLocalUrl(u); return () => URL.revokeObjectURL(u); }, [file]);

  useEffect(() => {
    if (!id) return;
    listWhims().then((all) => {
      const w = all.find((x) => x.id === id);
      if (!w) { setError("We couldn't find that whim."); setLoaded(true); return; }
      setKind(w.kind); setName(w.name); setLink(w.link ?? ""); setMessage(w.message); setPhoto(w.photo_path);
      if (w.price != null) { setPrice(String(w.price)); setCurrency(w.currency ?? "RM"); }
      setLoaded(true);
    }).catch((e) => { setError(friendlyError(e)); setLoaded(true); });
  }, [id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const p = price.trim() === "" ? null : Number(price.replace(/,/g, ""));
      if (p != null && (!Number.isFinite(p) || p < 0)) throw new Error("That price doesn't look right.");
      const base = { kind, name, link: link.trim() || null, price: p, currency: p == null ? null : currency, message };
      const wid = await saveWhim({ ...base, id: id ?? null, photo_path: photo });
      if (file && space && myId) {
        const path = await uploadWhimPhoto(space.relationship.id, wid, myId, file);
        await saveWhim({ ...base, id: wid, photo_path: path });
        if (photo && photo !== path) await removeWhimPhoto(photo);
      }
      nav("/mailbox?section=whims");
    } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  };

  if (!loaded) return <Spinner label="Opening the whim" />;
  return (
    <form onSubmit={submit} className="fade-up space-y-5">
      <Link to="/mailbox?section=whims" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted"><ArrowLeft size={16} aria-hidden="true" /> Whims</Link>
      <header>
        <p className="font-hand text-2xl text-raspberry-deep">a little whim</p>
        <h1 className="text-4xl">{id ? "Edit your whim" : "Add a whim"}</h1>
      </header>

      {!id && (
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Kind of whim">
          {(Object.keys(KIND_INFO) as WhimKind[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
              className={`rounded-2xl border-2 p-3 text-left ${kind === k ? "border-leaf/20 bg-mustard text-leaf" : "border-leaf/30 bg-paper text-leaf"}`}>
              <span className="block font-display text-base">{KIND_INFO[k].label}</span>
              <span className={`block text-xs ${kind === k ? "text-cream/85" : "text-muted"}`}>{KIND_INFO[k].hint}</span>
            </button>
          ))}
        </div>
      )}

      <Field label="What is it?" htmlFor="w-name">
        <input id="w-name" className={inputCls} value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} placeholder={kind === "little_want" ? "e.g. That rattan bag from the market" : "e.g. See the northern lights together"} />
      </Field>
      <Field label="Link (optional)" hint="Just a plain link — no previews, nothing tracked." htmlFor="w-link">
        <input id="w-link" type="url" inputMode="url" className={inputCls} value={link} maxLength={500} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
      </Field>
      <Field label="Rough price (optional)" htmlFor="w-price">
        <div className="flex gap-2">
          <select aria-label="Currency" className={`${inputCls} !w-24`} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input id="w-price" inputMode="decimal" className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 90" />
        </div>
      </Field>
      <Field label="A little message (optional)" htmlFor="w-msg">
        <textarea id="w-msg" rows={3} className={inputCls} value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} placeholder="Why it made you smile…" />
      </Field>

      <div className="space-y-2">
        <p className="text-sm font-semibold">Photo (optional)</p>
        {(localUrl || previewUrl) && (
          <div className="relative w-40">
            <img src={localUrl ?? previewUrl!} alt="" className="w-40 rounded-xl object-cover shadow-card" />
            <button type="button" aria-label="Remove photo" onClick={() => { setFile(null); setPhoto(null); }} className="absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded-full bg-paper shadow-card"><X size={14} /></button>
          </div>
        )}
        <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border-2 border-leaf/60 px-4 text-sm font-semibold text-leaf">
          <Camera size={16} aria-hidden="true" /> {localUrl || previewUrl ? "Change photo" : "Add a photo"}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      </div>

      <ErrorNote>{error}</ErrorNote>
      <Button type="submit" busy={busy}>{id ? "Save changes" : kind === "little_want" ? "Send it over" : "Add our wish"}</Button>
    </form>
  );
}
