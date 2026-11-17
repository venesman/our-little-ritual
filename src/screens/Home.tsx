import { OnThisDay, OurPhoto, useCoverPhoto } from "../components/HomeMemories";
import { BoardingPass, TogetherSince, useBegan } from "../components/Passport";
import { ForYouLine, WelcomeBack } from "../components/ForYouLine";
import { RecentMemories } from "../components/ScrapbookBits";
import { MailboxCard } from "../components/MailboxCard";
import { CheckinCard } from "../components/CheckinCard";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Send } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useSpace } from "../hooks/useSpace";
import { formatInZone, longDateInZone, nextRelease, placeFromZone, relativeFromNow } from "../lib/time";
import { ErrorNote, Postmark, Stamp } from "../components/ui";
import { RitualPostcard } from "../components/RitualPostcard";
import { CallWindowCard, NudgeCard, VisitCard } from "../components/HomeCards";
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
  const photo = useCoverPhoto();
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

  const dayParts = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: myTz }).formatToParts(now);
  const part = (t: string) => dayParts.find((x) => x.type === t)?.value ?? "";
  const began = useBegan();
  const todayIso = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: myTz }).format(now);
  const beganDate = began ? new Date(`${began.on}T00:00:00Z`) : null;
  const beganFmt = (o: Intl.DateTimeFormatOptions) => (beganDate ? new Intl.DateTimeFormat("en-GB", { ...o, timeZone: "UTC" }).format(beganDate) : "");
  const header = (title: string, sub?: string) => (
    <header className="space-y-2">
      <p className="font-hand text-2xl font-bold lowercase leading-none text-raspberry-deep">{longDateInZone(now, myTz)}</p>
      <h1 className="text-[2.6rem] italic leading-none">{title}</h1>
      {sub && <p className="text-muted">{sub}</p>}
    </header>
  );


  /* ---------------------------------------------- waiting for partner */
  if (space.relationship.status === "pending" || !partner) {
    return (
      <div className="fade-up space-y-6">
        {header(`Hello, ${myName}.`, "Your journal is ready. It begins once your partner joins.")}
        <div className="overflow-hidden rounded-card bg-paper shadow-card">
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
  // Location labels come from Our Story ("current city") when set, otherwise from the time zone.
  const myCity = me?.profile?.current_city ?? null;

  return (
    <div className="fade-up space-y-6">
      {header("Hello, you two.")}

      {/* our photo, pinned beside a stamp and today's postmark */}
      <section aria-label="Our photo" className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] items-start gap-3 pt-1">
        {photo.cover ? <OurPhoto {...photo} /> : (
          <Link to="/us" className="polaroid block -rotate-[4deg] !pb-3">
            <span className="tape" aria-hidden="true" />
            <div className="grid aspect-[5/4] place-items-center bg-raspberry-soft px-3 text-center font-hand text-lg leading-tight">pin your favourite photo of you two</div>
            <p className="mt-1 text-center font-hand text-lg font-bold">our photo</p>
          </Link>
        )}
        <div className="flex flex-col items-end gap-1 pr-1 pt-1">
          <TogetherSince began={began} todayIso={todayIso} />
          {/* your anniversary once "Our relationship began" is in Our Story; until then, today's date where you are */}
          {beganDate ? (
            <Postmark className="-mr-2 mt-1 h-[92px] w-[92px] self-start" place="anniversary"
              day={began!.precision === "day" ? beganFmt({ day: "numeric", month: "short" }) : beganFmt({ month: "short" })} year={beganFmt({ year: "numeric" })} />
          ) : (
            <Postmark className="-mr-2 mt-1 h-[92px] w-[92px] self-start" place={myCity?.trim() || placeFromZone(myTz)} day={`${part("day")} ${part("month")}`} year={part("year")} />
          )}
        </div>
      </section>

      {/* your two clocks, on a boarding pass */}
      <BoardingPass now={now} from={{ name: myName, tz: myTz, city: myCity }} to={{ name: partnerName, tz: partnerTz, city: partner.profile?.current_city ?? null }} />

      <WelcomeBack userId={session!.user.id} ritualId={ritual?.weeklyId} />

      <ForYouLine partnerName={partnerName} ritualId={ritual?.weeklyId} />

      {/* this week's ritual — postcard */}
      <section aria-label="This week's ritual" className="space-y-2">
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
              <p className="font-hand text-xl leading-tight text-leaf">{weekStatus?.revealed ? "you've both shared ✦" : "no rush, any time this week"}</p>
              <Link
                to={`/rituals/${ritual.weeklyId}`}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border-[1.5px] border-leaf/15 bg-mustard px-5 text-sm font-semibold text-leaf shadow-print transition hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-raspberry"
              >
                {weekStatus?.revealed ? "See answers" : weekStatus?.my_status === "submitted" ? "View" : weekStatus?.my_status === "draft" ? "Continue" : "Start"}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </RitualPostcard>
        )}
      </section>

      <VisitCard timeZone={myTz} />

      <NudgeCard myId={session!.user.id} partnerId={partner.user_id} partnerName={partnerName} timeZone={myTz} />

      <CheckinCard partnerName={partnerName} />

      <MailboxCard timeZone={myTz} />

      <OnThisDay />

      <RecentMemories />

      <CallWindowCard
        now={now}
        me={{ timeZone: myTz, from: profile?.free_from?.slice(0, 5) ?? null, to: profile?.free_to?.slice(0, 5) ?? null }}
        partner={{ timeZone: partnerTz, from: partner.profile?.free_from?.slice(0, 5) ?? null, to: partner.profile?.free_to?.slice(0, 5) ?? null }}
        partnerName={partnerName}
      />

      {/* next release */}
      <div className="-rotate-[0.8deg] rounded-[24px] bg-mint p-5 shadow-card">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em]">Next postcard</p>
        <div className="flex items-center gap-5">
          <Stamp top="every monday" main="11:00" bottom="utc" />
          <div className="min-w-0 text-sm">
            <h2 className="text-lg leading-snug">Next postcard arrives {relativeFromNow(release, now)}</h2>
            <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-muted">
              <dt>For you</dt><dd className="font-medium text-leaf">{formatInZone(release, myTz)}</dd>
              <dt>For {partnerName}</dt><dd className="font-medium text-leaf">{formatInZone(release, partnerTz)}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
