import type { Memory, MonthSummary } from "./scrapbook";
import type { Milestone } from "./story";
import { TAG_LABEL } from "./story";
import type { Visit } from "./visits";
import { STAY_LABEL } from "./visits";
import {
  DOC_TYPE_LABEL, daysInclusive, enteredBy, fmtPrecise, togetherByMonth, togetherDays,
  type MonthRecord, type SupportingDoc,
} from "./record";

/* =====================================================================
 * Export our story: turns what's in the app into the sections of the
 * relationship record. Pure (no network), so the Word file and the
 * printable page always say exactly the same thing.
 * ===================================================================== */

export interface Person { id: string; display_name: string; current_city: string | null; current_country: string | null; home_country: string | null }

export interface RecordInput {
  from: string; to: string; today: string;
  people: Person[]; myId: string | null;
  visits: Visit[]; milestones: Milestone[]; feed: Memory[]; docs: SupportingDoc[];
  months: MonthRecord[] | null; oldMonths: MonthSummary[];
  excluded: Set<string>;
}

export interface Row {
  key: string;          // for "leave out"
  date: string;         // formatted, consistent
  sort: string;         // ISO for ordering
  title: string;
  details: string;
  source: string;       // "Entered by Vee on 3 Dec 2026 · 2 documents attached"
  edit: string;         // where to change it in the app
}
export interface VisitRow extends Row { kind: string; travelled: string; days: number; from: string; until: string | null }
export interface DocRow { key: string; n: number; name: string; type: string; attachedTo: string; added: string }
export interface MonthRow {
  month: string;
  communication: string;
  activities: string;
  letters: string;
  experiences: string;
  together: string;
}

export const fmtDate = (d: string) => fmtPrecise(d, "day");
export const dateRange = (from: string, until?: string | null) => (until && until !== from ? `${fmtDate(from)} – ${fmtDate(until)}` : fmtDate(from));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function buildRecord(i: RecordInput) {
  const name = (id: string | null | undefined) => i.people.find((p) => p.id === id)?.display_name ?? "";
  const other = (id: string | null | undefined) => i.people.find((p) => p.id !== id)?.display_name ?? "";
  const docsOf = (kind: "visit" | "milestone", id: string) => i.docs.filter((d) => d.attached_kind === kind && d.ref_id === id);
  const docNote = (n: number) => (n ? ` · ${plural(n, "supporting document")} attached` : "");
  const inRange = (from: string, until?: string | null) => (until ?? from) >= i.from && from <= i.to;
  const keep = (k: string) => !i.excluded.has(k);

  /* --------------------------------------------------------- timeline */
  const dated = i.milestones.filter((m) => m.happened_on);
  const msRow = (m: Milestone): Row => ({
    key: `m:${m.id}`, sort: m.happened_on!, date: fmtPrecise(m.happened_on!, m.date_precision), title: m.title,
    details: [m.tag && TAG_LABEL[m.tag] !== m.title ? TAG_LABEL[m.tag] : "", m.note].filter(Boolean).join(" — "),
    source: enteredBy(name(m.created_by), m.created_at) + (m.date_precision && m.date_precision !== "day" ? ` · date known to the ${m.date_precision}` : "") + docNote(docsOf("milestone", m.id).length),
    edit: "/us?tab=story",
  });
  const allTimeline = dated.filter((m) => m.happened_on! <= i.today && inRange(m.happened_on!)).map(msRow).sort((a, b) => a.sort.localeCompare(b.sort));
  const allPlans = dated.filter((m) => m.happened_on! > i.today).map(msRow).sort((a, b) => a.sort.localeCompare(b.sort));

  /* ----------------------------------------------------------- visits */
  const linkedMoments = new Set(i.visits.map((v) => v.moment_id).filter(Boolean));
  const travelled = (v: Visit) => (v.travel === "one" && v.travelled_by ? `${name(v.travelled_by)} travelled to ${other(v.travelled_by)}` : v.travel === "both" ? "We both travelled" : "—");
  const visitRows: VisitRow[] = [
    ...i.visits.filter((v) => v.starts_on <= i.today && inRange(v.starts_on, v.ends_on)).map((v): VisitRow => {
      const until = v.ends_on && v.ends_on > i.today ? i.today : v.ends_on;
      const place = [v.place, [v.city, v.country].filter(Boolean).join(", ")].filter(Boolean).join(", ");
      return {
        key: `v:${v.id}`, sort: v.starts_on, from: v.starts_on, until, date: dateRange(v.starts_on, until),
        title: v.title || `Together in ${v.place}`, details: [place, v.note].filter(Boolean).join(" — "),
        kind: STAY_LABEL[v.stay_type ?? "visit"], travelled: travelled(v), days: daysInclusive(v.starts_on, until),
        source: enteredBy(name(v.created_by), v.created_at) + docNote(docsOf("visit", v.id).length), edit: "/visits",
      };
    }),
    ...i.feed.filter((m) => m.kind === "moment" && m.starts_on && !linkedMoments.has(m.ref_id) && m.starts_on <= i.today && inRange(m.starts_on, m.ends_on)).map((m): VisitRow => ({
      key: `t:${m.ref_id}`, sort: m.starts_on!, from: m.starts_on!, until: m.ends_on ?? null, date: dateRange(m.starts_on!, m.ends_on),
      title: m.title, details: m.place ?? "", kind: "Trip or moment", travelled: "—", days: daysInclusive(m.starts_on!, m.ends_on),
      source: enteredBy(name(m.authors?.[0])), edit: `/us/moment/${m.ref_id}`,
    })),
  ].sort((a, b) => a.sort.localeCompare(b.sort));
  const visitsKept = visitRows.filter((r) => keep(r.key));
  const days = togetherDays(visitsKept.map((r) => ({ from: r.from, until: r.until })), i.from, i.to);
  const byKind: Record<string, number> = {};
  for (const r of visitsKept) byKind[r.kind] = (byKind[r.kind] ?? 0) + r.days;

  /* ----------------------------------------------------------- family */
  const family: Row[] = [
    ...i.visits.filter((v) => v.with_family && v.starts_on <= i.today && inRange(v.starts_on, v.ends_on)).map((v): Row => ({
      key: `fv:${v.id}`, sort: v.starts_on, date: dateRange(v.starts_on, v.ends_on && v.ends_on > i.today ? i.today : v.ends_on),
      title: v.title || `Together in ${v.place}`, details: [[v.city, v.country].filter(Boolean).join(", "), v.family_note].filter(Boolean).join(" — "),
      source: enteredBy(name(v.created_by), v.created_at) + docNote(docsOf("visit", v.id).length), edit: "/visits",
    })),
    ...dated.filter((m) => m.tag === "met_family" && m.happened_on! <= i.today && inRange(m.happened_on!)).map((m) => ({ ...msRow(m), key: `fm:${m.id}` })),
  ].sort((a, b) => a.sort.localeCompare(b.sort));

  /* ----------------------------------------------------------- months */
  const perMonth = togetherByMonth(days);
  const [a, b] = i.people;
  const months: MonthRow[] = i.months
    ? i.months.map((r) => {
        const lA = a ? r.letters_by[a.id] ?? 0 : 0;
        const lB = b ? r.letters_by[b.id] ?? 0 : 0;
        const together = perMonth[r.month.slice(0, 7)] ?? 0;
        return {
          month: r.month,
          communication: join([r.rituals_both && plural(r.rituals_both, "weekly ritual"), r.checkins_both && plural(r.checkins_both, "check-in")]),
          activities: join([r.call_days && `${plural(r.call_days, "day")} with a call activity`, r.games && plural(r.games, "quiz / game", "quizzes / games"), r.creations && `${r.creations} made together`]),
          letters: join([a && lA && `${a.display_name} ${lA}`, b && lB && `${b.display_name} ${lB}`]),
          experiences: join([r.research && plural(r.research, "research date"), r.missions_both && plural(r.missions_both, "mission"), r.songs && plural(r.songs, "song")]),
          together: together ? plural(together, "day") : "",
        };
      })
    : i.oldMonths.map((r) => ({
        month: r.month,
        communication: join([r.rituals_both && plural(r.rituals_both, "weekly ritual"), r.checkins_both && plural(r.checkins_both, "check-in")]),
        activities: join([r.play_sessions && plural(r.play_sessions, "call activity", "call activities"), r.games && plural(r.games, "quiz / game", "quizzes / games"), r.creations && `${r.creations} made together`]),
        letters: r.letters ? plural(r.letters, "letter") : "",
        experiences: join([r.curious_sessions && plural(r.curious_sessions, "research date"), r.apart_missions && plural(r.apart_missions, "mission"), r.songs && plural(r.songs, "song")]),
        together: perMonth[r.month.slice(0, 7)] ? plural(perMonth[r.month.slice(0, 7)], "day") : "",
      }));
  const monthRows = months.filter((m) => m.communication || m.activities || m.letters || m.experiences || m.together);

  /* ------------------------------------------------------ documents */
  const attachedTo = (d: SupportingDoc) => {
    if (d.attached_kind === "visit") { const v = i.visits.find((x) => x.id === d.ref_id); return v ? `Visit: ${v.title || v.place} (${dateRange(v.starts_on, v.ends_on)})` : "Visit"; }
    const m = i.milestones.find((x) => x.id === d.ref_id); return m ? `Milestone: ${m.title}${m.happened_on ? ` (${fmtPrecise(m.happened_on, m.date_precision)})` : ""}` : "Milestone";
  };
  const shownRefs = new Set([...visitsKept.map((r) => r.key), ...allTimeline.filter((r) => keep(r.key)).map((r) => r.key), ...allPlans.filter((r) => keep(r.key)).map((r) => r.key)]);
  const docRows: DocRow[] = i.docs
    .filter((d) => shownRefs.has(`${d.attached_kind === "visit" ? "v" : "m"}:${d.ref_id}`))
    .map((d, n) => ({
      key: `d:${d.id}`, n: n + 1, name: d.file_name, type: DOC_TYPE_LABEL[d.doc_type], attachedTo: attachedTo(d),
      added: `${name(d.added_by) || "—"}, ${fmtDate(d.created_at.slice(0, 10))}`,
    }))
    .filter((d) => keep(d.key))
    .map((d, n) => ({ ...d, n: n + 1 }));

  /* ------------------------------------------------- start & overview */
  const startMs = dated.find((m) => m.tag === "relationship_start");
  const metMs = dated.find((m) => m.tag === "first_met");
  const countries = [...new Set(visitsKept.filter((r) => r.key.startsWith("v:")).map((r) => i.visits.find((v) => `v:${v.id}` === r.key)?.country).filter((c): c is string => !!c))];

  return {
    timeline: allTimeline, plans: allPlans,
    visits: visitRows, totalDays: days.size, byKind,
    family, months: monthRows, docs: docRows,
    start: startMs ? { on: startMs.happened_on!, precision: startMs.date_precision } : null,
    firstMet: metMs ? { on: metMs.happened_on!, precision: metMs.date_precision } : null,
    countries,
    familyVisits: i.visits.filter((v) => v.with_family && v.starts_on <= i.today && keep(`v:${v.id}`)).length,
    meetings: mergeRanges(visitsKept.map((r) => ({ from: r.from, until: r.until }))),
  };
}

function join(parts: (string | number | false | null | undefined | 0)[]) {
  return parts.filter((p): p is string => typeof p === "string" && p.length > 0).join(" · ");
}

/** Leaves out written words by the partner unless they've allowed it. Your own words are always yours to include. */
export function wordsAllowed(m: Memory, myId: string | null, consent: Record<string, boolean>): Memory | null {
  const ok = (uid: string | null | undefined) => !uid || uid === myId || consent[uid] === true;
  if (m.kind === "letter") return ok(m.authors?.[0]) ? m : null;
  if (!m.parts?.length) return m;
  return { ...m, parts: m.parts.filter((p) => ok(p.user_id)) };
}

export const DECLARATION = (names: string[]) =>
  `This record was compiled by ${names.join(" and ")} from information we recorded ourselves in the Our Little Ritual app. ` +
  "Entries marked “Recorded by the app” were dated automatically when they happened. Entries marked “Entered by” were typed in by one of us and have not been independently verified. " +
  "Photo dates come from the camera's own data in the photo unless marked as set by hand. Supporting documents are listed for reference; the originals are kept separately. " +
  "This is a personal record, not an official document, and it is meant to be read alongside independent evidence. To the best of our knowledge, the information in it is true.";

/** Overlapping or back-to-back stays become one meeting (a trip logged twice is still one time together). */
export function mergeRanges(rs: { from: string; until: string | null }[]): { from: string; until: string | null }[] {
  const next = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const out: { from: string; until: string }[] = [];
  for (const r of [...rs].sort((a, b) => a.from.localeCompare(b.from))) {
    const end = r.until && r.until > r.from ? r.until : r.from;
    const last = out[out.length - 1];
    if (last && r.from <= next(last.until)) { if (end > last.until) last.until = end; } else out.push({ from: r.from, until: end });
  }
  return out;
}
