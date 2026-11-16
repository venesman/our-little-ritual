import { supabase } from "./supabase";

/* =====================================================================
 * Language corner: a small starter phrasebook (Swedish · Spanish · Iban)
 * plus the words you teach each other. Games use both, run on the phone
 * and keep no scores.
 * ===================================================================== */

export type Lang = "sv" | "es" | "iban" | "ms" | "en" | "other";
export const LANG_LABEL: Record<Lang, string> = { sv: "Swedish", es: "Spanish", iban: "Iban", ms: "Malay", en: "English", other: "Other" };
export const LANG_NATIVE: Record<Lang, string> = { sv: "Svenska", es: "Español", iban: "Jaku Iban", ms: "Bahasa Melayu", en: "English", other: "" };

export type Category = "hello" | "love" | "assurance" | "call" | "feelings" | "food" | "visit" | "everyday" | "culture";
export const CATEGORY_LABEL: Record<Category, string> = {
  hello: "Hello & goodbye", love: "Love & care", assurance: "Reassurance", call: "On a call", feelings: "Feelings",
  food: "Food", visit: "Visiting each other", everyday: "Everyday", culture: "Little culture words",
};
export const CATEGORY_ORDER: Category[] = ["hello", "love", "assurance", "call", "feelings", "food", "visit", "everyday", "culture"];

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
  { cat: "assurance", en: "Don't worry", sv: "Oroa dig inte", es: "No te preocupes", iban: "Anang irau", say: { sv: "OO-roh-ah day IN-teh" } },
  { cat: "assurance", en: "Everything will be okay", sv: "Det kommer att ordna sig", es: "Todo va a estar bien", say: { sv: "deh KOM-mer at ORD-na say" } },
  { cat: "assurance", en: "I'm here for you", sv: "Jag finns här för dig", es: "Estoy aquí para ti", say: { sv: "yah FINS hair fur day" } },
  { cat: "assurance", en: "I'm proud of you", sv: "Jag är stolt över dig", es: "Estoy orgullosa de ti", say: { sv: "yah air STOLT UR-ver day" }, note: { es: "“orgulloso” when he says it" } },
  { cat: "assurance", en: "We'll get through this together", sv: "Vi klarar det här tillsammans", es: "Juntos vamos a salir adelante", say: { sv: "vee KLAH-rar deh hair till-SAM-ans" } },
  { cat: "assurance", en: "It won't be long until I see you", sv: "Snart ses vi igen", es: "Falta poco para vernos", say: { sv: "SNART sehs vee ee-YEN" } },
  { cat: "call", en: "Can you hear me?", sv: "Hör du mig?", es: "¿Me escuchas?", say: { sv: "hur doo MAY" } },
  { cat: "call", en: "You're breaking up", sv: "Du hackar", es: "Te estás cortando", say: { sv: "doo HACK-ar" }, note: { sv: "Literally “you're chopping”" } },
  { cat: "call", en: "I'll call you back", sv: "Jag ringer tillbaka", es: "Te vuelvo a llamar", say: { sv: "yah RING-er till-BAH-ka" } },
  { cat: "call", en: "Call me when you wake up", sv: "Ring mig när du vaknar", es: "Llámame cuando despiertes", say: { sv: "ring may nair doo VAHK-nar" } },
  { cat: "call", en: "I have to go now", sv: "Jag måste gå nu", es: "Tengo que irme", say: { sv: "yah MOS-teh goh noo" } },
  { cat: "call", en: "Talk tomorrow?", sv: "Hörs imorgon?", es: "¿Hablamos mañana?", say: { sv: "hurs ee-MOR-on" } },
  { cat: "call", en: "I'm falling asleep", sv: "Jag håller på att somna", es: "Me estoy quedando dormida", say: { sv: "yah HOL-er poh at SOM-na" }, note: { es: "“dormido” when he says it" } },
  { cat: "feelings", en: "I'm sad", sv: "Jag är ledsen", es: "Estoy triste", iban: "Aku tusah ati", say: { sv: "yah air LESS-en" } },
  { cat: "feelings", en: "I'm so excited!", sv: "Jag är så taggad!", es: "¡Estoy tan emocionada!", say: { sv: "yah air soh TAG-ad" }, note: { sv: "Casual, very common", es: "“emocionado” for him" } },
  { cat: "feelings", en: "I'm nervous", sv: "Jag är nervös", es: "Estoy nerviosa", say: { sv: "yah air ner-VURS" }, note: { es: "“nervioso” for him" } },
  { cat: "feelings", en: "I'm stressed", sv: "Jag är stressad", es: "Estoy estresada", say: { sv: "yah air STRESS-ad" }, note: { es: "“estresado” for him" } },
  { cat: "feelings", en: "I feel better now", sv: "Jag mår bättre nu", es: "Ya me siento mejor", say: { sv: "yah mohr BET-reh noo" } },
  { cat: "feelings", en: "You make me happy", sv: "Du gör mig glad", es: "Me haces feliz", say: { sv: "doo yur may GLAHD" } },
  { cat: "feelings", en: "I long for you", sv: "Jag längtar efter dig", es: "Te echo de menos", say: { sv: "yah LENG-tar EF-ter day" }, note: { sv: "“Längta” — to long for someone. A lovely Swedish word" } },
  { cat: "food", en: "I'm hungry", sv: "Jag är hungrig", es: "Tengo hambre", iban: "Aku lapar", say: { sv: "yah air HUNG-rig" } },
  { cat: "food", en: "What are you eating?", sv: "Vad äter du?", es: "¿Qué estás comiendo?", iban: "Nama diempa nuan?", say: { sv: "vah EH-ter doo" } },
  { cat: "food", en: "I'm full", sv: "Jag är mätt", es: "Estoy llena", say: { sv: "yah air MET" }, note: { es: "“lleno” for him" } },
  { cat: "food", en: "Breakfast / lunch / dinner", sv: "Frukost / lunch / middag", es: "Desayuno / almuerzo / cena", say: { sv: "FROO-kost / lunsh / MID-dahg" } },
  { cat: "food", en: "Let's cook together", sv: "Vi lagar mat tillsammans", es: "Cocinemos juntos", say: { sv: "vee LAH-gar maht till-SAM-ans" } },
  { cat: "food", en: "Can I have a taste?", sv: "Får jag smaka?", es: "¿Me das un poquito?", say: { sv: "fohr yah SMAH-ka" } },
  { cat: "visit", en: "I can't wait to see you", sv: "Jag längtar så efter att se dig", es: "Tengo muchas ganas de verte", say: { sv: "yah LENG-tar soh EF-ter at SEH day" } },
  { cat: "visit", en: "How many days left?", sv: "Hur många dagar kvar?", es: "¿Cuántos días faltan?", say: { sv: "hoor MONG-a DAH-gar kvar" } },
  { cat: "visit", en: "I've landed!", sv: "Jag har landat!", es: "¡Aterricé!", say: { sv: "yah har LAN-dat" } },
  { cat: "visit", en: "Welcome!", sv: "Välkommen!", es: "¡Bienvenido!", iban: "Selamat datai!", say: { sv: "VEL-kom-en" }, note: { es: "“Bienvenida” to her" } },
  { cat: "visit", en: "Where shall we meet?", sv: "Var ska vi ses?", es: "¿Dónde nos juntamos?", say: { sv: "var skah vee SEHS" }, note: { es: "“Juntarse” — the Chilean way to say meet up" } },
  { cat: "visit", en: "I don't want you to leave", sv: "Jag vill inte att du åker", es: "No quiero que te vayas", say: { sv: "yah vill IN-teh at doo OH-ker" } },
  { cat: "everyday", en: "Yes / No", sv: "Ja / Nej", es: "Sí / No", iban: "Au / Enda", say: { sv: "yah / nay" } },
  { cat: "everyday", en: "Where are you?", sv: "Var är du?", es: "¿Dónde estás?", iban: "Dini nuan?", say: { sv: "var air doo" } },
  { cat: "everyday", en: "What are you doing?", sv: "Vad gör du?", es: "¿Qué estás haciendo?", iban: "Nama dikereja nuan?", say: { sv: "vah yur doo" } },
  { cat: "everyday", en: "I'm happy", sv: "Jag är glad", es: "Estoy feliz", iban: "Aku gaga", say: { sv: "yah air GLAHD" } },
  { cat: "everyday", en: "I'm tired", sv: "Jag är trött", es: "Estoy cansada", iban: "Aku lelak", say: { sv: "yah air TRUHT" }, note: { es: "“cansado” for him" } },
  { cat: "everyday", en: "Very good!", sv: "Jättebra!", es: "¡Muy bien!", iban: "Manah amat!", say: { sv: "YET-te-brah" } },
  { cat: "everyday", en: "Delicious!", sv: "Gott!", es: "¡Qué rico!", iban: "Nyamai!", say: { sv: "got" } },
  { cat: "everyday", en: "Cheers!", sv: "Skål!", es: "¡Salud!", iban: "Oooohaa!", say: { sv: "skohl" } },
  { cat: "everyday", en: "I don't know", sv: "Jag vet inte", es: "No sé", iban: "Aku enda nemu", say: { sv: "yah veht IN-teh" } },
  { cat: "everyday", en: "Where are you going?", sv: "Vart ska du?", es: "¿A dónde vas?", iban: "Ka kini nuan?", say: { sv: "vart skah doo" } },
  { cat: "everyday", en: "Wait a moment", sv: "Vänta lite", es: "Espera un ratito", say: { sv: "VEN-ta LEE-teh" } },
  { cat: "everyday", en: "Sorry", sv: "Förlåt", es: "Perdón", say: { sv: "fur-LOHT" } },
  { cat: "everyday", en: "Good luck!", sv: "Lycka till!", es: "¡Suerte!", say: { sv: "LUCK-a till" } },
  { cat: "everyday", en: "Happy birthday!", sv: "Grattis på födelsedagen!", es: "¡Feliz cumpleaños!", say: { sv: "GRAT-is poh FUR-del-seh-dahg-en" } },
  { cat: "culture", en: "A coffee-and-cake break with someone", sv: "Fika", say: { sv: "FEE-ka" }, note: { sv: "Practically a Swedish institution" } },
  { cat: "culture", en: "Just the right amount — not too much, not too little", sv: "Lagom", say: { sv: "LAH-gom" } },
  { cat: "culture", en: "Cosy", sv: "Mysigt", say: { sv: "MEE-sigt" } },
  { cat: "culture", en: "You know? / Get it?", es: "¿Cachai?", note: { es: "Chilean slang" } },
  { cat: "culture", en: "Cool! / Great!", es: "¡Bacán!", note: { es: "Chilean slang" } },
  { cat: "culture", en: "Right away", es: "Al tiro", note: { es: "Chilean slang" } },
  { cat: "culture", en: "Cosy Friday night in — snacks, sofa, a film", sv: "Fredagsmys", say: { sv: "FREH-dahgs-mees" } },
  { cat: "culture", en: "A special little place that's just yours", sv: "Smultronställe", say: { sv: "SMUL-tron-stel-leh" }, note: { sv: "Literally “a wild-strawberry patch”" } },
  { cat: "culture", en: "Boyfriend / girlfriend", es: "Pololo / polola", note: { es: "Chilean — “pololear” means to be dating" } },
  { cat: "culture", en: "Chilean evening tea — bread, avocado, tea", es: "Once", note: { es: "Like a Chilean fika, around 6–8 pm" } },
  { cat: "culture", en: "Avocado", es: "Palta", note: { es: "Chile's word; elsewhere it's “aguacate”" } },
  { cat: "culture", en: "Okay / yeah", es: "Ya", note: { es: "Chileans say it all the time" } },
  { cat: "culture", en: "Happy Gawai (the Dayak harvest festival)", iban: "Selamat Ari Gawai" },
  { cat: "culture", en: "Long life, good health and prosperity — the Gawai blessing", iban: "Gayu guru, gerai nyamai" },
];

/** Little back-and-forth conversations to read aloud together on a call. */
export interface Dialogue { lang: Lang; title: string; lines: { text: string; en: string }[]; note?: string }
export const DIALOGUES: Dialogue[] = [
  { lang: "sv", title: "Good morning call", lines: [
    { text: "God morgon, älskling! Hur sov du?", en: "Good morning, darling! How did you sleep?" },
    { text: "Bra, tack. Jag drömde om dig.", en: "Well, thanks. I dreamt about you." },
    { text: "Åh, vad gulligt!", en: "Aw, how sweet!" },
    { text: "Ska vi ringas ikväll?", en: "Shall we call each other tonight?" },
  ] },
  { lang: "sv", title: "Fika", lines: [
    { text: "Ska vi fika?", en: "Shall we have a fika?" },
    { text: "Ja, gärna! En kaffe och en kanelbulle.", en: "Yes, please! A coffee and a cinnamon bun." },
    { text: "Vad mysigt det här är.", en: "This is so cosy." },
    { text: "Precis lagom.", en: "Just right." },
  ] },
  { lang: "sv", title: "Goodnight", lines: [
    { text: "Jag håller på att somna.", en: "I'm falling asleep." },
    { text: "Sov gott, älskling. Hörs imorgon.", en: "Sleep well, darling. Talk tomorrow." },
    { text: "Jag älskar dig.", en: "I love you." },
    { text: "Jag älskar dig mer.", en: "I love you more." },
  ] },
  { lang: "es", title: "Counting down to the next visit", lines: [
    { text: "¿Cuántos días faltan?", en: "How many days left?" },
    { text: "¡Solo treinta!", en: "Only thirty!" },
    { text: "Tengo muchas ganas de verte.", en: "I really can't wait to see you." },
    { text: "Yo también, mi amor.", en: "Me too, my love." },
  ] },
  { lang: "es", title: "Once in Santiago", note: "“Ya” means okay; “palta” is avocado in Chile.", lines: [
    { text: "¿Tomamos once?", en: "Shall we have once (evening tea)?" },
    { text: "¡Ya, bacán!", en: "Okay, great!" },
    { text: "¿Quieres palta con el pan?", en: "Do you want avocado on your bread?" },
    { text: "¡Obvio!", en: "Obviously!" },
  ] },
  { lang: "es", title: "Goodnight", lines: [
    { text: "Me estoy quedando dormida.", en: "I'm falling asleep." },
    { text: "Duerme, mi amor. Hablamos mañana.", en: "Sleep, my love. We'll talk tomorrow." },
    { text: "Te quiero mucho.", en: "I love you lots." },
    { text: "Yo más.", en: "I love you more." },
  ] },
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
