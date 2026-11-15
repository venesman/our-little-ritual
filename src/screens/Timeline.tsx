import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarHeart, Flag, Heart, MapPin, Plane, Sparkles, Star } from "lucide-react";
import { supabase } from "../lib/supabase";
import { activitySummary, signedUrl, type MonthSummary } from "../lib/scrapbook";
import { Spinner } from "../components/ui";
import { TAG_LABEL, type DatePrecision, type MilestoneTag } from "../lib/story";
import { STAY_LABEL, type StayType } from "../lib/visits";
import { fmtPrecise, listDocuments, togetherDays } from "../lib/record";

interface TimelineEvent {
  kind: "began" | "milestone" | "important_date" | "memory" | "moment" | "visit" | "first";
  on: string; until?: string | null; title: string; subtitle?: string | null; ref_id?: string; photo?: string | null; upcoming?: boolean;
  tag?: MilestoneTag | null; precision?: DatePrecision; stay_type?: StayType; with_family?: boolean;
}
const SUGGEST: MilestoneTag[] = ["first_met", "relationship_start", "first_visit", "met_family", "anniversary", "engagement", "marriage", "moving"];
type Filter = "all" | "milestones" | "together" | "firsts";
const FILTERS: [Filter, string][] = [["all", "All"], ["milestones", "Milestones"], ["together", "Trips & visits"], ["firsts", "Firsts"]];
const matches = (e: TimelineEvent, f: Filter) =>
  f === "all" || (f === "milestones" && ["milestone", "important_date", "memory", "began"].includes(e.kind))
  || (f === "together" && (e.kind === "moment" || e.kind === "visit")) || (f === "firsts" && e.kind === "first");

const STYLE: Record<TimelineEvent["kind"], { icon: typeof Star; dot: string; label: string }> = {
  began: { icon: Flag, dot: "bg-leaf text-cream", label: "The beginning" },
  milestone: { icon: Star, dot: "bg-mustard text-leaf", label: "Milestone" },
  important_date: { icon: CalendarHeart, dot: "bg-raspberry text-leaf", label: "Important date" },
  memory: { icon: Heart, dot: "bg-raspberry-soft text-raspberry-deep", label: "Memory" },
  moment: { icon: MapPin, dot: "bg-tomato text-cream", label: "Trip or moment" },
  visit: { icon: Plane, dot: "bg-leaf-soft text-leaf", label: "Together" },
  first: { icon: Sparkles, dot: "bg-cream text-mustard-deep border-2 border-mustard", label: "A first" },
};

const fmt = (d: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
const range = (e: TimelineEvent) => (e.until && e.until !== e.on ? `${fmt(e.on)} – ${fmt(e.until)}` : e.precision && e.precision !== "day" ? fmtPrecise(e.on, e.precision) : fmt(e.on));
const labelOf = (e: TimelineEvent) => (e.tag ? TAG_LABEL[e.tag] : e.kind === "visit" && e.stay_type ? STAY_LABEL[e.stay_type] + (e.with_family ? " · with family" : "") : STYLE[e.kind].label);

function Thumb({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { void signedUrl("moments", path).then(setUrl); }, [path]);
  return <div className="h-14 w-14 shrink-0 rotate-3 overflow-hidden rounded-sm bg-cream p-0.5 shadow-card">{url ? <img src={url} alt="" className="h-full w-full object-cover" /> : null}</div>;
}

/** Us → Timeline: your story on one line, newest at the top. */
export function Timeline() {
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [summary, setSummary] = useState<MonthSummary[]>([]);
  useEffect(() => {
    supabase.rpc("timeline_feed").then(({ data, error }) => setEvents(error ? [] : ((data ?? []) as TimelineEvent[])));
  }, []);
  const today = new Date().toISOString().slice(0, 10);
  useEffect(() => {
    if (!events?.length) return;
    const first = events[events.length - 1].on;
    activitySummary(first, today).then(setSummary).catch(() => {});
  }, [events, today]);

  const shown = (events ?? []).filter((e) => matches(e, filter));
  const upcoming = shown.filter((e) => e.on > today);
  const past = shown.filter((e) => e.on <= today);
  const years = useMemo(() => {
    const m = new Map<string, TimelineEvent[]>();
    for (const e of past) { const y = e.on.slice(0, 4); m.set(y, [...(m.get(y) ?? []), e]); }
    return [...m.entries()];
  }, [past]);
  const perYear = (y: string) => summary.filter((r) => r.month.startsWith(y)).reduce((a, r) => ({
    rituals: a.rituals + r.rituals_both, letters: a.letters + r.letters, calls: a.calls + r.play_sessions + r.curious_sessions,
  }), { rituals: 0, letters: 0, calls: 0 });
  const began = (events ?? []).find((e) => e.kind === "began");
  const earliest = (events ?? []).filter((e) => e.kind !== "first").map((e) => e.on).sort()[0];
  const trips = (events ?? []).filter((e) => e.kind === "moment" || (e.kind === "visit" && !e.upcoming));
  const daysTogether = togetherDays(trips.map((e) => ({ from: e.on, until: e.until }))).size;
  const [canTag, setCanTag] = useState(false);
  useEffect(() => { void listDocuments().then((d) => setCanTag(d !== null)); }, []);
  const haveTags = new Set((events ?? []).map((e) => e.tag).filter(Boolean));
  const suggestions = canTag ? SUGGEST.filter((t) => !haveTags.has(t)).slice(0, 4) : [];

  if (events === null) return <Spinner label="Unrolling the timeline" />;

  return (
    <div className="fade-up space-y-5">
      <header>
        <p className="font-hand text-2xl text-raspberry-deep">our story, one line at a time</p>
        <h1 className="text-4xl">Timeline</h1>
        {earliest && (
          <p className="mt-1 text-sm text-muted">
            Since {fmt(earliest)}{daysTogether ? ` · about ${daysTogether} day${daysTogether === 1 ? "" : "s"} side by side on trips and visits` : ""}.
          </p>
        )}
      </header>

      <div className="flex max-w-full gap-1 overflow-x-auto" role="tablist" aria-label="Show">
        {FILTERS.map(([f, label]) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full border-2 px-3 py-1 text-sm font-semibold ${filter === f ? "border-leaf bg-mustard text-leaf" : "border-leaf/20 text-muted"}`}>{label}</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-[20px] border-2 border-dashed border-leaf/20 px-5 py-8 text-center font-hand text-xl text-muted">
          add milestones with a date in Our Story, or a trip in the Scrapbook, and they'll appear here
        </p>
      ) : (
        <div className="relative pl-8">
          <span className="absolute bottom-2 left-[13px] top-2 border-l-2 border-dashed border-leaf/30" aria-hidden="true" />
          {upcoming.length > 0 && (
            <section className="mb-6 space-y-3" aria-label="Coming up">
              <p className="-ml-8 font-hand text-xl text-raspberry-deep">coming up ✈</p>
              {upcoming.slice().reverse().map((e, i) => <Item key={`u${i}`} e={e} />)}
              <p className="-ml-8 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted"><span className="h-px flex-1 bg-leaf/20" />today<span className="h-px flex-1 bg-leaf/20" /></p>
            </section>
          )}
          {years.map(([y, list]) => {
            const s = perYear(y);
            return (
              <section key={y} className="mb-6 space-y-3" aria-label={y}>
                <div className="-ml-8 flex items-baseline gap-3">
                  <h2 className="font-display text-3xl">{y}</h2>
                  {(s.rituals + s.letters + s.calls) > 0 && (
                    <p className="text-xs text-muted">{[s.rituals && `${s.rituals} rituals together`, s.letters && `${s.letters} letters`, s.calls && `${s.calls} call activities`].filter(Boolean).join(" · ")}</p>
                  )}
                </div>
                {list.map((e, i) => <Item key={`${y}${i}`} e={e} />)}
              </section>
            );
          })}
          {began && filter === "all" && <p className="-ml-8 text-center font-hand text-lg text-muted">— the very beginning —</p>}
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="rounded-[20px] bg-paper p-4 shadow-card">
          <p className="font-hand text-xl text-raspberry-deep">add to your story</p>
          <p className="mb-2 text-xs text-muted">Things that happened before you used the app count too. If you only know the month or year, that's fine.</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((t) => (
              <Link key={t} to={`/us?tab=story&add=${t}`} className="rounded-full border-2 border-leaf/20 px-3 py-1 text-xs font-semibold text-leaf hover:border-leaf">+ {TAG_LABEL[t]}</Link>
            ))}
            <Link to="/visits" className="rounded-full border-2 border-leaf/20 px-3 py-1 text-xs font-semibold text-leaf hover:border-leaf">+ A past visit</Link>
          </div>
        </div>
      )}
      <p className="text-xs text-muted">Built from what's already in your app. Add or edit milestones in <Link to="/us?tab=story" className="underline">Our Story</Link>, trips in the <Link to="/us" className="underline">Scrapbook</Link>, visits on <Link to="/visits" className="underline">Visits</Link>.</p>
    </div>
  );
}

function Item({ e }: { e: TimelineEvent }) {
  const st = STYLE[e.kind];
  const I = st.icon;
  const to = e.kind === "moment" && e.ref_id ? `/us/moment/${e.ref_id}` : e.kind === "visit" ? "/visits" : ["milestone", "important_date", "memory"].includes(e.kind) ? "/us?tab=story" : null;
  const body = (
    <div className={`flex items-center gap-3 rounded-2xl bg-paper p-3 shadow-card ${e.upcoming ? "border-2 border-dashed border-leaf/30" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-muted">{range(e)} · {labelOf(e)}{e.upcoming && e.kind !== "visit" ? " · planned" : ""}</p>
        <p className="font-display text-lg font-semibold leading-tight">{e.title}</p>
        {e.subtitle && <p className="line-clamp-2 text-sm text-muted">{e.subtitle}</p>}
      </div>
      {e.photo && <Thumb path={e.photo} />}
    </div>
  );
  return (
    <div className="relative">
      <span className={`absolute -left-8 top-3 grid h-7 w-7 place-items-center rounded-full shadow-card ${st.dot}`} aria-hidden="true"><I size={13} /></span>
      {to ? <Link to={to} className="block transition hover:-translate-y-px">{body}</Link> : body}
    </div>
  );
}
