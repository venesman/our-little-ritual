import { supabase } from "./supabase";
import { compressImage } from "./image";

export const WHIM_BUCKET = "whims";
export type WhimKind = "little_want" | "shared_wish";
export type WhimStatus = "new" | "maybe" | "yes" | "surprise" | "bought" | "not_now" | "plan" | "saving" | "done" | "in_the_works";
export type Currency = "RM" | "SEK" | "CLP";
export const CURRENCIES: Currency[] = ["RM", "SEK", "CLP"];

export interface Whim {
  id: string; kind: WhimKind; created_by: string; name: string; link: string | null; price: number | null; currency: Currency | null;
  message: string; photo_path: string | null; status: WhimStatus; status_by: string | null; status_at: string; response_note: string;
  surprise: boolean; revealed_at: string | null; archived: boolean; created_at: string;
}

export const KIND_INFO: Record<WhimKind, { label: string; hint: string }> = {
  little_want: { label: "Little Want", hint: "Something you'd love — your partner answers" },
  shared_wish: { label: "Shared Wish", hint: "Something for the two of you, moved along together" },
};

/** Answers, in the order they're offered (approved wording). */
export const LITTLE_WANT_ANSWERS: WhimStatus[] = ["maybe", "yes", "surprise", "bought", "not_now"];
export const SHARED_WISH_STATUSES: WhimStatus[] = ["plan", "saving", "done", "maybe", "not_now"];
export const STATUS_LABEL: Record<WhimStatus, string> = {
  new: "Waiting for an answer", maybe: "Maybe someday", yes: "Yes! Let's get it, Puffin!", surprise: "I'll surprise you",
  bought: "Bought!", not_now: "Not right now", plan: "Let's plan it", saving: "Saving up", done: "Done together!",
  in_the_works: "Something's in the works ✦",
};

export const cameTrue = (w: Whim) => (w.kind === "little_want" && w.status === "bought" && !w.surprise) || (w.kind === "shared_wish" && w.status === "done");

export function formatPrice(price: number | null, currency: Currency | null): string | null {
  if (price == null || !currency) return null;
  const n = Number(price), whole = currency === "CLP" || Number.isInteger(n);
  return `${currency} ${n.toLocaleString("en-GB", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })}`;
}

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export async function listWhims(): Promise<Whim[]> {
  return (check(await supabase.rpc("my_whims")) ?? []) as Whim[];
}
export async function saveWhim(w: { id?: string | null; kind: WhimKind; name: string; link?: string | null; price?: number | null; currency?: Currency | null; message?: string; photo_path?: string | null }) {
  return check(await supabase.rpc("save_whim", {
    p_id: w.id ?? null, p_kind: w.kind, p_name: w.name, p_link: w.link || null,
    p_price: w.price ?? null, p_currency: w.price == null ? null : w.currency ?? null, p_message: w.message ?? "", p_photo_path: w.photo_path ?? null,
  })) as string;
}
export async function setWhimStatus(id: string, status: WhimStatus, note?: string | null) {
  check(await supabase.rpc("set_whim_status", { p_id: id, p_status: status, p_note: note ?? null }));
}
export async function revealWhim(id: string) { check(await supabase.rpc("reveal_whim", { p_id: id })); }
export async function archiveWhim(id: string, archived = true) { check(await supabase.rpc("archive_whim", { p_id: id, p_archived: archived })); }
export async function deleteWhim(id: string) {
  const photo = check(await supabase.rpc("delete_whim", { p_id: id })) as string | null;
  if (photo) await supabase.storage.from(WHIM_BUCKET).remove([photo]);
}
export async function uploadWhimPhoto(relId: string, whimId: string, userId: string, file: File): Promise<string> {
  const small = await compressImage(file);
  const path = `${relId}/${whimId}/${userId}/${crypto.randomUUID()}.jpg`;
  check(await supabase.storage.from(WHIM_BUCKET).upload(path, small, { contentType: "image/jpeg", upsert: false }));
  return path;
}
export async function removeWhimPhoto(path: string) { await supabase.storage.from(WHIM_BUCKET).remove([path]); }
