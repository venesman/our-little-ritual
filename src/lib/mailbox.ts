import { supabase } from "./supabase";
import { compressImage } from "./image";
import { uploadVoice, type RecordedVoice } from "../components/Voice";

export const LETTER_BUCKET = "letters";
export type LetterKind = "love" | "note" | "compliment" | "appreciation" | "future" | "surprise";

export const KIND: Record<LetterKind, { label: string; stamp: string; tone: "raspberry" | "mustard" | "leaf" | "tomato"; starters: string[] }> = {
  love:         { label: "Love letter",   stamp: "♥", tone: "raspberry", starters: ["The moment I knew…", "What I love about us right now…", "If you were here tonight…"] },
  note:         { label: "Short note",    stamp: "✈", tone: "leaf",      starters: ["Just thinking about you because…", "Today reminded me of you when…"] },
  compliment:   { label: "Compliment",    stamp: "★", tone: "mustard",   starters: ["Something you're brilliant at…", "You looked so happy when…"] },
  appreciation: { label: "Appreciation",  stamp: "✿", tone: "leaf",      starters: ["Thank you for…", "I noticed you…", "You made my week easier by…"] },
  future:       { label: "Future letter", stamp: "⧗", tone: "tomato",    starters: ["By the time you read this…", "On our next visit, I hope…"] },
  surprise:     { label: "Surprise",      stamp: "✦", tone: "raspberry", starters: ["Close your eyes and…", "I've been planning something…"] },
};
export const KINDS = Object.keys(KIND) as LetterKind[];

export interface Letter {
  id: string; relationship_id: string; sender_id: string; recipient_id: string; kind: LetterKind; title: string; body: string;
  image_path: string | null; voice_path: string | null; voice_seconds: number | null;
  status: "draft" | "sent"; reveal_at: string | null; sent_at: string | null; opened_at: string | null; loved: boolean;
  song_url?: string | null; song_title?: string | null; song_artist?: string | null; song_album?: string | null; song_cover_path?: string | null; song_note?: string | null;
  created_at: string; updated_at: string;
}
export interface SealedLetter { id: string; kind: LetterKind; reveal_at: string; sent_at: string }
export interface MailboxSummary { unread: number; sealed: number; next_reveal_at: string | null }

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}
const BASE_COLS = "id, relationship_id, sender_id, recipient_id, kind, title, body, image_path, voice_path, voice_seconds, status, reveal_at, sent_at, opened_at, loved, created_at, updated_at";
// The song columns arrive with migration 0025; until it's run, letters still load without them.
let COLS = `${BASE_COLS}, song_url, song_title, song_artist, song_album, song_cover_path, song_note`;
async function selectLetters<T>(run: (cols: string) => PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const res = await run(COLS);
  if (res.error && /song_/.test(String((res.error as { message?: string }).message ?? ""))) { COLS = BASE_COLS; return check(await run(COLS)); }
  return check(res);
}

/** Everything the database lets you see: your own letters (drafts and sent) and letters that have arrived for you. */
export async function listLetters(): Promise<Letter[]> {
  return (await selectLetters((c) => supabase.from("letters").select(c).order("created_at", { ascending: false }).limit(500))) as unknown as Letter[];
}
export async function getLetter(id: string): Promise<Letter | null> {
  return (await selectLetters((c) => supabase.from("letters").select(c).eq("id", id).maybeSingle())) as unknown as Letter | null;
}
export async function listSealed(): Promise<SealedLetter[]> {
  return check(await supabase.rpc("my_sealed_letters")) as SealedLetter[];
}
export async function mailboxSummary(): Promise<MailboxSummary> {
  return check(await supabase.rpc("mailbox_summary")) as MailboxSummary;
}
export async function saveLetter(l: { id?: string | null; kind: LetterKind; title: string; body: string; image_path?: string | null; voice_path?: string | null; voice_seconds?: number | null }) {
  return check(await supabase.rpc("save_letter", {
    p_id: l.id ?? null, p_kind: l.kind, p_title: l.title, p_body: l.body,
    p_image_path: l.image_path ?? null, p_voice_path: l.voice_path ?? null, p_voice_seconds: l.voice_seconds ?? null,
  })) as string;
}
export async function sendLetter(id: string, revealAt: string | null) { check(await supabase.rpc("send_letter", { p_id: id, p_reveal_at: revealAt })); }
export async function takeBackLetter(id: string) { check(await supabase.rpc("take_back_letter", { p_id: id })); }
export async function deleteDraft(l: Letter) {
  const files = [l.image_path, l.voice_path].filter((x): x is string => !!x);
  if (files.length) await supabase.storage.from(LETTER_BUCKET).remove(files);
  check(await supabase.rpc("delete_letter_draft", { p_id: l.id }));
}
export async function openLetter(id: string) { check(await supabase.rpc("open_letter", { p_id: id })); }
export async function toggleLoved(id: string) { return check(await supabase.rpc("toggle_letter_loved", { p_id: id })) as boolean; }

const folder = (l: Pick<Letter, "relationship_id" | "id" | "sender_id">) => `${l.relationship_id}/${l.id}/${l.sender_id}`;
export async function uploadLetterPhoto(l: Pick<Letter, "relationship_id" | "id" | "sender_id">, file: File): Promise<string> {
  const small = await compressImage(file);
  const path = `${folder(l)}/${crypto.randomUUID()}.jpg`;
  check(await supabase.storage.from(LETTER_BUCKET).upload(path, small, { contentType: "image/jpeg", upsert: false }));
  return path;
}
export async function uploadLetterVoice(l: Pick<Letter, "relationship_id" | "id" | "sender_id">, v: RecordedVoice) {
  return uploadVoice(LETTER_BUCKET, folder(l), v);
}
export async function removeLetterFile(path: string) { await supabase.storage.from(LETTER_BUCKET).remove([path]); }
export async function signedLetterUrl(path: string) {
  const { data } = await supabase.storage.from(LETTER_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
