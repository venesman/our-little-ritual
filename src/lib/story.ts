import { supabase } from "./supabase";

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export interface LifeUpdate { id: string; user_id: string; body: string; created_at: string }
export interface SharedProfile { shared_interests: string[]; enjoy_together: string[]; shared_goals: string }
export type MilestoneKind = "milestone" | "important_date" | "memory";
export interface Milestone { id: string; kind: MilestoneKind; title: string; happened_on: string | null; note: string }

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

export async function listMilestones(): Promise<Milestone[]> {
  return check(await supabase.from("milestones").select("id, kind, title, happened_on, note").order("happened_on", { ascending: true, nullsFirst: false })) as Milestone[];
}
export async function saveMilestone(m: { id?: string | null; kind: MilestoneKind; title: string; happened_on?: string | null; note?: string }) {
  return check(await supabase.rpc("save_milestone", {
    p_id: m.id ?? null, p_kind: m.kind, p_title: m.title, p_happened_on: m.happened_on || null, p_note: m.note ?? "",
  })) as string;
}
export async function deleteMilestone(id: string) { check(await supabase.rpc("delete_milestone", { p_id: id })); }

export async function setIncludeJustUsWeekly(on: boolean) { check(await supabase.rpc("set_include_just_us_weekly", { p_on: on })); }
