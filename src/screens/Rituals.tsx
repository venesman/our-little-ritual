import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookHeart, Hourglass } from "lucide-react";
import { supabase } from "../lib/supabase";
import { CATEGORY, getRitualHistory, type WeeklyRitual } from "../lib/rituals";
import { getMyRitualStatuses, type WeekListStatus } from "../lib/submissions";
import { friendlyError } from "../lib/errors";
import { useCurrentRitual } from "../hooks/useCurrentRitual";
import { useSpace } from "../hooks/useSpace";
import { formatInZone } from "../lib/time";
import { RitualPostcard } from "../components/RitualPostcard";
import { ErrorNote, Loops, PostageStamp, Spinner, type StampColour } from "../components/ui";

/** Every week's ritual, newest first — the journal's table of contents. */
export function Rituals() {
  const { space, profile } = useSpace();
  const active = space?.relationship.status === "active";
  const { ritual: current, error: currentError } = useCurrentRitual(active);
  const [history, setHistory] = useState<WeeklyRitual[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, WeekListStatus>>({});
  const [kept, setKept] = useState<Set<string>>(new Set());
  const tz = profile?.timezone ?? "UTC";

  useEffect(() => {
    if (!active || !current) return; // load history once the current week is guaranteed to exist
    getRitualHistory().then(setHistory).catch((e) => setError(friendlyError(e)));
    getMyRitualStatuses().then((l) => setStatuses(Object.fromEntries(l.map((s) => [s.weekly_id, s])))).catch(() => {});
    supabase.from("scrapbook_entries").select("ref_id").eq("kind", "ritual").eq("saved", true)
      .then(({ data }) => setKept(new Set((data ?? []).map((r: { ref_id: string }) => r.ref_id))));
  }, [active, current]);

  if (!active) {
    return (
      <div className="fade-up space-y-4">
        <h1 className="text-4xl">Rituals</h1>
        <EmptyNote text="Your rituals begin once your partner has joined." />
      </div>
    );
  }

  const past = (history ?? []).filter((r) => r.weeklyId !== current?.weeklyId);

  return (
    <div className="fade-up space-y-6">
      <header>
        <p className="font-hand text-2xl text-raspberry-deep">our little rituals</p>
        <h1 className="text-4xl">Every week, together</h1>
      </header>
      <ErrorNote>{currentError ?? error}</ErrorNote>

      {!current && !currentError && <Spinner label="Opening this week" />}
      {current && (
        <section aria-label="This week">
          <h2 className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.16em] text-muted">This week</h2>
          <Link to={`/rituals/${current.weeklyId}`} className="block rounded-card focus:outline-none focus-visible:ring-2 focus-visible:ring-raspberry">
            <RitualPostcard ritual={current} size="compact" />
          </Link>
        </section>
      )}

      <section aria-label="Past weeks">
        <h2 className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.16em] text-muted">Past weeks</h2>
        {history === null && !error ? null : past.length === 0 ? (
          <EmptyNote text="Your past rituals will collect here, week by week." />
        ) : (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-4 pt-1">
            {past.map((r, i) => {
              const cat = CATEGORY[r.activity.category];
              return (
                <li key={r.weeklyId} style={{ transform: `rotate(${[-1.5, 1.2, 1, -1.2][i % 4]}deg)` }}>
                  <Link to={`/rituals/${r.weeklyId}`} className="relative flex h-full min-h-[150px] flex-col rounded-[18px] bg-white p-3.5 shadow-card transition hover:-translate-y-0.5"
                    aria-label={`Week ${r.weekNumber}: ${r.activity.title}`}>
                    <div className="flex items-start justify-between gap-2">
                      <PostageStamp colour={STAMP_COLOUR[cat.tone] ?? "tangerine"} size="sm" tilt={5}>
                        <span className="font-display text-base leading-none">{String(r.weekNumber).padStart(2, "0")}</span>
                        <span className="text-[7px] font-bold uppercase tracking-[0.1em]">Week</span>
                      </PostageStamp>
                      {statuses[r.weeklyId]?.revealed ? <PassportStamp ritual={r} tz={tz} /> : <WeekBadge s={statuses[r.weeklyId]} />}
                    </div>
                    <span className="mt-2 line-clamp-2 font-display text-lg leading-tight">{r.activity.title}</span>
                    <span className="mt-auto flex items-center justify-between pt-1">
                      <span className="font-hand text-base font-bold leading-none text-muted">{formatInZone(new Date(r.weekStart), tz).split(",")[0].toLowerCase()}</span>
                      {kept.has(r.weeklyId) && <BookHeart size={14} className="shrink-0 text-raspberry-deep" aria-label="In our scrapbook" />}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border-2 border-dashed border-leaf/20 px-6 py-10 text-center">
      <Loops className="h-8 w-14 opacity-80" />
      <p className="font-hand text-xl text-muted">{text}</p>
    </div>
  );
}

const STAMP_COLOUR: Record<string, StampColour> = { raspberry: "lilac", mustard: "gold", leaf: "cornflower", tomato: "tangerine" };

const STAMP_RING = {
  raspberry: "border-raspberry text-raspberry-deep", mustard: "border-mustard text-mustard-deep",
  leaf: "border-leaf/70 text-leaf", tomato: "border-tomato text-tomato-deep",
};

/** A round passport stamp for a week you've both opened: category colour, postmark code and the date. */
function PassportStamp({ ritual, tz }: { ritual: WeeklyRitual; tz: string }) {
  const cat = CATEGORY[ritual.activity.category];
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: tz }).format(new Date(ritual.weekStart)).toUpperCase();
  const tilt = ((ritual.weekNumber * 37) % 15) - 7;
  return (
    <span role="img" aria-label={`Opened together · ${cat.label} · ${date}`} style={{ transform: `rotate(${tilt}deg)` }}
      className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-dashed bg-paper text-center leading-none ${STAMP_RING[cat.tone]}`}>
      <span>
        <span className="block text-[8px] font-bold tracking-[0.12em]">{cat.postmark}</span>
        <span className="block font-display text-[10px]">{date}</span>
      </span>
    </span>
  );
}

function WeekBadge({ s }: { s?: WeekListStatus }) {
  if (!s) return null;
  if (s.my_status === "submitted" || s.partner_submitted)
    return <span className="inline-flex items-center gap-1 rounded-full bg-mustard-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-mustard-deep"><Hourglass size={11} />Half sealed</span>;
  return null;
}
