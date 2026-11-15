import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, EyeOff, FileDown, Pencil, Printer, RotateCcw } from "lucide-react";
import { usePeople } from "../hooks/usePeople";
import { activitySummary, getFeed, imagesOf, KIND_LABEL, signedUrl, type Memory, type MonthSummary } from "../lib/scrapbook";
import { CATEGORY } from "../lib/rituals";
import { KIND as LETTER_KIND, type LetterKind } from "../lib/mailbox";
import { friendlyError } from "../lib/errors";
import { Button, Card, ErrorNote, Field, Spinner, inputCls } from "../components/ui";
import { memoryDate } from "./Scrapbook";
import { listVisits, type Visit } from "../lib/visits";
import { listMilestones, type Milestone } from "../lib/story";
import { soundtrackFeed, type SoundtrackItem } from "../lib/music";
import {
  exportConsent, fmtPrecise, listDocuments, monthlyRecord, overviewText, photoSources, setExportMyWords, SOURCE_EXPLAIN, SOURCE_LABEL,
  type MonthRecord, type PhotoSource, type Source, type SupportingDoc,
} from "../lib/record";
import { buildRecord, DECLARATION, fmtDate, wordsAllowed, type Person, type Row, type VisitRow } from "../lib/exportRecord";

type Include = {
  overview: boolean; timeline: boolean; visits: boolean; family: boolean; summary: boolean; moments: boolean; photos: boolean;
  rituals: boolean; missions: boolean; discoveries: boolean; letters: boolean; games: boolean; soundtrack: boolean;
  documents: boolean; declaration: boolean;
};
const DEFAULTS: Include = {
  overview: true, timeline: true, visits: true, family: true, summary: true, moments: true, photos: true,
  rituals: false, missions: false, discoveries: false, letters: false, games: false, soundtrack: false,
  documents: true, declaration: true,
};
const GROUPS: [string, [keyof Include, string][]][] = [
  ["The record", [
    ["overview", "Relationship overview"], ["timeline", "Relationship timeline & future plans"], ["visits", "Physical visits & time together"],
    ["family", "Time spent with family"], ["summary", "Month-by-month: how we stayed in touch"], ["documents", "Supporting documentation index"],
    ["declaration", "Declaration of record"],
  ]],
  ["Shared memories", [
    ["moments", "Trips & moments"], ["photos", "Include photos"], ["rituals", "Weekly ritual answers"], ["missions", "Apart missions"],
    ["discoveries", "Curious Club discoveries"], ["games", "Saved quizzes, games and creations"], ["soundtrack", "Our Soundtrack"],
    ["letters", "Letters (private — off by default)"],
  ]],
];

const SECTION_TITLES = {
  overview: "Relationship overview", timeline: "Relationship timeline", visits: "Physical visits and time together", family: "Time spent with family",
  summary: "Maintaining our long-distance relationship", memories: "Shared memories", docs: "Supporting documentation index", declaration: "Declaration of record",
};

/**
 * "Export our story": a dated, organised record of your relationship as a
 * Word document (opens in Google Docs / Drive) or a printable page (PDF).
 * Built on the phone; nothing is sent anywhere. It reports what you've
 * recorded — it isn't an official document and doesn't claim to meet any
 * visa requirement.
 */
export function ExportStory() {
  const { me, partner, myId } = usePeople();
  const [feed, setFeed] = useState<Memory[] | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [docs, setDocs] = useState<SupportingDoc[]>([]);
  const [photoSrc, setPhotoSrc] = useState<Record<string, PhotoSource>>({});
  const [consent, setConsent] = useState<Record<string, boolean>>({});
  const [months, setMonths] = useState<MonthRecord[] | null>(null);
  const [oldMonths, setOldMonths] = useState<MonthSummary[]>([]);
  const [songs, setSongs] = useState<SoundtrackItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [inc, setInc] = useState<Include>(DEFAULTS);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [overview, setOverview] = useState<string | null>(null);   // null = use the generated text
  const [busy, setBusy] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    Promise.all([getFeed(), listVisits().catch(() => []), listMilestones().catch(() => [])]).then(([f, v, ms]) => {
      setFeed(f); setVisits(v); setMilestones(ms);
      const first = [...f.map((m) => (m.starts_on ?? m.at).slice(0, 10)), ...v.map((x) => x.starts_on), ...ms.map((m) => m.happened_on).filter((d): d is string => !!d && d <= today)].sort()[0];
      setFrom(first ?? new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10));
    }).catch((e) => { setError(friendlyError(e)); setFeed([]); });
    void listDocuments().then((d) => setDocs(d ?? []));
    void photoSources().then(setPhotoSrc);
    void exportConsent().then(setConsent);
  }, [today]);
  useEffect(() => { if (inc.soundtrack && !songs.length) soundtrackFeed().then(setSongs).catch(() => {}); }, [inc.soundtrack, songs.length]);
  useEffect(() => {
    if (!from || !to || !inc.summary) return;
    monthlyRecord(from, to).then((r) => {
      setMonths(r);
      if (r === null) activitySummary(from, to).then(setOldMonths).catch(() => setOldMonths([]));
    });
  }, [from, to, inc.summary]);

  const people = [me, partner].filter(Boolean) as Person[];
  const nameOf = (id: string | null | undefined) => people.find((p) => p.id === id)?.display_name || "—";
  const partnerAllowed = partner ? consent[partner.id] === true : false;
  const iAllow = myId ? consent[myId] === true : false;
  const consentReady = Object.keys(consent).length > 0;

  const rec = useMemo(() => buildRecord({
    from, to, today, people, myId, visits, milestones, feed: feed ?? [], docs, months, oldMonths, excluded,
  }), [from, to, today, people, myId, visits, milestones, feed, docs, months, oldMonths, excluded]);

  const memories = useMemo(() => (feed ?? []).filter((m) => {
    const d = (m.starts_on ?? m.at).slice(0, 10); if ((from && d < from) || (to && d > to)) return false;
    return (m.kind === "moment" && inc.moments) || (m.kind === "ritual" && inc.rituals) || (m.kind === "mission" && inc.missions)
      || (m.kind === "discovery" && inc.discoveries) || (m.kind === "letter" && inc.letters)
      || (["quiz", "personality", "knowme", "creation", "whim"].includes(m.kind) && inc.games);
  }).map((m) => wordsAllowed(m, myId, consent)).filter((m): m is Memory => !!m)
    .sort((a, b) => (a.starts_on ?? a.at).localeCompare(b.starts_on ?? b.at)), [feed, from, to, inc, myId, consent]);
  const soundtrack = inc.soundtrack ? songs.filter((x) => (!from || x.on >= from) && (!to || x.on <= to)).sort((a, b) => a.on.localeCompare(b.on)) : [];
  const photoSource = useMemo(() => {
    const out: Record<string, PhotoSource> = {};
    for (const m of feed ?? []) for (const p of m.photos ?? []) if (photoSrc[p.id]) out[p.path] = photoSrc[p.id];
    return out;
  }, [feed, photoSrc]);

  const generated = overviewText({
    names: people.map((p) => p.display_name), start: rec.start, firstMet: rec.firstMet, meetings: rec.meetings,
    totalDays: rec.totalDays, countries: rec.countries, familyVisits: rec.familyVisits,
    homes: people.map((p) => `${p.display_name} lives in ${[p.current_city, p.current_country].filter(Boolean).join(", ") || "—"}`),
  });
  const overviewShown = overview ?? generated;
  const startLine = rec.start ? fmtPrecise(rec.start.on, rec.start.precision) : null;

  const out = (k: string) => excluded.has(k);
  const toggle = (k: string) => setExcluded((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const memKey = (m: Memory) => `mem:${m.kind}:${m.ref_id}`;
  const keptMemories = memories.filter((m) => !out(memKey(m)));

  const download = async () => {
    setBusy("docx"); setError(null);
    try {
      const blob = await buildDocx({
        inc, rec, people, from, to, startLine, overview: overviewShown, memories: keptMemories, soundtrack, nameOf, photoSource,
        timeline: rec.timeline.filter((r) => !out(r.key)), plans: rec.plans.filter((r) => !out(r.key)),
        visits: rec.visits.filter((r) => !out(r.key)), family: rec.family.filter((r) => !out(r.key)),
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Our-relationship-record-${from}-to-${to}.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { setError(friendlyError(e, "We couldn't create the document. Please try again.")); }
    finally { setBusy(null); }
  };

  if (feed === null) return <Spinner label="Gathering your memories" />;

  const sections = {
    timeline: inc.timeline && (rec.timeline.length > 0 || rec.plans.length > 0),
    visits: inc.visits && rec.visits.length > 0,
    family: inc.family && rec.family.length > 0,
    summary: inc.summary && rec.months.length > 0,
    memories: keptMemories.length > 0 || memories.length > 0 || soundtrack.length > 0,
    docs: inc.documents && rec.docs.length > 0,
  };
  let n = 0;
  const num = () => ++n;

  return (
    <div className="fade-up space-y-5">
      <div className="no-print space-y-5">
        <Link to="/us" className="inline-flex items-center gap-1.5 text-sm font-semibold text-leaf"><ArrowLeft size={15} aria-hidden="true" /> Scrapbook</Link>
        <header>
          <p className="font-hand text-2xl text-raspberry-deep">a dated record of us</p>
          <h1 className="text-4xl">Export our story</h1>
          <p className="mt-2 text-sm text-muted">
            Your milestones, visits, dated photos and how you've stayed in touch — as an organised document for Google Drive or a PDF.
          </p>
        </header>
        <ErrorNote>{error}</ErrorNote>
        <Card className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" htmlFor="ex-from"><input id="ex-from" type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To" htmlFor="ex-to"><input id="ex-to" type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
          {GROUPS.map(([title, keys]) => (
            <fieldset key={title} className="space-y-2">
              <legend className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-leaf">{title}</legend>
              {keys.map(([k, label]) => (
                <label key={k} className="flex items-center gap-3 text-sm">
                  <input type="checkbox" className="h-5 w-5 accent-[#20492F]" checked={inc[k]} onChange={(e) => setInc({ ...inc, [k]: e.target.checked })} />
                  {label}
                </label>
              ))}
            </fieldset>
          ))}
          <p className="text-xs text-muted">
            {rec.visits.length} {rec.visits.length === 1 ? "visit" : "visits"} · {rec.totalDays} days together · {rec.timeline.length} milestones · {keptMemories.length} memories · {rec.docs.length} documents
            {excluded.size > 0 && <> · {excluded.size} left out <button type="button" className="font-semibold text-leaf underline" onClick={() => setExcluded(new Set())}>put all back</button></>}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button busy={busy === "docx"} onClick={() => void download()}><FileDown size={16} aria-hidden="true" /> Download Word document</Button>
            <Button variant="outline" onClick={() => window.print()}><Printer size={16} aria-hidden="true" /> Print / Save as PDF</Button>
          </div>
        </Card>

        {consentReady && partner && (
          <Card className="space-y-2 !p-5 text-sm">
            <h2 className="text-lg">Written words</h2>
            <p className="text-muted">Each of you decides whether your own written words (ritual answers, mission notes, letters) can appear in the other's export. Private messages never do unless you choose to include them.</p>
            <label className="flex items-center gap-3">
              <input type="checkbox" className="h-5 w-5 accent-[#20492F]" checked={iAllow}
                onChange={async (e) => { const on = e.target.checked; try { await setExportMyWords(on); setConsent({ ...consent, [myId!]: on }); } catch (err) { setError(friendlyError(err)); } }} />
              Let my written words appear in {partner.display_name}'s export
            </label>
            <p className="text-xs text-muted">{partnerAllowed ? `${partner.display_name} allows their words in your export.` : `${partner.display_name}'s written words are left out until they switch this on in their app.`}</p>
          </Card>
        )}

        {inc.overview && (
          <Card className="space-y-2 !p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg">Overview</h2>
              {overview !== null && <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-leaf" onClick={() => setOverview(null)}><RotateCcw size={12} aria-hidden="true" /> Rewrite from the app</button>}
            </div>
            <textarea aria-label="Overview" rows={5} maxLength={2000} className={inputCls} value={overviewShown} onChange={(e) => setOverview(e.target.value)} />
            <p className="text-xs text-muted">Written from what's in the app. Edit it as you like — it stays on this phone and isn't saved.</p>
          </Card>
        )}

        <Card className="space-y-2 !p-5 text-sm">
          <h2 className="text-lg">Saving it to Google Drive</h2>
          <ol className="list-decimal space-y-1 pl-5 text-muted">
            <li>Tap <strong className="text-leaf">Download Word document</strong>.</li>
            <li>Open the Google Drive app → <strong className="text-leaf">+</strong> → <strong className="text-leaf">Upload</strong> → choose the file (it's in Downloads / Files).</li>
            <li>It opens in Google Docs. For a PDF instead, use <strong className="text-leaf">Print / Save as PDF</strong>.</li>
          </ol>
          <p className="text-xs text-muted">
            This is a personal record, not an official immigration document, and it doesn't guarantee any outcome. Keep it alongside independent evidence — flight tickets,
            boarding passes, passport entry and exit stamps, accommodation records, a marriage certificate when you have one — and check what the Swedish Migration Agency
            asks for when you apply, as requirements can change.
          </p>
        </Card>
        <h2 className="text-2xl">Preview</h2>
        <p className="-mt-3 text-xs text-muted">Tap <EyeOff size={11} className="inline" aria-hidden="true" /> to leave something out of this export, or <Pencil size={11} className="inline" aria-hidden="true" /> to change it in the app.</p>
      </div>

      {/* The printable document */}
      <article className="print-doc space-y-7 rounded-[20px] bg-white p-6 text-[15px] leading-relaxed text-black shadow-card">
        <header className="space-y-1 border-b border-black/20 pb-5">
          <p className="text-xs uppercase tracking-[0.2em] text-black/60">Personal relationship record</p>
          <h1 className="font-display text-3xl">{people.map((p) => p.display_name).join(" & ")}</h1>
          {people.map((p) => (
            <p key={p.id} className="text-sm">
              <strong>{p.display_name}</strong> — lives in {[p.current_city, p.current_country].filter(Boolean).join(", ") || "—"}{p.home_country ? ` · from ${p.home_country}` : ""}
            </p>
          ))}
          {startLine && <p className="text-sm">Relationship began: {startLine}</p>}
          <p className="text-sm">Reporting period: {from ? fmtDate(from) : "—"} to {fmtDate(to)}</p>
          <p className="text-xs text-black/60">Compiled {fmtDate(today)} with Our Little Ritual from information recorded by both of us. Not an official document.</p>
        </header>

        {inc.overview && overviewShown.trim() && (
          <section className="space-y-2">
            <h2 className="font-display text-xl">{num()}. {SECTION_TITLES.overview}</h2>
            <p className="whitespace-pre-wrap">{overviewShown}</p>
            <SourceKey />
          </section>
        )}

        {sections.timeline && (
          <section className="space-y-2">
            <h2 className="font-display text-xl">{num()}. {SECTION_TITLES.timeline}</h2>
            <RowTable rows={rec.timeline} out={out} toggle={toggle} />
            {rec.plans.length > 0 && (<>
              <h3 className="pt-2 font-display text-lg">Plans for the future</h3>
              <RowTable rows={rec.plans} out={out} toggle={toggle} />
            </>)}
          </section>
        )}

        {sections.visits && (
          <section className="space-y-2">
            <h2 className="font-display text-xl">{num()}. {SECTION_TITLES.visits}</h2>
            <VisitTable rows={rec.visits} out={out} toggle={toggle} />
            <p className="text-sm"><strong>Total: {rec.totalDays} {rec.totalDays === 1 ? "day" : "days"} together</strong>{Object.keys(rec.byKind).length > 1 ? ` (${Object.entries(rec.byKind).map(([k, d]) => `${k}: ${d}`).join(" · ")})` : ""}</p>
            <p className="text-xs text-black/60">Days include the first and last day. A day that appears in more than one entry is counted once. Holidays and visits are not living together; only entries marked “Living together” are.</p>
          </section>
        )}

        {sections.family && (
          <section className="space-y-2">
            <h2 className="font-display text-xl">{num()}. {SECTION_TITLES.family}</h2>
            <RowTable rows={rec.family} out={out} toggle={toggle} />
          </section>
        )}

        {sections.summary && (
          <section className="space-y-2">
            <h2 className="font-display text-xl">{num()}. {SECTION_TITLES.summary}</h2>
            <div className="-mx-2 overflow-x-auto px-2">
              <table className="w-full min-w-[620px] border-collapse text-sm">
                <thead><tr className="border-b border-black/30 text-left align-bottom">
                  <th className="py-1 pr-2">Month</th><th className="py-1 pr-2">Communication & connection</th><th className="py-1 pr-2">Activities together</th>
                  <th className="py-1 pr-2">Letters exchanged</th><th className="py-1 pr-2">Shared experiences & discoveries</th><th className="py-1">Time together</th>
                </tr></thead>
                <tbody>{rec.months.map((r) => (
                  <tr key={r.month} className="border-b border-black/10 align-top">
                    <td className="py-1 pr-2 whitespace-nowrap">{fmtPrecise(r.month, "month")}</td><td className="py-1 pr-2">{r.communication || "—"}</td><td className="py-1 pr-2">{r.activities || "—"}</td>
                    <td className="py-1 pr-2">{r.letters || "—"}</td><td className="py-1 pr-2">{r.experiences || "—"}</td><td className="py-1">{r.together || "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <p className="text-xs text-black/60">{SUMMARY_NOTE}</p>
          </section>
        )}

        {sections.memories && (
          <section className="space-y-5">
            <h2 className="font-display text-xl">{num()}. {SECTION_TITLES.memories}</h2>
            {memories.map((m) => <PrintMemory key={memKey(m)} m={m} photos={inc.photos} nameOf={nameOf} photoSource={photoSource} left={out(memKey(m))} onToggle={() => toggle(memKey(m))} />)}
            {soundtrack.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-display text-lg">Our Soundtrack</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {soundtrack.map((x) => <li key={x.source + x.id}>{fmtDate(x.on)} — {x.title}{x.artist ? ` · ${x.artist}` : ""} (shared by {nameOf(x.by)}){x.note ? ` — “${x.note}”` : ""}</li>)}
                </ul>
              </div>
            )}
          </section>
        )}

        {sections.docs && (
          <section className="space-y-2">
            <h2 className="font-display text-xl">{num()}. {SECTION_TITLES.docs}</h2>
            <div className="-mx-2 overflow-x-auto px-2">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead><tr className="border-b border-black/30 text-left"><th className="py-1 pr-2">#</th><th className="py-1 pr-2">Document</th><th className="py-1 pr-2">Type</th><th className="py-1 pr-2">Attached to</th><th className="py-1">Added by</th></tr></thead>
                <tbody>{rec.docs.map((d) => (
                  <tr key={d.key} className="border-b border-black/10 align-top"><td className="py-1 pr-2">{d.n}</td><td className="py-1 pr-2">{d.name}</td><td className="py-1 pr-2">{d.type}</td><td className="py-1 pr-2">{d.attachedTo}</td><td className="py-1">{d.added}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <p className="text-xs text-black/60">These files are stored privately in the app. The app doesn't check them; the originals are the evidence.</p>
          </section>
        )}

        {inc.declaration && (
          <section className="break-inside-avoid space-y-3">
            <h2 className="font-display text-xl">{num()}. {SECTION_TITLES.declaration}</h2>
            <p className="text-sm">{DECLARATION(people.map((p) => p.display_name))}</p>
            <div className="grid grid-cols-2 gap-6 pt-6 text-sm">
              {people.map((p) => (
                <div key={p.id}><div className="h-10 border-b border-black/50" /><p className="mt-1">{p.display_name}</p><p className="text-xs text-black/60">Date: ____________</p></div>
              ))}
            </div>
          </section>
        )}
        {!sections.timeline && !sections.visits && !sections.summary && !sections.memories && <p>Nothing in this date range yet.</p>}
      </article>
    </div>
  );
}

const SUMMARY_NOTE = "A record of how we kept in touch, not a measure of our relationship. Each thing is counted once: weekly rituals and check-ins when both of us took part; call activities as days (several on one day count as one); missions only when both of us took part; the same song shared twice counts once. Time together comes from the visits above.";

function SourceKey() {
  const keys: Source[] = ["app", "entered", "photo", "manual_photo", "document"];
  return (
    <div className="rounded border border-black/15 p-3 text-xs">
      <p className="mb-1 font-semibold">How to read the source labels</p>
      <ul className="space-y-0.5">{keys.map((k) => <li key={k}><strong>{SOURCE_LABEL[k]}:</strong> {SOURCE_EXPLAIN[k]}</li>)}</ul>
    </div>
  );
}

function LeaveOut({ left, onToggle, edit }: { left: boolean; onToggle: () => void; edit?: string }) {
  return (
    <span className="no-print ml-1 inline-flex gap-0.5 align-middle">
      <button type="button" onClick={onToggle} aria-label={left ? "Put back" : "Leave out"} title={left ? "Put back" : "Leave out"}
        className="grid h-6 w-6 place-items-center rounded-full text-black/50 hover:bg-black/5">{left ? <RotateCcw size={12} /> : <EyeOff size={12} />}</button>
      {edit && <Link to={edit} aria-label="Change in the app" title="Change in the app" className="grid h-6 w-6 place-items-center rounded-full text-black/50 hover:bg-black/5"><Pencil size={12} /></Link>}
    </span>
  );
}

function RowTable({ rows, out, toggle }: { rows: Row[]; out: (k: string) => boolean; toggle: (k: string) => void }) {
  return (
    <div className="-mx-2 overflow-x-auto px-2">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead><tr className="border-b border-black/30 text-left"><th className="py-1 pr-2">Date</th><th className="py-1 pr-2">What</th><th className="py-1">Source</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.key} className={`border-b border-black/10 align-top ${out(r.key) ? "no-print opacity-35" : ""}`}>
            <td className="py-1 pr-2 whitespace-nowrap">{r.date}</td>
            <td className="py-1 pr-2"><strong>{r.title}</strong>{r.details && <span className="block text-black/70">{r.details}</span>}</td>
            <td className="py-1 text-xs text-black/60">{r.source}<LeaveOut left={out(r.key)} onToggle={() => toggle(r.key)} edit={r.edit} /></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function VisitTable({ rows, out, toggle }: { rows: VisitRow[]; out: (k: string) => boolean; toggle: (k: string) => void }) {
  return (
    <div className="-mx-2 overflow-x-auto px-2">
      <table className="w-full min-w-[620px] border-collapse text-sm">
        <thead><tr className="border-b border-black/30 text-left"><th className="py-1 pr-2">Dates</th><th className="py-1 pr-2">Occasion & place</th><th className="py-1 pr-2">Kind</th><th className="py-1 pr-2">Who travelled</th><th className="py-1 pr-2">Days</th><th className="py-1">Source</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.key} className={`border-b border-black/10 align-top ${out(r.key) ? "no-print opacity-35" : ""}`}>
            <td className="py-1 pr-2">{r.date}</td>
            <td className="py-1 pr-2"><strong>{r.title}</strong>{r.details && <span className="block text-black/70">{r.details}</span>}</td>
            <td className="py-1 pr-2">{r.kind}</td><td className="py-1 pr-2">{r.travelled}</td><td className="py-1 pr-2">{r.days}</td>
            <td className="py-1 text-xs text-black/60">{r.source}<LeaveOut left={out(r.key)} onToggle={() => toggle(r.key)} edit={r.edit} /></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function kindLabel(m: Memory) {
  if (m.kind === "ritual" && m.category) return `Weekly ritual · ${CATEGORY[m.category]?.label ?? ""}`;
  if (m.kind === "letter" && m.letter_kind) return LETTER_KIND[m.letter_kind as LetterKind]?.label ?? "Letter";
  return KIND_LABEL[m.kind];
}
const memorySource = (m: Memory) => (m.kind === "moment" ? SOURCE_LABEL.entered : SOURCE_LABEL.app);
function photoCaption(taken_at: string | null | undefined, src: PhotoSource | undefined) {
  if (!taken_at) return "Photo — date not known";
  return `Photo taken ${fmtDate(taken_at.slice(0, 10))} · ${src === "manual" ? "date set by hand" : "date from photo data"}`;
}

function PrintMemory({ m, photos, nameOf, photoSource, left, onToggle }: {
  m: Memory; photos: boolean; nameOf: (id: string | null | undefined) => string; photoSource: Record<string, PhotoSource>; left: boolean; onToggle: () => void;
}) {
  return (
    <div className={`break-inside-avoid border-t border-black/10 pt-3 ${left ? "no-print opacity-35" : ""}`}>
      <p className="text-xs uppercase tracking-wide text-black/60">
        {kindLabel(m)} · {memoryDate(m)}{m.place ? ` · ${m.place}` : ""} · {memorySource(m)}
        <LeaveOut left={left} onToggle={onToggle} edit={m.kind === "moment" ? `/us/moment/${m.ref_id}` : undefined} />
      </p>
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
          {imagesOf(m).map((img) => <PrintPhoto key={img.path} {...img} caption={m.kind === "moment" ? photoCaption(img.taken_at, photoSource[img.path]) : img.taken_at ? `Photo taken ${fmtDate(img.taken_at.slice(0, 10))}` : ""} />)}
        </div>
      )}
    </div>
  );
}

function PrintPhoto({ bucket, path, caption }: { bucket: string; path: string; caption: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { void signedUrl(bucket, path).then(setUrl); }, [bucket, path]);
  return (
    <figure className="break-inside-avoid">
      {url ? <img src={url} alt="" className="w-full rounded object-contain" /> : <div className="h-32 bg-black/5" />}
      {caption && <figcaption className="text-xs italic text-black/60">{caption}</figcaption>}
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

type Rec = ReturnType<typeof buildRecord>;
async function buildDocx(x: {
  inc: Include; rec: Rec; people: Person[]; from: string; to: string; startLine: string | null; overview: string;
  memories: Memory[]; soundtrack: SoundtrackItem[]; nameOf: (id: string | null | undefined) => string; photoSource: Record<string, PhotoSource>;
  timeline: Row[]; plans: Row[]; visits: VisitRow[]; family: Row[];
}): Promise<Blob> {
  const d = await import("docx");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ImageRun, Footer, AlignmentType, PageNumber, PageBreak } = d;
  const GREY = "555555";
  const P = (text: string, opts: { bold?: boolean; size?: number; italics?: boolean; color?: string } = {}) =>
    new Paragraph({ children: [new TextRun({ text, ...opts })], spacing: { after: 100 } });
  const cell = (text: string, bold = false) => new TableCell({ children: text.split("\n").map((t, i) => new Paragraph({ children: [new TextRun({ text: t, bold: bold || undefined, size: i ? 18 : 20, color: i ? GREY : undefined })] })) });
  const table = (head: string[], rows: string[][]) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: head.map((h) => cell(h, true)), tableHeader: true }), ...rows.map((r) => new TableRow({ children: r.map((c) => cell(c)), cantSplit: true }))],
  });
  const H1 = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 } });
  const H2 = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } });
  const note = (text: string) => P(text, { italics: true, size: 18, color: GREY });
  let n = 0;
  const num = (t: string) => `${++n}. ${t}`;
  const names = x.people.map((p) => p.display_name);

  type Block = InstanceType<typeof Paragraph> | InstanceType<typeof Table>;
  const children: Block[] = [
    P("PERSONAL RELATIONSHIP RECORD", { size: 18, color: GREY }),
    new Paragraph({ text: names.join(" & "), heading: HeadingLevel.TITLE }),
    ...x.people.map((p) => P(`${p.display_name} — lives in ${[p.current_city, p.current_country].filter(Boolean).join(", ") || "—"}${p.home_country ? ` · from ${p.home_country}` : ""}`)),
    ...(x.startLine ? [P(`Relationship began: ${x.startLine}`)] : []),
    P(`Reporting period: ${x.from ? fmtDate(x.from) : "—"} to ${fmtDate(x.to)}`),
    note(`Compiled ${fmtDate(new Date().toISOString().slice(0, 10))} with Our Little Ritual from information recorded by both of us. Not an official document.`),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  if (x.inc.overview && x.overview.trim()) {
    children.push(H1(num(SECTION_TITLES.overview)));
    for (const para of x.overview.split(/\n+/)) children.push(P(para));
    children.push(P("How to read the source labels", { bold: true, size: 18 }));
    for (const k of ["app", "entered", "photo", "manual_photo", "document"] as Source[]) children.push(P(`${SOURCE_LABEL[k]}: ${SOURCE_EXPLAIN[k]}`, { size: 18, color: GREY }));
  }
  const rowTable = (rows: Row[]) => table(["Date", "What", "Source"], rows.map((r) => [r.date, r.details ? `${r.title}\n${r.details}` : r.title, r.source]));
  if (x.inc.timeline && (x.timeline.length || x.plans.length)) {
    children.push(H1(num(SECTION_TITLES.timeline)));
    if (x.timeline.length) children.push(rowTable(x.timeline));
    if (x.plans.length) { children.push(H2("Plans for the future")); children.push(rowTable(x.plans)); }
  }
  if (x.inc.visits && x.visits.length) {
    children.push(H1(num(SECTION_TITLES.visits)));
    children.push(table(["Dates", "Occasion & place", "Kind", "Who travelled", "Days", "Source"],
      x.visits.map((r) => [r.date, r.details ? `${r.title}\n${r.details}` : r.title, r.kind, r.travelled, String(r.days), r.source])));
    const kinds = Object.entries(x.rec.byKind);
    children.push(P(`Total: ${x.rec.totalDays} ${x.rec.totalDays === 1 ? "day" : "days"} together${kinds.length > 1 ? ` (${kinds.map(([k, v]) => `${k}: ${v}`).join(" · ")})` : ""}`, { bold: true }));
    children.push(note("Days include the first and last day. A day that appears in more than one entry is counted once. Holidays and visits are not living together; only entries marked “Living together” are."));
  }
  if (x.inc.family && x.family.length) {
    children.push(H1(num(SECTION_TITLES.family)));
    children.push(rowTable(x.family));
  }
  if (x.inc.summary && x.rec.months.length) {
    children.push(H1(num(SECTION_TITLES.summary)));
    children.push(table(["Month", "Communication & connection", "Activities together", "Letters exchanged", "Shared experiences & discoveries", "Time together"],
      x.rec.months.map((r) => [fmtPrecise(r.month, "month"), r.communication || "—", r.activities || "—", r.letters || "—", r.experiences || "—", r.together || "—"])));
    children.push(note(SUMMARY_NOTE));
  }
  if (x.memories.length || x.soundtrack.length) {
    children.push(H1(num(SECTION_TITLES.memories)));
    for (const m of x.memories) {
      children.push(P(`${kindLabel(m)} · ${memoryDate(m)}${m.place ? ` · ${m.place}` : ""} · ${memorySource(m)}`, { size: 18, color: GREY }));
      children.push(H2(m.title));
      if (m.caption) children.push(P(m.caption));
      for (const p of m.parts ?? []) {
        const lines = [...(p.answers ?? []).filter((a) => a.answer).map((a) => `${a.prompt}: ${a.answer}`), ...(p.body ? [p.body] : [])];
        if (!lines.length) continue;
        children.push(P(`${x.nameOf(p.user_id)}${m.kind === "letter" ? " wrote" : ""}:`, { bold: true }));
        for (const l of lines) children.push(P(l));
      }
      if (x.inc.photos) {
        for (const img of imagesOf(m)) {
          const data = await imageForDocx(img.bucket, img.path).catch(() => null);
          if (!data) continue;
          children.push(new Paragraph({ children: [new ImageRun({ data: data.data, type: data.type, transformation: { width: data.width, height: data.height } })], keepNext: true }));
          const cap = m.kind === "moment" ? photoCaption(img.taken_at, x.photoSource[img.path]) : img.taken_at ? `Photo taken ${fmtDate(img.taken_at.slice(0, 10))}` : "";
          if (cap) children.push(P(cap, { italics: true, size: 18, color: GREY }));
        }
      }
    }
    if (x.soundtrack.length) {
      children.push(H2("Our Soundtrack"));
      children.push(table(["Date", "Song", "Artist", "Shared by"], x.soundtrack.map((s) => [fmtDate(s.on), s.title, s.artist || "—", x.nameOf(s.by)])));
    }
  }
  if (x.inc.documents && x.rec.docs.length) {
    children.push(H1(num(SECTION_TITLES.docs)));
    children.push(table(["#", "Document", "Type", "Attached to", "Added by"], x.rec.docs.map((r) => [String(r.n), r.name, r.type, r.attachedTo, r.added])));
    children.push(note("These files are stored privately in the app. The app doesn't check them; the originals are the evidence."));
  }
  if (x.inc.declaration) {
    children.push(H1(num(SECTION_TITLES.declaration)));
    children.push(P(DECLARATION(names)));
    for (const name of names) {
      children.push(P(" "));
      children.push(P("______________________________"));
      children.push(P(`${name}        Date: ____________`, { size: 20 }));
    }
  }

  const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
    new TextRun({ text: `${names.join(" & ")} — relationship record · page `, size: 16, color: GREY }),
    new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY }),
    new TextRun({ text: " of ", size: 16, color: GREY }),
    new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: GREY }),
  ] })] });
  const doc = new Document({ creator: "Our Little Ritual", title: "Relationship record", sections: [{ footers: { default: footer }, children }] });
  return Packer.toBlob(doc);
}
