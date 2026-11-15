import { supabase } from "./supabase";
import { compressImage } from "./image";

export const CREATION_BUCKET = "creations";
export type CreationKind = "doodle" | "fold" | "story" | "poem" | "mixtape" | "board";

export const FORMATS: Record<CreationKind, { label: string; how: string; starters: string[]; titleLabel: string }> = {
  doodle: {
    label: "Doodle Relay", titleLabel: "What are you drawing?",
    how: "One drawing passed back and forth — each turn, add something on top (up to 6 turns each).",
    starters: ["Our dream house", "A creature that lives between Kuching and Santiago", "Our breakfast table", "A map of an island only we know", "A robot that does our chores", "Our future pet", "A postcard from the moon", "The weather where you are"],
  },
  fold: {
    label: "Fold & Reveal", titleLabel: "What are you drawing?",
    how: "The folded-paper game: one draws the top half, the other the bottom — sealed until you've both drawn.",
    starters: ["A person", "An animal", "A monster", "A superhero version of us", "A plant from another planet", "A vehicle"],
  },
  story: {
    label: "Story Chain", titleLabel: "First line (or your own)",
    how: "Write a story together, a few sentences each turn. 'The End?' needs you both to agree.",
    starters: ["The parcel had no return address, only a drawing of a puffin.", "On the night the clocks in Kuching and Santiago stopped at the same time…", "We were the only two passengers on the last ferry.", "The map in Grandma's attic had our names on it.", "Every Monday at 7 pm, the cat came to visit.", "The suitcase was full of letters that hadn't been written yet.", "Somewhere over the Pacific, the plane turned left.", "The café served only one dish, and it changed every time you blinked."],
  },
  poem: {
    label: "Poem Duet", titleLabel: "Theme",
    how: "Take turns writing one line each. Choose 8, 10 or 12 lines — or an acrostic word.",
    starters: ["Missing you", "Our first meeting", "A rainy day in two cities", "Things I'd bring you", "The night sky", "Our future kitchen"],
  },
  mixtape: {
    label: "Mixtape Maker", titleLabel: "Theme",
    how: "A themed mixtape like an old cassette: take turns adding songs (up to 12), then name it and draw its cover.",
    starters: ["Songs for a road trip we'll take", "Rainy day in two cities", "Our first dance (someday)", "Songs from our countries", "Falling asleep on a call", "Getting ready for a visit"],
  },
  board: {
    label: "Mood Board", titleLabel: "Theme",
    how: "A shared board on one theme — up to 12 photos with captions. Keep as many boards as you like.",
    starters: ["Our future home", "Our next trip", "Food we'll cook together", "Our wedding someday (only if you like)", "Cosy weekend", "Places in Kuching, Sweden and Chile we love"],
  },
};
export const KINDS = Object.keys(FORMATS) as CreationKind[];

export interface CreationPart {
  id: string; user_id: string; position: number; hidden: boolean; body: string | null; image_path: string | null; caption: string | null;
  song_url: string | null; song_title: string | null; song_artist: string | null; song_cover_path: string | null; created_at: string;
}
export interface Creation {
  id: string; kind: CreationKind; title: string; settings: { lines?: number; acrostic?: string; name?: string }; started_by: string;
  status: "active" | "finished" | "ended"; end_requested_by: string | null; cover_path: string | null; created_at: string; finished_at: string | null;
  whose_turn: string | null; limit: number; parts: CreationPart[];
}
export interface CreationSummary {
  id: string; kind: CreationKind; title: string; settings: Creation["settings"]; status: "active" | "finished"; started_by: string;
  created_at: string; finished_at: string | null; cover_path: string | null; whose_turn: string | null; parts: number; preview: string | null;
}

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}
export const listCreations = async () => (check(await supabase.rpc("creations_list")) ?? []) as CreationSummary[];
export const getCreation = async (id: string) => check(await supabase.rpc("creation_detail", { p_id: id })) as Creation;
export const startCreation = async (kind: CreationKind, title: string, settings: Record<string, unknown> = {}) =>
  check(await supabase.rpc("start_creation", { p_kind: kind, p_title: title, p_settings: settings })) as string;
export const addPart = async (id: string, p: { body?: string | null; image_path?: string | null; caption?: string | null; song?: { url: string; title: string; artist: string; cover_path: string | null } | null }) =>
  check(await supabase.rpc("add_creation_part", {
    p_id: id, p_body: p.body ?? null, p_image_path: p.image_path ?? null, p_caption: p.caption ?? null,
    p_song_url: p.song?.url ?? null, p_song_title: p.song?.title ?? null, p_song_artist: p.song?.artist ?? null, p_song_cover: p.song?.cover_path ?? null,
  })) as string;
export const finishCreation = async (id: string, title?: string) => check(await supabase.rpc("finish_creation", { p_id: id, p_title: title ?? null })) as string;
export const continueCreation = async (id: string) => { check(await supabase.rpc("continue_creation", { p_id: id })); };
export const setCover = async (id: string, path: string | null) => { check(await supabase.rpc("set_creation_cover", { p_id: id, p_path: path })); };
export const endCreation = async (id: string) => { check(await supabase.rpc("end_creation", { p_id: id })); };
export const removeBoardPhoto = async (id: string) => {
  const path = check(await supabase.rpc("remove_board_photo", { p_part: id })) as string | null;
  if (path) await supabase.storage.from(CREATION_BUCKET).remove([path]);
};

/** Uploads a drawing (PNG) or a photo (compressed JPEG) into <rel>/<creation>/<me>/ and returns its path. */
export async function uploadCreationFile(relId: string, creationId: string, userId: string, file: Blob, kind: "drawing" | "photo"): Promise<string> {
  const blob = kind === "photo" && file instanceof File ? await compressImage(file) : file;
  const ext = kind === "drawing" ? "png" : "jpg";
  const path = `${relId}/${creationId}/${userId}/${crypto.randomUUID()}.${ext}`;
  check(await supabase.storage.from(CREATION_BUCKET).upload(path, blob, { contentType: kind === "drawing" ? "image/png" : "image/jpeg", upsert: false }));
  return path;
}
/** A same-origin copy of a stored picture (so the drawing pad can draw on top of it). */
export async function localCopy(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(CREATION_BUCKET).download(path);
  return data ? URL.createObjectURL(data) : null;
}
