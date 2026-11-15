/** Weekly rituals are released every Monday at 11:00 UTC (7 pm Kuching) — the shared boundary for both partners. */
export const RELEASE_UTC_HOUR = 11;

/** The next Monday release (11:00 UTC) strictly after `now`. */
export function nextRelease(now: Date = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), RELEASE_UTC_HOUR));
  const daysUntilMonday = (1 - d.getUTCDay() + 7) % 7; // getUTCDay: 0 = Sunday, 1 = Monday
  d.setUTCDate(d.getUTCDate() + daysUntilMonday);
  if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function listTimezones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  return intl.supportedValuesOf?.("timeZone") ?? ["UTC", "Asia/Kuching", "Asia/Kuala_Lumpur", "America/Santiago"];
}

/** e.g. "Mon 16 Nov, 8:00 PM" in the given time zone. */
export function formatInZone(date: Date, timeZone: string): string {
  const tz = isValidTimezone(timeZone) ? timeZone : "UTC";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(date);
}

/** e.g. "in 2 days" / "in 5 hours" */
export function relativeFromNow(date: Date, now: Date = new Date()): string {
  const mins = Math.round((date.getTime() - now.getTime()) / 60000);
  if (mins < 60) return `in ${Math.max(mins, 1)} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.round(mins / 60);
  if (hours < 36) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

/** e.g. "9:41 pm" — the current clock in a zone. */
export function clockInZone(date: Date, timeZone: string): string {
  const tz = isValidTimezone(timeZone) ? timeZone : "UTC";
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(date);
}

/** e.g. "Saturday, 14 November" in a zone. */
export function longDateInZone(date: Date, timeZone: string): string {
  const tz = isValidTimezone(timeZone) ? timeZone : "UTC";
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(date);
}

/** "GMT+8", "GMT-3", "GMT+5:30" for a zone at a given moment (follows daylight saving). */
export function gmtLabel(timeZone: string, at: Date = new Date()): string {
  const tz = isValidTimezone(timeZone) ? timeZone : "UTC";
  try {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(at);
    const name = p.find((x) => x.type === "timeZoneName")?.value;
    if (name) return name === "GMT" ? "GMT+0" : name;
  } catch { /* older browsers: compute it */ }
  const local = new Date(at.toLocaleString("en-US", { timeZone: tz }));
  const utc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }));
  const mins = Math.round((local.getTime() - utc.getTime()) / 60000);
  const sign = mins < 0 ? "-" : "+";
  const h = Math.floor(Math.abs(mins) / 60), m = Math.abs(mins) % 60;
  return `GMT${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

/** "Kuching · GMT+8" */
export function zoneLabel(timeZone: string, at: Date = new Date()): string {
  return `${placeFromZone(timeZone)} · ${gmtLabel(timeZone, at)}`;
}

/** "America/Santiago" -> "Santiago" */
export function placeFromZone(timeZone: string): string {
  const last = timeZone.split("/").pop() ?? timeZone;
  return last.replace(/_/g, " ");
}

/* A few countries to time zones, for suggestions in Our Story. Anything else falls back to matching the city. */
const COUNTRY_ZONES: Record<string, string[]> = {
  malaysia: ["Asia/Kuala_Lumpur", "Asia/Kuching"],
  chile: ["America/Santiago", "America/Punta_Arenas", "Pacific/Easter"],
  sweden: ["Europe/Stockholm"],
  argentina: ["America/Argentina/Buenos_Aires"], peru: ["America/Lima"], bolivia: ["America/La_Paz"],
  brazil: ["America/Sao_Paulo", "America/Manaus"], colombia: ["America/Bogota"], ecuador: ["America/Guayaquil"],
  uruguay: ["America/Montevideo"], paraguay: ["America/Asuncion"], mexico: ["America/Mexico_City"],
  spain: ["Europe/Madrid"], "united kingdom": ["Europe/London"], uk: ["Europe/London"], norway: ["Europe/Oslo"],
  denmark: ["Europe/Copenhagen"], finland: ["Europe/Helsinki"], germany: ["Europe/Berlin"],
  singapore: ["Asia/Singapore"], indonesia: ["Asia/Jakarta", "Asia/Makassar"], brunei: ["Asia/Brunei"],
  thailand: ["Asia/Bangkok"], japan: ["Asia/Tokyo"], australia: ["Australia/Sydney", "Australia/Perth"],
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s-]+/g, "_").trim();

/** Time zones that match a city (by name) or a country (from a short list). Best guesses first; never decides for you. */
export function suggestZones(city: string | null | undefined, country: string | null | undefined, zones: string[] = listTimezones()): string[] {
  const out: string[] = [];
  const c = city ? norm(city) : "";
  if (c) for (const z of zones) if (norm(z.split("/").pop() ?? "") === c) out.push(z);
  const k = country ? country.trim().toLowerCase() : "";
  for (const z of COUNTRY_ZONES[k] ?? []) if (!out.includes(z) && zones.includes(z)) out.push(z);
  return out.slice(0, 4);
}
