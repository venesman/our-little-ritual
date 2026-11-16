import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarPlus, ChevronDown, Heart, Phone, Plane } from "lucide-react";
import { downloadIcs, googleCalendarUrl } from "../lib/calendar";
import { dayLabel, formatRange, localDate, nextSharedWindow, nextWindowFor, prettyTime, sharedWindowsAhead, type Interval } from "../lib/callWindow";
import { zoneLabel } from "../lib/time";
import { PlacesWeMet, Scene, sceneFor } from "./Passport";
import { ago, recentNudges, sendNudge, summarise, type Nudge } from "../lib/nudges";
import { listVisits, visitState, type Visit } from "../lib/visits";
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
          <dt>You</dt><dd className="text-leaf">{prettyTime(me.from)} – {prettyTime(me.to!)} <span className="text-muted">({zoneLabel(me.timeZone, now)})</span></dd>
          <dt>{partnerName}</dt><dd className="text-leaf">{prettyTime(partner.from)} – {prettyTime(partner.to!)} <span className="text-muted">({zoneLabel(partner.timeZone, now)})</span></dd>
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
          <dt>You</dt>
          <dd><span className="font-medium text-leaf">{formatRange(w, me.timeZone)}</span><span className="block text-xs">{zoneLabel(me.timeZone, now)}</span></dd>
          <dt>{partnerName}</dt>
          <dd><span className="font-medium text-leaf">{formatRange(w, partner.timeZone)}</span> <span className="text-muted">({dayLabel(w.start, now, partner.timeZone)})</span><span className="block text-xs">{zoneLabel(partner.timeZone, now)}</span></dd>
        </dl>
        <button
          type="button" onClick={() => setPlanning((p) => !p)} aria-expanded={planning}
          className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-full border-[1.5px] border-leaf/15 bg-mustard px-4 text-sm font-semibold text-leaf shadow-print-sm transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
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
      `You: ${day(win.start, me.timeZone)}, ${formatRange(win, me.timeZone)} (${zoneLabel(me.timeZone, new Date(win.start))})\n` +
      `${partnerName}: ${day(win.start, partner.timeZone)}, ${formatRange(win, partner.timeZone)} (${zoneLabel(partner.timeZone, new Date(win.start))})\n` +
      `Shorten it in your calendar if you only need part of it.`,
  });
  return (
    <div className="mt-4 border-t border-dashed border-leaf/25 pt-3">
      <p className="mb-2 font-hand text-lg text-raspberry-deep">pick a day — you both add it to your own calendar</p>
      <ul className="space-y-2">
        {windows.map((win) => (
          <li key={win.start} className="rounded-xl bg-cream/70 px-3 py-2.5">
            <p className="text-sm font-semibold text-leaf">{day(win.start, me.timeZone)} · {formatRange(win, me.timeZone)} <span className="font-normal text-muted">({zoneLabel(me.timeZone, new Date(win.start))})</span></p>
            <p className="text-xs text-muted">{partnerName}: {day(win.start, partner.timeZone)}, {formatRange(win, partner.timeZone)} ({zoneLabel(partner.timeZone, new Date(win.start))})</p>
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
    <div className="rotate-[1.2deg] rounded-[24px] bg-lilac px-4 py-4 shadow-card">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-hand text-xl font-bold leading-tight">
            {sent ? `sent to ${partnerName.toLowerCase()} ♥` : theirs.last ? `${partnerName.toLowerCase()} thought of you` : "thinking of you"}
            {fresh && <span className="ml-1 inline-block animate-bounce text-raspberry-deep" aria-hidden="true">♥</span>}
          </p>
          {theirs.last ? (
            <p className="mt-0.5 font-display text-[2rem] leading-none">{theirs.todayCount > 0 ? <>{theirs.todayCount} {theirs.todayCount === 1 ? "time" : "times"}</> : ago(theirs.last, now)}</p>
          ) : (
            <p className="mt-1 text-sm">One tap lets {partnerName} know. No reply needed.</p>
          )}
          {mine.todayCount > 0 && <p className="mt-1 text-xs text-muted">you've sent {mine.todayCount} today</p>}
        </div>
        <button
          type="button" onClick={tap} disabled={busy}
          aria-label={`Send ${partnerName} a thinking-of-you`}
          className={`grid h-14 w-14 shrink-0 place-items-center rounded-full bg-tomato text-white shadow-print transition active:scale-95 disabled:opacity-60 ${sent ? "scale-110" : ""}`}
        >
          <Heart size={24} className="fill-current" aria-hidden="true" />
        </button>
      </div>
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
    </div>
  );
}

/* ------------------------------------------------------------ visit countdown */
const shortDay = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

export function VisitCard({ timeZone }: { timeZone: string }) {
  const [visits, setVisits] = useState<Visit[] | null>(null);
  useEffect(() => { listVisits().then(setVisits).catch(() => setVisits([])); }, []);
  if (visits === null) return null;
  const now = new Date();
  const t = localDate(now, timeZone);
  const today = `${t.y}-${String(t.m).padStart(2, "0")}-${String(t.d).padStart(2, "0")}`;
  const s = visitState(visits, now, timeZone);
  const where = s.kind === "none" ? "" : [s.visit.city, s.visit.country].filter(Boolean).join(", ") || s.visit.place;
  const stampName = s.kind === "none" ? "" : (s.visit.country || s.visit.city || s.visit.place);

  return (
    <div className="space-y-5">
      <PlacesWeMet visits={visits} today={today} />
      <Link to="/visits" className="block rounded-card focus:outline-none focus-visible:ring-2 focus-visible:ring-cornflower">
        {s.kind === "none" ? (
          <div className="flex items-center gap-3 rounded-card border-2 border-dashed border-leaf/25 bg-paper/60 px-5 py-4 text-muted hover:border-leaf/50">
            <Plane size={18} className="text-tomato" aria-hidden="true" />
            <span className="text-sm font-semibold">When's your next visit? Add it for your next stamp</span>
          </div>
        ) : (
          <article className="relative -rotate-1 overflow-hidden rounded-card bg-paper shadow-photo transition hover:rotate-0">
            <div className="airmail h-[10px]" aria-hidden="true" />
            <div className="grid grid-cols-[1fr_112px] items-center gap-2.5 px-4 pb-4 pt-3.5">
              <div className="min-w-0">
                {s.kind === "upcoming" ? (
                  <>
                    <p className="font-hand text-xl font-bold leading-none">until we're together{where ? ` in ${s.visit.city || s.visit.country || s.visit.place}` : ""}</p>
                    <p className="mt-1.5"><span className="font-display text-[3.4rem] leading-[0.9]">{s.days}</span> <em className="font-display text-[1.35rem]">{s.days === 1 ? "day" : "days"}</em></p>
                  </>
                ) : (
                  <>
                    <p className="font-hand text-xl font-bold leading-none">together now{where ? ` in ${where}` : ""}</p>
                    <p className="mt-1.5 font-display text-[2.2rem] leading-none">{s.of ? <>Day {s.day} <em className="text-xl">of {s.of}</em></> : "Today"}</p>
                  </>
                )}
                <p className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.1em]">{shortDay(s.visit.starts_on)}{s.visit.ends_on && s.visit.ends_on !== s.visit.starts_on ? ` → ${shortDay(s.visit.ends_on)}` : ""}</p>
              </div>
              <div className="flex h-[118px] -rotate-[8deg] flex-col items-center justify-center rounded-full border-2 border-dashed border-leaf/45 text-center">
                <Scene kind={sceneFor(`${s.visit.country} ${s.visit.city} ${s.visit.place}`)} className="h-11 w-16" />
                <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em]">{s.kind === "upcoming" ? "Next stamp" : "Stamping now"}</span>
                <span className="max-w-[90px] truncate font-display text-base leading-tight">{stampName}</span>
              </div>
            </div>
            <span className="absolute right-3.5 top-5 hidden" aria-hidden="true" />
          </article>
        )}
      </Link>
    </div>
  );
}
