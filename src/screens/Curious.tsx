import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeftRight, Bookmark, BookmarkCheck, BookOpen, CircleCheck, Dices, Link2, Mic, NotebookPen, Pause, Play as PlayIcon,
  Plus, RotateCcw, Search, Shuffle, SkipForward, Sparkles, Trash2, X,
} from "lucide-react";
import { useCuriousSession } from "../hooks/useCuriousSession";
import { usePeople } from "../hooks/usePeople";
import {
  addCuriousDiscovery, AREA, AREAS, coupleCountries, curiousAdvance, curiousSetup, curiousSwapOrder, curiousTimer, deleteCuriousDiscovery,
  DISCUSSION, endCurious, FORMAT, FORMATS, listCuriousFavourites, listCuriousHistory, listTopics, saveCuriousNote, SHORT_AREA, startCurious,
  supports, talkSegments, toggleCuriousFavourite, topicVisible, VERDICT_LABEL,
  type CuriousFilters, type CuriousState, type Difficulty, type Format, type Note, type PastCurious, type Topic, type Verdict,
} from "../lib/curious";
import { formatClock, secondsLeft } from "../lib/play";
import { personalise } from "../lib/tokens";
import { friendlyError } from "../lib/errors";
import { Button, Card, ErrorNote, Field, Spinner, Ticket, inputCls } from "../components/ui";
import { JustUsChip } from "./Play";

const DIFFICULTIES: Difficulty[] = ["beginner", "intermediate", "advanced"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const chip = (on: boolean) =>
  `rounded-full border-2 px-3 py-1 text-sm font-semibold transition ${on ? "border-leaf bg-mustard text-leaf" : "border-leaf/15 text-muted hover:border-leaf/40"}`;

/* ==================================================================== tab */

export function CuriousTab() {
  const { state, loading, error, skewMs, apply, setError } = useCuriousSession();
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback(async (label: string, fn: () => Promise<CuriousState | null | void>) => {
    setBusy(label); setError(null);
    try { const s = await fn(); if (s !== undefined) apply(s); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  }, [apply, setError]);

  if (loading) return <Spinner label="Opening the notebook" />;

  return (
    <div className="space-y-5">
      <ErrorNote>{error}</ErrorNote>
      {!state ? <Lobby busy={busy} run={run} />
        : state.stage === "setup" ? <SetupView s={state} busy={busy} run={run} />
        : state.stage === "research" ? <ResearchView s={state} skewMs={skewMs} busy={busy} run={run} />
        : state.stage === "present" ? <PresentView s={state} skewMs={skewMs} busy={busy} run={run} />
        : <DiscussView s={state} busy={busy} run={run} />}
      {state && (
        <div className="border-t border-dashed border-leaf/25 pt-4">
          <Button variant="ghost" busy={busy === "end"} onClick={() => run("end", async () => { await endCurious(state.session_id); return null; })}>
            <X size={15} aria-hidden="true" /> {state.stage === "setup" ? "Not now" : "End & save to history"}
          </Button>
          <p className="mt-1 text-xs text-muted">Either of you can end it — the other phone follows.</p>
        </div>
      )}
    </div>
  );
}

type Run = (label: string, fn: () => Promise<CuriousState | null | void>) => Promise<void>;

/* ================================================================== lobby */

function Lobby({ busy, run }: { busy: string | null; run: Run }) {
  const { me, partner } = usePeople();
  const [filters, setFilters] = useState<CuriousFilters>({});
  const [browse, setBrowse] = useState<Topic[] | null>(null);
  const [query, setQuery] = useState("");
  const countries = useMemo(() => coupleCountries(me, partner), [me, partner]);

  const openBrowse = async () => {
    if (browse) { setBrowse(null); return; }
    try { setBrowse(await listTopics()); } catch { setBrowse([]); }
  };
  const shown = (browse ?? []).filter((t) =>
    topicVisible(t, !!filters.just_us, countries)
    && (!filters.area || t.area === filters.area)
    && (!filters.difficulty || t.difficulty === filters.difficulty)
    && (!filters.format || supports(t, filters.format))
    && (!query.trim() || `${t.title} ${t.intro_question}`.toLowerCase().includes(query.trim().toLowerCase())));

  return (
    <div className="space-y-5">
      <Card className="notebook relative overflow-hidden">
        <p className="font-hand text-xl text-raspberry-deep">two curious minds · one little topic · two perspectives</p>
        <h2 className="mt-1 text-3xl">The Curious Club</h2>
        <p className="mt-2 text-sm text-muted">
          A mini research date: get a topic, look it up on your own for a few minutes, then each present your findings for a minute and talk it through.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button busy={busy === "start"} onClick={() => run("start", () => startCurious(filters))}><Dices size={16} aria-hidden="true" /> Pick a topic for us</Button>
          <JustUsChip on={!!filters.just_us} onChange={(v) => setFilters({ ...filters, just_us: v || undefined })} />
        </div>
      </Card>

      <section className="space-y-3" aria-label="Filters">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {AREAS.map((a) => (
            <button key={a} type="button" aria-pressed={filters.area === a} onClick={() => setFilters({ ...filters, area: filters.area === a ? undefined : a })} className={`${chip(filters.area === a)} shrink-0`}>
              {SHORT_AREA[a]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DIFFICULTIES.map((d) => (
            <button key={d} type="button" aria-pressed={filters.difficulty === d} onClick={() => setFilters({ ...filters, difficulty: filters.difficulty === d ? undefined : d })} className={chip(filters.difficulty === d)}>{cap(d)}</button>
          ))}
        </div>
        <Field label="Format (optional)" htmlFor="cc-format">
          <select id="cc-format" className={inputCls} value={filters.format ?? ""} onChange={(e) => setFilters({ ...filters, format: (e.target.value || undefined) as Format | undefined })}>
            <option value="">Any format</option>
            {FORMATS.map((f) => <option key={f} value={f}>{FORMAT[f].label}</option>)}
          </select>
        </Field>
      </section>

      <section className="space-y-2">
        <button type="button" onClick={() => void openBrowse()} aria-expanded={!!browse} className="inline-flex items-center gap-1.5 text-sm font-semibold text-leaf">
          <BookOpen size={15} aria-hidden="true" /> {browse ? "Hide the topic list" : "Browse all topics"}
        </button>
        {browse && (
          <>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
              <input aria-label="Search topics" className={`${inputCls} pl-9`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search topics" />
            </div>
            <p className="text-xs text-muted">{shown.length} topic{shown.length === 1 ? "" : "s"}</p>
            <TopicList topics={shown} busy={busy} onPick={(t) => run("pick-" + t.id, () => startCurious(filters, t.id))} />
          </>
        )}
      </section>

      <Notebook busy={busy} onPick={(t) => run("pick-" + t.id, () => startCurious({}, t.id))} />
    </div>
  );
}

function TopicList({ topics, busy, onPick }: { topics: Topic[]; busy: string | null; onPick: (t: Topic) => void }) {
  if (topics.length === 0) return <p className="font-hand text-lg text-muted">nothing matches — try fewer filters</p>;
  return (
    <ul className="divide-y divide-dashed divide-leaf/20 rounded-[20px] bg-paper shadow-card">
      {topics.map((t) => {
        const Icon = AREA[t.area].icon;
        return (
          <li key={t.id} className="flex items-center gap-3 px-4 py-3">
            <Icon size={18} className="shrink-0 text-raspberry-deep" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base font-semibold">{t.title}</p>
              <p className="truncate text-xs text-muted">{t.intro_question}</p>
            </div>
            <Button variant="outline" className="!min-h-[36px] !px-3 !py-1 text-xs" busy={busy === "pick-" + t.id} onClick={() => onPick(t)}>Choose</Button>
          </li>
        );
      })}
    </ul>
  );
}

/** Favourites, saved discoveries and past sessions. */
function Notebook({ busy, onPick }: { busy: string | null; onPick: (t: Topic) => void }) {
  const { myId, partner } = usePeople();
  const [favs, setFavs] = useState<Topic[] | null>(null);
  const [history, setHistory] = useState<PastCurious[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    listCuriousFavourites().then(setFavs).catch(() => setFavs([]));
    listCuriousHistory().then(setHistory).catch(() => setHistory([]));
  }, []);
  const who = (uid: string) => (uid === myId ? "You" : partner?.display_name || "Partner");
  const discoveries = (history ?? []).flatMap((h) => h.discoveries.map((d) => ({ ...d, topic: h.topic?.title ?? "" })));

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-2xl">Our favourite topics</h3>
        {favs === null ? <Spinner label="Loading" /> : favs.length === 0
          ? <p className="font-hand text-lg text-muted">tap the bookmark on a topic you'd like to come back to</p>
          : <TopicList topics={favs} busy={busy} onPick={onPick} />}
      </section>

      <section>
        <h3 className="mb-1 text-2xl">Our discoveries</h3>
        <p className="mb-2 text-xs text-muted">Shared between you. They'll move into the Scrapbook when it arrives.</p>
        {history === null ? <Spinner label="Loading" /> : discoveries.length === 0
          ? <p className="font-hand text-lg text-muted">save little discoveries at the end of a session</p>
          : (
            <ul className="space-y-2">
              {discoveries.slice(0, 12).map((d) => (
                <li key={d.id} className="rounded-2xl border border-leaf/15 bg-paper px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{who(d.user_id)} · {d.topic}</p>
                  <p className="mt-0.5">{d.body}</p>
                </li>
              ))}
            </ul>
          )}
      </section>

      <section>
        <h3 className="mb-2 text-2xl">Past research dates</h3>
        {history === null ? <Spinner label="Loading" /> : history.length === 0
          ? <p className="font-hand text-lg text-muted">your research sessions will collect here</p>
          : (
            <ul className="space-y-2">
              {history.map((h) => (
                <li key={h.id} className="postcard !p-4">
                  <button type="button" className="w-full text-left" onClick={() => setOpen(open === h.id ? null : h.id)} aria-expanded={open === h.id}>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-tomato-deep">
                      {new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(h.started_at))} · {FORMAT[h.format].label}
                    </p>
                    <p className="font-display text-lg font-semibold">{h.topic?.title ?? "A topic"}</p>
                    <p className="text-xs text-muted">{h.discoveries.length} discover{h.discoveries.length === 1 ? "y" : "ies"} · {open === h.id ? "hide notes" : "show notes"}</p>
                  </button>
                  {open === h.id && (
                    <div className="mt-3 space-y-2 border-t border-dashed border-leaf/20 pt-3">
                      {h.notes.filter((n) => n.summary || n.links.length).map((n) => (
                        <div key={n.user_id}>
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{who(n.user_id)}</p>
                          {n.summary && <p className="whitespace-pre-wrap text-sm">{n.summary}</p>}
                          <Links links={n.links} />
                        </div>
                      ))}
                      {h.discoveries.map((d) => <p key={d.id} className="text-sm">✦ {d.body}</p>)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}

/* ============================================================ topic card */

function TopicCard({ t, favourite, onFavourite, compact }: { t: Topic; favourite?: boolean; onFavourite?: () => void; compact?: boolean }) {
  const { me, partner } = usePeople();
  const a = AREA[t.area];
  const Icon = a.icon;
  const explore = personalise(t.explore, t.fallback_explore, me, partner);
  return (
    <article className="postcard notebook fade-up" key={t.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            <Ticket tone={a.tone}>{SHORT_AREA[t.area]}</Ticket>
            {(t.just_us || t.countries.length > 0) && <Ticket tone="tomato">Just us</Ticket>}
          </div>
          <h2 className={`mt-3 leading-tight ${compact ? "text-xl" : "text-[1.75rem]"}`}>{t.title}</h2>
          <p className="mt-1.5 font-hand text-xl text-raspberry-deep">{t.intro_question}</p>
        </div>
        <span className="grid h-14 w-14 shrink-0 -rotate-6 place-items-center rounded-sm border-2 border-dashed border-mustard bg-mustard-soft text-mustard-deep" aria-hidden="true">
          <Icon size={22} />
        </span>
      </div>
      {!compact && (
        <>
          <p className="mt-3 leading-relaxed">{explore.text}</p>
          {t.angles.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-leaf">Research angles</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {t.angles.map((x) => <li key={x} className="rounded-full border border-leaf/20 px-3 py-1 text-sm text-muted">{x}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em]">
        <span className="rounded-full bg-leaf-soft px-2.5 py-1 text-leaf">~{t.research_minutes} min research</span>
        <span className="rounded-full bg-mustard-soft px-2.5 py-1 text-mustard-deep">{cap(t.difficulty)}</span>
        {onFavourite && (
          <button type="button" onClick={onFavourite} aria-pressed={favourite} className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${favourite ? "bg-raspberry text-leaf" : "border border-leaf/20 text-muted"}`}>
            {favourite ? <BookmarkCheck size={13} aria-hidden="true" /> : <Bookmark size={13} aria-hidden="true" />}{favourite ? "Saved" : "Save topic"}
          </button>
        )}
      </div>
    </article>
  );
}

/* ================================================================== setup */

function SetupView({ s, busy, run }: { s: CuriousState; busy: string | null; run: Run }) {
  const { me, partner, myId } = usePeople();
  const t = s.topic;
  const set = (patch: Partial<{ format: Format; research: number; present: number; first: string }>) =>
    run("setup", () => curiousSetup(s.session_id, patch.format ?? s.format, patch.research ?? s.research_minutes, patch.present ?? s.present_seconds, patch.first ?? s.first_presenter ?? myId!));

  return (
    <div className="space-y-5">
      <p className="font-hand text-xl text-raspberry-deep">step 1 · your topic</p>
      <TopicCard t={t} favourite={s.favourite} onFavourite={() => run("fav", async () => { await toggleCuriousFavourite(t.id); return undefined; })} />
      <Button variant="outline" busy={busy === "redraw"} onClick={() => run("redraw", () => startCurious(t.just_us || t.countries.length ? { just_us: true } : {}))}>
        <Shuffle size={15} aria-hidden="true" /> Another topic
      </Button>

      <Card className="space-y-4">
        <h3 className="text-xl">How do you want to explore it?</h3>
        <div className="grid gap-2" role="radiogroup" aria-label="Format">
          {FORMATS.map((f) => {
            const ok = supports(t, f);
            return (
              <button key={f} type="button" role="radio" aria-checked={s.format === f} disabled={!ok || busy === "setup"} onClick={() => set({ format: f })}
                className={`rounded-2xl border-2 px-4 py-3 text-left transition disabled:opacity-40 ${s.format === f ? "border-leaf bg-mustard-soft" : "border-leaf/15 hover:border-leaf/40"}`}>
                <span className="block font-display text-base font-semibold">{FORMAT[f].label}</span>
                <span className="block text-xs text-muted">{ok ? FORMAT[f].blurb : "Not available for this topic"}</span>
              </button>
            );
          })}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-leaf">Research time</p>
          <div className="flex gap-1.5">{[5, 10, 15].map((m) => <button key={m} type="button" aria-pressed={s.research_minutes === m} onClick={() => set({ research: m })} className={chip(s.research_minutes === m)}>{m} min</button>)}</div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-leaf">Each presentation</p>
          <div className="flex gap-1.5">{[30, 60, 120].map((x) => <button key={x} type="button" aria-pressed={s.present_seconds === x} onClick={() => set({ present: x })} className={chip(s.present_seconds === x)}>{x < 60 ? `${x} s` : `${x / 60} min`}</button>)}</div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-leaf">Who presents first?</p>
          <div className="flex gap-1.5">
            {[me, partner].filter((p): p is NonNullable<typeof p> => !!p).map((p) => (
              <button key={p.id} type="button" aria-pressed={s.first_presenter === p.id} onClick={() => set({ first: p.id })} className={chip(s.first_presenter === p.id)}>
                {p.id === myId ? "Me" : p.display_name || "Partner"}
              </button>
            ))}
          </div>
        </div>
        <RoleBrief s={s} />
        <Button busy={busy === "advance"} onClick={() => run("advance", () => curiousAdvance(s.session_id, "setup"))}><NotebookPen size={16} aria-hidden="true" /> Start researching</Button>
      </Card>
    </div>
  );
}

/** Who does what, for the chosen format. */
function RoleBrief({ s }: { s: CuriousState }) {
  const { myId, partner } = usePeople();
  const t = s.topic;
  const firstIsMe = s.first_presenter === myId;
  const pName = partner?.display_name || "your partner";
  const mine = (a: string, b: string) => (firstIsMe ? a : b);
  const theirs = (a: string, b: string) => (firstIsMe ? b : a);
  let body: ReactNode = null;
  if (s.format === "debate" && t.debate_statement) {
    body = <>
      <p className="font-display text-lg font-semibold">“{t.debate_statement}”</p>
      <p className="text-sm">You argue <strong>{mine("for", "against")}</strong>; {pName} argues <strong>{theirs("for", "against")}</strong>. It's a friendly debate — find the best case, not the winning insult.</p>
    </>;
  } else if (s.format === "deep_dive" && t.split_a && t.split_b) {
    body = <p className="text-sm">You research <strong>{mine(t.split_a, t.split_b)}</strong>; {pName} researches <strong>{theirs(t.split_a, t.split_b)}</strong>.</p>;
  } else if (s.format === "fact_fiction") {
    body = <p className="text-sm">Check each claim below and mark it true, false or misleading. These are prompts to investigate — the app doesn't know the answers.</p>;
  } else if (s.format === "perspectives") {
    body = <p className="text-sm">Both investigate: <strong>{t.intro_question}</strong> Then compare what you each found.</p>;
  } else if (s.format === "expert") {
    body = <p className="text-sm">Each pick one complicated idea from this topic and explain it so simply a curious ten-year-old would get it.</p>;
  } else {
    body = <p className="text-sm">Each find one discovery that made you go “huh!” and teach it to the other.</p>;
  }
  return <div className="space-y-1 rounded-2xl bg-leaf-soft/70 px-4 py-3 text-leaf">{body}</div>;
}

/* ================================================================ research */

function ResearchView({ s, skewMs, busy, run }: { s: CuriousState; skewMs: number; busy: string | null; run: Run }) {
  const { myId, partner } = usePeople();
  const myNote = s.notes.find((n) => n.user_id === myId);
  const pName = partner?.display_name || "Your partner";
  return (
    <div className="space-y-5">
      <p className="font-hand text-xl text-raspberry-deep">step 2 · research on your own</p>
      <TopicCard t={s.topic} compact />
      <RoleBrief s={s} />
      <StageTimer s={s} skewMs={skewMs} busy={busy} run={run} lengths={[300, 600, 900]} />
      <NoteEditor s={s} note={myNote} busy={busy} run={run} />
      <p className="text-sm text-muted">
        {s.partner_has_notes ? `${pName} has saved notes — they open when you start presenting.` : `${pName} hasn't saved notes yet.`}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button busy={busy === "advance"} onClick={() => run("advance", () => curiousAdvance(s.session_id, "research"))}><Mic size={16} aria-hidden="true" /> We're ready to present</Button>
        <Button variant="ghost" busy={busy === "swap"} onClick={() => run("swap", () => curiousSwapOrder(s.session_id))}><ArrowLeftRight size={15} aria-hidden="true" /> Swap who goes first</Button>
      </div>
    </div>
  );
}

function NoteEditor({ s, note, busy, run }: { s: CuriousState; note?: Note; busy: string | null; run: Run }) {
  const [summary, setSummary] = useState(note?.summary ?? "");
  const [links, setLinks] = useState<string[]>(note?.links.length ? note.links : [""]);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>(note?.verdicts ?? {});
  const [saved, setSaved] = useState(false);
  const save = () => run("note", async () => { const r = await saveCuriousNote(s.session_id, summary, links.filter((l) => l.trim()), verdicts); setSaved(true); return r; });

  return (
    <Card className="notebook space-y-4">
      <div>
        <h3 className="text-xl">My research notes</h3>
        <p className="mt-1 text-xs text-muted">
          Private until you start presenting. Use sources you trust — encyclopaedias, universities, museums, reputable news. Topic cards are starting points, not verified facts.
        </p>
      </div>
      {s.format === "fact_fiction" && s.topic.claims.length > 0 && (
        <div className="space-y-3">
          {s.topic.claims.map((c, i) => (
            <div key={i}>
              <p className="text-sm font-semibold">{i + 1}. {c}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Your verdict on claim ${i + 1}`}>
                {(["true", "false", "misleading"] as Verdict[]).map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={verdicts[i] === v} onClick={() => { setVerdicts({ ...verdicts, [i]: v }); setSaved(false); }} className={chip(verdicts[i] === v)}>
                    {VERDICT_LABEL[v]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <Field label="What I found" htmlFor="cc-summary">
        <textarea id="cc-summary" rows={4} maxLength={1500} className={inputCls} value={summary} onChange={(e) => { setSummary(e.target.value); setSaved(false); }}
          placeholder="A short summary in your own words" />
      </Field>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-leaf">Sources (https://…)</p>
        {links.map((l, i) => (
          <div key={i} className="flex gap-2">
            <input aria-label={`Source ${i + 1}`} type="url" inputMode="url" className={inputCls} value={l} placeholder="https://"
              onChange={(e) => { const next = [...links]; next[i] = e.target.value; setLinks(next); setSaved(false); }} />
            {links.length > 1 && <button type="button" aria-label="Remove source" onClick={() => setLinks(links.filter((_, k) => k !== i))} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted hover:bg-tomato-soft"><X size={15} /></button>}
          </div>
        ))}
        {links.length < 5 && <button type="button" onClick={() => setLinks([...links, ""])} className="inline-flex items-center gap-1 text-sm font-semibold text-leaf"><Plus size={14} aria-hidden="true" /> Add a source</button>}
      </div>
      <Button variant="dark" busy={busy === "note"} onClick={() => void save()}>{saved ? "Saved ✓" : "Save my notes"}</Button>
    </Card>
  );
}

/* =================================================================== timer */

function StageTimer({ s, skewMs, busy, run, lengths, guide }: { s: CuriousState; skewMs: number; busy: string | null; run: Run; lengths: number[]; guide?: boolean }) {
  const [, tick] = useState(0);
  const running = !!s.timer.ends_at;
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [running]);
  const left = secondsLeft(s.timer, skewMs);
  const total = s.timer.duration_s ?? 60;
  const elapsed = Math.max(0, total - left);
  const pct = total ? Math.min(100, (elapsed / total) * 100) : 0;
  const segs = guide ? talkSegments(total) : [];
  const fresh = !running && left === total;

  return (
    <Card className="!p-5">
      <div className="flex items-center justify-between gap-3">
        <p className={`font-display text-5xl font-semibold tabular-nums ${running && left === 0 ? "text-tomato" : ""}`} aria-live="polite">{formatClock(left)}</p>
        <div className="flex gap-1.5">
          {running
            ? <Button variant="outline" aria-label="Pause" busy={busy === "timer"} onClick={() => run("timer", () => curiousTimer(s.session_id, "pause"))} className="!px-3"><Pause size={16} /></Button>
            : <Button aria-label={fresh ? "Start" : "Resume"} busy={busy === "timer"} disabled={left === 0} onClick={() => run("timer", () => curiousTimer(s.session_id, "start"))} className="!px-3"><PlayIcon size={16} /></Button>}
          <Button variant="ghost" aria-label="Restart" onClick={() => run("timer", () => curiousTimer(s.session_id, "reset"))} className="!px-3"><RotateCcw size={16} /></Button>
          <Button variant="ghost" aria-label="Skip" onClick={() => run("timer", () => curiousTimer(s.session_id, "skip"))} className="!px-3"><SkipForward size={16} /></Button>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-leaf-soft"><div className="h-full rounded-full bg-mustard transition-[width] duration-300" style={{ width: `${pct}%` }} /></div>
      {guide && (
        <ol className="mt-3 space-y-1">
          {segs.map((g) => {
            const now = elapsed >= g.from && elapsed < g.to && (running || elapsed > 0);
            return (
              <li key={g.from} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${now ? "bg-mustard-soft font-semibold text-leaf" : "text-muted"}`}>
                <span className="w-16 shrink-0 text-xs tabular-nums">{g.from}–{g.to}s</span>{g.label}
              </li>
            );
          })}
        </ol>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {lengths.map((d) => (
          <button key={d} type="button" onClick={() => run("timer", () => curiousTimer(s.session_id, "reset", d))} aria-pressed={total === d} className={chip(total === d)}>
            {d < 60 ? `${d} s` : `${d / 60} min`}
          </button>
        ))}
      </div>
    </Card>
  );
}

/* ================================================================= present */

function PresentView({ s, skewMs, busy, run }: { s: CuriousState; skewMs: number; busy: string | null; run: Run }) {
  const { myId, partner } = usePeople();
  const partnerId = partner?.id ?? null;
  const firstId = s.first_presenter;
  const secondId = firstId === myId ? partnerId : myId;
  const presenter = s.presenter_index === 0 ? firstId : secondId;
  const nameOf = (id: string | null) => (id === myId ? "You" : partner?.display_name || "Your partner");
  const note = s.notes.find((n) => n.user_id === presenter);
  const t = s.topic;
  const presenterRole =
    s.format === "debate" ? (s.presenter_index === 0 ? "arguing for" : "arguing against")
    : s.format === "deep_dive" ? (s.presenter_index === 0 ? t.split_a : t.split_b) : null;

  return (
    <div className="space-y-5">
      <p className="font-hand text-xl text-raspberry-deep">step 3 · presentation {s.presenter_index + 1} of 2</p>
      <Card className="!bg-leaf text-cream">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cream/80">{FORMAT[s.format].label}</p>
        <h2 className="mt-1 text-3xl text-cream">{presenter === myId ? "You're on!" : `${nameOf(presenter)} is presenting`}</h2>
        {presenterRole && <p className="mt-1 text-sm text-cream/85">{presenterRole}</p>}
        {s.format === "debate" && t.debate_statement && <p className="mt-2 font-display text-lg">“{t.debate_statement}”</p>}
      </Card>
      <StageTimer s={s} skewMs={skewMs} busy={busy} run={run} lengths={[30, 60, 120]} guide />
      {note && (note.summary || note.links.length > 0) && (
        <Card className="space-y-1 !p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{nameOf(presenter)}'s notes</p>
          {note.summary && <p className="whitespace-pre-wrap text-sm">{note.summary}</p>}
          <Links links={note.links} />
        </Card>
      )}
      <div className="flex flex-wrap gap-2">
        <Button busy={busy === "advance"} onClick={() => run("advance", () => curiousAdvance(s.session_id, "present", s.presenter_index))}>
          <CircleCheck size={16} aria-hidden="true" /> {s.presenter_index === 0 ? `Next: ${nameOf(secondId) === "You" ? "your turn" : nameOf(secondId)}` : "On to the discussion"}
        </Button>
        {s.presenter_index === 0 && (
          <Button variant="ghost" busy={busy === "swap"} onClick={() => run("swap", () => curiousSwapOrder(s.session_id))}><ArrowLeftRight size={15} aria-hidden="true" /> Swap order</Button>
        )}
      </div>
    </div>
  );
}

/* ================================================================= discuss */

function DiscussView({ s, busy, run }: { s: CuriousState; busy: string | null; run: Run }) {
  const { myId, partner } = usePeople();
  const [draft, setDraft] = useState("");
  const nameOf = (id: string) => (id === myId ? "You" : partner?.display_name || "Your partner");
  const notes = [...s.notes].sort((a, b) => Number(b.user_id === myId) - Number(a.user_id === myId));

  return (
    <div className="space-y-5">
      <p className="font-hand text-xl text-raspberry-deep">step 4 · talk it through</p>
      <TopicCard t={s.topic} compact favourite={s.favourite} onFavourite={() => run("fav", async () => { await toggleCuriousFavourite(s.topic.id); return undefined; })} />

      <Card className="space-y-2">
        <h3 className="text-xl">Discussion questions</h3>
        <ul className="space-y-1.5">
          {DISCUSSION.map((q) => <li key={q} className="flex gap-2"><span className="text-raspberry" aria-hidden="true">✦</span>{q}</li>)}
        </ul>
      </Card>

      {s.format === "fact_fiction" && s.topic.claims.length > 0 && (
        <Card className="space-y-3">
          <h3 className="text-xl">Your verdicts</h3>
          <p className="text-xs text-muted">Where you disagree, check your sources together. The app doesn't hold the answers.</p>
          {s.topic.claims.map((c, i) => (
            <div key={i} className="rounded-xl border border-leaf/15 px-3 py-2">
              <p className="text-sm font-semibold">{c}</p>
              <p className="mt-1 text-xs text-muted">
                {notes.map((n) => `${nameOf(n.user_id)}: ${n.verdicts[i] ? VERDICT_LABEL[n.verdicts[i]] : "—"}`).join(" · ") || "No verdicts saved"}
              </p>
            </div>
          ))}
        </Card>
      )}

      {notes.filter((n) => n.summary || n.links.length).map((n) => (
        <Card key={n.user_id} className="space-y-1 !p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{nameOf(n.user_id)} found</p>
          {n.summary && <p className="whitespace-pre-wrap text-sm">{n.summary}</p>}
          <Links links={n.links} />
        </Card>
      ))}

      <Card className="space-y-3">
        <h3 className="inline-flex items-center gap-2 text-xl"><Sparkles size={18} className="text-mustard-deep" aria-hidden="true" />Save a discovery</h3>
        <p className="text-xs text-muted">Little things worth remembering. Shared with both of you; they'll appear in the Scrapbook when it arrives.</p>
        <div className="flex gap-2">
          <input aria-label="New discovery" className={inputCls} maxLength={500} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. Rats can laugh when tickled" />
          <Button busy={busy === "disc"} onClick={() => { if (!draft.trim()) return; void run("disc", async () => { const r = await addCuriousDiscovery(s.session_id, draft); setDraft(""); return r; }); }}>
            <Plus size={16} aria-hidden="true" /><span className="sr-only">Save</span>
          </Button>
        </div>
        {s.discoveries.length > 0 && (
          <ul className="space-y-1.5">
            {s.discoveries.map((d) => (
              <li key={d.id} className="flex items-start gap-2">
                <span className="mt-0.5 text-raspberry" aria-hidden="true">✦</span>
                <p className="flex-1 text-sm"><span className="font-semibold">{nameOf(d.user_id)}:</span> {d.body}</p>
                {d.user_id === myId && (
                  <button type="button" aria-label="Remove discovery" onClick={() => run("deldisc", async () => { await deleteCuriousDiscovery(d.id); return undefined; })}
                    className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-tomato-soft"><Trash2 size={13} /></button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Button busy={busy === "advance"} onClick={() => run("advance", () => curiousAdvance(s.session_id, "discuss"))}><CircleCheck size={16} aria-hidden="true" /> Finish & save to history</Button>
    </div>
  );
}

function Links({ links }: { links: string[] }) {
  if (!links.length) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {links.map((l) => (
        <li key={l}>
          <a href={l} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 truncate text-sm font-semibold text-leaf underline underline-offset-4">
            <Link2 size={13} aria-hidden="true" />{l.replace(/^https:\/\//, "")}
          </a>
        </li>
      ))}
    </ul>
  );
}
