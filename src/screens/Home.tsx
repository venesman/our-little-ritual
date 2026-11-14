import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Send } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useSpace } from "../hooks/useSpace";
import { clockInZone, formatInZone, longDateInZone, nextRelease, placeFromZone, relativeFromNow } from "../lib/time";
import { Card, ErrorNote, Loops, Stamp, Ticket } from "../components/ui";
import { RitualPostcard } from "../components/RitualPostcard";
import { useCurrentRitual } from "../hooks/useCurrentRitual";
import { StatusPills } from "../components/WeekStatus";
import { getMyRitualStatuses, type WeekListStatus } from "../lib/submissions";
import { InvitePanel } from "./pair/InvitePanel";

/** Re-render once a minute so the clocks stay current. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  return now;
}

export function Home() {
  const { session } = useAuth();
  const { space, profile } = useSpace();
  const now = useNow();
  const { ritual, loading: ritualLoading, error: ritualError } = useCurrentRitual(space?.relationship.status === "active");
  const [weekStatus, setWeekStatus] = useState<WeekListStatus | null>(null);
  useEffect(() => {
    if (!ritual) return;
    const loadStatus = () => getMyRitualStatuses().then((l) => setWeekStatus(l.find((s) => s.weekly_id === ritual.weeklyId) ?? null)).catch(() => {});
    loadStatus();
    const onVis = () => { if (document.visibilityState === "visible") loadStatus(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [ritual]);
  if (!space) return null;

  const me = space.members.find((m) => m.user_id === session?.user.id);
  const partner = space.members.find((m) => m.user_id !== session?.user.id);
  const myTz = profile?.timezone ?? "UTC";
  const release = nextRelease(now);
  const myName = me?.profile?.display_name || "you";
  const partnerName = partner?.profile?.display_name || "your partner";

  const header = (title: string, sub?: string) => (
    <header className="space-y-2">
      <p className="font-hand text-2xl text-raspberry-deep">{longDateInZone(now, myTz)}</p>
      <Ticket>{space.relationship.name}</Ticket>
      <h1 className="pt-1 text-[2.5rem] leading-[1.05]">{title}</h1>
      {sub && <p className="text-muted">{sub}</p>}
    </header>
  );

  /* ---------------------------------------------- waiting for partner */
  if (space.relationship.status === "pending" || !partner) {
    return (
      <div className="fade-up space-y-6">
        {header(`Hello, ${myName}.`, "Your journal is ready. It begins once your partner joins.")}
        <div className="overflow-hidden rounded-[20px] bg-paper shadow-card">
          <div className="airmail h-2.5" aria-hidden="true" />
          <div className="p-6">
            <div className="mb-4 flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-raspberry-soft text-raspberry-deep">
                <Send size={18} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-xl">Invite your partner</h2>
                <p className="text-sm text-muted">Send them a private link. It works once, only for them.</p>
              </div>
            </div>
            <InvitePanel />
          </div>
          <div className="airmail h-2.5" aria-hidden="true" />
        </div>
        <p className="text-center font-hand text-lg text-muted">this page updates by itself when they join</p>
      </div>
    );
  }

  /* ---------------------------------------------- paired: journal opening page */
  const partnerTz = partner.profile?.timezone ?? "UTC";
  const places = [
    { name: myName, tz: myTz, you: true },
    { name: partnerName, tz: partnerTz, you: false },
  ];

  return (
    <div className="fade-up space-y-6">
      {header("Hello, you two.")}

      {/* two people · two places */}
      <section aria-label="Where you both are" className="relative mt-8 grid grid-cols-2 gap-3">
        {places.map((p, i) => (
          <div key={p.name + i} className={`rounded-[18px] p-4 ${i === 0 ? "bg-leaf text-cream" : "bg-raspberry text-leaf"}`}>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em]">{p.you ? "You" : "Them"} · {placeFromZone(p.tz)}</p>
            <p className="mt-2 font-display text-[1.65rem] font-semibold leading-none">{clockInZone(now, p.tz)}</p>
            <p className="mt-1 truncate text-sm">{p.name}</p>
          </div>
        ))}
        <span className="absolute left-1/2 top-0 grid h-8 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-cream shadow-card">
          <Loops className="h-5 w-8" />
        </span>
      </section>

      {/* this week's ritual — postcard */}
      <section aria-label="This week's ritual" className="space-y-2">
        <p className="font-hand text-xl text-raspberry-deep">this week, let's…</p>
        <ErrorNote>{ritualError}</ErrorNote>
        {ritualLoading && !ritual && <div className="postcard h-48 animate-pulse" aria-label="Loading this week's ritual" />}
        {ritual && (
          <RitualPostcard ritual={ritual}>
            {weekStatus && (
              <div className="mt-4">
                <StatusPills myName={myName} partnerName={partnerName} mine={weekStatus.my_status} partnerShared={weekStatus.partner_submitted} />
              </div>
            )}
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="font-hand text-lg text-muted">{weekStatus?.revealed ? "you've both shared ✦" : "no rush — any time this week"}</p>
              <Link
                to={`/rituals/${ritual.weeklyId}`}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border-2 border-leaf bg-mustard px-5 text-sm font-semibold text-leaf shadow-print transition hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-raspberry"
              >
                {weekStatus?.revealed ? "See answers" : weekStatus?.my_status === "submitted" ? "View" : weekStatus?.my_status === "draft" ? "Continue" : "Start"}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </RitualPostcard>
        )}
      </section>

      {/* next release */}
      <Card>
        <div className="flex items-center gap-5">
          <Stamp top="every monday" main="12:00" bottom="utc" />
          <div className="min-w-0 text-sm">
            <h2 className="text-lg leading-snug">Next postcard arrives {relativeFromNow(release, now)}</h2>
            <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-muted">
              <dt>For you</dt><dd className="font-medium text-leaf">{formatInZone(release, myTz)}</dd>
              <dt>For {partnerName}</dt><dd className="font-medium text-leaf">{formatInZone(release, partnerTz)}</dd>
            </dl>
          </div>
        </div>
      </Card>
    </div>
  );
}
