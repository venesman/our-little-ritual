import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getFeed, imagesOf, signedUrl, type Memory } from "../lib/scrapbook";

interface Cover { id: string; path: string; taken_at: string | null; moment_title: string; place: string }

/** Home: "Our photo" — a polaroid of a trip photo you picked in the Scrapbook. Hidden until one is chosen. */
export function OurPhoto() {
  const [cover, setCover] = useState<Cover | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    supabase.rpc("cover_photo").then(({ data, error }) => {
      if (error || !data) return;
      const c = data as Cover; setCover(c);
      void signedUrl("moments", c.path).then(setUrl);
    });
  }, []);
  if (!cover) return null;
  return (
    <Link to="/us" aria-label={`Our photo: ${cover.moment_title}`} className="mx-auto block w-56 -rotate-2 rounded-sm bg-paper p-2 pb-3 shadow-card transition hover:rotate-0">
      <div className="aspect-[4/3] overflow-hidden rounded-sm bg-cream">
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full animate-pulse bg-leaf-soft" />}
      </div>
      <p className="mt-1.5 truncate text-center font-hand text-lg leading-tight text-leaf">{cover.moment_title}{cover.place ? ` · ${cover.place.split("·")[0].trim()}` : ""}</p>
    </Link>
  );
}

/** Pick a memory from this date in an earlier year (or, failing that, this day in an earlier month). */
export function onThisDay(feed: Memory[], today = new Date()): { m: Memory; label: string } | null {
  const ymd = today.toISOString().slice(0, 10);
  const md = ymd.slice(5), day = ymd.slice(8);
  const dated = feed.map((m) => ({ m, d: (m.starts_on ?? m.at).slice(0, 10) })).filter((x) => x.d < ymd);
  const year = dated.find((x) => x.d.slice(5) === md);
  if (year) { const n = Number(ymd.slice(0, 4)) - Number(year.d.slice(0, 4)); return { m: year.m, label: n === 1 ? "A year ago today" : `${n} years ago today` }; }
  const month = dated.find((x) => x.d.slice(8) === day && x.d.slice(0, 7) < ymd.slice(0, 7));
  if (month) {
    const n = (Number(ymd.slice(0, 4)) - Number(month.d.slice(0, 4))) * 12 + Number(ymd.slice(5, 7)) - Number(month.d.slice(5, 7));
    return { m: month.m, label: n === 1 ? "A month ago today" : `${n} months ago today` };
  }
  return null;
}

/** Home: one memory from this date, as a little postcard. Hidden when there isn't one. */
export function OnThisDay() {
  const [hit, setHit] = useState<{ m: Memory; label: string } | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    getFeed().then((f) => {
      const h = onThisDay(f); setHit(h);
      const img = h && imagesOf(h.m)[0];
      if (img) void signedUrl(img.bucket, img.path).then(setUrl);
    }).catch(() => {});
  }, []);
  if (!hit) return null;
  const words = hit.m.parts?.find((p) => p.body?.trim())?.body ?? hit.m.caption;
  return (
    <Link to="/us" className="postcard flex items-center gap-4 !p-4 transition hover:-translate-y-px">
      <div className="h-16 w-16 shrink-0 rotate-3 overflow-hidden rounded-sm bg-cream p-1 shadow-card">
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <p className="line-clamp-3 font-hand text-xs leading-tight text-leaf">{words}</p>}
      </div>
      <div className="min-w-0">
        <p className="font-hand text-lg text-raspberry-deep">{hit.label}</p>
        <p className="truncate font-display text-base font-semibold">{hit.m.title}</p>
      </div>
    </Link>
  );
}
