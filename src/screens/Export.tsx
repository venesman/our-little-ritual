import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileDown, Printer } from "lucide-react";
import { usePeople } from "../hooks/usePeople";
import { activitySummary, getFeed, imagesOf, KIND_LABEL, signedUrl, type Memory, type MonthSummary } from "../lib/scrapbook";
import { CATEGORY } from "../lib/rituals";
import { KIND as LETTER_KIND, type LetterKind } from "../lib/mailbox";
import { friendlyError } from "../lib/errors";
import { Button, Card, ErrorNote, Field, Spinner, inputCls } from "../components/ui";
import { memoryDate } from "./Scrapbook";
import { listVisits, type Visit } from "../lib/visits";
import { soundtrackFeed, type SoundtrackItem } from "../lib/music";

type Include = { moments: boolean; visits: boolean; games: boolean; milestones: boolean; rituals: boolean; missions: boolean; discoveries: boolean; letters: boolean; soundtrack: boolean; summary: boolean; photos: boolean };
const INCLUDE_LABEL: Record<keyof Include, string> = {
  visits: "Visits (from the Visits page) in 'Time together'", games: "Saved quizzes, games and creations",
  moments: "Trips & moments", milestones: "Milestones", rituals: "Weekly rituals (both answers)", missions: "Apart missions",
  discoveries: "Curious Club discoveries", letters: "Letters (private — off by default)", soundtrack: "Our Soundtrack (song, artist, date, who shared it)", summary: "Month-by-month summary of shared activities", photos: "Include photos",
};

const dayOf = (m: Memory) => (m.starts_on ?? m.at).slice(0, 10);
const fmtDate = (d: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d.slice(0, 10)}T00:00:00Z`));
const fmtMonth = (d: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d.slice(0, 10)}T00:00:00Z`));
const daysBetween = (a: string, b?: string | null) => (b ? Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1 : 1);

/**
 * "Export our story": a dated record of your relationship as a Word document
 * (opens in Google Docs / Drive) or a printable page (Save as PDF).
 * It reports what's in the app; it doesn't claim to meet any visa requirement.
 */
export function ExportStory() {
  const { me, partner, myId } = usePeople();
  const [feed, setFeed] = useState<Memory[] | null>(null);
  const [summary, setSummary] = useState<MonthSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [inc, setInc] = useState<Include>({ visits: true, games: false, moments: true, milestones: true, rituals: true, missions: false, discoveries: false, letters: false, soundtrack: false, summary: true, photos: true });
  const [songs, setSongs] = useState<SoundtrackItem[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  useEffect(() => { listVisits().then(setVisits).catch(() => {}); }, []);
  useEffect(() => { if (inc.soundtrack && !songs.length) soundtrackFeed().then(setSongs).catch(() => {}); }, [inc.soundtrack, songs.length]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    getFeed().then((f) => {
      setFeed(f);
      const first = f.map(dayOf).sort()[0];
      setFrom(first ?? new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10));
    }).catch((e) => { setError(friendlyError(e)); setFeed([]); });
  }, []);
  useEffect(() => {
    if (!from || !to || !inc.summary) return;
    activitySummary(from, to).then(setSummary).catch(() => setSummary([]));
  }, [from, to, inc.summary]);

  const nameOf = (id: string | null | undefined) => (id === myId ? me?.display_name : partner?.display_name) || "—";
  const items = useMemo(() => (feed ?? []).filter((m) => {
    const d = dayOf(m); if ((from && d < from) || (to && d > to)) return false;
    return (m.kind === "moment" && inc.moments) || (m.kind === "milestone" && inc.milestones) || (m.kind === "ritual" && inc.rituals)
      || (m.kind === "mission" && inc.missions) || (m.kind === "discovery" && inc.discoveries) || (m.kind === "letter" && inc.letters)
      || (["quiz", "personality", "knowme", "creation", "whim"].includes(m.kind) && inc.games);
  }).sort((a, b) => dayOf(a).localeCompare(dayOf(b))), [feed, from, to, inc]);
  const trips = items.filter((m) => m.kind === "moment");
  const today = new Date().toISOString().slice(0, 10);
  const pastVisits = inc.visits ? visits.filter((v) => v.starts_on <= today && (!from || (v.ends_on ?? v.starts_on) >= from) && (!to || v.starts_on <= to)) : [];
  const together = [
    ...trips.map((t) => ({ kind: "Trip or moment", title: t.title, from: t.starts_on!, until: t.ends_on ?? null, place: t.place || "—" })),
    ...pastVisits.map((v) => ({ kind: "Visit", title: `Together in ${v.place}`, from: v.starts_on, until: v.ends_on, place: v.place })),
  ].sort((a, b) => a.from.localeCompare(b.from));
  const soundtrack = inc.soundtrack ? songs.filter((x) => (!from || x.on >= from) && (!to || x.on <= to)).sort((a, b) => a.on.localeCompare(b.on)) : [];
  const people = [me, partner].filter(Boolean);
  const summaryRows = inc.summary ? summary.filter((r) => r.rituals_both + r.checkins_both + r.letters + r.play_sessions + r.curious_sessions + r.apart_missions
    + (r.games ?? 0) + (r.creations ?? 0) + (r.songs ?? 0) > 0) : [];
  const hasNew = summaryRows.some((r) => r.games != null);

  const download = async () => {
    setBusy("docx"); setError(null);
    try {
      const blob = await buildDocx({ items, together, summaryRows, hasNew, inc, from, to, people: people.map((p) => p!), nameOf, soundtrack });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Our-story-${from}-to-${to}.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { setError(friendlyError(e, "We couldn't create the document. Please try again.")); }
    finally { setBusy(null); }
  };

  if (feed === null) return <Spinner label="Gathering your memories" />;

  return (
    <div className="fade-up space-y-5">
      <div className="no-print space-y-5">
        <Link to="/us" className="inline-flex items-center gap-1.5 text-sm font-semibold text-leaf"><ArrowLeft size={15} aria-hidden="true" /> Scrapbook</Link>
        <header>
          <p className="font-hand text-2xl text-raspberry-deep">a dated record of us</p>
          <h1 className="text-4xl">Export our story</h1>
          <p className="mt-2 text-sm text-muted">
            Your trips, dated photos, milestones and how you've stayed in touch — as a document for Google Drive or a PDF.
          </p>
        </header>
        <ErrorNote>{error}</ErrorNote>
        <Card className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" htmlFor="ex-from"><input id="ex-from" type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To" htmlFor="ex-to"><input id="ex-to" type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-leaf">Include</legend>
            {(Object.keys(INCLUDE_LABEL) as (keyof Include)[]).map((k) => (
              <label key={k} className="flex items-center gap-3 text-sm">
                <input type="checkbox" className="h-5 w-5 accent-[#20492F]" checked={inc[k]} onChange={(e) => setInc({ ...inc, [k]: e.target.checked })} />
                {INCLUDE_LABEL[k]}
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-muted">{items.length} {items.length === 1 ? "memory" : "memories"} · {together.length} {together.length === 1 ? "time together" : "times together"} · {items.reduce((n, m) => n + (inc.photos ? imagesOf(m).length : 0), 0)} photos</p>
          <div className="flex flex-wrap gap-2">
            <Button busy={busy === "docx"} onClick={() => void download()}><FileDown size={16} aria-hidden="true" /> Download Word document</Button>
            <Button variant="outline" onClick={() => window.print()}><Printer size={16} aria-hidden="true" /> Print / Save as PDF</Button>
          </div>
        </Card>
        <Card className="space-y-2 !p-5 text-sm">
          <h2 className="text-lg">Saving it to Google Drive</h2>
          <ol className="list-decimal space-y-1 pl-5 text-muted">
            <li>Tap <strong className="text-leaf">Download Word document</strong>.</li>
            <li>Open the Google Drive app → <strong className="text-leaf">+</strong> → <strong className="text-leaf">Upload</strong> → choose the file (it's in Downloads / Files).</li>
            <li>It opens in Google Docs. For a PDF instead, use <strong className="text-leaf">Print / Save as PDF</strong>.</li>
          </ol>
          <p className="text-xs text-muted">This document lists what's saved in the app. It isn't legal advice — check the Swedish Migration Agency's own list of what to submit.</p>
        </Card>
        <h2 className="text-2xl">Preview</h2>
      </div>

      {/* The printable document */}
      <article className="print-doc space-y-6 rounded-[20px] bg-white p-6 text-[15px] leading-relaxed text-black shadow-card">
        <header className="border-b border-black/20 pb-4">
          <h1 className="font-display text-3xl">Our relationship record</h1>
          <p className="mt-1">{people.map((p) => p!.display_name).join(" & ")}</p>
          {people.map((p) => (
            <p key={p!.id} className="text-sm text-black/70">
              {p!.display_name}: lives in {[p!.current_city, p!.current_country].filter(Boolean).join(", ") || "—"}{p!.home_country ? ` · from ${p!.home_country}` : ""}
            </p>
          ))}
          <p className="mt-2 text-sm text-black/70">Covers {from ? fmtDate(from) : "—"} to {fmtDate(to)} · created {fmtDate(new Date().toISOString())} with Our Little Ritual.</p>
          <p className="text-xs text-black/60">Dates are as recorded in the app. Photo dates come from the photo files where the phone saved them.</p>
        </header>

        {together.length > 0 && (
          <section>
            <h2 className="font-display text-xl">Time together</h2>
            <div className="-mx-2 overflow-x-auto px-2">
            <table className="mt-2 w-full min-w-[460px] border-collapse text-sm">
              <thead><tr className="border-b border-black/30 text-left"><th className="py-1 pr-2">What</th><th className="py-1 pr-2">Dates</th><th className="py-1 pr-2">Place</th><th className="py-1">Days</th></tr></thead>
              <tbody>{together.map((t, i) => (
                <tr key={i} className="border-b border-black/10 align-top">
                  <td className="py-1 pr-2">{t.title}<span className="block text-xs text-black/60">{t.kind}</span></td><td className="py-1 pr-2">{dateRange(t.from, t.until)}</td><td className="py-1 pr-2">{t.place}</td><td className="py-1">{daysBetween(t.from, t.until)}</td>
                </tr>
              ))}</tbody>
            </table>
            </div>
            <p className="mt-1 text-xs text-black/60">Total: {together.reduce((n, t) => n + daysBetween(t.from, t.until), 0)} days (trips and visits may overlap).</p>
          </section>
        )}

        {summaryRows.length > 0 && (
          <section>
            <h2 className="font-display text-xl">Staying in touch, month by month</h2>
            <div className="-mx-2 overflow-x-auto px-2">
            <table className="mt-2 w-full min-w-[520px] border-collapse text-sm">
              <thead><tr className="border-b border-black/30 text-left">
                <th className="py-1 pr-2">Month</th><th className="py-1 pr-2">Rituals</th><th className="py-1 pr-2">Check-ins</th><th className="py-1 pr-2">Letters</th><th className="py-1 pr-2">Call activities</th><th className="py-1 pr-2">Research dates</th><th className="py-1 pr-2">Missions</th>{hasNew && <><th className="py-1 pr-2">Quizzes & games</th><th className="py-1 pr-2">Made together</th><th className="py-1">Songs shared</th></>}
              </tr></thead>
              <tbody>{summaryRows.map((r) => (
                <tr key={r.month} className="border-b border-black/10">
                  <td className="py-1 pr-2">{fmtMonth(r.month)}</td><td className="py-1 pr-2">{r.rituals_both}</td><td className="py-1 pr-2">{r.checkins_both}</td><td className="py-1 pr-2">{r.letters}</td><td className="py-1 pr-2">{r.play_sessions}</td><td className="py-1 pr-2">{r.curious_sessions}</td><td className="py-1 pr-2">{r.apart_missions}</td>{hasNew && <><td className="py-1 pr-2">{r.games ?? 0}</td><td className="py-1 pr-2">{r.creations ?? 0}</td><td className="py-1">{r.songs ?? 0}</td></>}
                </tr>
              ))}</tbody>
            </table>
            </div>
            <p className="mt-1 text-xs text-black/60">Counts only. Rituals and check-ins are counted when both of you took part.</p>
          </section>
        )}

        {items.length > 0 && (
          <section className="space-y-5">
            <h2 className="font-display text-xl">Memories</h2>
            {items.map((m) => <PrintMemory key={m.kind + m.ref_id} m={m} photos={inc.photos} nameOf={nameOf} />)}
          </section>
        )}
        {soundtrack.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-display text-xl">Our Soundtrack</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {soundtrack.map((x) => <li key={x.source + x.id}>{fmtDate(x.on)} — {x.title}{x.artist ? ` · ${x.artist}` : ""} (shared by {nameOf(x.by)}){x.note ? ` — “${x.note}”` : ""}</li>)}
            </ul>
          </section>
        )}
        {items.length === 0 && together.length === 0 && summaryRows.length === 0 && soundtrack.length === 0 && <p>Nothing in this date range yet.</p>}
      </article>
    </div>
  );
}

function kindLabel(m: Memory) {
  if (m.kind === "ritual" && m.category) return `Weekly ritual · ${CATEGORY[m.category]?.label ?? ""}`;
  if (m.kind === "letter" && m.letter_kind) return LETTER_KIND[m.letter_kind as LetterKind]?.label ?? "Letter";
  return KIND_LABEL[m.kind];
}

function PrintMemory({ m, photos, nameOf }: { m: Memory; photos: boolean; nameOf: (id: string | null | undefined) => string }) {
  return (
    <div className="break-inside-avoid border-t border-black/10 pt-3">
      <p className="text-xs uppercase tracking-wide text-black/60">{kindLabel(m)} · {memoryDate(m)}{m.place ? ` · ${m.place}` : ""}</p>
      <h3 className="font-display text-lg font-semibold">{m.title}</h3>
      {m.caption && <p className="whitespace-pre-wrap">{m.caption}</p>}
      {(m.parts ?? []).filter((p) => p.body || p.answers?.some((a) => a.answer)).map((p, i) => (
        <div key={i} className="mt-1">
          <p className="text-sm font-semibold">{nameOf(p.user_id)}{m.kind === "letter" ? " wrote" : ""}:</p>
          {p.answers?.filter((a) => a.answer).map((a, j) => <p key={j} className="text-sm">{a.prompt}: {a.answer}</p>)}
          {p.body && <p className="whitespace-pre-wrap text-sm">{p.body}</p>}
        </div>
      ))}
      {photos && imagesOf(m).length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {imagesOf(m).map((img) => <PrintPhoto key={img.path} {...img} />)}
        </div>
      )}
    </div>
  );
}

function PrintPhoto({ bucket, path, taken_at }: { bucket: string; path: string; taken_at?: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { void signedUrl(bucket, path).then(setUrl); }, [bucket, path]);
  return (
    <figure className="break-inside-avoid">
      {url ? <img src={url} alt="" className="w-full rounded object-contain" /> : <div className="h-32 bg-black/5" />}
      {taken_at && <figcaption className="text-xs text-black/60">Taken {fmtDate(taken_at)}</figcaption>}
    </figure>
  );
}

/* ================================================================ Word */

async function imageForDocx(bucket: string, path: string): Promise<{ data: ArrayBuffer; type: "jpg" | "png"; width: number; height: number } | null> {
  const url = await signedUrl(bucket, path);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob);
  const max = 420;
  const scale = Math.min(1, max / bmp.width);
  return { data: await blob.arrayBuffer(), type: path.endsWith(".png") ? "png" : "jpg", width: Math.round(bmp.width * scale), height: Math.round(bmp.height * scale) };
}

async function buildDocx({ items, together, summaryRows, hasNew, inc, from, to, people, nameOf, soundtrack }: {
  items: Memory[]; together: { kind: string; title: string; from: string; until: string | null; place: string }[]; summaryRows: MonthSummary[]; hasNew: boolean; inc: Include; from: string; to: string; soundtrack: SoundtrackItem[];
  people: { id: string; display_name: string; current_city: string | null; current_country: string | null; home_country: string | null }[];
  nameOf: (id: string | null | undefined) => string;
}): Promise<Blob> {
  const d = await import("docx");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ImageRun } = d;
  const P = (text: string, opts: { bold?: boolean; size?: number; italics?: boolean; color?: string } = {}) =>
    new Paragraph({ children: [new TextRun({ text, ...opts })], spacing: { after: 80 } });
  const cell = (text: string, bold = false) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold, size: 20 })] })] });
  const table = (head: string[], rows: string[][]) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: head.map((h) => cell(h, true)), tableHeader: true }), ...rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) }))],
  });

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [
    new Paragraph({ text: "Our relationship record", heading: HeadingLevel.TITLE }),
    P(people.map((p) => p.display_name).join(" & "), { bold: true, size: 28 }),
    ...people.map((p) => P(`${p.display_name}: lives in ${[p.current_city, p.current_country].filter(Boolean).join(", ") || "—"}${p.home_country ? ` · from ${p.home_country}` : ""}`)),
    P(`Covers ${from ? fmtDate(from) : "—"} to ${fmtDate(to)} · created ${fmtDate(new Date().toISOString())} with Our Little Ritual.`, { color: "555555" }),
    P("Dates are as recorded in the app. Photo dates come from the photo files where the phone saved them.", { italics: true, size: 18, color: "555555" }),
  ];

  if (together.length) {
    children.push(new Paragraph({ text: "Time together", heading: HeadingLevel.HEADING_1 }));
    children.push(table(["What", "Dates", "Place", "Days"], together.map((t) => [`${t.title} (${t.kind})`, dateRange(t.from, t.until), t.place, String(daysBetween(t.from, t.until))])));
    children.push(P(`Total: ${together.reduce((n, t) => n + daysBetween(t.from, t.until), 0)} days (trips and visits may overlap).`, { italics: true, size: 18, color: "555555" }));
  }
  if (summaryRows.length) {
    children.push(new Paragraph({ text: "Staying in touch, month by month", heading: HeadingLevel.HEADING_1 }));
    children.push(table(["Month", "Rituals", "Check-ins", "Letters", "Call activities", "Research dates", "Missions", ...(hasNew ? ["Quizzes & games", "Made together", "Songs shared"] : [])],
      summaryRows.map((r) => [fmtMonth(r.month), r.rituals_both, r.checkins_both, r.letters, r.play_sessions, r.curious_sessions, r.apart_missions,
        ...(hasNew ? [r.games ?? 0, r.creations ?? 0, r.songs ?? 0] : [])].map(String))));
    children.push(P("Counts only. Rituals and check-ins are counted when both of you took part.", { italics: true, size: 18, color: "555555" }));
  }
  if (items.length) {
    children.push(new Paragraph({ text: "Memories", heading: HeadingLevel.HEADING_1 }));
    for (const m of items) {
      children.push(P(`${kindLabel(m)} · ${memoryDate(m)}${m.place ? ` · ${m.place}` : ""}`, { size: 18, color: "555555" }));
      children.push(new Paragraph({ text: m.title, heading: HeadingLevel.HEADING_2 }));
      if (m.caption) children.push(P(m.caption));
      for (const p of m.parts ?? []) {
        const lines = [...(p.answers ?? []).filter((a) => a.answer).map((a) => `${a.prompt}: ${a.answer}`), ...(p.body ? [p.body] : [])];
        if (!lines.length) continue;
        children.push(P(`${nameOf(p.user_id)}${m.kind === "letter" ? " wrote" : ""}:`, { bold: true }));
        for (const l of lines) children.push(P(l));
      }
      if (inc.photos) {
        for (const img of imagesOf(m)) {
          const data = await imageForDocx(img.bucket, img.path).catch(() => null);
          if (!data) continue;
          children.push(new Paragraph({ children: [new ImageRun({ data: data.data, type: data.type, transformation: { width: data.width, height: data.height } })] }));
          if (img.taken_at) children.push(P(`Taken ${fmtDate(img.taken_at)}`, { size: 18, color: "555555" }));
        }
      }
    }
  }
  if (soundtrack.length) {
    children.push(new Paragraph({ text: "Our Soundtrack", heading: HeadingLevel.HEADING_1 }));
    children.push(table(["Date", "Song", "Artist", "Shared by"], soundtrack.map((x) => [fmtDate(x.on), x.title, x.artist || "—", nameOf(x.by)])));
  }
  const doc = new Document({ creator: "Our Little Ritual", title: "Our relationship record", sections: [{ children }] });
  return Packer.toBlob(doc);
}

function dateRange(from: string, until: string | null | undefined) {
  return until && until !== from ? `${fmtDate(from)} – ${fmtDate(until)}` : fmtDate(from);
}
