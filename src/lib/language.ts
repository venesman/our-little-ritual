import { supabase } from "./supabase";

/* =====================================================================
 * Language corner: a small starter phrasebook (Swedish · Spanish · Iban)
 * plus the words you teach each other. Games use both, run on the phone
 * and keep no scores.
 * ===================================================================== */

export type Lang = "sv" | "es" | "iban" | "ms" | "en" | "other";
export const LANG_LABEL: Record<Lang, string> = { sv: "Swedish", es: "Spanish", iban: "Iban", ms: "Malay", en: "English", other: "Other" };
export const LANG_NATIVE: Record<Lang, string> = { sv: "Svenska", es: "Español", iban: "Jaku Iban", ms: "Bahasa Melayu", en: "English", other: "" };

export type Category = "hello" | "love" | "assurance" | "everyday" | "culture";
export const CATEGORY_LABEL: Record<Category, string> = { hello: "Hello & goodbye", love: "Love & care", assurance: "Reassurance", everyday: "Everyday", culture: "Little culture words" };

interface Starter { cat: Category; en: string; sv?: string; es?: string; iban?: string; say?: Partial<Record<Lang, string>>; note?: Partial<Record<Lang, string>> }

/** Starter phrases. Iban lines checked by Vee (15 Nov 2026) unless marked as a draft. */
export const STARTERS: Starter[] = [
  { cat: "hello", en: "Good morning", sv: "God morgon", es: "Buenos días", iban: "Selamat pagi", say: { sv: "goo MOR-ron" } },
  { cat: "hello", en: "Good night, sleep well", sv: "God natt, sov gott", es: "Buenas noches, que duermas bien", iban: "Selamat malam, ngarap ka nuan tinduk nyamai", say: { sv: "goo NAT, sohv GOT" } },
  { cat: "hello", en: "Good afternoon", sv: "God eftermiddag", es: "Buenas tardes", iban: "Selamat ngalih tengahari", say: { sv: "goo EF-ter-mid-dahg" } },
  { cat: "hello", en: "Good evening", sv: "God kväll", es: "Buenas noches", iban: "Selamat lemai", say: { sv: "goo KVELL" }, note: { es: "Spanish uses the same words for good evening and good night" } },
  { cat: "hello", en: "How are you?", sv: "Hur mår du?", es: "¿Cómo estás?", iban: "Nama berita nuan?", say: { sv: "hoor MOHR doo" } },
  { cat: "hello", en: "I'm fine", sv: "Jag mår bra", es: "Estoy bien", iban: "Aku gerai", say: { sv: "yah mohr BRAH" } },
  { cat: "hello", en: "Thank you", sv: "Tack", es: "Gracias", iban: "Terima kasih", say: { sv: "tahk" } },
  { cat: "hello", en: "Goodbye", sv: "Hej då", es: "Chao", iban: "Selamat tinggal", say: { sv: "hey DOH" }, note: { es: "Very common in Chile" } },
  { cat: "hello", en: "See you soon", sv: "Vi ses snart", es: "Nos vemos pronto", iban: "Betemu baru ilak", say: { sv: "vee sehs SNART" } },
  { cat: "love", en: "I love you", sv: "Jag älskar dig", es: "Te amo", iban: "Aku sayau ka nuan", say: { sv: "yah EL-skar day" }, note: { es: "“Te quiero” is softer and used more often" } },
  { cat: "love", en: "I miss you", sv: "Jag saknar dig", es: "Te extraño", iban: "Aku rindu ka nuan", say: { sv: "yah SAHK-nar day" } },
  { cat: "love", en: "My love / darling", sv: "Älskling", es: "Mi amor", iban: "Sulu ati aku", say: { sv: "ELSK-ling" } },
  { cat: "love", en: "You're beautiful", sv: "Du är vacker", es: "Eres hermosa", iban: "Nuan bajik", say: { sv: "doo air VAH-ker" }, note: { es: "“hermoso” when it's said to him" } },
  { cat: "love", en: "Take care of yourself", sv: "Ta hand om dig", es: "Cuídate", iban: "Jaga diri nuan", say: { sv: "tah hand om day" } },
  { cat: "love", en: "Have you eaten?", sv: "Har du ätit?", es: "¿Ya comiste?", iban: "Udah makai nuan?", say: { sv: "har doo EH-tit" }, note: { iban: "A very Malaysian way to say “I care about you”" } },
  { cat: "assurance", en: "Don't worry", sv: "Oroa dig inte", es: "No te preocupes", iban: "Anang irau", say: { sv: "OO-roh-ah day IN-teh" }, note: { iban: "Draft — Vee to check" } },
  { cat: "assurance", en: "Everything will be okay", sv: "Det kommer att ordna sig", es: "Todo va a estar bien", say: { sv: "deh KOM-mer at ORD-na say" } },
  { cat: "assurance", en: "I'm here for you", sv: "Jag finns här för dig", es: "Estoy aquí para ti", say: { sv: "yah FINS hair fur day" } },
  { cat: "assurance", en: "I'm proud of you", sv: "Jag är stolt över dig", es: "Estoy orgullosa de ti", say: { sv: "yah air STOLT UR-ver day" }, note: { es: "“orgulloso” when he says it" } },
  { cat: "assurance", en: "We'll get through this together", sv: "Vi klarar det här tillsammans", es: "Juntos vamos a salir adelante", say: { sv: "vee KLAH-rar deh hair till-SAM-ans" } },
  { cat: "assurance", en: "It won't be long until I see you", sv: "Snart ses vi igen", es: "Falta poco para vernos", say: { sv: "SNART sehs vee ee-YEN" } },
  { cat: "everyday", en: "Yes / No", sv: "Ja / Nej", es: "Sí / No", iban: "Au / Enda", say: { sv: "yah / nay" } },
  { cat: "everyday", en: "Where are you?", sv: "Var är du?", es: "¿Dónde estás?", iban: "Dini nuan?", say: { sv: "var air doo" } },
  { cat: "everyday", en: "What are you doing?", sv: "Vad gör du?", es: "¿Qué estás haciendo?", iban: "Nama dikereja nuan?", say: { sv: "vah yur doo" } },
  { cat: "everyday", en: "I'm happy", sv: "Jag är glad", es: "Estoy feliz", iban: "Aku gaga", say: { sv: "yah air GLAHD" } },
  { cat: "everyday", en: "I'm tired", sv: "Jag är trött", es: "Estoy cansada", iban: "Aku lelak", say: { sv: "yah air TRUHT" }, note: { es: "“cansado” for him" } },
  { cat: "everyday", en: "Very good!", sv: "Jättebra!", es: "¡Muy bien!", iban: "Manah amat!", say: { sv: "YET-te-brah" } },
  { cat: "everyday", en: "Delicious!", sv: "Gott!", es: "¡Qué rico!", iban: "Nyamai!", say: { sv: "got" } },
  { cat: "everyday", en: "Cheers!", sv: "Skål!", es: "¡Salud!", iban: "Oooohaa!", say: { sv: "skohl" } },
  { cat: "culture", en: "A coffee-and-cake break with someone", sv: "Fika", say: { sv: "FEE-ka" }, note: { sv: "Practically a Swedish institution" } },
  { cat: "culture", en: "Just the right amount — not too much, not too little", sv: "Lagom", say: { sv: "LAH-gom" } },
  { cat: "culture", en: "Cosy", sv: "Mysigt", say: { sv: "MEE-sigt" } },
  { cat: "culture", en: "You know? / Get it?", es: "¿Cachai?", note: { es: "Chilean slang" } },
  { cat: "culture", en: "Cool! / Great!", es: "¡Bacán!", note: { es: "Chilean slang" } },
  { cat: "culture", en: "Right away", es: "Al tiro", note: { es: "Chilean slang" } },
  { cat: "culture", en: "Happy Gawai (the Dayak harvest festival)", iban: "Selamat Ari Gawai" },
  { cat: "culture", en: "Long life, good health and prosperity — the Gawai blessing", iban: "Gayu guru, gerai nyamai" },
];

export interface Card {
  key: string;
  lang: Lang;
  phrase: string;
  meaning: string;
  pronunciation: string;
  note: string;
  cat: Category | "ours";
  taught_by?: string | null;
  id?: string;  // taught words only
}

export function starterCards(): Card[] {
  const out: Card[] = [];
  STARTERS.forEach((s, i) => {
    for (const lang of ["sv", "es", "iban"] as const) {
      const phrase = s[lang];
      if (!phrase) continue;
      out.push({ key: `s${i}${lang}`, lang, phrase, meaning: s.en, pronunciation: s.say?.[lang] ?? "", note: s.note?.[lang] ?? "", cat: s.cat });
    }
  });
  return out;
}

export interface TaughtWord { id: string; added_by: string; language: Lang; phrase: string; meaning: string; pronunciation: string; note: string; created_at: string }

/** Null when the database hasn't been updated yet (the starter phrasebook still works). */
export async function listTaught(): Promise<TaughtWord[] | null> {
  const res = await supabase.rpc("taught_words_list");
  if (res.error) return null;
  return (res.data ?? []) as TaughtWord[];
}
export async function teachWord(w: { id?: string; language: Lang; phrase: string; meaning: string; pronunciation?: string; note?: string }) {
  const res = await supabase.rpc("teach_word", { p_id: w.id ?? null, p_language: w.language, p_phrase: w.phrase, p_meaning: w.meaning, p_pronunciation: w.pronunciation ?? "", p_note: w.note ?? "" });
  if (res.error) throw res.error;
}
export async function deleteTaught(id: string) {
  const res = await supabase.rpc("delete_taught_word", { p_id: id });
  if (res.error) throw res.error;
}

export const taughtCards = (ws: TaughtWord[]): Card[] =>
  ws.map((w) => ({ key: `t${w.id}`, id: w.id, lang: w.language, phrase: w.phrase, meaning: w.meaning, pronunciation: w.pronunciation, note: w.note, cat: "ours", taught_by: w.added_by }));

export function shuffle<T>(a: T[], rnd = Math.random): T[] {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}

/** One quiz question: the phrase, and four meanings (one right) from the same language when possible. */
export function quizQuestion(card: Card, pool: Card[], rnd = Math.random): { card: Card; options: string[]; answer: number } {
  const others = [...new Set(shuffle(pool.filter((c) => c.meaning !== card.meaning && c.lang === card.lang), rnd).map((c) => c.meaning))];
  const extra = [...new Set(shuffle(pool.filter((c) => c.meaning !== card.meaning), rnd).map((c) => c.meaning))];
  const wrong = [...new Set([...others, ...extra])].slice(0, 3);
  const options = shuffle([card.meaning, ...wrong], rnd);
  return { card, options, answer: options.indexOf(card.meaning) };
}
