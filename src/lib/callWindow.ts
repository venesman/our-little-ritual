/**
 * Best time to call: each partner sets when they're usually free, in their
 * own local time. We turn both windows into real moments (UTC) for the days
 * around now — respecting each zone's daylight-saving rules on that date —
 * and find where they overlap.
 */

export interface Interval { start: number; end: number } // epoch ms, end exclusive

const parts = (date: Date, timeZone: string) => {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute, s: +p.second };
};

/** How far ahead of UTC the zone is at that moment, in ms. */
export function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = parts(date, timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(date.getTime() / 1000) * 1000;
}

/** The UTC moment of a wall-clock time in a zone, e.g. 20:00 on 16 Nov in Asia/Kuching. */
export function zonedToUtc(y: number, m: number, d: number, h: number, min: number, timeZone: string): number {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const first = guess - zoneOffsetMs(new Date(guess), timeZone);
  return guess - zoneOffsetMs(new Date(first), timeZone);
}

/** Today's calendar date in a zone. */
export function localDate(now: Date, timeZone: string): { y: number; m: number; d: number } {
  const p = parts(now, timeZone);
  return { y: p.y, m: p.m, d: p.d };
}

const hm = (t: string) => { const [h, m] = t.split(":").map(Number); return { h, m }; };

/** The person's free window on the local days around `now` (yesterday → day after tomorrow). */
export function windowsAround(now: Date, timeZone: string, from: string, to: string): Interval[] {
  const today = localDate(now, timeZone);
  const f = hm(from), t = hm(to);
  const crosses = t.h * 60 + t.m <= f.h * 60 + f.m;
  const out: Interval[] = [];
  for (let k = -1; k <= 2; k++) {
    const base = new Date(Date.UTC(today.y, today.m - 1, today.d + k));
    const y = base.getUTCFullYear(), m = base.getUTCMonth() + 1, d = base.getUTCDate();
    const start = zonedToUtc(y, m, d, f.h, f.m, timeZone);
    const endDay = new Date(Date.UTC(y, m - 1, d + (crosses ? 1 : 0)));
    const end = zonedToUtc(endDay.getUTCFullYear(), endDay.getUTCMonth() + 1, endDay.getUTCDate(), t.h, t.m, timeZone);
    if (end > start) out.push({ start, end });
  }
  return out;
}

export function intersect(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const x of a) for (const y of b) {
    const start = Math.max(x.start, y.start), end = Math.min(x.end, y.end);
    if (end > start) out.push({ start, end });
  }
  return out.sort((p, q) => p.start - q.start);
}

export interface Person { timeZone: string; from: string | null; to: string | null }

/** The current or next shared free window, or null if your windows never overlap. */
export function nextSharedWindow(now: Date, me: Person, partner: Person): (Interval & { isNow: boolean }) | null {
  if (!me.from || !me.to || !partner.from || !partner.to) return null;
  const shared = intersect(windowsAround(now, me.timeZone, me.from, me.to), windowsAround(now, partner.timeZone, partner.from, partner.to));
  const t = now.getTime();
  const next = shared.find((w) => w.end > t);
  return next ? { ...next, isNow: next.start <= t } : null;
}

/** e.g. "8:00 – 10:00 pm" or "11:30 pm – 1:00 am", in a zone. */
export function formatRange(w: Interval, timeZone: string): string {
  const f = (ms: number) => new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(ms));
  return `${f(w.start)} – ${f(w.end)}`;
}

/** The partner's next free window (now or upcoming), to show in your own time. */
export function nextWindowFor(now: Date, p: Person): Interval | null {
  if (!p.from || !p.to) return null;
  const t = now.getTime();
  return windowsAround(now, p.timeZone, p.from, p.to).find((w) => w.end > t) ?? null;
}

/** "18:00" -> "6:00 pm" */
export function prettyTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "today" / "tomorrow" / "Tue" for the window's start, in a zone. */
export function dayLabel(ms: number, now: Date, timeZone: string): string {
  const a = localDate(new Date(ms), timeZone), b = localDate(now, timeZone);
  const diff = Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short" }).format(new Date(ms));
}
