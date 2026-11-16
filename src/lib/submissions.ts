import { supabase } from "./supabase";
import { notifyNow } from "./reminders";

export const MEDIA_BUCKET = "ritual-media";

export interface Answer { prompt: string; answer: string; guess?: string }

export interface Submission {
  id: string;
  weekly_activity_id: string;
  relationship_id: string;
  user_id: string;
  status: "draft" | "submitted";
  body: string;
  link_url: string | null;
  answers: Answer[];
  image_path: string | null;
  voice_path?: string | null;
  voice_seconds?: number | null;
  updated_at: string;
  submitted_at: string | null;
}

export interface MemberStatus {
  user_id: string;
  has_submitted: boolean;
  submitted_at: string | null;
  is_me: boolean;
  revealed: boolean;
}

export type MyStatus = "none" | "draft" | "submitted";
export interface WeekListStatus { weekly_id: string; my_status: MyStatus; partner_submitted: boolean; revealed: boolean }

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

const SUB_COLS = "id, weekly_activity_id, relationship_id, user_id, status, body, link_url, answers, image_path, voice_path, voice_seconds, updated_at, submitted_at";

/**
 * Every submission for the week that the database lets this user see:
 * their own (draft or sent), plus the partner's only once both have shared.
 */
export async function getVisibleSubmissions(weeklyId: string): Promise<Submission[]> {
  return check(await supabase.from("activity_submissions").select(SUB_COLS).eq("weekly_activity_id", weeklyId)) as Submission[];
}

export async function getWeekStatus(weeklyId: string): Promise<MemberStatus[]> {
  return check(await supabase.rpc("week_status", { p_weekly: weeklyId })) as MemberStatus[];
}

export async function getMyRitualStatuses(): Promise<WeekListStatus[]> {
  return check(await supabase.rpc("my_ritual_statuses")) as WeekListStatus[];
}

export async function saveDraft(weeklyId: string, draft: { body: string; link_url: string | null; answers: Answer[]; image_path: string | null }) {
  check(await supabase.rpc("save_ritual_draft", {
    p_weekly: weeklyId,
    p_body: draft.body,
    p_link_url: draft.link_url || null,
    p_answers: draft.answers,
    p_image_path: draft.image_path,
  }));
}

/** Seals the answer. Resolves to true when this completed the reveal. */
export async function submitRitual(weeklyId: string): Promise<boolean> {
  const opened = check(await supabase.rpc("submit_ritual", { p_weekly: weeklyId })) as boolean;
  notifyNow();
  return opened;
}

/** Uploads into the user's own private folder for this week. Storage policies refuse anything else. */
export async function uploadRitualImage(relationshipId: string, weeklyId: string, userId: string, blob: Blob): Promise<string> {
  const ext = blob.type === "image/png" ? "png" : "jpg";
  const path = `${relationshipId}/${weeklyId}/${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw error;
  return path;
}

export async function removeRitualImage(path: string): Promise<void> {
  await supabase.storage.from(MEDIA_BUCKET).remove([path]);
}

/** Short-lived link to a private image. The storage policy decides whether this user may see it. */
export async function signedImageUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

/** Attach (or clear, with null) a voice note on your draft — only for rituals that allow voice. */
export async function setRitualVoice(weeklyId: string, path: string | null, seconds: number | null) {
  check(await supabase.rpc("set_ritual_voice", { p_weekly: weeklyId, p_voice_path: path, p_voice_seconds: seconds }));
}
