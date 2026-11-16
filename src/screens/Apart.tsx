import { SaveToScrapbook } from "../components/ScrapbookBits";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Camera, Check, Dices, Hourglass, ImagePlus, Link2, Lock, PenLine, Repeat, Send, Shuffle, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useSpace } from "../hooks/useSpace";
import { usePeople } from "../hooks/usePeople";
import {
  addEntry, APART_BUCKET, closeMission, getMission, listMissions, signedApartUrl, startMission, uploadApartImage,
  type ApartEntry, type MissionSummary,
} from "../lib/apart";
import { ACTIVITY_COLUMNS, APART_TYPES, STYLE_LABEL, type PlayActivity, type PlayFilters } from "../lib/play";
import { friendlyError } from "../lib/errors";
import { Button, Card, ErrorNote, Field, Spinner, Ticket, inputCls } from "../components/ui";
import { DrawingPad, type DrawingPadHandle } from "../components/DrawingPad";
import { uploadVoice, VoicePlayer, VoiceRecorder, type RecordedVoice } from "../components/Voice";
import { ActivityCard, JustUsChip } from "./Play";

const STYLE_ICON = { solo: Lock, relay: Repeat, same: Hourglass } as const;

/* ======================================================= list (inside Play) */

export function ApartTab() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<PlayFilters>({ mode: "apart" });
  const [open, setOpen] = useState<MissionSummary[] | null>(null);
  const [past, setPast] = useState<MissionSummary[] | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [browse, setBrowse] = useState<PlayActivity[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const all = await listMissions(true);
      setOpen(all.filter((m) => !m.closed_at));
      setPast(all.filter((m) => m.closed_at));
    } catch (e) { setError(friendlyError(e)); setOpen([]); setPast([]); }
  }, []);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    return () => clearInterval(t);
  }, [load]);

  const start = async (activityId?: string) => {
    setBusy(activityId ?? "random"); setError(null);
    try { navigate(`/play/apart/${await startMission(filters, activityId)}`); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  const openBrowse = async () => {
    if (browse) { setBrowse(null); return; }
    const { data, error: err } = await supabase.from("play_activities").select(ACTIVITY_COLUMNS)
      .eq("mode", "apart").eq("is_active", true).eq("just_us", !!filters.just_us).order("code");
    if (err) setError(friendlyError(err)); else setBrowse(data as unknown as PlayActivity[]);
  };

  return (
    <div className="space-y-5">
      <ErrorNote>{error}</ErrorNote>
      <Card className="space-y-3 !bg-lilac">
        <p className="font-hand text-xl font-bold leading-none text-raspberry-deep">apart, anytime</p>
        <h2 className="text-[1.75rem] italic leading-tight">Little missions</h2>
        <p className="text-sm">
          Little missions you each do whenever it suits you — no call needed.
        </p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kind of mission">
          {APART_TYPES.map((t) => (
            <button key={t.value} type="button" aria-pressed={filters.type === t.value}
              onClick={() => { setFilters({ ...filters, type: filters.type === t.value ? undefined : t.value }); setBrowse(null); }}
              className={`rounded-full border-2 px-3 py-1 text-sm font-semibold ${filters.type === t.value ? "border-leaf/20 bg-white text-leaf" : "border-leaf/15 text-leaf/75"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void start()} busy={busy === "random"}><Dices size={16} aria-hidden="true" /> Give us a mission</Button>
          <JustUsChip on={!!filters.just_us} onChange={(v) => { setFilters({ ...filters, just_us: v || undefined }); setBrowse(null); }} dark />
        </div>
      </Card>

      <section>
        <h2 className="mb-2 text-2xl">On the go</h2>
        {open === null ? <Spinner label="Checking the post" /> : open.length === 0 ? (
          <p className="rounded-card border-2 border-dashed border-leaf/20 px-5 py-6 text-center font-hand text-xl text-muted">no missions yet — start one above</p>
        ) : <MissionList items={open} />}
      </section>

      <section className="space-y-2">
        <button type="button" onClick={() => void openBrowse()} className="inline-flex items-center gap-1.5 text-sm font-semibold text-leaf" aria-expanded={!!browse}>
          <Shuffle size={15} aria-hidden="true" /> {browse ? "Hide the list" : "Pick one yourself"}
        </button>
        {browse && (
          <ul className="divide-y divide-dashed divide-leaf/20 rounded-card bg-paper shadow-card">
            {browse.filter((a) => !filters.type || a.activity_type === filters.type).map((a) => {
              const SI = a.style ? STYLE_ICON[a.style] : Lock;
              return (
                <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-lg">{a.title}</p>
                    <p className="flex items-center gap-1 text-xs text-muted"><SI size={12} aria-hidden="true" />{a.style ? STYLE_LABEL[a.style].label : ""} · {a.share_as ?? ""}</p>
                  </div>
                  <Button variant="outline" className="!min-h-[36px] !px-3 !py-1 text-xs" busy={busy === a.id} onClick={() => void start(a.id)}>Start</Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {past && past.length > 0 && (
        <section className="space-y-2">
          <button type="button" onClick={() => setShowPast((v) => !v)} className="text-sm font-semibold text-muted underline-offset-4 hover:underline" aria-expanded={showPast}>
            {showPast ? "Hide past missions" : `Past missions (${past.length})`}
          </button>
          {showPast && <MissionList items={past} />}
        </section>
      )}
    </div>
  );
}

function MissionList({ items }: { items: MissionSummary[] }) {
  return (
    <ul className="space-y-2">
      {items.map((m) => {
        const a = m.activity;
        if (!a) return null;
        const style = a.style ?? "solo";
        const SI = STYLE_ICON[style];
        const status =
          m.closed_at ? "Finished" :
          style === "relay" ? (m.my_entries + m.partner_entries === 0 ? "Your turn to start" : `${m.my_entries + m.partner_entries} turns so far`) :
          m.visible ? "Both shared — open it ✦" :
          m.my_entries > 0 ? "Waiting for your partner" :
          m.partner_entries > 0 ? "Your partner shared — your turn" : "Nobody has shared yet";
        const hot = !m.closed_at && (m.visible || (style !== "relay" && m.partner_entries > 0 && m.my_entries === 0));
        return (
          <li key={m.mission_id}>
            <Link to={`/play/apart/${m.mission_id}`} className="postcard flex items-center gap-3 !p-4 transition hover:-translate-y-px">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${hot ? "bg-tomato-deep text-cream" : "bg-leaf-soft text-leaf"}`}><SI size={17} aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg">{a.title}</p>
                <p className="text-xs text-muted">{STYLE_LABEL[style].label} · {status}</p>
              </div>
              {a.just_us && <Ticket tone="tomato">Just us</Ticket>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ============================================================ one mission */

export function ApartMission() {
  const { missionId = "" } = useParams();
  const { space } = useSpace();
  const { partner, myId } = usePeople();
  const [summary, setSummary] = useState<MissionSummary | null>(null);
  const [entries, setEntries] = useState<ApartEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await getMission(missionId);
      setSummary(r.summary); setEntries(r.entries);
    } catch (e) { setError(friendlyError(e)); setEntries([]); }
  }, [missionId]);

  useEffect(() => {
    void load();
    // Live when Realtime is on; polling keeps it working either way.
    const ch = supabase.channel(`apart-${missionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "apart_entries", filter: `mission_id=eq.${missionId}` }, () => void load())
      .subscribe();
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 10000);
    return () => { clearInterval(t); void supabase.removeChannel(ch); };
  }, [load, missionId]);

  if (entries === null) return <Spinner label="Opening the mission" />;
  if (!summary?.activity) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="text-muted">We couldn't find that mission.</p>
      </div>
    );
  }
  const a = summary.activity;
  const style = a.style ?? "solo";
  const sealed = style !== "relay" && !summary.visible;
  const partnerName = partner?.display_name || "your partner";
  const nameOf = (uid: string) => (uid === myId ? "You" : partnerName);
  const closed = !!summary.closed_at;
  const canAdd = !closed && (style === "relay" || summary.my_entries === 0 || summary.visible);

  return (
    <div className="fade-up space-y-5">
      <BackLink />
      <ActivityCard activity={a} />
      <div className="flex items-start gap-3 rounded-2xl bg-mustard-soft px-4 py-3 text-sm text-mustard-deep">
        {(() => { const SI = STYLE_ICON[style]; return <SI size={18} className="mt-0.5 shrink-0" aria-hidden="true" />; })()}
        <p><strong>{STYLE_LABEL[style].label}.</strong> {STYLE_LABEL[style].hint}{a.share_as ? ` Share as: ${a.share_as.toLowerCase()}.` : ""}</p>
      </div>

      <ErrorNote>{error}</ErrorNote>

      <section className="space-y-3" aria-live="polite">
        <h2 className="text-2xl">{style === "relay" ? "The relay so far" : "What you've shared"}</h2>
        {entries.length === 0 && summary.partner_entries === 0 && <p className="font-hand text-xl text-muted">nothing yet — you could go first</p>}
        {entries.map((e) => <EntryCard key={e.id} entry={e} who={nameOf(e.user_id)} mine={e.user_id === myId} />)}
        {sealed && summary.partner_entries > 0 && (
          <div className="flex items-center gap-3 rounded-card border-2 border-dashed border-raspberry px-5 py-4 text-raspberry-deep">
            <Lock size={18} aria-hidden="true" />
            <p className="text-sm font-semibold">{partnerName} has shared. It opens as soon as you share yours.</p>
          </div>
        )}
        {sealed && summary.my_entries > 0 && summary.partner_entries === 0 && (
          <p className="font-hand text-xl text-raspberry-deep">sealed until {partnerName} shares too ✉</p>
        )}
      </section>

      {canAdd && space && myId && (
        <EntryComposer
          drawing={a.activity_type === "drawing"}
          voice={!!a.allow_voice}
          busy={busy === "add"}
          onSubmit={async (body, link, file, voice) => {
            setBusy("add"); setError(null);
            try {
              const path = file ? await uploadApartImage(space.relationship.id, missionId, myId, file) : null;
              const vpath = voice ? await uploadVoice(APART_BUCKET, `${space.relationship.id}/${missionId}/${myId}`, voice) : null;
              await addEntry(missionId, body, link, path, vpath, voice?.seconds ?? null);
              await load();
              return true;
            } catch (e) { setError(friendlyError(e)); return false; }
            finally { setBusy(null); }
          }}
          prompt={style === "relay" && entries.length > 0 ? "Add the next turn" : "Your part"}
        />
      )}

      {(style === "relay" ? entries.length > 0 : summary.visible) && <SaveToScrapbook kind="mission" refId={missionId} prompt />}

      {!closed ? (
        <div className="border-t border-dashed border-leaf/25 pt-4">
          <Button variant="ghost" busy={busy === "close"} onClick={async () => {
            setBusy("close");
            try { await closeMission(missionId); await load(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
          }}><Check size={15} aria-hidden="true" /> Mark as finished</Button>
          <p className="mt-1 text-xs text-muted">Moves it to Past missions for both of you. Everything shared stays saved.</p>
        </div>
      ) : <p className="font-hand text-xl text-leaf">finished ✦ saved for both of you</p>}
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/play?mode=apart" className="inline-flex items-center gap-1.5 text-sm font-semibold text-leaf">
      <ArrowLeft size={15} aria-hidden="true" /> Apart missions
    </Link>
  );
}

function EntryCard({ entry, who, mine }: { entry: ApartEntry; who: string; mine: boolean }) {
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (entry.image_path) void signedApartUrl(entry.image_path).then((u) => { if (alive) setImg(u); });
    return () => { alive = false; };
  }, [entry.image_path]);
  return (
    <article className={`postcard !p-4 ${mine ? "" : "border-l-4 border-raspberry"}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-tomato-deep">
        {who} · {new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(entry.created_at))}
      </p>
      {entry.body && <p className="mt-2 whitespace-pre-wrap leading-relaxed">{entry.body}</p>}
      {entry.image_path && (img
        ? <img src={img} alt={`Shared by ${who}`} className="mt-3 max-h-96 w-full rounded-xl object-contain bg-cream" />
        : <div className="mt-3 h-40 animate-pulse rounded-xl bg-leaf-soft" />)}
      {entry.voice_path && <VoicePlayer bucket={APART_BUCKET} path={entry.voice_path} seconds={entry.voice_seconds} label={`${who === "You" ? "Your" : `${who}'s`} voice note`} />}
      {entry.link_url && (
        <a href={entry.link_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1.5 truncate text-sm font-semibold text-leaf underline underline-offset-4">
          <Link2 size={14} aria-hidden="true" />{entry.link_url.replace(/^https:\/\//, "")}
        </a>
      )}
    </article>
  );
}

function EntryComposer({ drawing, voice: allowVoice, busy, onSubmit, prompt }: {
  drawing: boolean; voice: boolean; busy: boolean; prompt: string;
  onSubmit: (body: string, link: string | null, file: File | null, voice: RecordedVoice | null) => Promise<boolean>;
}) {
  const [voice, setVoice] = useState<RecordedVoice | null>(null);
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [draw, setDraw] = useState(false);
  const pad = useRef<DrawingPadHandle>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const u = URL.createObjectURL(file); setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const submit = async () => {
    let f = file;
    if (draw && pad.current && !pad.current.isEmpty()) {
      const blob = await pad.current.toBlob();
      if (blob) f = new File([blob], "drawing.png", { type: "image/png" });
    }
    const ok = await onSubmit(body.trim(), showLink && link.trim() ? link.trim() : null, f, voice);
    if (ok) { setBody(""); setLink(""); setFile(null); setDraw(false); setShowLink(false); setVoice(null); }
  };

  return (
    <Card className="space-y-3">
      <h2 className="text-xl">{prompt}</h2>
      <Field label="Words" htmlFor="apart-body">
        <textarea id="apart-body" rows={4} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} className={inputCls} placeholder="Write as much or as little as you like" />
      </Field>
      {showLink && (
        <Field label="Link (https://…)" htmlFor="apart-link">
          <input id="apart-link" type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} className={inputCls} placeholder="https://" />
        </Field>
      )}
      {preview && (
        <div className="relative">
          <img src={preview} alt="Your photo" className="max-h-72 w-full rounded-xl object-contain bg-cream" />
          <button type="button" aria-label="Remove photo" onClick={() => setFile(null)} className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-paper shadow-card"><X size={15} /></button>
        </div>
      )}
      {draw && <DrawingPad ref={pad} />}
      {allowVoice && <VoiceRecorder value={voice} onChange={setVoice} disabled={busy} />}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only"
        onChange={(e) => { setFile(e.target.files?.[0] ?? null); setDraw(false); e.target.value = ""; }} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" type="button" onClick={() => input.current?.click()} className="!min-h-[38px] !px-3 text-xs">
          {file ? <ImagePlus size={15} aria-hidden="true" /> : <Camera size={15} aria-hidden="true" />} {file ? "Change photo" : "Photo"}
        </Button>
        {drawing && (
          <Button variant="outline" type="button" onClick={() => { setDraw((v) => !v); setFile(null); }} className="!min-h-[38px] !px-3 text-xs">
            <PenLine size={15} aria-hidden="true" /> {draw ? "Hide pad" : "Draw"}
          </Button>
        )}
        <Button variant="outline" type="button" onClick={() => setShowLink((v) => !v)} className="!min-h-[38px] !px-3 text-xs">
          <Link2 size={15} aria-hidden="true" /> Link
        </Button>
      </div>
      <Button onClick={() => void submit()} busy={busy}><Send size={16} aria-hidden="true" /> Share</Button>
      <p className="text-xs text-muted">Once shared, an entry stays — like posting a postcard.</p>
    </Card>
  );
}

