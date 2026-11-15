// Our Little Ritual — "send-reminders" (Supabase Edge Function)
//
// Delivers gentle reminders by web push. Two ways in:
//   1. Hourly schedule: POST with header `x-cron-secret: <CRON_SECRET>`.
//      Asks the database who is due (due_reminders), sends each reminder once
//      (reminder_log prevents repeats), and tidies up devices that unsubscribed.
//   2. "Send a test reminder" from Settings: POST with the signed-in user's token.
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
  send: (sub: webpush.PushSubscription, data: string) => Promise<unknown> = (s, d) => webpush.sendNotification(s, d, { TTL: 60 * 60 * 12 }),
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

  // 1) Hourly schedule
  if (req.headers.get("x-cron-secret")) {
    if (req.headers.get("x-cron-secret") !== cfg.cronSecret) return json({ error: "forbidden" }, 403);
    const { data: due, error } = await db.rpc("due_reminders");
    if (error) return json({ error: error.message }, 500);
    let sent = 0;
    for (const r of (due ?? []) as Due[]) {
      // Claim it first, so a retry or an overlapping run never sends it twice.
      const { data: claimed } = await db.from("reminder_log")
        .upsert({ user_id: r.user_id, kind: r.kind, ref: r.ref }, { onConflict: "user_id,kind,ref", ignoreDuplicates: true }).select();
      if (!claimed?.length) continue;
      const { data: subs } = await db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").eq("user_id", r.user_id);
      sent += await deliver(db, (subs ?? []) as Sub[], { title: r.title, body: r.body, url: r.url, tag: `${r.kind}-${r.ref}` }, sendImpl);
    }
    return json({ due: (due ?? []).length, sent });
  }

  // 2) Test from Settings: only to the caller's own devices.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Please sign in." }, 401);
  const { data: userData, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Please sign in." }, 401);
  const uid = userData.user.id;
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
