import { supabase } from "./supabase";

export interface KnowMeRound {
  id: string; subject_id: string; questions: string[]; answered: boolean; guessed: boolean; marked: boolean;
  answers: string[] | null; guesses: string[] | null; marks: number[] | null; score: number;
}
export interface KnowMeGame { id: string; status: "active" | "finished" | "ended"; created_at: string; finished_at: string | null; rounds: KnowMeRound[] }
export interface KnowMeHistory { id: string; finished_at: string; scores: Record<string, number> }

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}
export const knowMeState = async (id?: string) => check(await supabase.rpc("knowme_state", { p_game: id ?? null })) as KnowMeGame | null;
export const knowMeStart = async () => check(await supabase.rpc("knowme_start")) as string;
export const knowMeAnswer = async (round: string, answers: string[]) => { check(await supabase.rpc("knowme_answer", { p_round: round, p_answers: answers })); };
export const knowMeGuess = async (round: string, guesses: string[]) => { check(await supabase.rpc("knowme_guess", { p_round: round, p_guesses: guesses })); };
export const knowMeMark = async (round: string, marks: number[]) => { check(await supabase.rpc("knowme_mark", { p_round: round, p_marks: marks })); };
export const knowMeEnd = async (id: string) => { check(await supabase.rpc("knowme_end", { p_game: id })); };
export const knowMeHistory = async () => (check(await supabase.rpc("knowme_history")) ?? []) as KnowMeHistory[];
export const MARKS = ["Not quite", "Close", "Spot on"];
