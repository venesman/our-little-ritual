import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Lock, Music2, Plane, Printer, Sparkles } from "lucide-react";
import { usePeople } from "../hooks/usePeople";
import { getKeepsake, keepsakeYears, statTiles, writeKeepsakeNote, type Keepsake as K } from "../lib/keepsake";
import { BUCKET, signedUrl } from "../lib/scrapbook";
import { TAG_LABEL } from "../lib/story";
import { STAY_LABEL } from "../lib/visits";
import { fmtPrecise } from "../lib/record";
import { dateRange } from "../lib/exportRecord";
import { friendlyError } from "../lib/errors";
import { Button, Card, ErrorNote, Spinner, inputCls } from "../components/ui";

/**
 * Yearly keepsake — "Our year together". Read-only, built from the app,
 * plus a note from each of you (your partner's stays sealed until you've
 * written yours). Save it as a PDF with Print.
 */
export function Keepsake() {
  const { year: yParam } = useParams();
  const nav = useNavigate();
  const { me, partner } = usePeople();
  const [years, setYears] = useState<number[] | null | undefined>(undefined);
  const [k, setK] = useState<K | null>(null);
  const [error, setError] = useState<string | null>(null);
  const year = yParam ? Number(yParam) : years?.[0];

  useEffect(() => { void keepsakeYears().then(setYears); }, []);
  const load = useCallback(() => {
    if (!year) return;
    setK(null); setError(null);
    getKeepsake(year).then(setK).catch((e) => setError(friendlyError(e)));
  }, [year]);
  useEffect(() => { load(); }, [load]);

  if (years === undefined) return <Spinner label="Opening your year" />;
  if (years === null) return (
    <div className="fade-up space-y-4">
      <Back />
      <Card><p className="text-sm">The yearly keepsake needs a small database update (<code>0030_yearly_keepsake.sql</code>). Once it's run, your years appear here.</p></Card>
    </div>
  );

  const names = [me?.display_name, partner?.display_name].filter(Boolean).join(" & ");
  const current = new Date().getFullYear();

  return (
    <div className="fade-up space-y-5">
      <div className="no-print space-y-3">
        <Back />
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Year">
          {years.map((y) => (
            <button key={y} role="tab" aria-selected={y === year} onClick={() => nav(`/us/keepsake/${y}`)}
              className={`rounded-full border-2 px-3 py-1 text-sm font-semibold ${y === year ? "border-leaf bg-mustard text-leaf" : "border-leaf/15 text-muted"}`}>{y}</button>
          ))}
        </div>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {!k ? (!error && <Spinner label="Opening your year" />) : (
        <article className="print-doc space-y-5">
          {/* cover */}
          <section className="break-inside-avoid rounded-card bg-peach px-6 py-10 text-center shadow-card">
            <p className="font-hand text-3xl font-bold text-raspberry-deep">our year together</p>
            <h1 className="font-display text-7xl italic">{k.year}</h1>
            <p className="mt-2 text-sm text-muted">{names}{k.year === current ? " · so far" : ""}</p>
            {k.days_together > 0 && (
              <p className="mt-6 font-display text-2xl">{k.days_together} {k.days_together === 1 ? "day" : "days"} side by side</p>
            )}
            {k.countries.length > 0 && <p className="mt-1 text-sm text-muted">in {k.countries.join(" · ")}</p>}
          </section>

          {k.visits.length > 0 && (
            <Section hand="where we met" title="Time together">
              <ul className="space-y-3">
                {k.visits.map((v, i) => (
                  <li key={i} className="flex gap-3">
                    <Plane size={16} className="mt-1 shrink-0 text-tomato" aria-hidden="true" />
                    <div>
                      <p className="font-semibold">{v.title}</p>
                      <p className="text-xs text-muted">{dateRange(v.from, v.until)} · {[v.city, v.country].filter(Boolean).join(", ") || v.place} · {STAY_LABEL[v.stay_type] ?? "Visit"}{v.with_family ? " · with family" : ""}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {(k.milestones.length > 0 || k.firsts.length > 0) && (
            <Section hand="the big little things" title="Milestones & firsts">
              <ul className="space-y-2">
                {[...k.milestones.map((m) => ({ on: m.on, title: m.title, sub: `${fmtPrecise(m.on, m.precision)}${m.tag && TAG_LABEL[m.tag] !== m.title ? ` · ${TAG_LABEL[m.tag]}` : ""}` })),
                  ...k.firsts.map((f) => ({ on: f.on, title: f.title, sub: fmtPrecise(f.on) }))]
                  .sort((a, b) => a.on.localeCompare(b.on))
                  .map((x, i) => (
                    <li key={i} className="flex gap-3"><Sparkles size={15} className="mt-1 shrink-0 text-raspberry-deep" aria-hidden="true" />
                      <div><p className="font-semibold">{x.title}</p><p className="text-xs text-muted">{x.sub}</p></div></li>
                  ))}
              </ul>
            </Section>
          )}

          {k.photos.length > 0 && (
            <Section hand="snapshots" title="Our year in photos">
              <div className="grid grid-cols-3 gap-1.5">
                {k.photos.map((p) => <Photo key={p.path} path={p.path} title={p.title} />)}
              </div>
            </Section>
          )}

          {statTiles(k.stats).length > 0 && (
            <Section hand="across the miles" title="Staying close">
              <div className="grid grid-cols-2 gap-2">
                {statTiles(k.stats).map((t) => (
                  <div key={t.label} className="rounded-2xl bg-cream px-3 py-3">
                    <p className="font-display text-3xl text-leaf">{t.n}</p>
                    <p className="text-xs text-muted">{t.label}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">Just a look back, counted once each — not a score.</p>
            </Section>
          )}

          {k.songs.length > 0 && (
            <Section hand="on repeat" title="Soundtrack of the year">
              <ul className="space-y-1.5">
                {k.songs.map((s, i) => (
                  <li key={i}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm">
                      <Music2 size={14} className="shrink-0 text-leaf" aria-hidden="true" />
                      <span className="font-semibold">{s.title}</span>{s.artist && <span className="text-muted">· {s.artist}</span>}
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Notes k={k} partnerName={partner?.display_name ?? "your partner"} onSaved={load} />

          {k.visits.length + k.milestones.length + k.photos.length + statTiles(k.stats).length === 0 && (
            <Card><p className="text-sm text-muted">Not much recorded for {k.year} yet. Add past visits or milestones and they'll show up here.</p></Card>
          )}

          <div className="no-print flex justify-center pb-4">
            <Button variant="outline" onClick={() => window.print()}><Printer size={16} aria-hidden="true" /> Save as PDF</Button>
          </div>
        </article>
      )}
    </div>
  );
}

function Back() {
  return <Link to="/us" className="inline-flex items-center gap-1.5 text-sm font-semibold text-leaf"><ArrowLeft size={15} aria-hidden="true" /> Scrapbook</Link>;
}

function Section({ hand, title, children }: { hand: string; title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid rounded-card bg-paper p-5 shadow-card">
      <p className="font-hand text-xl text-raspberry-deep">{hand}</p>
      <h2 className="mb-3 text-2xl">{title}</h2>
      {children}
    </section>
  );
}

function Photo({ path, title }: { path: string; title: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { void signedUrl(BUCKET.moment, path).then(setUrl); }, [path]);
  return url ? <img src={url} alt={title} className="aspect-square w-full rounded-lg object-cover" /> : <div className="aspect-square animate-pulse rounded-lg bg-leaf-soft" />;
}

function Notes({ k, partnerName, onSaved }: { k: K; partnerName: string; onSaved: () => void }) {
  const [draft, setDraft] = useState<string | null>(k.note_mine ? null : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (draft === null) return;
    setBusy(true); setError(null);
    try { await writeKeepsakeNote(k.year, draft); setDraft(null); onSaved(); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };
  return (
    <Section hand="in our own words" title={`A note about ${k.year}`}>
      <div className="space-y-4">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-muted">You</p>
          {draft !== null ? (
            <div className="no-print space-y-2">
              <textarea aria-label={`Your note about ${k.year}`} rows={4} maxLength={1500} className={inputCls} value={draft}
                placeholder="A moment you loved, something you learned about us, a hope for next year…" onChange={(e) => setDraft(e.target.value)} />
              <div className="flex gap-2">
                <Button busy={busy} onClick={() => void save()} disabled={!draft.trim()}>Save my note</Button>
                {k.note_mine && <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>}
              </div>
              {!k.note_mine && <p className="text-xs text-muted">{k.partner_wrote ? `${partnerName} has written theirs — it opens when you save yours.` : `${partnerName} can't see it until they've written theirs too.`}</p>}
              <ErrorNote>{error}</ErrorNote>
            </div>
          ) : (
            <div>
              <p className="whitespace-pre-wrap font-hand text-xl leading-snug">{k.note_mine}</p>
              <button type="button" className="no-print mt-1 text-xs font-semibold text-leaf" onClick={() => setDraft(k.note_mine ?? "")}>Edit</button>
            </div>
          )}
        </div>
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-muted">{partnerName}</p>
          {k.note_partner ? <p className="whitespace-pre-wrap font-hand text-xl leading-snug">{k.note_partner}</p>
            : k.partner_wrote ? <p className="flex items-center gap-1.5 text-sm text-muted"><Lock size={13} aria-hidden="true" /> Sealed — write yours to open it.</p>
            : <p className="text-sm text-muted">Not written yet.</p>}
        </div>
      </div>
    </Section>
  );
}
