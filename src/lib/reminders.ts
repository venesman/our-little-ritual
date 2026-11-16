import { supabase } from "./supabase";

/**
 * Gentle reminders via web push. Opt-in per phone. The public key comes from
 * VITE_VAPID_PUBLIC_KEY; the private key lives only in Supabase secrets.
 */
export const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? "";

export type ReminderSupport = "ok" | "not-configured" | "unsupported" | "ios-needs-home-screen" | "denied";

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function reminderSupport(): ReminderSupport {
  if (!VAPID_PUBLIC_KEY) return "not-configured";
  if (isIOS() && !isStandalone()) return "ios-needs-home-screen";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "ok";
}

function urlB64ToUint8Array(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  return reg;
}

/** Is this phone currently subscribed? */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function turnOnReminders(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications weren't allowed. You can allow them in your phone's settings for this app.");
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY) }));
  const j = sub.toJSON();
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth, p_user_agent: navigator.userAgent.slice(0, 300),
  });
  if (error) throw error;
}

export async function turnOffReminders(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.rpc("delete_push_subscription", { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}

/** remind_partner / remind_love exist once migration 0032 has run; quiet hours once 0033 has. */
export interface ReminderPrefs { remind_monday: boolean; remind_midweek: boolean; remind_letters: boolean; remind_partner?: boolean; remind_love?: boolean }
export interface QuietHours { start: number | null; end: number | null }
export async function getReminderPrefs(userId: string): Promise<ReminderPrefs | null> {
  for (const cols of ["remind_monday, remind_midweek, remind_letters, remind_partner, remind_love", "remind_monday, remind_midweek, remind_letters"]) {
    const { data, error } = await supabase.from("profiles").select(cols).eq("id", userId).maybeSingle();
    if (!error) return data as ReminderPrefs | null;
  }
  return null;
}
/** null when the quiet-hours migration hasn't run yet (the control stays hidden). */
export async function getQuietHours(userId: string): Promise<QuietHours | null> {
  const { data, error } = await supabase.from("profiles").select("quiet_start, quiet_end").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  const d = data as { quiet_start: number | null; quiet_end: number | null };
  return { start: d.quiet_start, end: d.quiet_end };
}
export async function setQuietHours(q: QuietHours) {
  const { error } = await supabase.rpc("set_quiet_hours", { p_start: q.start, p_end: q.end });
  if (error) throw error;
}
export async function setReminderPrefs(p: Partial<ReminderPrefs>) {
  if (p.remind_partner !== undefined || p.remind_love !== undefined) {
    const { error } = await supabase.rpc("set_news_prefs", { p_partner: p.remind_partner ?? null, p_love: p.remind_love ?? null });
    if (error) throw error;
    if (p.remind_monday === undefined && p.remind_midweek === undefined && p.remind_letters === undefined) return;
  }
  const { error } = await supabase.rpc("set_reminder_prefs", {
    p_monday: p.remind_monday ?? null, p_midweek: p.remind_midweek ?? null, p_letters: p.remind_letters ?? null,
  });
  if (error) throw error;
}

export async function sendTestReminder(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("send-reminders", { body: { test: true } });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    try { const body = await ctx?.json(); if (body?.error) return body.error as string; } catch { /* ignore */ }
    return "The reminder service isn't set up yet — see the setup steps.";
  }
  return (data as { sent?: number })?.sent ? "Sent! It should appear on this phone in a moment." : "No reminder could be delivered to this phone.";
}

/**
 * Ask the server to deliver anything that's now due (e.g. "Jonatan shared…") straight
 * away, instead of waiting for the next scheduled check. Fire-and-forget: if it fails,
 * the schedule still delivers within a few minutes.
 */
export function notifyNow(): void {
  window.setTimeout(() => {
    void supabase.functions.invoke("send-reminders", { body: { kick: true } }).catch(() => {});
  }, 400);
}
