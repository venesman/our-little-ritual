import { supabase } from "./supabase";

export type QuizNext = "pick" | "play" | "wait" | "finished" | "ended";
export interface QuizAnswerMark { choice: number; correct: boolean }
export interface QuizReview { question: string; source: string; question_id: string; options: string[]; right: number }
export interface QuizQuestionState { index: number; mine: QuizAnswerMark | null; partner: QuizAnswerMark | "hidden" | null; review: QuizReview | null }
export interface QuizRound {
  id: string; round_no: number; picker_id: string; offered: string[]; category: string | null;
  my_done: number; partner_done: number; questions: QuizQuestionState[];
}
export interface QuizMatch {
  id: string; status: "active" | "finished" | "ended"; started_by: string; created_at: string; finished_at: string | null;
  partner_id: string; my_score: number; partner_score: number; next: QuizNext; next_round: number | null; rounds: QuizRound[]; seconds: number;
}
export interface QuizMatchSummary { id: string; status: "active" | "finished"; created_at: string; finished_at: string | null; categories: string[]; scores: Record<string, number> | null }
export interface OpenQuestion { question: string; question_id: string; source: "starter" | "opentdb" | "ours"; difficulty: string; options: string[]; seconds_left: number }
export interface AnswerResult { correct: boolean; timed_out: boolean; right: number; choice: number; partner: QuizAnswerMark | null }
export interface OwnQuestion { id: string; category: string; question: string; correct: string; wrong: string[]; created_at: string }

/** Category labels (kept in the app too so lists render instantly). */
export const QUIZ_CATEGORY: Record<string, string> = {
  general: "General knowledge", geography: "Geography", science: "Science & nature", history: "History", food: "Food & drink",
  music: "Music", movies: "Movies & TV", sport: "Sport", words: "Words & languages", animals: "Animals", art_books: "Art & books",
  technology: "Technology", malaysia: "Malaysia & Borneo", sweden: "Sweden", chile: "Chile & South America", anime: "Anime & manga", games: "Video games", board_games: "Board games",
  mythology: "Mythology", celebrities: "Celebrities & musicals", ours: "Our inside jokes",
};
export const catLabel = (c: string | null | undefined) => (c ? QUIZ_CATEGORY[c] ?? c : "Not picked yet");

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}
export const startMatch = async () => check(await supabase.rpc("quiz_start_match")) as string;
export const matchState = async (id: string) => check(await supabase.rpc("quiz_match_state", { p_match: id })) as QuizMatch;
export const listMatches = async () => (check(await supabase.rpc("quiz_matches_list")) ?? []) as QuizMatchSummary[];
export const pickCategory = async (round: string, category: string) => { check(await supabase.rpc("quiz_pick_category", { p_round: round, p_category: category })); };
export const openQuestion = async (round: string, idx: number) => check(await supabase.rpc("quiz_open_question", { p_round: round, p_idx: idx })) as OpenQuestion;
export const answerQuestion = async (round: string, idx: number, choice: number) =>
  check(await supabase.rpc("quiz_answer", { p_round: round, p_idx: idx, p_choice: choice })) as AnswerResult;
export const endMatch = async (id: string) => { check(await supabase.rpc("quiz_end_match", { p_match: id })); };
export const reportQuestion = async (id: string, reason: string) => { check(await supabase.rpc("quiz_report_question", { p_question: id, p_reason: reason })); };
export const myQuestions = async () => (check(await supabase.rpc("quiz_my_questions")) ?? []) as OwnQuestion[];
export const addQuestion = async (q: { category: string; question: string; correct: string; wrong: [string, string, string] }) =>
  check(await supabase.rpc("quiz_add_question", {
    p_category: q.category, p_question: q.question, p_correct: q.correct, p_wrong1: q.wrong[0], p_wrong2: q.wrong[1], p_wrong3: q.wrong[2],
  })) as string;
export const deleteQuestion = async (id: string) => { check(await supabase.rpc("quiz_delete_question", { p_id: id })); };

/** "Vee 12 – 10 Mateo" style line, mine first. */
export function scoreLine(scores: Record<string, number> | null | undefined, myId: string | null | undefined, myName: string, partnerName: string) {
  if (!scores || !myId) return "";
  const mine = scores[myId] ?? 0;
  const theirs = Object.entries(scores).find(([k]) => k !== myId)?.[1] ?? 0;
  return `${myName} ${mine} – ${theirs} ${partnerName}`;
}
export function verdict(mine: number, theirs: number, partnerName: string) {
  return mine > theirs ? "You won this one! ✦" : mine < theirs ? `${partnerName} won this one ✦` : "A draw — perfectly matched ✦";
}
