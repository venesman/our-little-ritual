import { supabase } from "./supabase";
import { notifyNow } from "./reminders";
import { localDate } from "./callWindow";

export interface Nudge { id: string; sender_id: string; created_at: string }

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export async function sendNudge(): Promise<void> {
  check(await supabase.rpc("send_nudge"));
  notifyNow();
}

/** The last week of taps between you two (RLS limits it to your space). */
export async function recentNudges(): Promise<Nudge[]> {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  return check(await supabase.from("nudges").select("id, sender_id, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(200)) as Nudge[];
}

/** How many taps a person sent "today" in the viewer's own time zone, and when the latest was. */
export function summarise(nudges: Nudge[], senderId: string, now: Date, timeZone: string) {
  const today = localDate(now, timeZone);
  const fromThem = nudges.filter((n) => n.sender_id === senderId);
  const todayCount = fromThem.filter((n) => {
    const d = localDate(new Date(n.created_at), timeZone);
    return d.y === today.y && d.m === today.m && d.d === today.d;
  }).length;
  return { todayCount, last: fromThem[0]?.created_at ?? null };
}

export function ago(iso: string, now: Date = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
