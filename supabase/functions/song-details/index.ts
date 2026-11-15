// Our Little Ritual — song-details
//
// Given a Spotify song link, returns its title, artist, album and a copy of its
// cover in your private "songs" folder. Uses only Spotify's public pages (the
// oEmbed endpoint and the song's page), no Spotify login, nothing about you is
// sent to Spotify. Only signed-in members of a space can use it.
//
// Deploy: Supabase → Edge Functions → Deploy new function → name "song-details",
// paste this file. SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY
// are provided by Supabase automatically.
import { createClient } from "npm:@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
type Db = any;
type Fetch = typeof fetch;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const TRACK = /^https:\/\/open\.spotify\.com\/(?:intl-[a-zA-Z-]+\/)?track\/([A-Za-z0-9]{22})(?:[?#].*)?$/;
const SHORT = /^https:\/\/spotify\.link\/[A-Za-z0-9]+$/;
const IMAGE_HOSTS = /^https:\/\/(i\.scdn\.co|image-cdn-[a-z0-9-]+\.spotifycdn\.com|mosaic\.scdn\.co)\//;

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const meta = (html: string, key: string) => {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)="${key}"[^>]+content="([^"]*)"`, "i"))
    ?? html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${key}"`, "i"));
  return m ? decode(m[1]).trim() : "";
};

/** Pull title / artist / album out of the song's public page and oEmbed reply. */
export function parseDetails(oembed: { title?: string; thumbnail_url?: string } | null, html: string) {
  const title = (oembed?.title || meta(html, "og:title")).trim();
  let artist = "", album = "";
  // og:description on song pages reads "Artist · Album · Song · Year"
  const parts = meta(html, "og:description").split(" · ").map((p) => p.trim());
  if (parts.length >= 3 && /^(song|låt|canción|lagu)$/i.test(parts[2])) { artist = parts[0]; album = parts[1]; }
  if (!artist) artist = meta(html, "music:musician_description");
  const cover = oembed?.thumbnail_url || meta(html, "og:image");
  return { title: title.slice(0, 200), artist: artist.slice(0, 200), album: album.slice(0, 200), cover };
}

export async function handle(req: Request, env: (k: string) => string | undefined, fetchImpl: Fetch = fetch): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const url = env("SUPABASE_URL"), anon = env("SUPABASE_ANON_KEY"), service = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "The song finder isn't set up yet." }, 500);

  const auth = req.headers.get("Authorization") ?? "";
  const userDb: Db = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u } = await userDb.auth.getUser();
  if (!u?.user) return json({ error: "Please sign in first." }, 401);
  const { data: rel } = await userDb.rpc("my_relationship_id");
  if (!rel) return json({ error: "You're not part of a space yet." }, 403);

  let link = "";
  try { link = String((await req.json()).url ?? "").trim(); } catch { /* empty */ }
  if (!TRACK.test(link) && !SHORT.test(link)) return json({ error: "That doesn't look like a Spotify song link." }, 400);

  // short links: follow to the real song page
  let page = link;
  if (SHORT.test(link)) {
    const r = await fetchImpl(link, { redirect: "follow" });
    page = r.url;
    if (!TRACK.test(page)) return json({ error: "That link doesn't lead to a Spotify song." }, 400);
  }
  const id = page.match(TRACK)![1];
  const canonical = `https://open.spotify.com/track/${id}`;

  let oembed: { title?: string; thumbnail_url?: string } | null = null;
  try {
    const r = await fetchImpl(`https://open.spotify.com/oembed?url=${encodeURIComponent(canonical)}`);
    if (r.ok) oembed = await r.json();
  } catch { /* fall back to the page */ }
  let html = "";
  try {
    const r = await fetchImpl(canonical, { headers: { "Accept-Language": "en", "User-Agent": "Mozilla/5.0 (OurLittleRitual song card)" } });
    if (r.ok) html = (await r.text()).slice(0, 400_000);
  } catch { /* fine */ }
  const d = parseDetails(oembed, html);

  // keep our own copy of the cover, so viewing never reaches out to Spotify
  let cover_path: string | null = null;
  if (d.cover && IMAGE_HOSTS.test(d.cover)) {
    try {
      const img = await fetchImpl(d.cover);
      const type = img.headers.get("content-type") ?? "image/jpeg";
      const buf = new Uint8Array(await img.arrayBuffer());
      if (img.ok && /^image\/(jpeg|png|webp)$/.test(type) && buf.byteLength < 2_000_000) {
        const admin: Db = createClient(url, service, { auth: { persistSession: false } });
        const path = `${rel}/${u.user.id}/${crypto.randomUUID()}.${type.endsWith("png") ? "png" : type.endsWith("webp") ? "webp" : "jpg"}`;
        const { error } = await admin.storage.from("songs").upload(path, buf, { contentType: type, upsert: false });
        if (!error) cover_path = path;
      }
    } catch { /* a song without a cover is fine */ }
  }
  return json({ url: canonical, track_id: id, title: d.title, artist: d.artist, album: d.album, cover_path });
}

if (Deno.env.get("OLR_TEST") !== "1") {
  Deno.serve((req) => handle(req, (k) => Deno.env.get(k)));
}
