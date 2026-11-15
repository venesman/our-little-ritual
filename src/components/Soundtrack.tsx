import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { usePeople } from "../hooks/usePeople";
import { addSoundtrackSong, findSongLink, lookUpSong, removeSoundtrackSong, soundtrackFeed, updateSoundtrackNote, type Song, type SoundtrackItem } from "../lib/music";
import { friendlyError } from "../lib/errors";
import { Button, ErrorNote, inputCls } from "./ui";
import { SongCard, SongPicker } from "./Song";

const monthLabel = (ym: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));
const dayLabel = (d: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

/** Our Story → Our Soundtrack: a musical diary of the songs you've shared. */
export function OurSoundtrack() {
  const { myId, me, partner } = usePeople();
  const [items, setItems] = useState<SoundtrackItem[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [song, setSong] = useState<Song | null>(null);
  const [note, setNote] = useState("");
  const [on, setOn] = useState(new Date().toISOString().slice(0, 10));
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");

  const load = () => soundtrackFeed().then(setItems).catch(() => setItems([]));
  useEffect(() => { void load(); }, []);
  // shared from Spotify (Android): /us?tab=story&song=<link>
  useEffect(() => {
    const shared = findSongLink(new URLSearchParams(window.location.search).get("song"));
    if (!shared) return;
    setAdding(true);
    void lookUpSong(shared).then((s) => setSong({ url: s.url, title: s.title, artist: s.artist, album: s.album, cover_path: s.cover_path }));
  }, []);

  const nameOf = (id: string) => (id === myId ? me?.display_name || "You" : partner?.display_name || "Partner");
  const shown = (items ?? []).filter((i) => !day || i.on === day);
  const months = useMemo(() => {
    const m = new Map<string, SoundtrackItem[]>();
    for (const i of shown) { const k = i.on.slice(0, 7); m.set(k, [...(m.get(k) ?? []), i]); }
    return [...m.entries()];
  }, [shown]);

  return (
    <section className="space-y-3" aria-label="Our Soundtrack">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl">Our Soundtrack</h2>
          <p className="text-sm text-muted">A musical diary of what you've shared — and what you were feeling.</p>
        </div>
        {!adding && <Button variant="outline" className="!min-h-[38px] !px-3 text-xs" onClick={() => setAdding(true)}><Plus size={14} aria-hidden="true" /> Add a song</Button>}
      </div>

      {adding && (
        <div className="postcard space-y-3 !p-4">
          <SongPicker value={song} onChange={setSong} note={note} onNote={setNote} noteLabel="What were you listening to or feeling? (optional)" noteMax={300} />
          {song && (
            <label className="block text-sm"><span className="font-semibold">Date</span>
              <input type="date" className={inputCls} value={on} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setOn(e.target.value)} />
            </label>
          )}
          <ErrorNote>{error}</ErrorNote>
          <div className="flex gap-2">
            <Button busy={busy} disabled={!song || !song.title.trim()} onClick={async () => {
              if (!song) return;
              setBusy(true); setError(null);
              try { await addSoundtrackSong(song, note, on); setSong(null); setNote(""); setAdding(false); await load(); }
              catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
            }}>Add to our soundtrack</Button>
            <Button variant="ghost" onClick={() => { setAdding(false); setSong(null); setNote(""); }}>Cancel</Button>
          </div>
        </div>
      )}

      {(items?.length ?? 0) > 0 && (
        <label className="flex items-center gap-2 text-sm"><span className="font-semibold">Revisit a day</span>
          <input type="date" className={`${inputCls} !w-auto`} value={day} onChange={(e) => setDay(e.target.value)} />
          {day && <button type="button" onClick={() => setDay("")} className="text-xs font-semibold text-muted underline">Show all</button>}
        </label>
      )}

      {items === null ? null : shown.length === 0 ? (
        <p className="rounded-card border-2 border-dashed border-leaf/20 px-5 py-6 text-center font-hand text-xl text-muted">
          {day ? "no songs from that day" : "songs you share in letters or add here will gather into your soundtrack"}
        </p>
      ) : months.map(([ym, list]) => (
        <div key={ym} className="space-y-2">
          <p className="font-hand text-xl text-raspberry-deep">{monthLabel(ym)}</p>
          <ol className="space-y-2">
            {list.map((i) => (
              <li key={i.source + i.id} className="space-y-1">
                <p className="text-[11px] font-semibold text-muted">{dayLabel(i.on)} · shared by {nameOf(i.by)}{i.source === "letter" && i.letter_id ? " · " : ""}
                  {i.source === "letter" && i.letter_id && <Link to={`/mailbox/${i.letter_id}`} className="underline">from a letter</Link>}</p>
                <SongCard song={i} note={editing === i.id ? null : i.note} compact />
                {i.source === "added" && i.by === myId && (
                  editing === i.id ? (
                    <div className="flex gap-2">
                      <input className={inputCls} maxLength={300} value={editNote} onChange={(e) => setEditNote(e.target.value)} aria-label="Note" />
                      <Button className="!min-h-[38px] !px-3 text-xs" onClick={async () => {
                        try { await updateSoundtrackNote(i.id, editNote); setEditing(null); await load(); } catch (e) { setError(friendlyError(e)); }
                      }}>Save</Button>
                    </div>
                  ) : (
                    <div className="flex gap-3 text-[11px] font-semibold text-muted">
                      <button type="button" onClick={() => { setEditing(i.id); setEditNote(i.note); }} className="inline-flex items-center gap-1 underline"><Pencil size={11} aria-hidden="true" />Edit note</button>
                      <button type="button" onClick={async () => {
                        if (!window.confirm("Remove this song from your soundtrack?")) return;
                        try { await removeSoundtrackSong(i.id); await load(); } catch (e) { setError(friendlyError(e)); }
                      }} className="inline-flex items-center gap-1 underline"><Trash2 size={11} aria-hidden="true" />Remove</button>
                    </div>
                  )
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}
