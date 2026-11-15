import { supabase } from "./supabase";
import { localDate } from "./callWindow";

export type StayType = "visit" | "holiday" | "living_together";
export type Travel = "unset" | "one" | "both";
export interface Visit {
  id: string;
  place: string;
  starts_on: string; // YYYY-MM-DD
  ends_on: string | null;
  note: string;
  created_by: string | null;
  created_at?: string;
  // Time together (after migration 0029; optional so older databases still work)
  title?: string;
  country?: string;
  city?: string;
  stay_type?: StayType;
  travel?: Travel;
  travelled_by?: string | null;
  with_family?: boolean;
  family_note?: string;
  moment_id?: string | null;
}
export type VisitDraft = Omit<Visit, "id" | "created_by" | "created_at"> & { id?: string };

export const STAY_LABEL: Record<StayType, string> = { visit: "Visit", holiday: "Holiday together", living_together: "Living together" };
export const STAY_HINT: Record<StayType, string> = {
  visit: "One of you stayed with the other, or you met up",
  holiday: "A trip you took together",
  living_together: "You actually lived together at the same address — only choose this if that's true",
};

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

const V_BASE = "id, place, starts_on, ends_on, note, created_by, created_at";
let vCols = `${V_BASE}, title, country, city, stay_type, travel, travelled_by, with_family, family_note, moment_id`;
export async function listVisits(): Promise<Visit[]> {
  const run = () => supabase.from("visits").select(vCols).order("starts_on");
  let res = await run();
  if (res.error && vCols !== V_BASE) { vCols = V_BASE; res = await run(); }
  return check(res) as unknown as Visit[];
}

/** True once the database knows about Time together (migration 0029). */
export const hasTimeTogether = (visits: Visit[]) => vCols !== V_BASE && (visits.length === 0 || "stay_type" in visits[0]);

export async function saveVisit(v: VisitDraft): Promise<string> {
  if (v.stay_type !== undefined) {
    const res = await supabase.rpc("save_time_together", { p: { ...v, id: v.id ?? null, ends_on: v.ends_on || null } });
    if (!res.error) return res.data as string;
    const e = res.error as { code?: string; message?: string };
    if (!(e.code === "PGRST202" || /could not find the function/i.test(e.message ?? ""))) throw res.error;
  }
  return check(await supabase.rpc("save_visit", {
    p_id: v.id ?? null, p_place: v.place, p_starts_on: v.starts_on, p_ends_on: v.ends_on || null, p_note: v.note,
  })) as string;
}

export async function deleteVisit(id: string): Promise<void> {
  check(await supabase.rpc("delete_visit", { p_id: id }));
}

const dayNumber = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };

export type VisitState =
  | { kind: "upcoming"; visit: Visit; days: number }
  | { kind: "together"; visit: Visit; day: number; of: number | null }
  | { kind: "none" };

/** The visit that matters right now, from the viewer's local "today". */
export function visitState(visits: Visit[], now: Date, timeZone: string): VisitState {
  const t = localDate(now, timeZone);
  const today = Date.UTC(t.y, t.m - 1, t.d) / 86400000;
  for (const v of [...visits].sort((a, b) => a.starts_on.localeCompare(b.starts_on))) {
    const start = dayNumber(v.starts_on);
    const end = v.ends_on ? dayNumber(v.ends_on) : start;
    if (today >= start && today <= end) return { kind: "together", visit: v, day: today - start + 1, of: v.ends_on ? end - start + 1 : null };
    if (start > today) return { kind: "upcoming", visit: v, days: start - today };
  }
  return { kind: "none" };
}

export function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, d)));
}
