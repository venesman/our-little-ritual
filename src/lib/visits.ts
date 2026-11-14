import { supabase } from "./supabase";
import { localDate } from "./callWindow";

export interface Visit {
  id: string;
  place: string;
  starts_on: string; // YYYY-MM-DD
  ends_on: string | null;
  note: string;
  created_by: string | null;
}

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export async function listVisits(): Promise<Visit[]> {
  return check(await supabase.from("visits").select("id, place, starts_on, ends_on, note, created_by").order("starts_on")) as Visit[];
}

export async function saveVisit(v: { id?: string; place: string; starts_on: string; ends_on: string | null; note: string }): Promise<string> {
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
