import { Clapperboard, Compass, Heart, CircleHelp, Laugh, Palette, type LucideIcon } from "lucide-react";
import { supabase } from "./supabase";

export type PlayCategory = "guess_discover" | "creative_chaos" | "virtual_date_night" | "heart_to_heart" | "silly_random" | "future_adventures";
export type Mood = "romantic" | "playful" | "silly" | "creative" | "deep" | "relaxed";
export type Energy = "low" | "medium" | "high";
export type PlayType = "talking" | "guessing" | "drawing" | "storytelling" | "virtual_date";

export interface PlayActivity {
  id: string;
  code: number;
  title: string;
  category: PlayCategory;
  description: string;
  instructions: string;
  prompts: string[];
  minutes: number;
  energy: Energy;
  activity_type: PlayType;
  moods: Mood[];
  materials: string | null;
}

export interface PlayFilters { minutes?: number; moods?: Mood[]; energy?: Energy; type?: PlayType }

export interface PlayState {
  session_id: string;
  started_by: string | null;
  started_at: string;
  ended_at: string | null;
  round: number;
  filters: PlayFilters;
  current: null | { item_id: string; status: "shown" | "done" | "skipped"; position: number; round: number; activity: PlayActivity };
  played_count: number;
  timer: { duration_s: number | null; ends_at: string | null; remaining_s: number | null };
  server_now: string;
  updated_at: string;
  reshuffled?: boolean;
}

export const PLAY_CATEGORY: Record<PlayCategory, { label: string; tone: "raspberry" | "mustard" | "leaf" | "tomato"; icon: LucideIcon }> = {
  guess_discover:     { label: "Guess & Discover",   tone: "leaf",      icon: CircleHelp },
  creative_chaos:     { label: "Creative Chaos",     tone: "mustard",   icon: Palette },
  virtual_date_night: { label: "Virtual Date Night", tone: "raspberry", icon: Clapperboard },
  heart_to_heart:     { label: "Heart to Heart",     tone: "tomato",    icon: Heart },
  silly_random:       { label: "Silly & Random",     tone: "mustard",   icon: Laugh },
  future_adventures:  { label: "Future Adventures",  tone: "leaf",      icon: Compass },
};

export const MINUTES = [5, 10, 15, 20, 30] as const;
export const MOODS: Mood[] = ["romantic", "playful", "silly", "creative", "deep", "relaxed"];
export const ENERGIES: Energy[] = ["low", "medium", "high"];
export const TYPES: { value: PlayType; label: string }[] = [
  { value: "talking", label: "Talking" },
  { value: "guessing", label: "Guessing" },
  { value: "drawing", label: "Drawing" },
  { value: "storytelling", label: "Storytelling" },
  { value: "virtual_date", label: "Virtual date" },
];
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const typeLabel = (t: PlayType) => TYPES.find((x) => x.value === t)?.label ?? t;

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export async function currentPlayState(): Promise<PlayState | null> {
  return check(await supabase.rpc("current_play_state")) as PlayState | null;
}
export async function startPlaySession(): Promise<string> {
  return check(await supabase.rpc("start_play_session")) as string;
}
export async function drawPlayActivity(sessionId: string, filters: PlayFilters, activityId?: string): Promise<PlayState> {
  return check(await supabase.rpc("draw_play_activity", { p_session: sessionId, p_filters: filters, p_activity: activityId ?? null })) as PlayState;
}
export async function setPlayItemStatus(itemId: string, status: "done" | "skipped" | "shown"): Promise<PlayState> {
  return check(await supabase.rpc("set_play_item_status", { p_item: itemId, p_status: status })) as PlayState;
}
export async function playTimer(sessionId: string, action: "start" | "pause" | "reset", durationS?: number): Promise<PlayState> {
  return check(await supabase.rpc("play_timer", { p_session: sessionId, p_action: action, p_duration_s: durationS ?? null })) as PlayState;
}
export async function endPlaySession(sessionId: string): Promise<void> {
  check(await supabase.rpc("end_play_session", { p_session: sessionId }));
}
export async function togglePlayFavourite(activityId: string, scope: "mine" | "ours"): Promise<boolean> {
  return check(await supabase.rpc("toggle_play_favourite", { p_activity: activityId, p_scope: scope })) as boolean;
}

export interface Favourite { id: string; scope: "mine" | "ours"; user_id: string; activity: PlayActivity }
export async function listFavourites(): Promise<Favourite[]> {
  return check(await supabase.from("play_favourites")
    .select("id, scope, user_id, activity:play_activities(id, code, title, category, description, instructions, prompts, minutes, energy, activity_type, moods, materials)")
    .order("created_at", { ascending: false })) as unknown as Favourite[];
}

export interface PastSession {
  id: string; started_at: string; ended_at: string | null;
  items: { status: "shown" | "done" | "skipped"; position: number; activity: { title: string; category: PlayCategory } | null }[];
}
export async function listPastSessions(): Promise<PastSession[]> {
  return check(await supabase.from("play_sessions")
    .select("id, started_at, ended_at, items:play_session_items(status, position, activity:play_activities(title, category))")
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(30)) as unknown as PastSession[];
}

/** Seconds left on the shared timer, using the server's clock (corrected by `skewMs`). */
export function secondsLeft(timer: PlayState["timer"], skewMs: number, nowMs = Date.now()): number {
  if (timer.ends_at) return Math.max(0, Math.ceil((Date.parse(timer.ends_at) - (nowMs + skewMs)) / 1000));
  return Math.max(0, timer.remaining_s ?? timer.duration_s ?? 0);
}

export function formatClock(s: number): string {
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
