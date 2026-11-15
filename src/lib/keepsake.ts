import { supabase } from "./supabase";
import type { DatePrecision, MilestoneTag } from "./story";
import type { StayType } from "./visits";

/* Yearly keepsake: "Our year together", built from what's already in the app. */

export interface Keepsake {
  year: number;
  stats: { rituals: number; checkins: number; letters: number; call_days: number; games: number; creations: number; research: number; missions: number; songs: number };
  days_together: number;
  visits: { title: string; place: string; city: string; country: string; from: string; until: string | null; stay_type: StayType; with_family: boolean }[];
  countries: string[];
  milestones: { title: string; on: string; tag: MilestoneTag | null; precision: DatePrecision }[];
  firsts: { kind: string; on: string; title: string }[];
  photos: { path: string; taken_at: string | null; title: string }[];
  songs: { title: string; artist: string; url: string; on: string; by: string }[];
  note_mine: string | null;
  note_partner: string | null;
  partner_wrote: boolean;
}

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

/** Null when the database hasn't been updated yet. */
export async function keepsakeYears(): Promise<number[] | null> {
  const res = await supabase.rpc("keepsake_years");
  if (res.error) return null;
  return (res.data ?? []) as number[];
}
export async function getKeepsake(year: number): Promise<Keepsake> {
  return check(await supabase.rpc("keepsake", { p_year: year })) as Keepsake;
}
export async function writeKeepsakeNote(year: number, body: string) {
  check(await supabase.rpc("keepsake_write_note", { p_year: year, p_body: body }));
}

/** Little stat tiles — only the ones that happened. */
export function statTiles(s: Keepsake["stats"]): { n: number; label: string }[] {
  const t: [number, string, string][] = [
    [s.rituals, "weekly ritual", "weekly rituals"], [s.checkins, "check-in", "check-ins"], [s.letters, "letter", "letters"],
    [s.call_days, "day with a call activity", "days with a call activity"], [s.games, "quiz or game", "quizzes & games"],
    [s.creations, "thing made together", "things made together"], [s.research, "research date", "research dates"],
    [s.missions, "apart mission", "apart missions"], [s.songs, "song shared", "songs shared"],
  ];
  return t.filter(([n]) => n > 0).map(([n, one, many]) => ({ n, label: n === 1 ? one : many }));
}
