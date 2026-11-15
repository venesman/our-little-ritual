import { supabase } from "./supabase";

export const SONG_BUCKET = "songs";
export interface Song { url: string; title: string; artist: string; album: string; cover_path: string | null }
export interface SoundtrackItem extends Song {
  id: string; source: "added" | "letter"; by: string; note: string; on: string; at: string; letter_id?: string;
}

const TRACK = /https:\/\/open\.spotify\.com\/(?:intl-[a-zA-Z-]+\/)?track\/[A-Za-z0-9]{22}(?:\?[^\s]*)?|https:\/\/spotify\.link\/[A-Za-z0-9]+/;
/** The first Spotify song link in some shared or pasted text, or null. */
export function findSongLink(text: string | null | undefined): string | null {
  const m = (text ?? "").match(TRACK);
  return m ? m[0] : null;
}

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

/**
 * Looks up a song's details through the song-details function. If the function
 * isn't set up (or Spotify doesn't answer), you get the link back and can type
 * the title and artist yourself.
 */
export async function lookUpSong(url: string): Promise<Song & { found: boolean }> {
  try {
    const { data, error } = await supabase.functions.invoke("song-details", { body: { url } });
    if (error || !data?.url) throw error ?? new Error("no details");
    return { url: data.url, title: data.title ?? "", artist: data.artist ?? "", album: data.album ?? "", cover_path: data.cover_path ?? null, found: !!data.title };
  } catch {
    return { url, title: "", artist: "", album: "", cover_path: null, found: false };
  }
}

export async function setLetterSong(letterId: string, song: Song | null, note: string) {
  check(await supabase.rpc("set_letter_song", {
    p_id: letterId, p_url: song?.url ?? null, p_title: song?.title ?? null, p_artist: song?.artist ?? null,
    p_album: song?.album ?? null, p_cover_path: song?.cover_path ?? null, p_note: note || null,
  }));
}
export const soundtrackFeed = async () => (check(await supabase.rpc("soundtrack_feed")) ?? []) as SoundtrackItem[];
export const addSoundtrackSong = async (s: Song, note: string, on: string | null) =>
  check(await supabase.rpc("add_soundtrack_song", {
    p_url: s.url, p_title: s.title, p_artist: s.artist, p_album: s.album, p_cover_path: s.cover_path, p_note: note, p_shared_on: on,
  })) as string;
export const updateSoundtrackNote = async (id: string, note: string) => { check(await supabase.rpc("update_soundtrack_note", { p_id: id, p_note: note })); };
export const removeSoundtrackSong = async (id: string) => { check(await supabase.rpc("remove_soundtrack_song", { p_id: id })); };
