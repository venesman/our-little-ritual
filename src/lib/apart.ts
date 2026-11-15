import { supabase } from "./supabase";
import { ACTIVITY_COLUMNS, type PlayActivity, type PlayFilters } from "./play";
import { compressImage } from "./image";

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export const APART_BUCKET = "apart-media";

export interface MissionSummary {
  mission_id: string; activity_id: string; created_at: string; closed_at: string | null;
  my_entries: number; partner_entries: number; visible: boolean; last_entry_at: string | null;
  activity?: PlayActivity;
}
export interface ApartEntry {
  id: string; user_id: string; body: string; link_url: string | null; image_path: string | null; created_at: string;
}

export async function listMissions(includeClosed = false): Promise<MissionSummary[]> {
  const rows = check(await supabase.rpc("my_apart_missions", { p_include_closed: includeClosed })) as MissionSummary[];
  const ids = [...new Set(rows.map((r) => r.activity_id))];
  if (ids.length) {
    const acts = check(await supabase.from("play_activities").select(ACTIVITY_COLUMNS).in("id", ids)) as unknown as PlayActivity[];
    for (const r of rows) r.activity = acts.find((a) => a.id === r.activity_id);
  }
  return rows;
}

export async function getMission(id: string): Promise<{ summary: MissionSummary | null; entries: ApartEntry[] }> {
  const all = check(await supabase.rpc("my_apart_missions", { p_include_closed: true })) as MissionSummary[];
  const summary = all.find((m) => m.mission_id === id) ?? null;
  if (summary) {
    summary.activity = (check(await supabase.from("play_activities").select(ACTIVITY_COLUMNS).eq("id", summary.activity_id).single()) as unknown) as PlayActivity;
  }
  // RLS only returns your own entries plus your partner's once the mission is visible.
  const entries = check(await supabase.from("apart_entries").select("id, user_id, body, link_url, image_path, created_at")
    .eq("mission_id", id).order("created_at")) as ApartEntry[];
  return { summary, entries };
}

export async function startMission(filters: PlayFilters, activityId?: string): Promise<string> {
  return check(await supabase.rpc("start_apart_mission", { p_filters: { ...filters, mode: "apart" }, p_activity: activityId ?? null })) as string;
}

export async function closeMission(id: string) { check(await supabase.rpc("close_apart_mission", { p_mission: id })); }

/** Uploads a photo (compressed) into <relationship>/<mission>/<me>/ and returns its storage path. */
export async function uploadApartImage(relationshipId: string, missionId: string, userId: string, file: File): Promise<string> {
  const small = await compressImage(file);
  const path = `${relationshipId}/${missionId}/${userId}/${crypto.randomUUID()}.jpg`;
  check(await supabase.storage.from(APART_BUCKET).upload(path, small, { contentType: "image/jpeg", upsert: false }));
  return path;
}

export async function addEntry(missionId: string, body: string, link?: string | null, imagePath?: string | null) {
  check(await supabase.rpc("add_apart_entry", { p_mission: missionId, p_body: body, p_link_url: link || null, p_image_path: imagePath || null }));
}

export async function signedApartUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(APART_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
