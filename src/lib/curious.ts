import { Atom, Brain, Coins, Cpu, Globe, Landmark, Leaf, Lightbulb, Map as MapIcon, Music, type LucideIcon } from "lucide-react";
import { supabase } from "./supabase";

export type Area = "psychology" | "science" | "culture" | "philosophy" | "technology" | "art" | "nature" | "money" | "history" | "geography";
export type Difficulty = "beginner" | "intermediate" | "advanced";
export type Format = "teach" | "perspectives" | "debate" | "fact_fiction" | "deep_dive" | "expert";
export type Stage = "setup" | "research" | "present" | "discuss";
export type Verdict = "true" | "false" | "misleading";

export interface Topic {
  id: string; code: number; title: string; area: Area; intro_question: string; explore: string; angles: string[];
  research_minutes: 5 | 10 | 15; difficulty: Difficulty; debate_statement: string | null; claims: string[];
  split_a: string | null; split_b: string | null; countries: string[]; just_us: boolean; needs: string[]; fallback_explore: string | null;
}
export interface Note { user_id: string; summary: string; links: string[]; verdicts: Record<string, Verdict>; updated_at: string }
export interface Discovery { id: string; user_id: string; body: string; created_at: string }
export interface CuriousState {
  session_id: string; stage: Stage; format: Format; research_minutes: number; present_seconds: number;
  first_presenter: string | null; presenter_index: 0 | 1; started_by: string | null; started_at: string; ended_at: string | null;
  topic: Topic; favourite: boolean;
  timer: { duration_s: number | null; ends_at: string | null; remaining_s: number | null };
  notes: Note[]; partner_has_notes: boolean; discoveries: Discovery[];
  server_now: string; updated_at: string;
}
export interface CuriousFilters { area?: Area; difficulty?: Difficulty; format?: Format; just_us?: boolean }

export const AREA: Record<Area, { label: string; tone: "raspberry" | "mustard" | "leaf" | "tomato"; icon: LucideIcon }> = {
  psychology: { label: "Psychology & Human Behaviour", tone: "raspberry", icon: Brain },
  science:    { label: "Science & the Universe",       tone: "leaf",      icon: Atom },
  culture:    { label: "Culture & the World",          tone: "tomato",    icon: Globe },
  philosophy: { label: "Philosophy & Big Questions",   tone: "mustard",   icon: Lightbulb },
  technology: { label: "Technology & the Future",      tone: "leaf",      icon: Cpu },
  art:        { label: "Art, Music & Creativity",      tone: "raspberry", icon: Music },
  nature:     { label: "Nature & the Unknown",         tone: "leaf",      icon: Leaf },
  money:      { label: "Money, Business & Society",    tone: "mustard",   icon: Coins },
  history:    { label: "History & Interesting Events", tone: "tomato",    icon: Landmark },
  geography:  { label: "Geography & Travel",           tone: "raspberry", icon: MapIcon },
};
export const AREAS = Object.keys(AREA) as Area[];
export const SHORT_AREA: Record<Area, string> = {
  psychology: "Psychology", science: "Science", culture: "Culture", philosophy: "Philosophy", technology: "Tech",
  art: "Art & music", nature: "Nature", money: "Money", history: "History", geography: "Geography",
};

export const FORMAT: Record<Format, { label: string; blurb: string }> = {
  teach:        { label: "Teach Me Something",  blurb: "Research on your own, then each teach the other one interesting discovery." },
  perspectives: { label: "Two Perspectives",    blurb: "Both investigate the same question independently, then compare what you found." },
  debate:       { label: "Friendly Debate",     blurb: "One statement, two sides. Each of you researches and presents a different side." },
  fact_fiction: { label: "Fact or Fiction",     blurb: "Check surprising claims and decide: true, false or misleading. Your research decides — the app never tells you." },
  deep_dive:    { label: "Deep Dive",           blurb: "One broad subject, split in two. Each of you researches a different part." },
  expert:       { label: "Expert for a Minute", blurb: "Pick one complicated idea from this topic and explain it in simple words." },
};
export const FORMATS = Object.keys(FORMAT) as Format[];

export function supports(t: Topic, f: Format): boolean {
  if (f === "debate") return !!t.debate_statement;
  if (f === "fact_fiction") return t.claims.length > 0;
  if (f === "deep_dive") return !!t.split_a;
  return true;
}

export const VERDICT_LABEL: Record<Verdict, string> = { true: "True", false: "False", misleading: "Misleading" };

export const DISCUSSION = [
  "What surprised you most?",
  "Did you discover something you didn't expect?",
  "Do you agree with the findings?",
  "Which perspective was more convincing?",
  "What would you like to research next?",
];

/** The suggested one-minute structure, scaled to whatever length you chose. */
export function talkSegments(total: number) {
  return [
    { from: 0, to: Math.round(total * 0.25), label: "Introduce the topic" },
    { from: Math.round(total * 0.25), to: Math.round(total * 0.667), label: "Your most interesting discovery" },
    { from: Math.round(total * 0.667), to: Math.round(total * 0.917), label: "Why it matters" },
    { from: Math.round(total * 0.917), to: total, label: "Finish with a surprise or a question" },
  ];
}

/** Which topics each kind of draw can show (mirrors curious_matches on the server). */
export function topicVisible(t: Topic, justUs: boolean, countries: string[]): boolean {
  if (justUs) return t.just_us || (t.countries.length > 0 && t.countries.some((c) => countries.includes(c)));
  return !t.just_us && t.countries.length === 0;
}

export function coupleCountries(...people: Array<{ current_country: string | null; home_country: string | null } | null | undefined>): string[] {
  return [...new Set(people.flatMap((p) => [p?.current_country, p?.home_country]).filter((c): c is string => !!c && !!c.trim()).map((c) => c.trim().toLowerCase()))];
}

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export async function currentCuriousState(): Promise<CuriousState | null> {
  return check(await supabase.rpc("current_curious_state")) as CuriousState | null;
}
export async function startCurious(filters: CuriousFilters, topicId?: string): Promise<CuriousState> {
  return check(await supabase.rpc("start_curious", { p_filters: filters, p_topic: topicId ?? null })) as CuriousState;
}
export async function curiousSetup(sessionId: string, format: Format, researchMinutes: number, presentSeconds: number, firstPresenter: string): Promise<CuriousState> {
  return check(await supabase.rpc("curious_setup", {
    p_session: sessionId, p_format: format, p_research_minutes: researchMinutes, p_present_seconds: presentSeconds, p_first_presenter: firstPresenter,
  })) as CuriousState;
}
export async function curiousSwapOrder(sessionId: string): Promise<CuriousState> {
  return check(await supabase.rpc("curious_swap_order", { p_session: sessionId })) as CuriousState;
}
export async function curiousAdvance(sessionId: string, fromStage: Stage, fromIndex = 0): Promise<CuriousState | null> {
  return check(await supabase.rpc("curious_advance", { p_session: sessionId, p_from_stage: fromStage, p_from_index: fromIndex })) as CuriousState | null;
}
export async function curiousTimer(sessionId: string, action: "start" | "pause" | "reset" | "skip", durationS?: number): Promise<CuriousState> {
  return check(await supabase.rpc("curious_timer", { p_session: sessionId, p_action: action, p_duration_s: durationS ?? null })) as CuriousState;
}
export async function saveCuriousNote(sessionId: string, summary: string, links: string[], verdicts: Record<string, Verdict>): Promise<CuriousState> {
  return check(await supabase.rpc("save_curious_note", { p_session: sessionId, p_summary: summary, p_links: links, p_verdicts: verdicts })) as CuriousState;
}
export async function addCuriousDiscovery(sessionId: string, body: string): Promise<CuriousState> {
  return check(await supabase.rpc("add_curious_discovery", { p_session: sessionId, p_body: body })) as CuriousState;
}
export async function deleteCuriousDiscovery(id: string): Promise<void> {
  check(await supabase.rpc("delete_curious_discovery", { p_id: id }));
}
export async function toggleCuriousFavourite(topicId: string): Promise<boolean> {
  return check(await supabase.rpc("toggle_curious_favourite", { p_topic: topicId })) as boolean;
}
export async function endCurious(sessionId: string): Promise<void> {
  check(await supabase.rpc("end_curious", { p_session: sessionId }));
}

const TOPIC_COLS = "id, code, title, area, intro_question, explore, angles, research_minutes, difficulty, debate_statement, claims, split_a, split_b, countries, just_us, needs, fallback_explore";
export async function listTopics(): Promise<Topic[]> {
  return check(await supabase.from("curious_topics").select(TOPIC_COLS).eq("is_active", true).order("code")) as unknown as Topic[];
}
export async function listCuriousFavourites(): Promise<Topic[]> {
  const rows = check(await supabase.from("curious_favourites").select(`topic:curious_topics(${TOPIC_COLS})`).order("created_at", { ascending: false })) as unknown as { topic: Topic | null }[];
  return rows.map((r) => r.topic).filter((t): t is Topic => !!t);
}
export interface PastCurious {
  id: string; started_at: string; format: Format;
  topic: { title: string; area: Area } | null;
  notes: { user_id: string; summary: string; links: string[] }[];
  discoveries: { id: string; user_id: string; body: string }[];
}
export async function listCuriousHistory(): Promise<PastCurious[]> {
  return check(await supabase.from("curious_sessions")
    .select("id, started_at, format, topic:curious_topics(title, area), notes:curious_notes(user_id, summary, links), discoveries:curious_discoveries(id, user_id, body)")
    .not("ended_at", "is", null).order("started_at", { ascending: false }).limit(40)) as unknown as PastCurious[];
}
