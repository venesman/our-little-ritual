import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Brush, Camera, Disc3, Feather, Images, Layers, PenLine, Plus, Trash2, X } from "lucide-react";
import { usePeople } from "../hooks/usePeople";
import { useSpace } from "../hooks/useSpace";
import { useForYou } from "../hooks/useForYou";
import {
  addPart, continueCreation, CREATION_BUCKET, endCreation, finishCreation, FORMATS, getCreation, KINDS, listCreations, localCopy, removeBoardPhoto,
  setCover, startCreation, uploadCreationFile, type Creation, type CreationKind, type CreationSummary,
} from "../lib/creative";
import { signedUrl } from "../lib/scrapbook";
import { friendlyError } from "../lib/errors";
import { Button, ErrorNote, Spinner, Ticket, inputCls } from "../components/ui";
import { DrawingPad, type DrawingPadHandle } from "../components/DrawingPad";
import { SaveToScrapbook } from "../components/ScrapbookBits";
import { SongCard, SongPicker } from "../components/Song";
import type { Song } from "../lib/music";

const ICON: Record<CreationKind, typeof Brush> = { doodle: Brush, fold: Layers, story: Feather, poem: PenLine, mixtape: Disc3, board: Images };

function useSigned(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { setUrl(null); if (path) void signedUrl(CREATION_BUCKET, path).then(setUrl); }, [path]);
  return url;
}
function Pic({ path, className = "" }: { path: string | null; className?: string }) {
  const url = useSigned(path);
  return url ? <img src={url} alt="" className={className} /> : <div className={`animate-pulse bg-leaf-soft ${className}`} />;
}

/* ============================================================ Play → Creative Corner */

export function CreativeTab() {
  const nav = useNavigate();
  const { myId, partner } = usePeople();
  const pName = partner?.display_name || "your partner";
  const [list, setList] = useState<CreationSummary[] | null>(null);
  const [starting, setStarting] = useState<CreationKind | null>(null);
  const [title, setTitle] = useState("");
  const [lines, setLines] = useState("8");
  const [acrostic, setAcrostic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { listCreations().then(setList).catch((e) => { setError(friendlyError(e)); setList([]); }); }, []);
  if (list === null) return <Spinner label="Opening the studio" />;
  const active = list.filter((c) => c.status === "active");
  const done = list.filter((c) => c.status === "finished");

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">Make things together, whenever you like. No scores, no deadlines.</p>
      <ErrorNote>{error}</ErrorNote>
      <ul className="space-y-3">
        {KINDS.map((k) => {
          const I = ICON[k];
          const open = active.filter((c) => c.kind === k);
          return (
            <li key={k} className="postcard space-y-3 !p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 -rotate-3 place-items-center rounded-sm border-2 border-dashed border-mustard bg-mustard-soft text-mustard-deep" aria-hidden="true"><I size={18} /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl leading-tight">{FORMATS[k].label}</h2>
                  <p className="text-xs text-muted">{FORMATS[k].how}</p>
                </div>
              </div>
              {open.map((c) => (
                <Link key={c.id} to={`/play/create/${c.id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-cream px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-semibold">{c.title || FORMATS[k].label}</span>
                  <span className={`shrink-0 text-xs font-semibold ${c.whose_turn === myId ? "text-raspberry-deep" : "text-muted"}`}>
                    {k === "board" ? `${c.parts} photo${c.parts === 1 ? "" : "s"}` : c.whose_turn === myId ? "Your turn" : `${pName}'s turn`}
                  </span>
                </Link>
              ))}
              {starting === k ? (
                <div className="space-y-2">
                  <input className={inputCls} maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={FORMATS[k].titleLabel} aria-label={FORMATS[k].titleLabel} />
                  <div className="flex flex-wrap gap-1.5" aria-label="Ideas">
                    {FORMATS[k].starters.map((s) => (
                      <button key={s} type="button" onClick={() => setTitle(s)} className="rounded-full border border-leaf/20 px-3 py-1 text-xs text-muted hover:border-leaf/50">{s}</button>
                    ))}
                  </div>
                  {k === "poem" && (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold">Lines</span>
                      {["8", "10", "12"].map((n) => (
                        <button key={n} type="button" aria-pressed={lines === n && !acrostic} onClick={() => { setLines(n); setAcrostic(""); }}
                          className={`rounded-full border-2 px-3 py-1 text-xs font-semibold ${lines === n && !acrostic ? "border-leaf/20 bg-mustard text-leaf" : "border-leaf/30"}`}>{n}</button>
                      ))}
                      <span className="text-muted">or acrostic</span>
                      <input className={`${inputCls} !w-32`} maxLength={12} value={acrostic} onChange={(e) => setAcrostic(e.target.value)} placeholder="e.g. PUFFIN" aria-label="Acrostic word" />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button busy={busy} onClick={async () => {
                      setBusy(true); setError(null);
                      try { nav(`/play/create/${await startCreation(k, title, k === "poem" ? (acrostic ? { acrostic } : { lines }) : {})}`); }
                      catch (e) { setError(friendlyError(e)); setBusy(false); }
                    }}>Start</Button>
                    <Button variant="ghost" onClick={() => setStarting(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (k === "board" || open.length === 0) && (
                <button type="button" onClick={() => { setStarting(k); setTitle(""); setAcrostic(""); }} className="inline-flex items-center gap-1.5 text-sm font-semibold text-leaf underline underline-offset-4">
                  <Plus size={14} aria-hidden="true" /> {k === "board" ? "New board" : "Start one"}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {done.length > 0 && (
        <section className="space-y-2" aria-label="Finished">
          <p className="font-hand text-2xl text-raspberry-deep">things we made ✦</p>
          <ul className="grid grid-cols-2 gap-3">
            {done.map((c) => (
              <li key={c.id}>
                <Link to={`/play/create/${c.id}`} className="block rounded-sm bg-paper p-2 pb-3 shadow-card">
                  <div className="aspect-square overflow-hidden rounded-sm bg-cream">
                    {c.cover_path || c.preview ? <Pic path={c.cover_path ?? c.preview} className="h-full w-full object-cover" />
                      : <p className="p-3 font-hand text-lg leading-snug text-leaf">{c.title}</p>}
                  </div>
                  <p className="mt-2 truncate font-display text-sm">{c.kind === "mixtape" && c.settings.name ? c.settings.name : c.title || FORMATS[c.kind].label}</p>
                  <p className="text-[11px] text-muted">{FORMATS[c.kind].label}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ================================================================ one creation */

export function CreationScreen() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { space } = useSpace();
  const { myId, me, partner } = usePeople();
  const { refresh } = useForYou();
  const pName = partner?.display_name || "your partner";
  const nameOf = (u: string | null) => (u === myId ? me?.display_name || "You" : partner?.display_name || "Partner");
  const [c, setC] = useState<Creation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setC(await getCreation(id)); setError(null); refresh(); } catch (e) { setError(friendlyError(e)); }
  }, [id, refresh]);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 20000);
    return () => clearInterval(t);
  }, [load]);

  if (!c) return error ? <ErrorNote>{error}</ErrorNote> : <Spinner label="Opening" />;
  const myTurn = c.status === "active" && (c.kind === "board" || c.whose_turn === myId || (c.kind === "fold" && !c.parts.some((p) => p.user_id === myId)));
  const full = c.parts.length >= c.limit;
  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setError(null);
    try { await fn(); await load(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
  };
  const upload = async (blob: Blob, kind: "drawing" | "photo") => uploadCreationFile(space!.relationship.id, c.id, myId!, blob, kind);
  const turnNote = c.status !== "active" ? null : c.kind === "board" ? null
    : myTurn ? <p className="text-sm font-semibold text-raspberry-deep">Your turn ✦</p> : <p className="text-sm text-muted">Waiting for {pName} — no rush.</p>;

  return (
    <div className="fade-up space-y-5">
      <Link to="/play?mode=create" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted"><ArrowLeft size={16} aria-hidden="true" /> Creative Corner</Link>
      <header>
        <Ticket tone="mustard">{FORMATS[c.kind].label}</Ticket>
        <h1 className="mt-2 text-3xl leading-tight">{c.kind === "mixtape" && c.settings.name ? c.settings.name : c.title || FORMATS[c.kind].label}</h1>
        {c.kind === "mixtape" && c.settings.name && <p className="text-sm text-muted">{c.title}</p>}
        {c.kind === "poem" && c.settings.acrostic && <p className="text-sm text-muted">Acrostic: {c.settings.acrostic.split("").join(" · ")}</p>}
      </header>
      <ErrorNote>{error}</ErrorNote>
      {turnNote}

      {c.kind === "doodle" && <Doodle c={c} myTurn={myTurn && !full} nameOf={nameOf} busy={busy} onAdd={(b) => act("add", async () => addPart(c.id, { image_path: await upload(b, "drawing") }))} />}
      {c.kind === "fold" && <Fold c={c} myId={myId} pName={pName} busy={busy} onAdd={(b) => act("add", async () => addPart(c.id, { image_path: await upload(b, "drawing") }))} />}
      {(c.kind === "story" || c.kind === "poem") && <Words c={c} myTurn={myTurn && !full} nameOf={nameOf} otherName={c.started_by === myId ? (partner?.display_name || "Partner") : (me?.display_name || "You")} busy={busy} onAdd={(t) => act("add", () => addPart(c.id, { body: t }))} />}
      {c.kind === "mixtape" && <Mixtape c={c} myTurn={myTurn && !full} nameOf={nameOf} busy={busy}
        onAdd={(song, note) => act("add", () => addPart(c.id, { song, caption: note }))}
        onCover={(b) => act("cover", async () => setCover(c.id, await upload(b, "drawing")))} />}
      {c.kind === "board" && <Board c={c} myId={myId} nameOf={nameOf} busy={busy}
        onAdd={(f, cap) => act("add", async () => addPart(c.id, { image_path: await upload(f, "photo"), caption: cap }))}
        onRemove={(pid) => act("rm-" + pid, () => removeBoardPhoto(pid))} />}

      {/* finishing */}
      {c.status === "active" && c.kind === "story" && c.end_requested_by && (
        <div className="rounded-2xl bg-raspberry-soft p-4 text-sm">
          {c.end_requested_by === myId ? <p>You suggested ending here — waiting for {pName} to agree.</p> : (
            <div className="space-y-2">
              <p><b>{pName}</b> thinks this is a good place for <i>The End</i>. Agree?</p>
              <div className="flex gap-2">
                <Button busy={busy === "fin"} onClick={() => act("fin", () => finishCreation(c.id))}>Yes — The End</Button>
                <Button variant="ghost" onClick={() => act("cont", () => continueCreation(c.id))}>Keep going</Button>
              </div>
            </div>
          )}
        </div>
      )}
      {c.status === "active" && (c.kind === "doodle" || c.kind === "poem" || (c.kind === "story" && !c.end_requested_by)) && c.parts.length >= (c.kind === "doodle" ? 2 : 4) && (
        <Button variant="outline" busy={busy === "fin"} onClick={() => act("fin", () => finishCreation(c.id))}>{c.kind === "story" ? "The End?" : "It's finished"}</Button>
      )}
      {c.status === "active" && c.kind === "mixtape" && c.parts.length >= 2 && <NameMixtape busy={busy === "fin"} onName={(n) => act("fin", () => finishCreation(c.id, n))} />}

      {(c.status === "finished" || (c.kind === "board" && c.parts.length > 0)) && <SaveToScrapbook kind="creation" refId={c.id} prompt />}
      {c.status === "active" && c.kind !== "board" && (
        <Button variant="ghost" onClick={async () => {
          if (!window.confirm("Stop this one? It'll be tidied away.")) return;
          try { await endCreation(c.id); nav("/play?mode=create"); } catch (e) { setError(friendlyError(e)); }
        }}><X size={14} aria-hidden="true" /> Stop this one</Button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Doodle Relay */
function Doodle({ c, myTurn, nameOf, busy, onAdd }: { c: Creation; myTurn: boolean; nameOf: (u: string | null) => string; busy: string | null; onAdd: (b: Blob) => void }) {
  const last = c.parts[c.parts.length - 1]?.image_path ?? null;
  const [bg, setBg] = useState<string | null>(null);
  const pad = useRef<DrawingPadHandle>(null);
  useEffect(() => { let u: string | null = null; if (last && myTurn) void localCopy(last).then((x) => { u = x; setBg(x); }); return () => { if (u) URL.revokeObjectURL(u); }; }, [last, myTurn]);
  return (
    <div className="space-y-3">
      {myTurn ? (
        <>
          <p className="text-sm text-muted">{last ? "Add your bit on top." : "Start the drawing."} ({c.parts.length}/12 turns)</p>
          <DrawingPad ref={pad} background={bg} />
          <Button busy={busy === "add"} onClick={async () => { const b = await pad.current?.toBlob(); if (b) onAdd(b); }}>Pass it over</Button>
        </>
      ) : last ? <Pic path={last} className="w-full rounded-2xl bg-paper shadow-card" /> : null}
      {c.parts.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="How it grew">
          {c.parts.map((p) => (
            <figure key={p.id} className="w-20 shrink-0">
              <Pic path={p.image_path} className="aspect-[4/3] w-20 rounded-md object-cover" />
              <figcaption className="truncate text-[10px] text-muted">{p.position}. {nameOf(p.user_id)}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- Fold & Reveal */
function Fold({ c, myId, pName, busy, onAdd }: { c: Creation; myId: string | null | undefined; pName: string; busy: string | null; onAdd: (b: Blob) => void }) {
  const pad = useRef<DrawingPadHandle>(null);
  const top = c.started_by === myId;
  const mine = c.parts.find((p) => p.user_id === myId);
  const starterPart = c.parts.find((p) => p.user_id === c.started_by);
  const otherPart = c.parts.find((p) => p.user_id !== c.started_by);
  if (c.status === "finished") {
    return (
      <div className="overflow-hidden rounded-2xl bg-paper shadow-card">
        <Pic path={starterPart?.image_path ?? null} className="block w-full" />
        <div className="border-t-2 border-dashed border-leaf/30" aria-hidden="true" />
        <Pic path={otherPart?.image_path ?? null} className="block w-full" />
      </div>
    );
  }
  if (mine) return <p className="rounded-card border-2 border-dashed border-leaf/20 px-5 py-6 text-center font-hand text-xl text-muted">your half is folded away — waiting for {pName}</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {top ? "Draw the TOP half (the head and shoulders). Let a few lines run off the bottom edge so it joins up." : "Draw the BOTTOM half (body and legs). Start a few lines at the top edge so it joins up."}
        {" "}You won't see {pName}'s half until you've both drawn.
      </p>
      <DrawingPad ref={pad} />
      <Button busy={busy === "add"} onClick={async () => { const b = await pad.current?.toBlob(); if (b) onAdd(b); }}>Fold it away</Button>
    </div>
  );
}

/* ------------------------------------------------------- Story Chain / Poem Duet */
function Words({ c, myTurn, nameOf, otherName, busy, onAdd }: { c: Creation; myTurn: boolean; nameOf: (u: string | null) => string; otherName: string; busy: string | null; onAdd: (t: string) => void }) {
  const [text, setText] = useState("");
  const poem = c.kind === "poem";
  const letter = poem && c.settings.acrostic ? c.settings.acrostic[c.parts.length] : null;
  useEffect(() => { setText(letter ?? ""); }, [c.parts.length, letter]);
  return (
    <div className="space-y-3">
      <article className={`postcard space-y-2 !p-5 ${poem ? "text-center" : ""}`}>
        {!poem && c.title && <p className="font-hand text-xl text-raspberry-deep">{c.title}</p>}
        {c.parts.length === 0 ? <p className="font-hand text-lg text-muted">the first {poem ? "line" : "words"} will appear here</p> :
          c.parts.map((p) => (
            <p key={p.id} className={`${poem ? "font-hand text-2xl leading-snug" : "leading-relaxed"} ${p.user_id === c.started_by ? "text-leaf" : "text-raspberry-deep"}`} title={nameOf(p.user_id)}>
              {poem && c.settings.acrostic ? <><b>{p.body?.[0]}</b>{p.body?.slice(1)}</> : p.body}
            </p>
          ))}
        {c.status === "finished" && !poem && <p className="pt-2 font-display text-lg">The End.</p>}
      </article>
      <p className="text-[11px] text-muted">{poem ? `${c.parts.length} of ${c.limit} lines` : `${c.parts.length} of ${c.limit} turns`} · <span className="text-leaf">■</span> {nameOf(c.started_by)} <span className="text-raspberry-deep">■</span> {otherName}</p>
      {myTurn && (
        <div className="space-y-2">
          {poem ? <input className={inputCls} maxLength={120} value={text} onChange={(e) => setText(e.target.value)} placeholder={letter ? `A line starting with "${letter}"` : "Your line"} aria-label="Your line" />
            : <textarea className={inputCls} rows={4} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} placeholder="What happens next…" aria-label="Your part" />}
          <Button busy={busy === "add"} disabled={!text.trim()} onClick={() => onAdd(text)}>{poem ? "Add my line" : "Add my part"}</Button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Mixtape Maker */
function Mixtape({ c, myTurn, nameOf, busy, onAdd, onCover }: {
  c: Creation; myTurn: boolean; nameOf: (u: string | null) => string; busy: string | null; onAdd: (s: Song, note: string) => void; onCover: (b: Blob) => void;
}) {
  const [song, setSong] = useState<Song | null>(null);
  const [note, setNote] = useState("");
  const [drawing, setDrawing] = useState(false);
  const pad = useRef<DrawingPadHandle>(null);
  useEffect(() => { setSong(null); setNote(""); }, [c.parts.length]);
  return (
    <div className="space-y-3">
      <div className="rounded-card bg-lilac p-4 shadow-card">
        <div className="flex items-center gap-3">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-white/70">
            {c.cover_path ? <Pic path={c.cover_path} className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center"><Disc3 size={28} aria-hidden="true" /></div>}
          </div>
          <div>
            <p className="font-hand text-lg font-bold text-raspberry-deep">side A · {c.parts.length} of 12</p>
            <p className="font-display text-xl leading-tight">{c.settings.name ?? c.title}</p>
          </div>
        </div>
      </div>
      <ol className="space-y-2">
        {c.parts.map((p) => (
          <li key={p.id} className="space-y-1">
            <p className="text-[11px] font-semibold text-muted">{p.position}. picked by {nameOf(p.user_id)}</p>
            <SongCard song={{ url: p.song_url!, title: p.song_title ?? "", artist: p.song_artist ?? "", album: "", cover_path: p.song_cover_path }} note={p.caption} compact />
          </li>
        ))}
      </ol>
      {myTurn && (
        <div className="space-y-2">
          <SongPicker value={song} onChange={setSong} note={note} onNote={setNote} noteLabel="Liner note: why this one? (optional)" />
          <Button busy={busy === "add"} disabled={!song || !song.title.trim()} onClick={() => song && onAdd(song, note)}>Add to the mixtape</Button>
        </div>
      )}
      {c.parts.length >= 2 && (drawing ? (
        <div className="space-y-2">
          <DrawingPad ref={pad} />
          <Button busy={busy === "cover"} onClick={async () => { const b = await pad.current?.toBlob(); if (b) { onCover(b); setDrawing(false); } }}>Save the cover</Button>
        </div>
      ) : (
        <button type="button" onClick={() => setDrawing(true)} className="text-sm font-semibold text-leaf underline underline-offset-4">{c.cover_path ? "Redraw the cover" : "Draw the cover"}</button>
      ))}
    </div>
  );
}

function NameMixtape({ busy, onName }: { busy: boolean; onName: (n: string) => void }) {
  const [n, setN] = useState("");
  return (
    <div className="flex gap-2">
      <input className={inputCls} maxLength={80} value={n} onChange={(e) => setN(e.target.value)} placeholder="Name your mixtape to finish it" aria-label="Mixtape name" />
      <Button busy={busy} disabled={!n.trim()} onClick={() => onName(n)}>Finish</Button>
    </div>
  );
}

/* ------------------------------------------------------------------- Mood Board */
function Board({ c, myId, nameOf, busy, onAdd, onRemove }: {
  c: Creation; myId: string | null | undefined; nameOf: (u: string | null) => string; busy: string | null; onAdd: (f: File, cap: string) => void; onRemove: (id: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [cap, setCap] = useState("");
  useEffect(() => { setFile(null); setCap(""); }, [c.parts.length]);
  return (
    <div className="space-y-3">
      {c.parts.length === 0 ? <p className="rounded-card border-2 border-dashed border-leaf/20 px-5 py-6 text-center font-hand text-xl text-muted">pin the first photo</p> : (
        <ul className="grid grid-cols-2 gap-3">
          {c.parts.map((p, i) => (
            <li key={p.id} className={`rounded-sm bg-paper p-1.5 pb-2 shadow-card ${i % 2 ? "rotate-1" : "-rotate-1"}`}>
              <Pic path={p.image_path} className="aspect-square w-full rounded-sm object-cover" />
              {p.caption && <p className="mt-1 font-hand text-base leading-tight">{p.caption}</p>}
              <div className="flex items-center justify-between text-[10px] text-muted">
                <span>{nameOf(p.user_id)}</span>
                {p.user_id === myId && <button type="button" disabled={busy === "rm-" + p.id} onClick={() => onRemove(p.id)} aria-label="Remove photo"><Trash2 size={12} /></button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {c.parts.length < c.limit && (
        <div className="space-y-2 rounded-2xl bg-cream p-3">
          <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border-2 border-leaf/60 px-4 text-sm font-semibold text-leaf">
            <Camera size={16} aria-hidden="true" /> {file ? file.name.slice(0, 24) : "Add a photo"}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {file && (
            <>
              <input className={inputCls} maxLength={200} value={cap} onChange={(e) => setCap(e.target.value)} placeholder="A short caption (optional)" aria-label="Caption" />
              <Button busy={busy === "add"} onClick={() => onAdd(file, cap)}>Pin it</Button>
            </>
          )}
          <p className="text-[11px] text-muted">{c.parts.length} of {c.limit} photos</p>
        </div>
      )}
    </div>
  );
}
