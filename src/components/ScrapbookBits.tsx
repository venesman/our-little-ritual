import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookHeart, Check } from "lucide-react";
import { getFeed, imagesOf, isSaved, setEntry, signedUrl, type Memory, type MemoryKind } from "../lib/scrapbook";
import { friendlyError } from "../lib/errors";

/** "Save to scrapbook" for things that are open to both of you (revealed rituals, open Apart missions). */
export function SaveToScrapbook({ kind, refId, prompt }: { kind: MemoryKind; refId: string; prompt?: boolean }) {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { isSaved(kind, refId).then(setSaved).catch(() => setSaved(false)); }, [kind, refId]);
  if (saved === null) return null;
  const save = async () => {
    setBusy(true); setError(null);
    try { await setEntry(kind, refId, !saved); setSaved(!saved); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };
  // The moment something finishes: a small postcard asking to keep it.
  if (prompt && !saved) {
    return (
      <div className="postcard flex items-center gap-4 !p-4">
        <span className="grid h-12 w-12 shrink-0 -rotate-6 place-items-center rounded-sm border-2 border-dashed border-raspberry bg-raspberry-soft text-raspberry-deep" aria-hidden="true">
          <BookHeart size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg leading-tight">Keep this in our scrapbook?</p>
          {error && <p className="text-xs text-tomato-deep">{error}</p>}
        </div>
        <button type="button" disabled={busy} onClick={() => void save()}
          className="inline-flex min-h-[40px] shrink-0 items-center rounded-full border-[1.5px] border-leaf/15 bg-mustard px-4 text-sm font-semibold text-leaf shadow-print-sm">Keep it</button>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <button type="button" disabled={busy} aria-pressed={saved} onClick={() => void save()} className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border-2 px-5 text-sm font-semibold transition ${saved ? "border-leaf bg-leaf text-cream" : "border-leaf bg-paper text-leaf hover:bg-leaf-soft"}`}>
        {saved ? <Check size={16} aria-hidden="true" /> : <BookHeart size={16} aria-hidden="true" />}{saved ? "In our scrapbook" : "Save to scrapbook"}
      </button>
      {error && <p className="text-xs text-tomato-deep">{error}</p>}
    </div>
  );
}

/** Home: the three most recent memories, polaroid-style. */
export function RecentMemories() {
  const [items, setItems] = useState<Memory[] | null>(null);
  useEffect(() => { getFeed().then((f) => setItems(f.slice(0, 3))).catch(() => setItems([])); }, []);
  if (!items || items.length === 0) return null;
  return (
    <section aria-label="Recent memories" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="font-hand text-xl text-raspberry-deep">recent memories</p>
        <Link to="/us" className="text-sm font-semibold text-leaf">Scrapbook →</Link>
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {items.map((m, i) => <li key={m.kind + m.ref_id}><MiniPolaroid m={m} tilt={[-4, 3, -2][i]} /></li>)}
      </ul>
    </section>
  );
}

function MiniPolaroid({ m, tilt }: { m: Memory; tilt: number }) {
  const first = imagesOf(m)[0];
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { if (first) void signedUrl(first.bucket, first.path).then(setUrl); }, [first?.bucket, first?.path]); // eslint-disable-line react-hooks/exhaustive-deps
  const words = m.parts?.find((p) => p.body?.trim())?.body ?? m.caption;
  return (
    <Link to="/us" style={{ transform: `rotate(${tilt}deg)` }} className="polaroid block !p-1.5">
      <div className={`aspect-square overflow-hidden ${first ? "bg-cream" : "bg-lilac-soft"}`}>
        {first ? (url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full animate-pulse bg-leaf-soft" />)
          : <p className="line-clamp-5 p-2 font-hand text-sm leading-tight text-leaf">{words || m.title}</p>}
      </div>
      <p className="mt-1 truncate text-center font-hand text-base font-bold leading-tight">{m.title}</p>
    </Link>
  );
}
