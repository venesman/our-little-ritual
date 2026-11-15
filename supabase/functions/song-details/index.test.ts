const assertEquals = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
import { parseDetails } from "./index.ts";

Deno.test("reads title, artist and album from the song page", () => {
  const html = `<meta property="og:title" content="Waterloo"><meta property="og:description" content="ABBA · Waterloo · Song · 1974">
    <meta property="og:image" content="https://i.scdn.co/image/abc">`;
  const d = parseDetails({ title: "Waterloo", thumbnail_url: "https://i.scdn.co/image/xyz" }, html);
  assertEquals(d, { title: "Waterloo", artist: "ABBA", album: "Waterloo", cover: "https://i.scdn.co/image/xyz" });
});

Deno.test("falls back to the page when oEmbed gives nothing", () => {
  const html = `<meta content="Dancing Queen" property="og:title"><meta name="music:musician_description" content="ABBA">
    <meta property="og:image" content="https://i.scdn.co/image/abc">`;
  const d = parseDetails(null, html);
  assertEquals(d.title, "Dancing Queen");
  assertEquals(d.artist, "ABBA");
  assertEquals(d.cover, "https://i.scdn.co/image/abc");
});

Deno.test("decodes HTML entities", () => {
  const d = parseDetails(null, `<meta property="og:title" content="Rock &amp; Roll"><meta property="og:description" content="Guns N&#39; Roses · Album · Song · 1987">`);
  assertEquals(d.title, "Rock & Roll");
  assertEquals(d.artist, "Guns N' Roses");
});
