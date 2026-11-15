import { supabase } from "./supabase";
import { compressImage } from "./image";
import type { Category } from "./rituals";

export type MemoryKind = "ritual" | "mission" | "letter" | "discovery" | "milestone" | "moment" | "whim" | "quiz" | "personality" | "knowme";

export interface MemoryPart {
  user_id: string | null; body?: string; answers?: { prompt: string; answer: string }[]; link_url?: string | null;
  image_path?: string | null; voice_path?: string | null; voice_seconds?: number | null;
}
export interface MomentPhoto { id: string; path: string; taken_at: string | null }
export interface Memory {
  kind: MemoryKind; ref_id: string; at: string; caption: string; title: string; authors: string[] | null;
  parts?: MemoryPart[]; category?: Category; week_number?: number; letter_kind?: string; area?: string; milestone_kind?: string;
  place?: string; starts_on?: string; ends_on?: string | null; photos?: MomentPhoto[]; whim_kind?: string; scores?: Record<string, number>; categories?: string[]; quiz_code?: string; results?: Record<string, number>;
}

/** Which private bucket a memory's files live in. */
export const BUCKET: Record<MemoryKind, string> = {
  ritual: "ritual-media", mission: "apart-media", letter: "letters", discovery: "", milestone: "", moment: "moments", whim: "whims", quiz: "", personality: "", knowme: "",
};

export const KIND_LABEL: Record<MemoryKind, string> = {
  ritual: "Weekly ritual", mission: "Apart mission", letter: "Letter", discovery: "Discovery", milestone: "Milestone", moment: "Trip or moment", whim: "Wish come true", quiz: "Quiz Duel", personality: "Personality quiz", knowme: "How well do you know me?",
};

/** Filter chips (from the approved spec). Photos / drawings / voice are derived from what a memory contains. */
export type TypeFilter = "all" | "rituals" | "photos" | "drawings" | "letters" | "voice" | "missions" | "discoveries" | "milestones" | "moments";
export const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" }, { value: "rituals", label: "Rituals" }, { value: "photos", label: "Photos" }, { value: "drawings", label: "Drawings" },
  { value: "letters", label: "Letters" }, { value: "voice", label: "Voice" }, { value: "missions", label: "Missions" },
  { value: "discoveries", label: "Discoveries" }, { value: "milestones", label: "Milestones" }, { value: "moments", label: "Trips & moments" },
];

export const imagesOf = (m: Memory): { bucket: string; path: string; taken_at?: string | null }[] => [
  ...(m.photos ?? []).map((p) => ({ bucket: BUCKET.moment, path: p.path, taken_at: p.taken_at })),
  ...(m.parts ?? []).filter((p) => p.image_path).map((p) => ({ bucket: BUCKET[m.kind], path: p.image_path! })),
];
export const hasVoice = (m: Memory) => (m.parts ?? []).some((p) => p.voice_path);
/** Drawings are saved as PNG by the drawing pad; photos are compressed to JPEG. */
export const hasDrawing = (m: Memory) => (m.parts ?? []).some((p) => p.image_path?.endsWith(".png"));

export function matchesType(m: Memory, f: TypeFilter): boolean {
  switch (f) {
    case "all": return true;
    case "rituals": return m.kind === "ritual";
    case "letters": return m.kind === "letter";
    case "missions": return m.kind === "mission";
    case "discoveries": return m.kind === "discovery";
    case "milestones": return m.kind === "milestone";
    case "moments": return m.kind === "moment";
    case "photos": return imagesOf(m).some((i) => !i.path.endsWith(".png"));
    case "drawings": return hasDrawing(m);
    case "voice": return hasVoice(m);
  }
}

/** "2026-06" style key for grouping by month. Dates without a time are treated as calendar dates. */
export const monthKey = (iso: string) => iso.slice(0, 7);

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export async function getFeed(): Promise<Memory[]> {
  return check(await supabase.rpc("scrapbook_feed")) as Memory[];
}
export async function setEntry(kind: MemoryKind, refId: string, saved: boolean | null, caption?: string | null) {
  check(await supabase.rpc("set_scrapbook_entry", { p_kind: kind, p_ref: refId, p_saved: saved, p_caption: caption ?? null }));
}
export async function isSaved(kind: MemoryKind, refId: string): Promise<boolean> {
  return check(await supabase.rpc("scrapbook_saved", { p_kind: kind, p_ref: refId })) as boolean;
}
export async function listRemoved(): Promise<{ kind: MemoryKind; ref_id: string; updated_at: string }[]> {
  return check(await supabase.rpc("scrapbook_removed")) as { kind: MemoryKind; ref_id: string; updated_at: string }[];
}

export async function saveMoment(m: { id?: string | null; title: string; place: string; starts_on: string; ends_on?: string | null; caption: string }) {
  return check(await supabase.rpc("save_moment", {
    p_id: m.id ?? null, p_title: m.title, p_place: m.place, p_starts_on: m.starts_on, p_ends_on: m.ends_on || null, p_caption: m.caption,
  })) as string;
}
export async function deleteMoment(id: string, photoIds: string[]) {
  for (const p of photoIds) {
    const { data } = await supabase.rpc("remove_moment_photo", { p_id: p });
    if (typeof data === "string") await supabase.storage.from(BUCKET.moment).remove([data]);
  }
  check(await supabase.rpc("delete_moment", { p_id: id }));
}

/** The date the photo was taken, from the file's own data when the phone kept it. */
export async function photoTakenAt(file: File): Promise<string | null> {
  try {
    const { parse } = await import("exifr");
    const d = await parse(file, ["DateTimeOriginal", "CreateDate"]);
    const when: unknown = d?.DateTimeOriginal ?? d?.CreateDate;
    return when instanceof Date && !Number.isNaN(when.getTime()) ? when.toISOString() : null;
  } catch { return null; }
}

/** Reads the date, compresses, uploads and attaches one photo to a moment. */
export async function addMomentPhoto(relationshipId: string, momentId: string, userId: string, file: File) {
  const takenAt = await photoTakenAt(file);
  const small = await compressImage(file);
  const path = `${relationshipId}/${momentId}/${userId}/${crypto.randomUUID()}.jpg`;
  check(await supabase.storage.from(BUCKET.moment).upload(path, small, { contentType: "image/jpeg", upsert: false }));
  try {
    check(await supabase.rpc("add_moment_photo", { p_moment: momentId, p_path: path, p_taken_at: takenAt }));
  } catch (e) {
    await supabase.storage.from(BUCKET.moment).remove([path]);
    throw e;
  }
}
export async function removeMomentPhoto(photoId: string) {
  const path = check(await supabase.rpc("remove_moment_photo", { p_id: photoId })) as string;
  await supabase.storage.from(BUCKET.moment).remove([path]);
}

export async function signedUrl(bucket: string, path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export interface MonthSummary { month: string; rituals_both: number; checkins_both: number; letters: number; play_sessions: number; curious_sessions: number; apart_missions: number }
export async function activitySummary(from: string, to: string): Promise<MonthSummary[]> {
  return check(await supabase.rpc("export_activity_summary", { p_from: from, p_to: to })) as MonthSummary[];
}
