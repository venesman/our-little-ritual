import { supabase } from "./supabase";

export const MOOD_WORDS = ["calm", "happy", "tired", "stressed", "excited", "homesick", "grateful", "lonely",
  "hopeful", "busy", "proud", "overwhelmed", "content", "missing you"] as const;

export const CORE_QUESTIONS = [
  { key: "feeling", label: "How have you been feeling lately?" },
  { key: "happy", label: "What made you happy this week?" },
  { key: "need", label: "Is there anything you need more or less of from me?" },
] as const;

export interface CheckinRow {
  user_id: string; feeling: string; happy: string; need: string; bonus_code: number | null; bonus: string;
  mood_words: string[]; talk_on_call: boolean; talk_done_at: string | null;
  status: "draft" | "submitted"; submitted_at: string | null; updated_at: string;
}
export interface CheckinWeek {
  week_start: string; next_release: string; is_current: boolean;
  bonus: { code: number; text: string } | null;
  mine: CheckinRow | null; partner_submitted: boolean; revealed: boolean; partner: CheckinRow | null;
  partner_wants_to_talk: boolean;
}
export interface CheckinWeekStatus { week_start: string; my_status: "none" | "draft" | "submitted"; partner_submitted: boolean; revealed: boolean; talk_pending: boolean }
export interface CheckinDraft { feeling: string; happy: string; need: string; bonus: string; mood_words: string[]; talk_on_call: boolean }

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export async function getCheckinWeek(week?: string | null): Promise<CheckinWeek> {
  return check(await supabase.rpc("checkin_week", { p_week: week ?? null })) as CheckinWeek;
}
export async function saveCheckin(week: string, d: CheckinDraft, submit: boolean): Promise<CheckinWeek> {
  return check(await supabase.rpc("save_checkin", {
    p_week: week, p_feeling: d.feeling, p_happy: d.happy, p_need: d.need, p_bonus: d.bonus,
    p_mood_words: d.mood_words, p_talk_on_call: d.talk_on_call, p_submit: submit,
  })) as CheckinWeek;
}
export async function markCheckinTalked(week: string): Promise<CheckinWeek> {
  return check(await supabase.rpc("mark_checkin_talked", { p_week: week })) as CheckinWeek;
}
export async function listCheckinWeeks(): Promise<CheckinWeekStatus[]> {
  return check(await supabase.rpc("my_checkin_weeks")) as CheckinWeekStatus[];
}
