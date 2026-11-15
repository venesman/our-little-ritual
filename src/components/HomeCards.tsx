import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarHeart, CalendarPlus, ChevronDown, Heart, Phone, Plane } from "lucide-react";
import { downloadIcs, googleCalendarUrl } from "../lib/calendar";
import { dayLabel, formatRange, nextSharedWindow, nextWindowFor, prettyTime, sharedWindowsAhead, type Interval } from "../lib/callWindow";
import { placeFromZone } from "../lib/time";
import { ago, recentNudges, sendNudge, summarise, type Nudge } from "../lib/nudges";
import { formatDay, listVisits, visitState, type Visit } from "../lib/visits";
import { friendlyError } from "../lib/errors";
import { Card, ErrorNote } from "./ui";

/* --------------------------------------------------------- best time to call */
export function CallWindowCard({ now, me, partner, partnerName }: {
  now: Date;
  me: { timeZone: string; from: string | null; to: string | null };
  partner: { timeZone: string; from: string | null; to: string | null };
  partnerName: string;
}) {
  const w = nextSharedWindow(now, me, partner);
  const [planning, setPlanning] = useState(false);
  const icon = <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-leaf-soft text-leaf"><Phone size={17} aria-hidden="true" /></span>;

  let body: React.ReactNode;
  if (!me.from) {
    body = <><h2 className="text-lg">Best time to call</h2><p className="text-sm text-muted">Add when you're usually free in <Link to="/settings" className="font-semibold text-leaf underline">Settings</Link> and we'll find your overlap.</p></>;
  } else if (!partner.from) {
    body = <><h2 className="text-lg">Best time to call</h2><p className="text-sm text-muted">Waiting for {partnerName} to add their free hours in Settings.</p></>;
  } else if (!w) {
    const theirs = nextWindowFor(now, partner);
    body = (
      <>
        <h2 className="text-lg">Best time to call</h2>
        <p className="text-sm text-muted">Your usual free hours don't overlap right now.</p>
        <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-sm text-muted">
          <dt>You</dt><dd className="text-leaf">{prettyTime(me.from)} – {prettyTime(me.to!)} <span className="text-muted">({placeFromZone(me.timeZone)})</span></dd>
          <dt>{partnerName}</dt><dd className="text-leaf">{prettyTime(partner.from)} – {prettyTime(partner.to!)} <span className="text-muted">({placeFromZone(partner.timeZone)})</span></dd>
          {theirs && <><dt>In your time</dt><dd className="text-leaf">{formatRange(theirs, me.timeZone)}</dd></>}
        </dl>
        <p className="mt-2 text-xs text-muted">If a place looks wrong, fix the time zone in Settings.</p>
      </>
    );
  } else {
    body = (
      <>
        <h2 className="text-lg">{w.isNow ? "You're both free now ✦" : `Best time to call ${dayLabel(w.start, now, me.timeZone)}`}</h2>
        <dl className="mt-1 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-sm text-muted">
          <dt>You</dt><dd className="font-medium text-leaf">{formatRange(w, me.timeZone)}</dd>
          <dt>{partnerName}</dt><dd className="font-medium text-leaf">{formatRange(w, partner.timeZone)} <span className="text-muted">({dayLabel(w.start, now, partner.timeZone)})</span></dd>
        </dl>
        <button
          type="button" onClick={() => setPlanning((p) => !p)} aria-expanded={planning}
          className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-full border-2 border-leaf bg-mustard px-4 text-sm font-semibold text-leaf shadow-print-sm transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
        >
          <CalendarPlus size={15} aria-hidden="true" /> Plan a call date
          <ChevronDown size={15} className={`transition ${planning ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </>
    );
  }
  return (
    <Card>
      <div className="flex items-start gap-3">{icon}<div className="min-w-0">{body}</div></div>
      {planning && w && <CallDatePlanner now={now} me={me} partner={partner} partnerName={partnerName} />}
    </Card>
  );
}

/** The next 7 days of shared free time, each with "add to calendar". */
function CallDatePlanner({ now, me, partner, partnerName }: {
  now: Date; partnerName: string;
  me: { timeZone: string; from: string | null; to: string | null };
  partner: { timeZone: string; from: string | null; to: string | null };
}) {
  const windows = sharedWindowsAhead(now, me, partner, 7);
  const day = (ms: number, tz: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(new Date(ms));
  const event = (win: Interval) => ({
    title: `Call date with ${partnerName} ♥`,
    start: win.start,
    end: win.end,
    description:
      `Your shared free time, from Our Little Ritual.\n` +
      `You: ${day(win.start, me.timeZone)}, ${formatRange(win, me.timeZone)} (${placeFromZone(me.timeZone)})\n` +
      `${partnerName}: ${day(win.start, partner.timeZone)}, ${formatRange(win, partner.timeZone)} (${placeFromZone(partner.timeZone)})\n` +
      `Shorten it in your calendar if you only need part of it.`,
  });
  return (
    <div className="mt-4 border-t border-dashed border-leaf/25 pt-3">
      <p className="mb-2 font-hand text-lg text-raspberry-deep">pick a day — you both add it to your own calendar</p>
      <ul className="space-y-2">
        {windows.map((win) => (
          <li key={win.start} className="rounded-xl bg-cream/70 px-3 py-2.5">
            <p className="text-sm font-semibold text-leaf">{day(win.start, me.timeZone)} · {formatRange(win, me.timeZone)}</p>
            <p className="text-xs text-muted">{partnerName}: {day(win.start, partner.timeZone)}, {formatRange(win, partner.timeZone)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => downloadIcs(event(win))}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border-2 border-leaf/30 px-3 text-xs font-semibold text-leaf hover:border-leaf">
                <CalendarPlus size={13} aria-hidden="true" /> Apple / Outlook
              </button>
              <a href={googleCalendarUrl(event(win))} target="_blank" rel="noopener noreferrer"
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border-2 border-leaf/30 px-3 text-xs font-semibold text-leaf hover:border-leaf">
                <CalendarPlus size={13} aria-hidden="true" /> Google Calendar
              </a>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">Each of you taps on your own phone, so it lands in your own calendar at the right local time.</p>
    </div>
  );
}

/* ---------------------------------------------------------- thinking of you */
const SEEN = "olr.nudgeSeen";

export function NudgeCard({ myId, partnerId, partnerName, timeZone }: { myId: string; partnerId: string; partnerName: string; timeZone: string }) {
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await recentNudges();
      setNudges(list);
      const latest = list.find((n) => n.sender_id === partnerId)?.created_at;
      let seen = "";
      try { seen = localStorage.getItem(SEEN) ?? ""; } catch { /* ignore */ }
      if (latest && latest > seen) { setFresh(true); try { localStorage.setItem(SEEN, latest); } catch { /* ignore */ } }
    } catch { /* non-essential card: stay quiet */ }
  }, [partnerId]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60000);
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  const tap = async () => {
    setBusy(true); setError(null);
    try { await sendNudge(); setSent(true); void load(); window.setTimeout(() => setSent(false), 4000); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };

  const now = new Date();
  const theirs = summarise(nudges, partnerId, now, timeZone);
  const mine = summarise(nudges, myId, now, timeZone);

  return (
    <Card>
      <div className="flex items-center gap-4">
        <button
          type="button" onClick={tap} disabled={busy}
          aria-label={`Send ${partnerName} a thinking-of-you`}
          className={`grid h-16 w-16 shrink-0 place-items-center rounded-full border-2 border-leaf bg-raspberry text-leaf shadow-print transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-60 ${sent ? "scale-110" : ""}`}
        >
          <Heart size={26} className={sent ? "fill-current" : ""} aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <h2 className="text-lg">{sent ? `Sent to ${partnerName} ♥` : "Thinking of you"}</h2>
          <p className="text-sm text-muted">
            {theirs.last
              ? <>{fresh && <span className="mr-1 inline-block animate-bounce text-raspberry-deep">♥</span>}
                  {partnerName} thought of you{theirs.todayCount > 0 ? ` ${theirs.todayCount}× today` : ""} · {ago(theirs.last, now)}</>
              : `One tap lets ${partnerName} know. No reply needed.`}
          </p>
          {mine.todayCount > 0 && <p className="mt-0.5 font-hand text-base text-raspberry-deep">you've sent {mine.todayCount} today</p>}
        </div>
      </div>
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
    </Card>
  );
}

/* ------------------------------------------------------------ visit countdown */
export function VisitCard({ timeZone }: { timeZone: string }) {
  const [visits, setVisits] = useState<Visit[] | null>(null);
  useEffect(() => { listVisits().then(setVisits).catch(() => setVisits([])); }, []);
  if (visits === null) return null;
  const s = visitState(visits, new Date(), timeZone);

  return (
    <Link to="/visits" className="block rounded-[20px] focus:outline-none focus-visible:ring-2 focus-visible:ring-raspberry">
      {s.kind === "none" ? (
        <div className="flex items-center gap-3 rounded-[20px] border-2 border-dashed border-leaf/25 px-5 py-4 text-muted hover:border-leaf/50">
          <Plane size={18} className="text-tomato" aria-hidden="true" />
          <span className="text-sm font-semibold">When's your next visit? Add it to start a countdown</span>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-[20px] bg-tomato-deep p-5 text-cream shadow-card">
          <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full border-[10px] border-mustard/90" aria-hidden="true" />
          <div className="relative flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-90">
                <CalendarHeart size={12} className="mr-1 inline" aria-hidden="true" />
                {s.kind === "together" ? "Together now" : "Next visit"}
              </p>
              {s.kind === "upcoming" ? (
                <>
                  <p className="mt-1 font-display text-5xl font-semibold leading-none">{s.days}</p>
                  <p className="mt-1 text-sm">{s.days === 1 ? "day" : "days"} until {s.visit.place}</p>
                </>
              ) : (
                <>
                  <p className="mt-1 font-display text-3xl font-semibold leading-tight">{s.visit.place}</p>
                  <p className="mt-1 text-sm">{s.of ? `Day ${s.day} of ${s.of}` : "Today"} — enjoy every minute ✦</p>
                </>
              )}
            </div>
            <p className="shrink-0 text-right text-xs opacity-90">{formatDay(s.visit.starts_on)}{s.visit.ends_on ? <><br />→ {formatDay(s.visit.ends_on)}</> : null}</p>
          </div>
        </div>
      )}
    </Link>
  );
}
