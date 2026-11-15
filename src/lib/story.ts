import { supabase } from "./supabase";

/** True when the database hasn't been updated yet (the function doesn't exist). */
export function isMissingFunction(e: unknown): boolean {
  const x = e as { code?: string; message?: string } | null;
  return x?.code === "PGRST202" || x?.code === "42883" || /could not find the function|does not exist/i.test(x?.message ?? "");
}

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export interface LifeUpdate { id: string; user_id: string; body: string; created_at: string }
export interface SharedProfile { shared_interests: string[]; enjoy_together: string[]; shared_goals: string }
export type MilestoneKind = "milestone" | "important_date" | "memory";
export type MilestoneTag = "first_met" | "relationship_start" | "first_visit" | "met_family" | "holiday" | "anniversary" | "birthday" | "engagement" | "marriage" | "moving" | "other";
export type DatePrecision = "day" | "month" | "year";
export interface Milestone { id: string; kind: MilestoneKind; title: string; happened_on: string | null; note: string; tag?: MilestoneTag | null; date_precision?: DatePrecision; created_by?: string | null; created_at?: string }

export const TAG_LABEL: Record<MilestoneTag, string> = {
  first_met: "When we first met", relationship_start: "Our relationship began", first_visit: "First visit to a country",
  met_family: "Meeting family", holiday: "Holiday together", anniversary: "Anniversary", birthday: "Birthday",
  engagement: "Engagement", marriage: "Marriage", moving: "Moving / relocation", other: "Other",
};
export const PRECISION_LABEL: Record<DatePrecision, string> = { day: "Exact day", month: "Month only", year: "Year only" };

export const MILESTONE_LABEL: Record<MilestoneKind, string> = {
  milestone: "Milestone", important_date: "Important date", memory: "Memory",
};

export async function listLifeUpdates(): Promise<LifeUpdate[]> {
  return check(await supabase.from("life_updates").select("id, user_id, body, created_at").order("created_at", { ascending: false }).limit(30)) as LifeUpdate[];
}
export async function addLifeUpdate(body: string) { check(await supabase.rpc("add_life_update", { p_body: body })); }
export async function deleteLifeUpdate(id: string) { check(await supabase.rpc("delete_life_update", { p_id: id })); }

export async function getSharedProfile(): Promise<SharedProfile> {
  const row = check(await supabase.from("relationship_profile").select("shared_interests, enjoy_together, shared_goals").maybeSingle()) as SharedProfile | null;
  return row ?? { shared_interests: [], enjoy_together: [], shared_goals: "" };
}
export async function saveSharedProfile(patch: Partial<SharedProfile>) { check(await supabase.rpc("save_shared_profile", { p_patch: patch })); }

const MS_BASE = "id, kind, title, happened_on, note, created_by, created_at";
let msCols = `${MS_BASE}, tag, date_precision`;
export async function listMilestones(): Promise<Milestone[]> {
  const run = () => supabase.from("milestones").select(msCols).order("happened_on", { ascending: true, nullsFirst: false });
  let res = await run();
  if (res.error && msCols !== MS_BASE) { msCols = MS_BASE; res = await run(); }
  return check(res) as unknown as Milestone[];
}
export async function saveMilestone(m: { id?: string | null; kind: MilestoneKind; title: string; happened_on?: string | null; note?: string; tag?: MilestoneTag | null; date_precision?: DatePrecision }) {
  const v2 = await supabase.rpc("save_milestone_v2", { p: {
    id: m.id ?? null, kind: m.kind, title: m.title, happened_on: m.happened_on || null, note: m.note ?? "", tag: m.tag ?? null, date_precision: m.date_precision ?? "day",
  } });
  if (!v2.error) return v2.data as string;
  if (!isMissingFunction(v2.error)) throw v2.error;
  return check(await supabase.rpc("save_milestone", {
    p_id: m.id ?? null, p_kind: m.kind, p_title: m.title, p_happened_on: m.happened_on || null, p_note: m.note ?? "",
  })) as string;
}
export async function deleteMilestone(id: string) { check(await supabase.rpc("delete_milestone", { p_id: id })); }

export async function setIncludeJustUsWeekly(on: boolean) { check(await supabase.rpc("set_include_just_us_weekly", { p_on: on })); }
