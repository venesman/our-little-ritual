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
  { cat: "hello", en: "Good morning", sv: "God morgon", es: "Buenos días", iban: "Selamat pagi", say: { es: "BWEH-nohs DEE-ahs", sv: "goo MOR-ron" } },
  { cat: "hello", en: "Good night, sleep well", sv: "God natt, sov gott", es: "Buenas noches, que duermas bien", iban: "Selamat malam, ngarap ka nuan tinduk nyamai", say: { es: "BWEH-nahs NOH-chehs, keh DWEHR-mahs byen", sv: "goo NAT, sohv GOT" } },
  { cat: "hello", en: "Good afternoon", sv: "God eftermiddag", es: "Buenas tardes", iban: "Selamat ngalih tengahari", say: { es: "BWEH-nahs TAR-dehs", sv: "goo EF-ter-mid-dahg" } },
  { cat: "hello", en: "Good evening", sv: "God kväll", es: "Buenas noches", iban: "Selamat lemai", say: { es: "BWEH-nahs NOH-chehs", sv: "goo KVELL" }, note: { es: "Spanish uses the same words for good evening and good night" } },
  { cat: "hello", en: "How are you?", sv: "Hur mår du?", es: "¿Cómo estás?", iban: "Nama berita nuan?", say: { es: "KOH-moh ehs-TAHS", sv: "hoor MOHR doo" } },
  { cat: "hello", en: "I'm fine", sv: "Jag mår bra", es: "Estoy bien", iban: "Aku gerai", say: { es: "ehs-TOY BYEN", sv: "yah mohr BRAH" } },
  { cat: "hello", en: "Thank you", sv: "Tack", es: "Gracias", iban: "Terima kasih", say: { es: "GRAH-syahs", sv: "tahk" } },
  { cat: "hello", en: "Goodbye", sv: "Hej då", es: "Chao", iban: "Selamat tinggal", say: { es: "chow", sv: "hey DOH" }, note: { es: "Very common in Chile" } },
  { cat: "hello", en: "See you soon", sv: "Vi ses snart", es: "Nos vemos pronto", iban: "Betemu baru ilak", say: { es: "nohs BEH-mohs PROHN-toh", sv: "vee sehs SNART" } },
  { cat: "love", en: "I love you", sv: "Jag älskar dig", es: "Te amo", iban: "Aku sayau ka nuan", say: { es: "teh AH-moh", sv: "yah EL-skar day" }, note: { es: "“Te quiero” is softer and used more often" } },
  { cat: "love", en: "I miss you", sv: "Jag saknar dig", es: "Te extraño", iban: "Aku rindu ka nuan", say: { es: "teh ehks-TRAH-nyoh", sv: "yah SAHK-nar day" } },
  { cat: "love", en: "My love / darling", sv: "Älskling", es: "Mi amor", iban: "Sulu ati aku", say: { es: "mee ah-MOR", sv: "ELSK-ling" } },
  { cat: "love", en: "You're beautiful", sv: "Du är vacker", es: "Eres hermosa", iban: "Nuan bajik", say: { es: "EH-rehs ehr-MOH-sah", sv: "doo air VAH-ker" }, note: { es: "“hermoso” when it's said to him" } },
  { cat: "love", en: "Take care of yourself", sv: "Ta hand om dig", es: "Cuídate", iban: "Jaga diri nuan", say: { es: "KWEE-dah-teh", sv: "tah hand om day" } },
  { cat: "love", en: "Have you eaten?", sv: "Har du ätit?", es: "¿Ya comiste?", iban: "Udah makai nuan?", say: { es: "yah koh-MEES-teh", sv: "har doo EH-tit" }, note: { iban: "A very Malaysian way to say “I care about you”" } },
  { cat: "assurance", en: "Don't worry", sv: "Oroa dig inte", es: "No te preocupes", iban: "Anang irau", say: { es: "noh teh preh-oh-KOO-pehs", sv: "OO-roh-ah day IN-teh" } },
  { cat: "assurance", en: "Everything will be okay", sv: "Det kommer att ordna sig", es: "Todo va a estar bien", say: { es: "TOH-doh bah ah ehs-TAR BYEN", sv: "deh KOM-mer at ORD-na say" } },
  { cat: "assurance", en: "I'm here for you", sv: "Jag finns här för dig", es: "Estoy aquí para ti", say: { es: "ehs-TOY ah-KEE PAH-rah tee", sv: "yah FINS hair fur day" } },
  { cat: "assurance", en: "I'm proud of you", sv: "Jag är stolt över dig", es: "Estoy orgullosa de ti", say: { es: "ehs-TOY or-goo-YOH-sah deh tee", sv: "yah air STOLT UR-ver day" }, note: { es: "“orgulloso” when he says it" } },
  { cat: "assurance", en: "We'll get through this together", sv: "Vi klarar det här tillsammans", es: "Juntos vamos a salir adelante", say: { es: "HOON-tohs BAH-mohs ah sah-LEER ah-deh-LAHN-teh", sv: "vee KLAH-rar deh hair till-SAM-ans" } },
  { cat: "assurance", en: "It won't be long until I see you", sv: "Snart ses vi igen", es: "Falta poco para vernos", say: { es: "FAHL-tah POH-koh PAH-rah BEHR-nohs", sv: "SNART sehs vee ee-YEN" } },
  { cat: "call", en: "Can you hear me?", sv: "Hör du mig?", es: "¿Me escuchas?", say: { es: "meh ehs-KOO-chahs", sv: "hur doo MAY" } },
  { cat: "call", en: "You're breaking up", sv: "Du hackar", es: "Te estás cortando", say: { es: "teh ehs-TAHS kor-TAHN-doh", sv: "doo HACK-ar" }, note: { sv: "Literally “you're chopping”" } },
  { cat: "call", en: "I'll call you back", sv: "Jag ringer tillbaka", es: "Te vuelvo a llamar", say: { es: "teh BWEHL-boh ah yah-MAR", sv: "yah RING-er till-BAH-ka" } },
  { cat: "call", en: "Call me when you wake up", sv: "Ring mig när du vaknar", es: "Llámame cuando despiertes", say: { es: "YAH-mah-meh KWAHN-doh dehs-PYEHR-tehs", sv: "ring may nair doo VAHK-nar" } },
  { cat: "call", en: "I have to go now", sv: "Jag måste gå nu", es: "Tengo que irme", say: { es: "TEHN-goh keh EER-meh", sv: "yah MOS-teh goh noo" } },
  { cat: "call", en: "Talk tomorrow?", sv: "Hörs imorgon?", es: "¿Hablamos mañana?", say: { es: "ah-BLAH-mohs mah-NYAH-nah", sv: "hurs ee-MOR-on" } },
  { cat: "call", en: "I'm falling asleep", sv: "Jag håller på att somna", es: "Me estoy quedando dormida", say: { es: "meh ehs-TOY keh-DAHN-doh dor-MEE-dah", sv: "yah HOL-er poh at SOM-na" }, note: { es: "“dormido” when he says it" } },
  { cat: "feelings", en: "I'm sad", sv: "Jag är ledsen", es: "Estoy triste", iban: "Aku tusah ati", say: { es: "ehs-TOY TREES-teh", sv: "yah air LESS-en" } },
  { cat: "feelings", en: "I'm so excited!", sv: "Jag är så taggad!", es: "¡Estoy tan emocionada!", say: { es: "ehs-TOY tahn eh-moh-syoh-NAH-dah", sv: "yah air soh TAG-ad" }, note: { sv: "Casual, very common", es: "“emocionado” for him" } },
  { cat: "feelings", en: "I'm nervous", sv: "Jag är nervös", es: "Estoy nerviosa", say: { es: "ehs-TOY nehr-BYOH-sah", sv: "yah air ner-VURS" }, note: { es: "“nervioso” for him" } },
  { cat: "feelings", en: "I'm stressed", sv: "Jag är stressad", es: "Estoy estresada", say: { es: "ehs-TOY ehs-treh-SAH-dah", sv: "yah air STRESS-ad" }, note: { es: "“estresado” for him" } },
  { cat: "feelings", en: "I feel better now", sv: "Jag mår bättre nu", es: "Ya me siento mejor", say: { es: "yah meh SYEHN-toh meh-HOR", sv: "yah mohr BET-reh noo" } },
  { cat: "feelings", en: "You make me happy", sv: "Du gör mig glad", es: "Me haces feliz", say: { es: "meh AH-sehs feh-LEES", sv: "doo yur may GLAHD" } },
  { cat: "feelings", en: "I long for you", sv: "Jag längtar efter dig", es: "Te echo de menos", say: { es: "teh EH-choh deh MEH-nohs", sv: "yah LENG-tar EF-ter day" }, note: { sv: "“Längta” — to long for someone. A lovely Swedish word" } },
  { cat: "food", en: "I'm hungry", sv: "Jag är hungrig", es: "Tengo hambre", iban: "Aku lapar", say: { es: "TEHN-goh AHM-breh", sv: "yah air HUNG-rig" } },
  { cat: "food", en: "What are you eating?", sv: "Vad äter du?", es: "¿Qué estás comiendo?", iban: "Nama diempa nuan?", say: { es: "keh ehs-TAHS koh-MYEHN-doh", sv: "vah EH-ter doo" } },
  { cat: "food", en: "I'm full", sv: "Jag är mätt", es: "Estoy llena", say: { es: "ehs-TOY YEH-nah", sv: "yah air MET" }, note: { es: "“lleno” for him" } },
  { cat: "food", en: "Breakfast / lunch / dinner", sv: "Frukost / lunch / middag", es: "Desayuno / almuerzo / cena", say: { es: "deh-sah-YOO-noh / al-MWEHR-soh / SEH-nah", sv: "FROO-kost / lunsh / MID-dahg" } },
  { cat: "food", en: "Let's cook together", sv: "Vi lagar mat tillsammans", es: "Cocinemos juntos", say: { es: "koh-see-NEH-mohs HOON-tohs", sv: "vee LAH-gar maht till-SAM-ans" } },
  { cat: "food", en: "Can I have a taste?", sv: "Får jag smaka?", es: "¿Me das un poquito?", say: { es: "meh dahs oon poh-KEE-toh", sv: "fohr yah SMAH-ka" } },
  { cat: "visit", en: "I can't wait to see you", sv: "Jag längtar så efter att se dig", es: "Tengo muchas ganas de verte", say: { es: "TEHN-goh MOO-chahs GAH-nahs deh BEHR-teh", sv: "yah LENG-tar soh EF-ter at SEH day" } },
  { cat: "visit", en: "How many days left?", sv: "Hur många dagar kvar?", es: "¿Cuántos días faltan?", say: { es: "KWAHN-tohs DEE-ahs FAHL-tahn", sv: "hoor MONG-a DAH-gar kvar" } },
  { cat: "visit", en: "I've landed!", sv: "Jag har landat!", es: "¡Aterricé!", say: { es: "ah-teh-rree-SEH", sv: "yah har LAN-dat" } },
  { cat: "visit", en: "Welcome!", sv: "Välkommen!", es: "¡Bienvenido!", iban: "Selamat datai!", say: { es: "byehn-beh-NEE-doh", sv: "VEL-kom-en" }, note: { es: "“Bienvenida” to her" } },
  { cat: "visit", en: "Where shall we meet?", sv: "Var ska vi ses?", es: "¿Dónde nos juntamos?", say: { es: "DOHN-deh nohs hoon-TAH-mohs", sv: "var skah vee SEHS" }, note: { es: "“Juntarse” — the Chilean way to say meet up" } },
  { cat: "visit", en: "I don't want you to leave", sv: "Jag vill inte att du åker", es: "No quiero que te vayas", say: { es: "noh KYEH-roh keh teh BAH-yahs", sv: "yah vill IN-teh at doo OH-ker" } },
  { cat: "everyday", en: "Yes / No", sv: "Ja / Nej", es: "Sí / No", iban: "Au / Enda", say: { es: "see / noh", sv: "yah / nay" } },
  { cat: "everyday", en: "Where are you?", sv: "Var är du?", es: "¿Dónde estás?", iban: "Dini nuan?", say: { es: "DOHN-deh ehs-TAHS", sv: "var air doo" } },
  { cat: "everyday", en: "What are you doing?", sv: "Vad gör du?", es: "¿Qué estás haciendo?", iban: "Nama dikereja nuan?", say: { es: "keh ehs-TAHS ah-SYEHN-doh", sv: "vah yur doo" } },
  { cat: "everyday", en: "I'm happy", sv: "Jag är glad", es: "Estoy feliz", iban: "Aku gaga", say: { es: "ehs-TOY feh-LEES", sv: "yah air GLAHD" } },
  { cat: "everyday", en: "I'm tired", sv: "Jag är trött", es: "Estoy cansada", iban: "Aku lelak", say: { es: "ehs-TOY kahn-SAH-dah", sv: "yah air TRUHT" }, note: { es: "“cansado” for him" } },
  { cat: "everyday", en: "Very good!", sv: "Jättebra!", es: "¡Muy bien!", iban: "Manah amat!", say: { es: "mooy BYEN", sv: "YET-te-brah" } },
  { cat: "everyday", en: "Delicious!", sv: "Gott!", es: "¡Qué rico!", iban: "Nyamai!", say: { es: "keh REE-koh", sv: "got" } },
  { cat: "everyday", en: "Cheers!", sv: "Skål!", es: "¡Salud!", iban: "Oooohaa!", say: { es: "sah-LOOD", sv: "skohl" } },
  { cat: "everyday", en: "I don't know", sv: "Jag vet inte", es: "No sé", iban: "Aku enda nemu", say: { es: "noh SEH", sv: "yah veht IN-teh" } },
  { cat: "everyday", en: "Where are you going?", sv: "Vart ska du?", es: "¿A dónde vas?", iban: "Ka kini nuan?", say: { es: "ah DOHN-deh BAHS", sv: "vart skah doo" } },
  { cat: "everyday", en: "Wait a moment", sv: "Vänta lite", es: "Espera un ratito", say: { es: "ehs-PEH-rah oon rah-TEE-toh", sv: "VEN-ta LEE-teh" } },
  { cat: "everyday", en: "Sorry", sv: "Förlåt", es: "Perdón", say: { es: "pehr-DOHN", sv: "fur-LOHT" } },
  { cat: "everyday", en: "Good luck!", sv: "Lycka till!", es: "¡Suerte!", say: { es: "SWEHR-teh", sv: "LUCK-a till" } },
  { cat: "everyday", en: "Happy birthday!", sv: "Grattis på födelsedagen!", es: "¡Feliz cumpleaños!", say: { es: "feh-LEES koom-pleh-AH-nyohs", sv: "GRAT-is poh FUR-del-seh-dahg-en" } },
  { cat: "culture", en: "A coffee-and-cake break with someone", sv: "Fika", say: { sv: "FEE-ka" }, note: { sv: "Practically a Swedish institution" } },
  { cat: "culture", en: "Just the right amount — not too much, not too little", sv: "Lagom", say: { sv: "LAH-gom" } },
  { cat: "culture", en: "Cosy", sv: "Mysigt", say: { sv: "MEE-sigt" } },
  { cat: "culture", en: "You know? / Get it?", es: "¿Cachai?", say: { es: "kah-CHAI (rhymes with “eye”)" }, note: { es: "Chilean slang" } },
  { cat: "culture", en: "Cool! / Great!", es: "¡Bacán!", say: { es: "bah-KAHN" }, note: { es: "Chilean slang" } },
  { cat: "culture", en: "Right away", es: "Al tiro", say: { es: "al TEE-roh" }, note: { es: "Chilean slang" } },
  { cat: "culture", en: "Cosy Friday night in — snacks, sofa, a film", sv: "Fredagsmys", say: { sv: "FREH-dahgs-mees" } },
  { cat: "culture", en: "A special little place that's just yours", sv: "Smultronställe", say: { sv: "SMUL-tron-stel-leh" }, note: { sv: "Literally “a wild-strawberry patch”" } },
  { cat: "culture", en: "Boyfriend / girlfriend", es: "Pololo / polola", say: { es: "poh-LOH-loh / poh-LOH-lah" }, note: { es: "Chilean — “pololear” means to be dating" } },
  { cat: "culture", en: "Chilean evening tea — bread, avocado, tea", es: "Once", say: { es: "OHN-seh" }, note: { es: "Like a Chilean fika, around 6–8 pm" } },
  { cat: "culture", en: "Avocado", es: "Palta", say: { es: "PAHL-tah" }, note: { es: "Chile's word; elsewhere it's “aguacate”" } },
  { cat: "culture", en: "Okay / yeah", es: "Ya", say: { es: "yah" }, note: { es: "Chileans say it all the time" } },
  { cat: "culture", en: "Happy Gawai (the Dayak harvest festival)", iban: "Selamat Ari Gawai" },
  { cat: "culture", en: "Long life, good health and prosperity — the Gawai blessing", iban: "Gayu guru, gerai nyamai" },
];

/** Little back-and-forth conversations to read aloud together on a call. */
export interface Dialogue { lang: Lang; title: string; lines: { text: string; say?: string; en: string }[]; note?: string }
export const DIALOGUES: Dialogue[] = [
  { lang: "sv", title: "Good morning call", lines: [
    { text: "God morgon, älskling! Hur sov du?", say: "goo MOR-ron, ELSK-ling! hoor SOHV doo", en: "Good morning, darling! How did you sleep?" },
    { text: "Bra, tack. Jag drömde om dig.", say: "brah, TAHK. yah DRUM-deh om day", en: "Well, thanks. I dreamt about you." },
    { text: "Åh, vad gulligt!", say: "oh, vah GUL-lit", en: "Aw, how sweet!" },
    { text: "Ska vi ringas ikväll?", say: "skah vee RING-as ee-KVELL", en: "Shall we call each other tonight?" },
  ] },
  { lang: "sv", title: "Fika", lines: [
    { text: "Ska vi fika?", say: "skah vee FEE-ka", en: "Shall we have a fika?" },
    { text: "Ja, gärna! En kaffe och en kanelbulle.", say: "yah, YAIR-na! en KAF-feh ok en ka-NEHL-bul-leh", en: "Yes, please! A coffee and a cinnamon bun." },
    { text: "Vad mysigt det här är.", say: "vah MEE-sit deh hair air", en: "This is so cosy." },
    { text: "Precis lagom.", say: "preh-SEES LAH-gom", en: "Just right." },
  ] },
  { lang: "sv", title: "Goodnight", lines: [
    { text: "Jag håller på att somna.", say: "yah HOL-er poh at SOM-na", en: "I'm falling asleep." },
    { text: "Sov gott, älskling. Hörs imorgon.", say: "sohv GOT, ELSK-ling. hurs ee-MOR-on", en: "Sleep well, darling. Talk tomorrow." },
    { text: "Jag älskar dig.", say: "yah EL-skar day", en: "I love you." },
    { text: "Jag älskar dig mer.", say: "yah EL-skar day MEHR", en: "I love you more." },
  ] },
  { lang: "es", title: "Counting down to the next visit", lines: [
    { text: "¿Cuántos días faltan?", say: "KWAHN-tohs DEE-ahs FAHL-tahn", en: "How many days left?" },
    { text: "¡Solo treinta!", say: "SOH-loh TRAYN-tah", en: "Only thirty!" },
    { text: "Tengo muchas ganas de verte.", say: "TEHN-goh MOO-chahs GAH-nahs deh BEHR-teh", en: "I really can't wait to see you." },
    { text: "Yo también, mi amor.", say: "yoh tahm-BYEN, mee ah-MOR", en: "Me too, my love." },
  ] },
  { lang: "es", title: "Once in Santiago", note: "“Ya” means okay; “palta” is avocado in Chile.", lines: [
    { text: "¿Tomamos once?", say: "toh-MAH-mohs OHN-seh", en: "Shall we have once (evening tea)?" },
    { text: "¡Ya, bacán!", say: "yah, bah-KAHN", en: "Okay, great!" },
    { text: "¿Quieres palta con el pan?", say: "KYEH-rehs PAHL-tah kohn ehl PAHN", en: "Do you want avocado on your bread?" },
    { text: "¡Obvio!", say: "OHB-byoh", en: "Obviously!" },
  ] },
  { lang: "es", title: "Goodnight", lines: [
    { text: "Me estoy quedando dormida.", say: "meh ehs-TOY keh-DAHN-doh dor-MEE-dah", en: "I'm falling asleep." },
    { text: "Duerme, mi amor. Hablamos mañana.", say: "DWEHR-meh, mee ah-MOR. ah-BLAH-mohs mah-NYAH-nah", en: "Sleep, my love. We'll talk tomorrow." },
    { text: "Te quiero mucho.", say: "teh KYEH-roh MOO-choh", en: "I love you lots." },
    { text: "Yo más.", say: "yoh MAHS", en: "I love you more." },
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
