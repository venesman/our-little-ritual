import { supabase } from "./supabase";
import type { DatePrecision } from "./story";

/* =====================================================================
 * The relationship record: supporting documents, photo-date sources,
 * "my words in exports" consent, the fairer monthly summary, and small
 * pure helpers used by Export our story. Everything stays private: files
 * live in a private bucket and the document is built on the phone.
 * ===================================================================== */

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

/* ------------------------------------------------ supporting documents */
export type DocType = "travel_booking" | "boarding_pass" | "accommodation" | "entry_stamp" | "other";
export const DOC_TYPE_LABEL: Record<DocType, string> = {
  travel_booking: "Flight / travel booking", boarding_pass: "Boarding pass", accommodation: "Accommodation booking",
  entry_stamp: "Passport entry / exit stamp", other: "Other document",
};
export interface SupportingDoc {
  id: string; attached_kind: "visit" | "milestone"; ref_id: string; path: string; file_name: string;
  doc_type: DocType; note: string; added_by: string | null; created_at: string;
}
export const DOC_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic";
const DOC_MAX = 10 * 1024 * 1024;

/** Null when the database hasn't been updated yet (so the app can hide the feature). */
export async function listDocuments(): Promise<SupportingDoc[] | null> {
  const res = await supabase.rpc("documents_list");
  if (res.error) return null;
  return (res.data ?? []) as SupportingDoc[];
}

export async function uploadDocument(relationshipId: string, userId: string, kind: "visit" | "milestone", refId: string, file: File, docType: DocType, note = "") {
  if (file.size > DOC_MAX) throw new Error("That file is over 10 MB. Try a smaller copy or a screenshot.");
  const type = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
  if (!DOC_ACCEPT.split(",").includes(type)) throw new Error("Please choose a PDF or a photo (JPG, PNG, HEIC).");
  const ext = type === "application/pdf" ? "pdf" : type.split("/")[1].replace("jpeg", "jpg");
  const path = `${relationshipId}/${userId}/${crypto.randomUUID()}.${ext}`;
  check(await supabase.storage.from("documents").upload(path, file, { contentType: type, upsert: false }));
  try {
    check(await supabase.rpc("add_document", { p_kind: kind, p_ref: refId, p_path: path, p_file_name: file.name.slice(0, 120) || "Document", p_doc_type: docType, p_note: note }));
  } catch (e) {
    await supabase.storage.from("documents").remove([path]);
    throw e;
  }
}

export async function removeDocument(id: string) {
  const path = check(await supabase.rpc("remove_document", { p_id: id })) as string;
  await supabase.storage.from("documents").remove([path]);
}

/** Removes every document on a visit or milestone (before deleting it), files included. */
export async function removeDocumentsOf(docs: SupportingDoc[] | null, kind: "visit" | "milestone", refId: string) {
  for (const d of (docs ?? []).filter((x) => x.attached_kind === kind && x.ref_id === refId)) {
    await removeDocument(d.id).catch(() => {});
  }
}

export async function openDocument(path: string) {
  const { data } = await supabase.storage.from("documents").createSignedUrl(path, 120);
  if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
}

/* ------------------------------------------------------- photo dates */
export type PhotoSource = "photo" | "manual";
export async function photoSources(): Promise<Record<string, PhotoSource>> {
  const res = await supabase.rpc("moment_photo_sources");
  if (res.error) return {};
  return Object.fromEntries(((res.data ?? []) as { id: string; taken_at_source: PhotoSource | null }[])
    .filter((r) => r.taken_at_source).map((r) => [r.id, r.taken_at_source!]));
}
export async function setPhotoDate(photoId: string, on: string | null) {
  check(await supabase.rpc("set_photo_date", { p_id: photoId, p_on: on }));
}

/* ------------------------------------------------ my words in exports */
/** { userId: allowed } — empty when the database hasn't been updated yet. */
export async function exportConsent(): Promise<Record<string, boolean>> {
  const res = await supabase.rpc("export_consent");
  return res.error ? {} : ((res.data ?? {}) as Record<string, boolean>);
}
export async function setExportMyWords(on: boolean) {
  check(await supabase.rpc("set_export_my_words", { p_on: on }));
}

/* ------------------------------------------------ fairer monthly summary */
export interface MonthRecord {
  month: string;
  rituals_both: number; checkins_both: number;
  letters_by: Record<string, number>;
  call_days: number; games: number; creations: number;
  research: number; missions_both: number; songs: number;
}
/** Null when the database hasn't been updated yet. */
export async function monthlyRecord(from: string, to: string): Promise<MonthRecord[] | null> {
  const res = await supabase.rpc("export_activity_summary_v3", { p_from: from, p_to: to });
  if (res.error) return null;
  return (res.data ?? []) as MonthRecord[];
}

/* ============================================================ pure helpers */
const dayNum = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
const isoOf = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);

/** Days counted inclusively: 10–17 April is 8 days. */
export const daysInclusive = (from: string, until?: string | null) => (until && until >= from ? dayNum(until) - dayNum(from) + 1 : 1);

/**
 * Every calendar day spent together, counted once — overlapping trips and
 * visits never double up. Clipped to [from, to] when given.
 */
export function togetherDays(ranges: { from: string; until?: string | null }[], clipFrom?: string, clipTo?: string): Set<string> {
  const out = new Set<string>();
  const lo = clipFrom ? dayNum(clipFrom) : -Infinity;
  const hi = clipTo ? dayNum(clipTo) : Infinity;
  for (const r of ranges) {
    const a = Math.max(dayNum(r.from), lo);
    const b = Math.min(dayNum(r.until && r.until >= r.from ? r.until : r.from), hi);
    for (let d = a; d <= b; d++) out.add(isoOf(d));
  }
  return out;
}

/** Days together per month ("2025-04" → 8). */
export function togetherByMonth(days: Set<string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of days) out[d.slice(0, 7)] = (out[d.slice(0, 7)] ?? 0) + 1;
  return out;
}

/** A date written as exactly as it's known: "14 March 2025", "March 2025" or "2025". */
export function fmtPrecise(iso: string, precision: DatePrecision = "day"): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  const opts: Intl.DateTimeFormatOptions = precision === "year" ? { year: "numeric", timeZone: "UTC" }
    : precision === "month" ? { month: "long", year: "numeric", timeZone: "UTC" }
    : { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" };
  return new Intl.DateTimeFormat("en-GB", opts).format(d);
}

/* -------------------------------------------------------- source labels */
export type Source = "app" | "entered" | "photo" | "manual_photo" | "document";
export const SOURCE_LABEL: Record<Source, string> = {
  app: "Recorded by the app",
  entered: "Entered by hand",
  photo: "Date from photo data",
  manual_photo: "Photo date corrected by hand",
  document: "Supporting document attached",
};
export const SOURCE_EXPLAIN: Record<Source, string> = {
  app: "The app saved the date automatically when it happened.",
  entered: "Typed in by one of us. Not independently verified.",
  photo: "Taken from the camera's own date stored in the photo (EXIF), not the file's date.",
  manual_photo: "The photo had no usable camera date, or it was wrong, so we set it by hand.",
  document: "A file is attached in the app. The app doesn't check documents; see the original.",
};

/** "Entered by Vee on 3 Dec 2026" — or just "Entered by hand". */
export function enteredBy(name: string | null | undefined, createdAt?: string | null): string {
  const who = name ? ` by ${name}` : " by hand";
  if (!createdAt) return `Entered${who}`;
  return `Entered${who} on ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(createdAt))}`;
}

/* ------------------------------------------------------------- overview */
export interface OverviewInput {
  names: string[];
  start?: { on: string; precision?: DatePrecision } | null;
  firstMet?: { on: string; precision?: DatePrecision } | null;
  meetings: { from: string; until?: string | null; country?: string; stay_type?: string }[];
  totalDays: number;
  countries: string[];
  familyVisits: number;
  homes: string[];   // "Vee lives in Kuching, Malaysia"
}

/** A short, factual introduction. Editable before export; never stored on the server. */
export function overviewText(o: OverviewInput): string {
  const names = o.names.length === 2 ? `${o.names[0]} and ${o.names[1]}` : o.names.join(", ");
  const out: string[] = [];
  if (o.firstMet && o.start && o.firstMet.on !== o.start.on) {
    out.push(`${names} first met in ${fmtPrecise(o.firstMet.on, o.firstMet.precision)}, and their relationship began in ${fmtPrecise(o.start.on, o.start.precision)}.`);
  } else if (o.start) {
    out.push(`${names}'s relationship began in ${fmtPrecise(o.start.on, o.start.precision)}.`);
  } else if (o.firstMet) {
    out.push(`${names} first met in ${fmtPrecise(o.firstMet.on, o.firstMet.precision)}.`);
  }
  if (o.homes.length) out.push(`${o.homes.join("; ")}.`);
  const past = o.meetings.length;
  if (past) {
    const where = o.countries.length ? ` in ${listJoin(o.countries)}` : "";
    out.push(`They have spent time together in person ${past === 1 ? "once" : past === 2 ? "twice" : `${past} times`}${where}, ${o.totalDays} ${o.totalDays === 1 ? "day" : "days"} in total.`);
  }
  if (o.familyVisits) out.push(`${o.familyVisits === 1 ? "One of these visits" : `${o.familyVisits} of these visits`} included time with family.`);
  out.push("Between visits they have kept in touch through the app, as summarised month by month below.");
  return out.join(" ");
}

export function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
