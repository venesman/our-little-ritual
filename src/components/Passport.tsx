import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plane, Plus } from "lucide-react";
import { clockInZone, placeFromZone } from "../lib/time";
import { listMilestones } from "../lib/story";
import type { Visit } from "../lib/visits";

/* =====================================================================
 * "Scrapbook Passport" pieces for Home: a "together since" stamp, the
 * boarding pass with both clocks, visa stamps for every place you've met,
 * and little drawings for where you are.
 * ===================================================================== */

const INK = "#3A2A24";

/* --------------------------------------------------------- drawings */
type Scene = "longhouse" | "swedish-house" | "mountains" | "plane";
export function sceneFor(place: string | null | undefined): Scene {
  const p = (place ?? "").toLowerCase();
  if (/swed|sverige|lund|stockholm|malm|göteborg|gothenburg|uppsala/.test(p)) return "swedish-house";
  if (/malays|kuching|sarawak|borneo|kuala|sabah/.test(p)) return "longhouse";
  if (/chile|santiago|andes|argentin|peru|bolivia|patagon/.test(p)) return "mountains";
  return "plane";
}

/** Flat little illustrations with brown ink outlines. */
export function Scene({ kind, className = "", night = false }: { kind: Scene; className?: string; night?: boolean }) {
  if (kind === "longhouse") return (
    <svg aria-hidden="true" viewBox="0 0 120 70" className={className}>
      {night ? <><circle cx="102" cy="16" r="8" fill={INK} /><circle cx="106" cy="13" r="7" fill="#fff" /></> : <circle cx="104" cy="14" r="8" fill="#EE8A2B" />}
      <path d="M 10 34 L 60 14 L 110 34 Z" fill="#E0614F" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <rect x="20" y="34" width="80" height="16" fill="#FBF0C4" stroke={INK} strokeWidth="2.4" />
      <path d="M 36 34 V 50 M 52 34 V 50 M 68 34 V 50 M 84 34 V 50 M 26 50 V 60 M 46 50 V 60 M 74 50 V 60 M 94 50 V 60" stroke={INK} strokeWidth="2.4" />
      <path d="M 4 64 q 8 -6 16 0 t 16 0 t 16 0 t 16 0 t 16 0 t 16 0 t 16 0" fill="none" stroke="#7FB0A0" strokeWidth="2.6" />
    </svg>
  );
  if (kind === "swedish-house") return (
    <svg aria-hidden="true" viewBox="0 0 120 84" className={className}>
      <rect x="26" y="40" width="58" height="40" fill="#E0614F" stroke={INK} strokeWidth="2.6" />
      <path d="M 18 42 L 55 16 L 92 42" fill="#FFFAF3" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <rect x="49" y="56" width="12" height="24" fill={INK} />
      <path d="M 112 80 L 92 80 L 102 50 Z" fill="#7FB0A0" stroke={INK} strokeWidth="2.4" />
    </svg>
  );
  if (kind === "mountains") return (
    <svg aria-hidden="true" viewBox="0 0 120 70" className={className}>
      {night ? <><circle cx="100" cy="16" r="8" fill={INK} /><circle cx="104" cy="13" r="7" fill="#fff" /></> : <circle cx="102" cy="14" r="8" fill="#EE8A2B" />}
      <path d="M 4 70 L 42 24 L 60 44 L 78 18 L 118 70 Z" fill="#F4A36B" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M 34 34 L 42 24 L 50 33 L 45 36 Z M 70 28 L 78 18 L 86 28 L 80 30 Z" fill="#fff" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
  return (
    <svg aria-hidden="true" viewBox="0 0 60 40" className={className}>
      <path d="M 6 24 L 54 8 L 40 34 L 30 26 Z M 30 26 L 54 8" fill="#DCE6F4" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------- together since */
/** A perforated stamp with your loops — shown once "Our relationship began" is added. */
export function TogetherSince({ className = "" }: { className?: string }) {
  const [on, setOn] = useState<string | null>(null);
  useEffect(() => {
    listMilestones().then((ms) => setOn(ms.find((m) => m.tag === "relationship_start" && m.happened_on)?.happened_on ?? null)).catch(() => {});
  }, []);
  if (!on) return (
    <Link to="/us?tab=story&add=relationship_start" className={`flex h-[118px] w-[98px] rotate-[6deg] flex-col items-center justify-center rounded-lg border-2 border-dashed border-leaf/30 p-2 text-center ${className}`}>
      <Plus size={16} aria-hidden="true" />
      <span className="mt-1 font-hand text-lg leading-tight">when did it all begin?</span>
    </Link>
  );
  const d = new Date(`${on}T00:00:00Z`);
  const label = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(d);
  return (
    <div role="img" aria-label={`Together since ${label}`} className={`h-[118px] w-[98px] rotate-[7deg] p-2 shadow-print ${className}`}
      style={{ background: "radial-gradient(circle at 5px 5px, #FBF3EA 4px, transparent 4.5px) -5px -5px / 10px 10px, #E0614F" }}>
      <div className="flex h-full flex-col items-center justify-center gap-0.5 border-[1.5px] border-leaf bg-peach text-center">
        <svg aria-hidden="true" viewBox="0 0 80 48" className="h-8 w-[52px]"><circle cx="28" cy="24" r="17" fill="none" stroke="#E0614F" strokeWidth="4" /><circle cx="52" cy="24" r="17" fill="none" stroke="#4F7FC1" strokeWidth="4" /></svg>
        <span className="text-[8px] font-bold uppercase tracking-[0.12em]">Together since</span>
        <span className="font-display text-lg leading-none">{label}</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------- boarding pass */
const AIRPORT: [RegExp, string][] = [
  [/kuching/i, "KCH"], [/santiago/i, "SCL"], [/stockholm/i, "ARN"], [/lund|malm/i, "MMX"], [/copenhagen|københavn/i, "CPH"],
  [/kuala lumpur/i, "KUL"], [/göteborg|gothenburg/i, "GOT"], [/berlin/i, "BER"], [/munich|münchen/i, "MUC"], [/frankfurt/i, "FRA"],
  [/singapore/i, "SIN"], [/london/i, "LHR"], [/kota kinabalu/i, "BKI"], [/miri/i, "MYY"], [/sibu/i, "SBW"],
];
export function airportCode(city: string): string {
  const hit = AIRPORT.find(([re]) => re.test(city));
  return hit ? hit[1] : city.replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 3).toUpperCase() || "???";
}
function offsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return (Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute")) - Math.floor(at.getTime() / 60000) * 60000) / 60000;
}

export interface Traveller { name: string; tz: string; city: string | null }

/** Both clocks on a boarding pass, with a tear-off stub for the time difference. */
export function BoardingPass({ from, to, now }: { from: Traveller; to: Traveller; now: Date }) {
  const a = from.city?.trim() || placeFromZone(from.tz);
  const b = to.city?.trim() || placeFromZone(to.tz);
  const diff = Math.round((offsetMinutes(to.tz, now) - offsetMinutes(from.tz, now)) / 60);
  return (
    <section aria-label={`${from.name} in ${a}: ${clockInZone(now, from.tz)}. ${to.name} in ${b}: ${clockInZone(now, to.tz)}.`}
      className="ticket-lg flex -rotate-1 bg-white shadow-card">
      <div className="min-w-0 flex-1 py-3.5 pl-5 pr-2.5" aria-hidden="true">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-raspberry-deep">Boarding pass</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display text-[1.9rem] leading-none">{airportCode(a)}</p>
            <p className="mt-0.5 truncate text-[11px] font-bold uppercase tracking-[0.08em]">{from.name}</p>
            <p className="mt-0.5 font-display text-lg leading-tight">{clockInZone(now, from.tz)}</p>
          </div>
          <svg viewBox="0 0 60 24" className="h-[22px] w-12 shrink-0">
            <path d="M 2 12 H 50" fill="none" stroke={INK} strokeWidth="1.4" strokeDasharray="3 4" />
            <path d="M 46 6 L 58 12 L 46 18 L 49 12 Z" fill="#E0614F" />
          </svg>
          <div className="min-w-0 text-right">
            <p className="font-display text-[1.9rem] leading-none">{airportCode(b)}</p>
            <p className="mt-0.5 truncate text-[11px] font-bold uppercase tracking-[0.08em]">{to.name}</p>
            <p className="mt-0.5 font-display text-lg leading-tight">{clockInZone(now, to.tz)}</p>
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="my-3 border-l-2 border-dashed border-leaf/25" />
      <div aria-hidden="true" className="flex w-[74px] shrink-0 flex-col items-center justify-between py-3.5 pl-2 pr-4 text-center">
        <span className="text-[9px] font-bold uppercase tracking-[0.12em]">Apart by</span>
        <span className="font-hand text-xl font-bold leading-none">{diff === 0 ? "same time" : `${Math.abs(diff)} hrs`}</span>
        <span className="h-5 w-11" style={{ background: `repeating-linear-gradient(to right, ${INK} 0 2px, transparent 2px 4px, ${INK} 4px 5px, transparent 5px 8px)` }} />
      </div>
    </section>
  );
}

/* --------------------------------------------------- visa stamps */
const STAMP_INK = ["#C8352B", "#2F5A9A", "#3E6B4C"];
const shortMonth = (iso: string) => new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`)).toUpperCase();

function VisaStamp({ v, i }: { v: Visit; i: number }) {
  const ink = STAMP_INK[i % 3];
  const shape = i % 3;
  const where = (v.city || v.place).toUpperCase().slice(0, 14);
  const country = (v.country ?? "").toUpperCase().slice(0, 14);
  const when = shortMonth(v.starts_on);
  const tilt = [-12, 6, 14, -6, 9, -14][i % 6];
  const label = `${v.title || v.place}${v.country ? `, ${v.country}` : ""}, ${when.toLowerCase()}${v.with_family ? ", with family" : ""}`;
  const t = { fontFamily: "DM Sans Variable, sans-serif", fontWeight: 700, fill: ink } as const;
  return (
    <li className="-m-1" style={{ transform: `rotate(${tilt}deg)` }}>
      {shape === 0 ? (
        <svg role="img" aria-label={label} viewBox="0 0 110 110" className="h-[96px] w-[96px]">
          <circle cx="55" cy="55" r="50" fill="none" stroke={ink} strokeWidth="2.5" />
          <circle cx="55" cy="55" r="40" fill="none" stroke={ink} strokeWidth="1.2" strokeDasharray="3 3" />
          <text x="55" y={country ? 46 : 52} textAnchor="middle" fontSize={where.length > 9 ? 10 : 13} letterSpacing="1" {...t}>{where}</text>
          {country && <text x="55" y="59" textAnchor="middle" fontSize="8" {...t}>{country}</text>}
          <text x="55" y={v.with_family ? 71 : 73} textAnchor="middle" fontSize="8.5" {...t}>{when}</text>
          {v.with_family && <text x="55" y="82" textAnchor="middle" fontSize="7" {...t}>WITH FAMILY</text>}
        </svg>
      ) : shape === 1 ? (
        <svg role="img" aria-label={label} viewBox="0 0 130 90" className="h-[80px] w-[114px]">
          <rect x="4" y="4" width="122" height="82" rx="10" fill="none" stroke={ink} strokeWidth="2.5" />
          <text x="65" y={country ? 34 : 40} textAnchor="middle" fontSize={where.length > 10 ? 11 : 14} {...t}>{where}</text>
          {country && <text x="65" y="48" textAnchor="middle" fontSize="8.5" {...t}>{country}</text>}
          <path d="M 18 56 H 112" stroke={ink} strokeWidth="1" strokeDasharray="2 3" />
          <text x="65" y="72" textAnchor="middle" fontSize="9" {...t}>{v.with_family ? `WITH FAMILY · ${when}` : `ARRIVED · ${when}`}</text>
        </svg>
      ) : (
        <svg role="img" aria-label={label} viewBox="0 0 110 110" className="h-[90px] w-[90px]">
          <path d="M 55 6 L 104 55 L 55 104 L 6 55 Z" fill="none" stroke={ink} strokeWidth="2.5" />
          <text x="55" y={country ? 48 : 52} textAnchor="middle" fontSize={where.length > 9 ? 9 : 12} {...t}>{where}</text>
          {country && <text x="55" y="60" textAnchor="middle" fontSize="7.5" {...t}>{country}</text>}
          <text x="55" y="71" textAnchor="middle" fontSize="8" {...t}>{when}</text>
          {v.with_family && <text x="55" y="80" textAnchor="middle" fontSize="6.5" {...t}>WITH FAMILY</text>}
        </svg>
      )}
    </li>
  );
}

/** "Places we've met": a passport page with a visa stamp for every past visit. */
export function PlacesWeMet({ visits, today }: { visits: Visit[]; today: string }) {
  const past = visits.filter((v) => (v.ends_on ?? v.starts_on) < today).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  return (
    <Link to="/visits" className="block rotate-[0.6deg] rounded-card bg-paper px-4 pb-3 pt-4 shadow-card transition hover:rotate-0">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-sans text-[11px] font-bold uppercase tracking-[0.14em]">Places we've met</h2>
        <span className="font-hand text-lg font-bold text-raspberry-deep">
          {past.length === 0 ? "your first stamp is waiting" : `${past.length} ${past.length === 1 ? "stamp" : "stamps"} so far`}
        </span>
      </div>
      {past.length === 0 ? (
        <div className="mt-3 flex items-center gap-3 rounded-2xl border-2 border-dashed border-leaf/25 px-4 py-5 text-sm text-muted">
          <Plane size={18} className="shrink-0 text-tomato" aria-hidden="true" />
          Add the times you've already met — each one becomes a stamp.
        </div>
      ) : (
        <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-0 gap-y-1 py-1">
          {past.slice(-9).map((v, i) => <VisaStamp key={v.id} v={v} i={i} />)}
        </ul>
      )}
    </Link>
  );
}
