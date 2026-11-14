import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { getRitualHistory, type WeeklyRitual } from "../lib/rituals";
import { friendlyError } from "../lib/errors";
import { useCurrentRitual } from "../hooks/useCurrentRitual";
import { useSpace } from "../hooks/useSpace";
import { formatInZone } from "../lib/time";
import { RitualPostcard } from "../components/RitualPostcard";
import { ErrorNote, Loops, Spinner } from "../components/ui";

/** Every week's ritual, newest first — the journal's table of contents. */
export function Rituals() {
  const { space, profile } = useSpace();
  const active = space?.relationship.status === "active";
  const { ritual: current, error: currentError } = useCurrentRitual(active);
  const [history, setHistory] = useState<WeeklyRitual[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tz = profile?.timezone ?? "UTC";

  useEffect(() => {
    if (!active || !current) return; // load history once the current week is guaranteed to exist
    getRitualHistory().then(setHistory).catch((e) => setError(friendlyError(e)));
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
          <Link to={`/rituals/${current.weeklyId}`} className="block rounded-[20px] focus:outline-none focus-visible:ring-2 focus-visible:ring-raspberry">
            <RitualPostcard ritual={current} size="compact" />
          </Link>
        </section>
      )}

      <section aria-label="Past weeks">
        <h2 className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.16em] text-muted">Past weeks</h2>
        {history === null && !error ? null : past.length === 0 ? (
          <EmptyNote text="Your past rituals will collect here, week by week." />
        ) : (
          <ul className="divide-y divide-dashed divide-leaf/20 rounded-[20px] bg-paper shadow-card">
            {past.map((r) => (
              <li key={r.weeklyId}>
                <Link to={`/rituals/${r.weeklyId}`} className="flex items-center gap-3 px-5 py-4 hover:bg-cream/60">
                  <span className="w-14 shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-tomato-deep">Week {r.weekNumber}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-lg font-semibold">{r.activity.title}</span>
                    <span className="block text-xs text-muted">{formatInZone(new Date(r.weekStart), tz).split(",")[0]}</span>
                  </span>
                  <ChevronRight size={18} className="text-faint" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[20px] border-2 border-dashed border-leaf/20 px-6 py-10 text-center">
      <Loops className="h-8 w-14 opacity-80" />
      <p className="font-hand text-xl text-muted">{text}</p>
    </div>
  );
}
