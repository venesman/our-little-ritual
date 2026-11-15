import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Camera, Heart, Lock, MailOpen, PenLine, Send, Trash2, Undo2, X } from "lucide-react";
import { usePeople } from "../hooks/usePeople";
import { useSpace } from "../hooks/useSpace";
import {
  deleteDraft, getLetter, KIND, KINDS, LETTER_BUCKET, listLetters, listSealed, openLetter, removeLetterFile, saveLetter, sendLetter,
  signedLetterUrl, takeBackLetter, toggleLoved, uploadLetterPhoto, uploadLetterVoice, type Letter, type LetterKind, type SealedLetter,
} from "../lib/mailbox";
import { formatInZone } from "../lib/time";
import { friendlyError } from "../lib/errors";
import { Button, Card, ErrorNote, Field, Spinner, Ticket, inputCls } from "../components/ui";
import { VoicePlayer, VoiceRecorder, type RecordedVoice } from "../components/Voice";

type Tab = "inbox" | "sent" | "drafts" | "loved";
const STAMP_TONE = {
  raspberry: "border-raspberry bg-raspberry-soft text-raspberry-deep",
  mustard: "border-mustard bg-mustard-soft text-mustard-deep",
  leaf: "border-leaf/70 bg-leaf-soft text-leaf",
  tomato: "border-tomato bg-tomato-soft text-tomato-deep",
};

function Stamp({ kind, size = "md" }: { kind: LetterKind; size?: "sm" | "md" }) {
  const k = KIND[kind];
  return (
    <span aria-hidden="true" className={`grid shrink-0 rotate-3 place-items-center rounded-sm border-2 border-dashed font-display ${STAMP_TONE[k.tone]} ${size === "sm" ? "h-11 w-10 text-lg" : "h-16 w-14 text-2xl"}`}>
      {k.stamp}
    </span>
  );
}

const shortDate = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: tz }).format(new Date(iso));

/* ================================================================= list */

export function Mailbox() {
  const { space, profile } = useSpace();
  const { myId, partner } = usePeople();
  const tz = profile?.timezone ?? "UTC";
  const pName = partner?.display_name || "your partner";
  const [tab, setTab] = useState<Tab>("inbox");
  const [letters, setLetters] = useState<Letter[] | null>(null);
  const [sealed, setSealed] = useState<SealedLetter[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const [l, s] = await Promise.all([listLetters(), listSealed()]); setLetters(l); setSealed(s); setError(null); }
    catch (e) { setError(friendlyError(e)); setLetters([]); }
  }, []);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30000);
    return () => clearInterval(t);
  }, [load]);

  if (space?.relationship.status !== "active") {
    return <div className="space-y-3"><h1 className="text-4xl">Our Mailbox</h1><p className="font-hand text-xl text-muted">opens once your partner has joined</p></div>;
  }

  const inbox = (letters ?? []).filter((l) => l.recipient_id === myId);
  const sent = (letters ?? []).filter((l) => l.sender_id === myId && l.status === "sent");
  const drafts = (letters ?? []).filter((l) => l.sender_id === myId && l.status === "draft");
  const loved = (letters ?? []).filter((l) => l.loved);
  const unread = inbox.filter((l) => !l.opened_at).length;
  const lists: Record<Tab, Letter[]> = {
    inbox: [...inbox].sort((a, b) => Number(!!a.opened_at) - Number(!!b.opened_at) || (b.sent_at ?? "").localeCompare(a.sent_at ?? "")),
    sent, drafts, loved,
  };
  const empty: Record<Tab, string> = {
    inbox: "nothing in the post yet", sent: "letters you send will be kept here", drafts: "no drafts — start one any time", loved: "tap the heart on a letter you want to keep close",
  };

  return (
    <div className="fade-up space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="font-hand text-2xl text-raspberry-deep">letters across the miles</p>
          <h1 className="text-4xl">Our Mailbox</h1>
        </div>
        <Link to="/mailbox/new" className="inline-flex min-h-[44px] items-center gap-2 rounded-full border-2 border-leaf bg-mustard px-4 text-sm font-semibold text-leaf shadow-print">
          <PenLine size={16} aria-hidden="true" /> Write
        </Link>
      </header>
      <ErrorNote>{error}</ErrorNote>

      <div className="flex max-w-full gap-0.5 overflow-x-auto rounded-full border-2 border-leaf/20 p-1" role="tablist" aria-label="Mailbox sections">
        {([["inbox", `Inbox${unread ? ` (${unread})` : ""}`], ["sent", "Sent"], ["drafts", `Drafts${drafts.length ? ` (${drafts.length})` : ""}`], ["loved", "Letters we love"]] as [Tab, string][]).map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${tab === t ? "bg-leaf text-cream" : "text-muted"}`}>{label}</button>
        ))}
      </div>

      {tab === "inbox" && sealed.length > 0 && (
        <ul className="space-y-2" aria-label="Letters on their way">
          {sealed.map((s) => (
            <li key={s.id} className="envelope relative overflow-hidden rounded-[18px] bg-paper px-4 pb-3 pt-[4.5rem] shadow-card">
              {/* envelope flap + wax seal */}
              <span aria-hidden="true" className="envelope-flap absolute inset-x-0 top-0 h-12" />
              <span aria-hidden="true" className="absolute left-1/2 top-7 grid h-10 w-10 -translate-x-1/2 place-items-center rounded-full bg-tomato font-display text-lg text-cream shadow-[0_2px_0_0_#A82815]">
                {KIND[s.kind].stamp}
              </span>
              <div className="text-center">
                <p className="font-display text-base font-semibold">A sealed {KIND[s.kind].label.toLowerCase()} from {pName}</p>
                <p className="text-xs text-muted">Opens {formatInZone(new Date(s.reveal_at), tz)}</p>
              </div>
              <span className="sr-only">Sealed until then.</span>
            </li>
          ))}
        </ul>
      )}

      {letters === null ? <Spinner label="Checking the post" /> : lists[tab].length === 0 ? (
        <p className="rounded-[20px] border-2 border-dashed border-leaf/20 px-5 py-8 text-center font-hand text-xl text-muted">{empty[tab]}</p>
      ) : (
        <ul className="space-y-2">
          {lists[tab].map((l) => {
            const mine = l.sender_id === myId;
            const waiting = l.status === "sent" && l.reveal_at && new Date(l.reveal_at) > new Date();
            const status = l.status === "draft" ? `Draft · edited ${shortDate(l.updated_at, tz)}`
              : mine ? (waiting ? `Opens ${shortDate(l.reveal_at!, tz)}` : l.opened_at ? `Opened ${shortDate(l.opened_at, tz)}` : `Sent ${shortDate(l.sent_at!, tz)}`)
              : `From ${pName} · ${shortDate(l.reveal_at ?? l.sent_at!, tz)}`;
            return (
              <li key={l.id}>
                <Link to={l.status === "draft" ? `/mailbox/${l.id}/edit` : `/mailbox/${l.id}`}
                  className={`postcard flex items-center gap-3 !p-4 transition hover:-translate-y-px ${!mine && !l.opened_at ? "ring-2 ring-raspberry" : ""}`}>
                  <Stamp kind={l.kind} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-lg font-semibold">{l.title || KIND[l.kind].label}</p>
                    <p className="truncate text-xs text-muted">{status}{l.voice_path ? " · 🎙" : ""}{l.image_path ? " · 📷" : ""}</p>
                  </div>
                  {!mine && !l.opened_at && <span className="rounded-full bg-raspberry px-2 py-0.5 text-[11px] font-bold text-leaf">New</span>}
                  {l.loved && <Heart size={16} className="fill-raspberry text-raspberry" aria-label="In Letters we love" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted">Only the two of you can see your letters. No read streaks, no reply reminders.</p>
    </div>
  );
}

/* =============================================================== composer */

export function LetterComposer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { space, profile } = useSpace();
  const { myId, partner } = usePeople();
  const tz = profile?.timezone ?? "UTC";
  const pTz = partner?.timezone ?? "UTC";
  const pName = partner?.display_name || "your partner";
  const [letter, setLetter] = useState<Letter | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [kind, setKind] = useState<LetterKind>("love");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [voice, setVoice] = useState<RecordedVoice | null>(null);
  const [dropVoice, setDropVoice] = useState(false);
  const [dropPhoto, setDropPhoto] = useState(false);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [revealLocal, setRevealLocal] = useState("");
  const [busy, setBusy] = useState<"save" | "send" | "delete" | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    getLetter(id).then((l) => {
      if (!l || l.sender_id !== myId || l.status !== "draft") { navigate(`/mailbox/${id}`, { replace: true }); return; }
      setLetter(l); setKind(l.kind); setTitle(l.title); setBody(l.body);
      if (l.image_path) void signedLetterUrl(l.image_path).then(setPhotoUrl);
    }).catch((e) => setError(friendlyError(e))).finally(() => setLoading(false));
  }, [id, myId, navigate]);

  useEffect(() => {
    if (!photo) return;
    const u = URL.createObjectURL(photo); setPhotoUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);

  useEffect(() => { if (kind === "future") setWhen("later"); }, [kind]);

  if (space?.relationship.status !== "active") return <Navigate404 />;
  if (loading) return <Spinner label="Opening your draft" />;

  /** Saves text, uploads any new photo/voice, and returns the up-to-date draft. */
  const persist = async (): Promise<Letter> => {
    const draftId = await saveLetter({ id: letter?.id, kind, title, body, image_path: letter?.image_path ?? null, voice_path: letter?.voice_path ?? null, voice_seconds: letter?.voice_seconds ?? null });
    let current = (await getLetter(draftId))!;
    let img = dropPhoto ? null : current.image_path;
    let vox = dropVoice ? null : current.voice_path;
    let secs = dropVoice ? null : current.voice_seconds;
    const oldFiles: string[] = [];
    if (photo) { if (current.image_path) oldFiles.push(current.image_path); img = await uploadLetterPhoto(current, photo); }
    else if (dropPhoto && current.image_path) oldFiles.push(current.image_path);
    if (voice) { if (current.voice_path) oldFiles.push(current.voice_path); vox = await uploadLetterVoice(current, voice); secs = voice.seconds; }
    else if (dropVoice && current.voice_path) oldFiles.push(current.voice_path);
    if (img !== current.image_path || vox !== current.voice_path) {
      await saveLetter({ id: draftId, kind, title, body, image_path: img, voice_path: vox, voice_seconds: secs });
      current = (await getLetter(draftId))!;
      for (const f of oldFiles) void removeLetterFile(f);
    }
    setLetter(current); setPhoto(null); setVoice(null); setDropPhoto(false); setDropVoice(false);
    if (!letter) navigate(`/mailbox/${draftId}/edit`, { replace: true });
    return current;
  };

  const save = async () => {
    setBusy("save"); setError(null);
    try { await persist(); setSaved(true); } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
  };
  const send = async () => {
    setError(null);
    let reveal: string | null = null;
    if (when === "later") {
      if (!revealLocal) { setError("Choose when it should open."); return; }
      const d = new Date(revealLocal);
      if (Number.isNaN(d.getTime()) || d.getTime() < Date.now() + 60_000) { setError("Pick a time in the future."); return; }
      reveal = d.toISOString();
    }
    setBusy("send");
    try { const l = await persist(); await sendLetter(l.id, reveal); navigate(`/mailbox/${l.id}`, { replace: true }); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  const hasVoice = !!voice || (!!letter?.voice_path && !dropVoice);
  const shownPhoto = photo ? photoUrl : letter?.image_path && !dropPhoto ? photoUrl : null;
  const revealDate = revealLocal ? new Date(revealLocal) : null;

  return (
    <div className="fade-up space-y-5">
      <Link to="/mailbox" className="inline-flex items-center gap-1.5 text-sm font-semibold text-leaf"><ArrowLeft size={15} aria-hidden="true" /> Mailbox</Link>
      <h1 className="text-3xl">{letter ? "Your draft" : "Write a letter"}</h1>
      <ErrorNote>{error}</ErrorNote>

      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Kind of letter">
        {KINDS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => { setKind(k); setSaved(false); }}
            className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 text-center text-xs font-semibold transition ${kind === k ? "border-leaf bg-mustard-soft text-leaf" : "border-leaf/15 text-muted"}`}>
            <span className="font-display text-xl" aria-hidden="true">{KIND[k].stamp}</span>{KIND[k].label}
          </button>
        ))}
      </div>

      <Card className="space-y-4">
        <div className="airmail -mt-1 h-2 rounded-full" aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">To {pName}</p>
        <Field label="Title (optional)" htmlFor="lt-title">
          <input id="lt-title" className={inputCls} maxLength={80} value={title} onChange={(e) => { setTitle(e.target.value); setSaved(false); }} />
        </Field>
        <div className="flex flex-wrap gap-1.5" aria-label="Starter ideas">
          {KIND[kind].starters.map((s) => (
            <button key={s} type="button" onClick={() => { setBody((b) => (b ? `${b}\n\n${s} ` : `${s} `)); setSaved(false); }}
              className="rounded-full border border-leaf/20 px-3 py-1 text-sm text-muted hover:border-leaf/50">{s}</button>
          ))}
        </div>
        <Field label="Your letter" htmlFor="lt-body">
          <textarea id="lt-body" rows={9} maxLength={5000} className={`${inputCls} font-hand text-xl leading-relaxed`} value={body}
            onChange={(e) => { setBody(e.target.value); setSaved(false); }} placeholder="Dear…" />
        </Field>

        {shownPhoto && (
          <div className="relative">
            <img src={shownPhoto} alt="Attached photo" className="max-h-72 w-full rounded-xl bg-cream object-contain" />
            <button type="button" aria-label="Remove photo" onClick={() => { setPhoto(null); setDropPhoto(true); setSaved(false); }} className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-paper shadow-card"><X size={15} /></button>
          </div>
        )}
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPhoto(f); setDropPhoto(false); setSaved(false); } e.target.value = ""; }} />
        <Button variant="outline" type="button" className="!min-h-[38px] !px-3 text-xs" onClick={() => fileInput.current?.click()}>
          <Camera size={15} aria-hidden="true" /> {shownPhoto ? "Change photo" : "Add a photo"}
        </Button>

        {letter?.voice_path && !dropVoice && !voice ? (
          <div>
            <VoicePlayer bucket={LETTER_BUCKET} path={letter.voice_path} seconds={letter.voice_seconds} label="Your voice note" />
            <button type="button" onClick={() => { setDropVoice(true); setSaved(false); }} className="mt-1 text-sm font-semibold text-tomato-deep">Remove voice note</button>
          </div>
        ) : (
          <VoiceRecorder value={voice} onChange={(v) => { setVoice(v); if (v) setDropVoice(true); setSaved(false); }} />
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-xl">When should it arrive?</h2>
        <div className="flex gap-2" role="radiogroup" aria-label="When it arrives">
          <button type="button" role="radio" aria-checked={when === "now"} disabled={kind === "future"} onClick={() => setWhen("now")}
            className={`rounded-full border-2 px-4 py-1.5 text-sm font-semibold disabled:opacity-40 ${when === "now" ? "border-leaf bg-mustard text-leaf" : "border-leaf/15 text-muted"}`}>Now</button>
          <button type="button" role="radio" aria-checked={when === "later"} onClick={() => setWhen("later")}
            className={`rounded-full border-2 px-4 py-1.5 text-sm font-semibold ${when === "later" ? "border-leaf bg-mustard text-leaf" : "border-leaf/15 text-muted"}`}>On a date</button>
        </div>
        {when === "later" && (
          <>
            <Field label="Opens on (your time)" htmlFor="lt-when" hint="Until then, they'll see a sealed envelope with this date — never what's inside.">
              <input id="lt-when" type="datetime-local" className={inputCls} value={revealLocal} onChange={(e) => setRevealLocal(e.target.value)} />
            </Field>
            {revealDate && !Number.isNaN(revealDate.getTime()) && (
              <p className="text-sm text-muted">That's {formatInZone(revealDate, tz)} for you · {formatInZone(revealDate, pTz)} for {pName}.</p>
            )}
          </>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button busy={busy === "send"} onClick={() => void send()}><Send size={16} aria-hidden="true" /> {when === "later" ? "Seal & schedule" : `Send to ${pName}`}</Button>
        <Button variant="outline" busy={busy === "save"} onClick={() => void save()}>{saved ? "Draft saved ✓" : "Save draft"}</Button>
        {letter && (
          <Button variant="ghost" busy={busy === "delete"} onClick={async () => {
            setBusy("delete");
            try { await deleteDraft(letter); navigate("/mailbox", { replace: true }); } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
          }}><Trash2 size={15} aria-hidden="true" /> Delete draft</Button>
        )}
      </div>
      <p className="text-xs text-muted">{hasVoice ? "Your voice note travels with the letter. " : ""}Once sent, a letter can't be edited — but you can take it back until it's opened.</p>
    </div>
  );
}

function Navigate404() {
  return <div className="space-y-3"><h1 className="text-4xl">Our Mailbox</h1><p className="font-hand text-xl text-muted">opens once your partner has joined</p></div>;
}

/* ================================================================= reader */

export function LetterView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { profile } = useSpace();
  const { myId, partner } = usePeople();
  const tz = profile?.timezone ?? "UTC";
  const pName = partner?.display_name || "your partner";
  const [l, setL] = useState<Letter | null | undefined>(undefined);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const x = await getLetter(id);
      if (x && x.status === "draft" && x.sender_id === myId) { navigate(`/mailbox/${id}/edit`, { replace: true }); return; }
      if (x && x.recipient_id === myId && !x.opened_at) { await openLetter(x.id); x.opened_at = new Date().toISOString(); }
      setL(x);
      if (x?.image_path) void signedLetterUrl(x.image_path).then(setPhoto);
    } catch (e) { setError(friendlyError(e)); setL(null); }
  }, [id, myId, navigate]);
  useEffect(() => { void load(); }, [load]);

  if (l === undefined) return <Spinner label="Opening the envelope" />;
  if (!l) {
    return (
      <div className="space-y-4">
        <Link to="/mailbox" className="inline-flex items-center gap-1.5 text-sm font-semibold text-leaf"><ArrowLeft size={15} aria-hidden="true" /> Mailbox</Link>
        <ErrorNote>{error}</ErrorNote>
        <p className="text-muted">This letter isn't here — it may still be sealed, or it was taken back.</p>
      </div>
    );
  }
  const mine = l.sender_id === myId;
  const waiting = l.reveal_at && new Date(l.reveal_at) > new Date();
  const k = KIND[l.kind];

  return (
    <div className="fade-up space-y-5">
      <Link to="/mailbox" className="inline-flex items-center gap-1.5 text-sm font-semibold text-leaf"><ArrowLeft size={15} aria-hidden="true" /> Mailbox</Link>
      <ErrorNote>{error}</ErrorNote>
      <article className="postcard unfold space-y-4">
        <div className="airmail -mt-1 h-2 rounded-full" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Ticket tone={k.tone}>{k.label}</Ticket>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              {mine ? `To ${pName}` : `From ${pName}`} · {formatInZone(new Date(l.reveal_at ?? l.sent_at!), tz)}
            </p>
            {l.title && <h1 className="mt-1 text-3xl leading-tight">{l.title}</h1>}
          </div>
          <Stamp kind={l.kind} />
        </div>
        {l.body && <p className="whitespace-pre-wrap font-hand text-2xl leading-relaxed">{l.body}</p>}
        {l.image_path && (photo ? <img src={photo} alt="Photo in the letter" className="w-full rounded-xl bg-cream object-contain" /> : <div className="h-48 animate-pulse rounded-xl bg-leaf-soft" />)}
        {l.voice_path && <VoicePlayer bucket={LETTER_BUCKET} path={l.voice_path} seconds={l.voice_seconds} />}
      </article>

      <div className="flex flex-wrap items-center gap-2">
        {!waiting && (
          <button type="button" aria-pressed={l.loved} disabled={busy === "love"} onClick={async () => {
            setBusy("love");
            try { const v = await toggleLoved(l.id); setL({ ...l, loved: v }); } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
          }} className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border-2 px-4 text-sm font-semibold ${l.loved ? "border-raspberry bg-raspberry text-leaf" : "border-leaf/20 text-muted"}`}>
            <Heart size={15} className={l.loved ? "fill-current" : ""} aria-hidden="true" /> {l.loved ? "In Letters we love" : "Letters we love"}
          </button>
        )}
        {mine && (
          <p className="inline-flex items-center gap-1.5 text-sm text-muted">
            {waiting ? <><Lock size={14} aria-hidden="true" /> Sealed until {formatInZone(new Date(l.reveal_at!), tz)}</>
              : l.opened_at ? <><MailOpen size={14} aria-hidden="true" /> Opened {formatInZone(new Date(l.opened_at), tz)}</>
              : "Delivered — not opened yet"}
          </p>
        )}
      </div>
      {mine && !l.opened_at && (
        <Button variant="ghost" busy={busy === "back"} onClick={async () => {
          setBusy("back");
          try { await takeBackLetter(l.id); navigate(`/mailbox/${l.id}/edit`, { replace: true }); } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
        }}><Undo2 size={15} aria-hidden="true" /> Take it back</Button>
      )}
    </div>
  );
}
