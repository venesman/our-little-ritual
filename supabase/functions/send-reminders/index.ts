// Our Little Ritual — "send-reminders" (Supabase Edge Function)
//
// Delivers gentle reminders by web push. Two ways in:
//   1. Hourly schedule: POST with header `x-cron-secret: <CRON_SECRET>`.
//      Asks the database who is due (due_reminders), sends each reminder once
//      (reminder_log prevents repeats), and tidies up devices that unsubscribed.
//   2. "Send now": POST { kick: true } with the signed-in user's token, right after
//      they send something (a letter, their ritual, a check-in, a mission post, a
//      heart tap). Delivers whatever is already due for the two people in their
//      space, immediately. Same rules and same log as the schedule, so nothing is
//      ever sent twice and the schedule still catches anything missed.
//   3. "Send a test reminder" from Settings: POST with the signed-in user's token.
//      Sends one test to that person's own devices only (max one per minute).
//
// Secrets (Supabase → Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT (e.g. mailto:you@example.com), CRON_SECRET.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
// Reminders never contain private content.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
type Db = any;

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };
type Due = { user_id: string; kind: string; ref: string; title: string; body: string; url: string };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

export function configFromEnv(env: (k: string) => string | undefined) {
  const names = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "CRON_SECRET"];
  const missing = names.filter((n) => !env(n));
  const cfg = {
    url: env("SUPABASE_URL"), serviceKey: env("SUPABASE_SERVICE_ROLE_KEY"),
    vapidPublic: env("VAPID_PUBLIC_KEY"), vapidPrivate: env("VAPID_PRIVATE_KEY"),
    vapidSubject: env("VAPID_SUBJECT") ?? "mailto:hello@example.com", cronSecret: env("CRON_SECRET"),
  };
  return { cfg, missing };
}

/** Sends one notification to each device; returns how many arrived. Removes devices the browser says are gone. */
export async function deliver(
  db: Db, subs: Sub[], payload: { title: string; body: string; url: string; tag: string },
  send: (sub: webpush.PushSubscription, data: string) => Promise<unknown> = (s, d) =>
    // "high" so iPhones show it right away on the lock screen instead of saving it for later.
    webpush.sendNotification(s, d, { TTL: 60 * 60 * 12, urgency: "high" }),
) {
  let ok = 0;
  for (const s of subs) {
    try {
      await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
      ok++;
      await db.from("push_subscriptions").update({ last_ok_at: new Date().toISOString() }).eq("id", s.id);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
      else console.error("push failed", status ?? String(e));
    }
  }
  return ok;
}

export async function handle(req: Request, env: (k: string) => string | undefined, sendImpl?: Parameters<typeof deliver>[3]): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const { cfg, missing } = configFromEnv(env);
  if (missing.length) return json({ error: `Missing secrets: ${missing.join(", ")}` }, 500);
  webpush.setVapidDetails(cfg.vapidSubject!, cfg.vapidPublic!, cfg.vapidPrivate!);
  const db: Db = createClient(cfg.url!, cfg.serviceKey!, { auth: { persistSession: false } });

  // Sends everything due (optionally only for some people). Claims each one first,
  // so a retry, an overlapping run or a "send now" never sends it twice.
  const sendDue = async (onlyFor?: string[]) => {
    const { data: due, error } = await db.rpc("due_reminders");
    if (error) return { error: error.message };
    const rows = ((due ?? []) as Due[]).filter((r) => !onlyFor || onlyFor.includes(r.user_id));
    let sent = 0;
    for (const r of rows) {
      const { data: claimed } = await db.from("reminder_log")
        .upsert({ user_id: r.user_id, kind: r.kind, ref: r.ref }, { onConflict: "user_id,kind,ref", ignoreDuplicates: true }).select();
      if (!claimed?.length) continue;
      const { data: subs } = await db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").eq("user_id", r.user_id);
      sent += await deliver(db, (subs ?? []) as Sub[], { title: r.title, body: r.body, url: r.url, tag: `${r.kind}-${r.ref}` }, sendImpl);
    }
    return { due: rows.length, sent };
  };

  // 1) Schedule
  if (req.headers.get("x-cron-secret")) {
    if (req.headers.get("x-cron-secret") !== cfg.cronSecret) return json({ error: "forbidden" }, 403);
    const out = await sendDue();
    return "error" in out ? json(out, 500) : json(out);
  }

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Please sign in." }, 401);
  const { data: userData, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Please sign in." }, 401);
  const uid = userData.user.id;

  // 2) Send now: only ever for the two people in the caller's own space.
  let body: { kick?: boolean } = {};
  try { body = await req.clone().json(); } catch { /* no body */ }
  if (body.kick) {
    const { data: me } = await db.from("relationship_members").select("relationship_id").eq("user_id", uid).eq("status", "active").maybeSingle();
    if (!me) return json({ sent: 0 });
    const { data: members } = await db.from("relationship_members").select("user_id").eq("relationship_id", me.relationship_id).eq("status", "active");
    const out = await sendDue(((members ?? []) as { user_id: string }[]).map((m) => m.user_id));
    return "error" in out ? json(out, 500) : json(out);
  }

  // 3) Test from Settings: only to the caller's own devices.
  const minute = new Date().toISOString().slice(0, 16);
  const { data: claimed } = await db.from("reminder_log")
    .upsert({ user_id: uid, kind: "test", ref: minute }, { onConflict: "user_id,kind,ref", ignoreDuplicates: true }).select();
  if (!claimed?.length) return json({ error: "Give it a minute before testing again." }, 429);
  const { data: subs } = await db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").eq("user_id", uid);
  if (!subs?.length) return json({ error: "Reminders aren't turned on for this phone yet." }, 400);
  const sent = await deliver(db, subs as Sub[], { title: "Our Little Ritual ✦", body: "Reminders are on. This is how a gentle nudge will look.", url: "/settings", tag: "test" }, sendImpl);
  return json({ sent });
}

// Start the function (skipped only when this file is imported by its own tests).
if (Deno.env.get("OLR_TEST") !== "1") {
  Deno.serve((req) => handle(req, (k) => Deno.env.get(k)));
}
