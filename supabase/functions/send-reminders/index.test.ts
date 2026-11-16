// Run: OLR_TEST=1 deno test --allow-net --allow-env supabase/functions/send-reminders/index.test.ts
import webpush from "npm:web-push@3.6.7";
import { handle } from "./index.ts";

function assert(c: unknown, msg: string) { if (!c) throw new Error("FAIL: " + msg); }

// A tiny fake of the Supabase REST/Auth API, just enough for this function.
function fakeSupabase() {
  const state = {
    due: [] as Record<string, string>[], log: new Set<string>(),
    subs: [] as { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }[],
    deleted: [] as string[], users: { "good-token": "user-a" } as Record<string, string>,
  };
  const server = Deno.serve({ port: 0, onListen() {} }, async (req) => {
    const u = new URL(req.url);
    const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
    if (u.pathname === "/rest/v1/rpc/due_reminders") return j(state.due);
    if (u.pathname === "/rest/v1/reminder_log") {
      const row = await req.json(); const key = `${row.user_id}|${row.kind}|${row.ref}`;
      if (state.log.has(key)) return j([], 201);
      state.log.add(key); return j([row], 201);
    }
    if (u.pathname === "/rest/v1/push_subscriptions") {
      if (req.method === "GET") { const uid = u.searchParams.get("user_id")!.replace("eq.", ""); return j(state.subs.filter((s) => s.user_id === uid)); }
      if (req.method === "DELETE") { state.deleted.push(u.searchParams.get("id")!.replace("eq.", "")); return j([], 204 === 204 ? 200 : 200); }
      return j([]);
    }
    if (u.pathname === "/rest/v1/relationship_members") {
      const uid = u.searchParams.get("user_id")?.replace("eq.", "");
      if (uid) {
        const row = uid === "user-a" || uid === "user-b" ? { relationship_id: "rel-1" } : null;
        return (req.headers.get("accept") ?? "").includes("pgrst.object") ? (row ? j(row) : j({}, 406)) : j(row ? [row] : []);
      }
      return j([{ user_id: "user-a" }, { user_id: "user-b" }]);
    }
    if (u.pathname === "/auth/v1/user") {
      const t = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
      const id = state.users[t]; return id ? j({ id, aud: "authenticated" }) : j({ msg: "bad" }, 401);
    }
    return j({ msg: "not found " + u.pathname }, 404);
  });
  return { state, server, url: `http://localhost:${(server.addr as Deno.NetAddr).port}` };
}

// A real browser-like push subscription key pair, so encryption is actually exercised.
async function browserKeys() {
  const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const b64u = (a: Uint8Array) => btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { p256dh: b64u(raw), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) };
}

Deno.test("send-reminders", async () => {
  const fake = fakeSupabase();
  const vapid = webpush.generateVAPIDKeys();
  const env = (k: string) => ({
    SUPABASE_URL: fake.url, SUPABASE_SERVICE_ROLE_KEY: "service", VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey,
    VAPID_SUBJECT: "mailto:test@example.com", CRON_SECRET: "s3cret",
  } as Record<string, string>)[k];
  const key1 = await browserKeys(); const key2 = await browserKeys();
  fake.state.subs = [
    { id: "s1", user_id: "user-a", endpoint: "https://push.example/a", ...key1 },
    { id: "s2", user_id: "user-b", endpoint: "https://push.example/gone", ...key2 },
  ];
  fake.state.due = [
    { user_id: "user-a", kind: "monday", ref: "2026-11-16", title: "Your Monday postcard has arrived ✉", body: "x", url: "/" },
    { user_id: "user-b", kind: "monday", ref: "2026-11-16", title: "Your Monday postcard has arrived ✉", body: "x", url: "/" },
  ];
  const delivered: { endpoint: string; payload: string; encrypted: number }[] = [];
  const send = async (sub: webpush.PushSubscription, data: string) => {
    if (sub.endpoint.includes("gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
    // Real VAPID signing + payload encryption, without a network call:
    const details = webpush.generateRequestDetails(sub, data, { TTL: 60 });
    delivered.push({ endpoint: sub.endpoint, payload: data, encrypted: (details.body as Uint8Array).length });
  };
  const post = (headers: Record<string, string>) => new Request("http://fn/send-reminders", { method: "POST", headers, body: "{}" });

  // wrong cron secret
  assert((await handle(post({ "x-cron-secret": "nope" }), env, send)).status === 403, "wrong cron secret refused");

  // scheduled run
  const r1 = await (await handle(post({ "x-cron-secret": "s3cret" }), env, send)).json();
  assert(r1.due === 2 && r1.sent === 1, "one delivered, one device gone: " + JSON.stringify(r1));
  assert(delivered[0].endpoint === "https://push.example/a" && delivered[0].encrypted > 0, "payload encrypted with VAPID");
  assert(JSON.parse(delivered[0].payload).title.includes("Monday postcard"), "right title");
  assert(fake.state.deleted.includes("s2"), "unsubscribed device cleaned up");

  // same hour again → nothing twice
  const r2 = await (await handle(post({ "x-cron-secret": "s3cret" }), env, send)).json();
  assert(r2.sent === 0, "never sends the same reminder twice");

  // test reminder: needs a signed-in user; once a minute
  assert((await handle(post({}), env, send)).status === 401, "test needs sign-in");
  assert((await handle(post({ authorization: "Bearer bad" }), env, send)).status === 401, "bad token refused");
  const t1 = await handle(post({ authorization: "Bearer good-token" }), env, send);
  assert(t1.status === 200 && (await t1.json()).sent === 1, "test reminder delivered to own device");
  assert((await handle(post({ authorization: "Bearer good-token" }), env, send)).status === 429, "test limited to once a minute");

  // send now: delivers what's due for the two of you, straight away, never twice
  fake.state.due.push(
    { user_id: "user-b", kind: "love", ref: "2026-11-16T14", title: "Vee is thinking of you ♥", body: "x", url: "/" },
    { user_id: "user-z", kind: "love", ref: "2026-11-16T14", title: "Someone else", body: "x", url: "/" },
  );
  fake.state.subs.push({ id: "s3", user_id: "user-b", endpoint: "https://push.example/b2", ...(await browserKeys()) });
  const kick = (auth: string) => new Request("http://fn/send-reminders", { method: "POST", headers: { authorization: auth }, body: JSON.stringify({ kick: true }) });
  const before = delivered.length;
  const k1 = await (await handle(kick("Bearer good-token"), env, send)).json();
  assert(k1.sent === 1 && delivered.length === before + 1, "send now delivers immediately: " + JSON.stringify(k1));
  assert(JSON.parse(delivered[delivered.length - 1].payload).title.includes("thinking of you"), "the heart tap arrives");
  assert(!delivered.some((d) => d.payload.includes("Someone else")), "send now never touches other couples");
  const k2 = await (await handle(kick("Bearer good-token"), env, send)).json();
  assert(k2.sent === 0, "pressing again sends nothing twice");
  assert((await handle(kick("Bearer bad"), env, send)).status === 401, "send now needs sign-in");

  // missing secrets
  const bare = await handle(post({ "x-cron-secret": "s3cret" }), () => undefined, send);
  assert(bare.status === 500 && (await bare.json()).error.includes("VAPID_PUBLIC_KEY"), "clear message when secrets are missing");

  await fake.server.shutdown();
});
