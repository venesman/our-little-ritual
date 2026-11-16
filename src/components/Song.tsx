import { useEffect, useState } from "react";
import { ClipboardPaste, Music2, X } from "lucide-react";
import { findSongLink, lookUpSong, SONG_BUCKET, type Song } from "../lib/music";
import { signedUrl } from "../lib/scrapbook";
import { inputCls } from "./ui";

function useCover(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { setUrl(null); if (path) void signedUrl(SONG_BUCKET, path).then(setUrl); }, [path]);
  return url;
}

/** A song: cover, title, artist, album. Tapping opens it in Spotify. */
export function SongCard({ song, note, compact }: { song: Song; note?: string | null; compact?: boolean }) {
  const cover = useCover(song.cover_path);
  return (
    <a href={song.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl bg-leaf p-3 text-cream shadow-card transition hover:-translate-y-px" aria-label={`Open ${song.title || "this song"} in Spotify`}>
      <div className={`${compact ? "h-12 w-12" : "h-16 w-16"} shrink-0 overflow-hidden rounded-lg bg-leaf-soft/20`}>
        {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center"><Music2 size={20} aria-hidden="true" /></div>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-lg leading-tight">{song.title || "A song for you"}</p>
        <p className="truncate text-sm text-cream/80">{[song.artist, song.album].filter(Boolean).join(" · ") || "Open in Spotify"}</p>
        {note && <p className="mt-1 font-hand text-base leading-snug text-mustard">“{note}”</p>}
      </div>
      <span className="shrink-0 rounded-full bg-mustard px-2.5 py-1 text-[11px] font-bold text-leaf">Spotify ↗</span>
    </a>
  );
}

/** Paste (or share) a Spotify song link; edit the details if they couldn't be found. */
export function SongPicker({ value, onChange, note, onNote, noteLabel = "Why this song? (optional)", noteMax = 200 }: {
  value: Song | null; onChange: (s: Song | null) => void; note: string; onNote: (n: string) => void; noteLabel?: string; noteMax?: number;
}) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);

  const use = async (text: string) => {
    const url = findSongLink(text);
    if (!url) { setError("That doesn't look like a Spotify song link. In Spotify: Share → Copy link."); return; }
    setBusy(true); setError(null);
    const s = await lookUpSong(url);
    setBusy(false); setManual(!s.found); setLink("");
    onChange({ url: s.url, title: s.title, artist: s.artist, album: s.album, cover_path: s.cover_path });
  };

  if (value) {
    return (
      <div className="space-y-2 rounded-2xl bg-cream p-3">
        <div className="relative">
          <SongCard song={value} compact />
          <button type="button" aria-label="Remove song" onClick={() => { onChange(null); onNote(""); }} className="absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded-full bg-paper text-leaf shadow-card"><X size={14} /></button>
        </div>
        {(manual || !value.title) && (
          <div className="grid gap-2 sm:grid-cols-2">
            <input className={inputCls} placeholder="Song title" maxLength={200} value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} aria-label="Song title" />
            <input className={inputCls} placeholder="Artist" maxLength={200} value={value.artist} onChange={(e) => onChange({ ...value, artist: e.target.value })} aria-label="Artist" />
          </div>
        )}
        <input className={inputCls} maxLength={noteMax} value={note} onChange={(e) => onNote(e.target.value)} placeholder={noteLabel} aria-label={noteLabel} />
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-2xl bg-cream p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold"><Music2 size={15} aria-hidden="true" /> Add a song</p>
      <div className="flex gap-2">
        <input className={inputCls} inputMode="url" placeholder="Paste a Spotify song link" value={link} onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void use(link); } }} aria-label="Spotify song link" />
        <button type="button" disabled={busy} onClick={async () => {
          if (link) { void use(link); return; }
          try { const t = await navigator.clipboard.readText(); setLink(t); void use(t); } catch { setError("Paste the link into the box, then tap Add."); }
        }} className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border-[1.5px] border-leaf/15 bg-mustard px-3 text-sm font-semibold text-leaf">
          <ClipboardPaste size={15} aria-hidden="true" /> {busy ? "Finding…" : link ? "Add" : "Paste"}
        </button>
      </div>
      <p className="text-[11px] text-muted">In Spotify: ••• → Share → Copy link. Nothing is ever shared automatically.</p>
      {error && <p className="text-xs text-tomato-deep">{error}</p>}
    </div>
  );
}
