import type { Profile } from "./api";

/**
 * Just us activities contain [tokens] such as "[your current city]" or "[their home country]".
 * They're filled on each phone from the two profiles: "your" means the person reading,
 * "their" means their partner. Nationality, home country and institution are never used
 * as a stand-in for where someone lives now.
 *
 * If any token can't be filled (a field is empty, or the partner hasn't joined yet), the whole
 * text switches to the activity's general fallback, so nothing ever reads "[your city]".
 */

type P = Pick<Profile, "current_city" | "current_country" | "home_country" | "institution" | "situation" | "languages_spoken" | "languages_learning"> | null | undefined;

const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

/** "Spanish", "Spanish or Swedish", "Spanish, Swedish or Iban" */
export function orList(xs: string[]): string | null {
  const u = uniq(xs);
  if (u.length === 0) return null;
  if (u.length === 1) return u[0];
  return `${u.slice(0, -1).join(", ")} or ${u[u.length - 1]}`;
}

const langs = (p: P) => [...(p?.languages_spoken ?? []), ...(p?.languages_learning ?? [])];

function resolveToken(token: string, me: P, partner: P): string | null {
  const t = token.toLowerCase().replace(/’/g, "'").trim();
  const who = /\b(their|partner)\b/.test(t) ? partner : me;

  // languages
  if (t.includes("language")) {
    if (t.includes("one of you is learning")) return orList([...(me?.languages_learning ?? []), ...(partner?.languages_learning ?? [])]);
    if (t.includes("your partner") || t.includes("their")) return orList(langs(partner));
    if (t.includes("you're learning") || (t.includes("you are learning") && !t.includes("speak"))) return orList(me?.languages_learning ?? []);
    if (t.includes("speak or are learning")) return orList([...langs(me), ...langs(partner)]);
    if (t.includes("you speak")) return orList([...(me?.languages_spoken ?? []), ...(partner?.languages_spoken ?? [])]);
    return orList([...langs(me), ...langs(partner)]);
  }
  if (t.includes("home country")) return clean(who?.home_country);
  if (t.includes("current city")) return clean(who?.current_city);
  if (t.includes("current country") || t.includes("where you live now") || t.includes("where they live now")) return clean(who?.current_country);
  if (t.includes("situation")) return clean(who?.situation);
  if (t.includes("work or studies")) return clean(who?.situation) ?? clean(who?.institution);
  if (t.includes("institution") || t.includes("university")) return clean(who?.institution);
  return null;
}

const TOKEN = /\[([^\]]{2,60})\]/g;

/** Fill [tokens]; returns null if any token is missing so the caller can use the fallback. */
export function fillTokens(text: string, me: P, partner: P): string | null {
  let missing = false;
  const out = text.replace(TOKEN, (_, tok: string) => {
    const v = resolveToken(tok, me, partner);
    if (v === null) { missing = true; return ""; }
    return v;
  });
  return missing ? null : out;
}

export const hasTokens = (text: string | null | undefined) => !!text && /\[[^\]]{2,60}\]/.test(text);

/**
 * The text to show for an activity's instructions. General activities pass through unchanged.
 * `personal` is true when the profile details were used, so the UI can say "made for you two".
 */
export function personalise(
  instructions: string,
  fallback: string | null | undefined,
  me: P,
  partner: P,
): { text: string; personal: boolean } {
  if (!hasTokens(instructions)) return { text: instructions, personal: false };
  const filled = fillTokens(instructions, me, partner);
  if (filled !== null) return { text: filled, personal: true };
  if (fallback) return { text: fallback, personal: false };
  // No fallback written: soften each token into general wording.
  return { text: instructions.replace(TOKEN, (_, tok: string) => tok.replace(/^(your|their) /, "a ")), personal: false };
}
