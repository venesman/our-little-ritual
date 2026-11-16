import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Pencil, RotateCcw, Shuffle, Trash2 } from "lucide-react";
import { usePeople } from "../hooks/usePeople";
import { friendlyError } from "../lib/errors";
import {
  CATEGORY_LABEL, LANG_LABEL, LANG_NATIVE, deleteTaught, listTaught, quizQuestion, shuffle, starterCards, taughtCards, teachWord,
  type Card, type Category, type Lang, type TaughtWord,
} from "../lib/language";
import { Button, Card as Box, ErrorNote, Field, inputCls } from "../components/ui";

type Tab = "book" | "cards" | "quiz" | "teach";
const chip = (on: boolean) => `shrink-0 rounded-full border-2 px-3 py-1 text-xs font-semibold ${on ? "border-leaf bg-mustard text-leaf" : "border-leaf/15 text-muted"}`;

/**
 * Language corner: Swedish, Spanish and Iban to learn together. A starter
 * phrasebook, words you teach each other, and three little games. Nothing
 * is scored or saved except the words you teach.
 */
export function Language() {
  const { myId, partner } = usePeople();
  const [tab, setTab] = useState<Tab>("book");
  const [lang, setLang] = useState<Lang | "all">("all");
  const [taught, setTaught] = useState<TaughtWord[] | null | undefined>(undefined);
  const load = useCallback(() => listTaught().then(setTaught), []);
  useEffect(() => { void load(); }, [load]);

  const all = useMemo(() => [...taughtCards(taught ?? []), ...starterCards()], [taught]);
  const langs = useMemo(() => [...new Set(all.map((c) => c.lang))], [all]);
  const deck = lang === "all" ? all : all.filter((c) => c.lang === lang);
  const nameOf = (id?: string | null) => (id === myId ? "you" : partner?.display_name ?? "your partner");

  return (
    <div className="fade-up space-y-5">
      <Link to="/play" className="inline-flex items-center gap-1.5 text-sm font-semibold text-leaf"><ArrowLeft size={15} aria-hidden="true" /> Play</Link>
      <header>
        <p className="font-hand text-2xl text-raspberry-deep">hej · hola · selamat</p>
        <h1 className="text-4xl">Language corner</h1>
        <p className="mt-2 text-sm text-muted">Teach each other your words — Iban, Swedish, and the Spanish you're both picking up.</p>
      </header>

      <div className="flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-white p-1 shadow-card" role="tablist" aria-label="Language corner sections">
        {([["book", "Phrasebook"], ["cards", "Flashcards"], ["quiz", "Quiz"], ["teach", "Teach"]] as [Tab, string][]).map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${tab === t ? "bg-mustard text-leaf" : "text-muted"}`}>{label}</button>
        ))}
      </div>

      {tab !== "teach" && (
        <div className="flex gap-1.5 overflow-x-auto" role="radiogroup" aria-label="Language">
          <button type="button" role="radio" aria-checked={lang === "all"} className={chip(lang === "all")} onClick={() => setLang("all")}>All</button>
          {langs.map((l) => <button key={l} type="button" role="radio" aria-checked={lang === l} className={chip(lang === l)} onClick={() => setLang(l)}>{LANG_LABEL[l]}</button>)}
        </div>
      )}

      {tab === "book" && <Phrasebook deck={deck} nameOf={nameOf} myId={myId} onEdit={() => setTab("teach")} onChange={load} />}
      {tab === "cards" && <Flashcards key={lang} deck={deck} />}
      {tab === "quiz" && <Quiz key={lang} deck={deck} pool={all} />}
      {tab === "teach" && (taught === null
        ? <Box><p className="text-sm">Teaching words needs a small database update (<code>0031_language_corner.sql</code>). The phrasebook and games work already.</p></Box>
        : <Teach taught={taught ?? []} myId={myId} onChange={load} />)}
    </div>
  );
}

function Phrasebook({ deck, nameOf, myId, onEdit, onChange }: { deck: Card[]; nameOf: (id?: string | null) => string; myId: string | null; onEdit: () => void; onChange: () => void }) {
  const groups: [Category | "ours", Card[]][] = (["ours", "hello", "love", "assurance", "everyday", "culture"] as const)
    .map((c) => [c, deck.filter((x) => x.cat === c)] as [Category | "ours", Card[]]).filter(([, l]) => l.length);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-5">
      <ErrorNote>{error}</ErrorNote>
      {groups.map(([c, list]) => (
        <section key={c} className="rounded-card bg-paper p-4 shadow-card">
          <h2 className="mb-2 font-sans text-xs font-bold uppercase tracking-[0.16em] text-muted">{c === "ours" ? "Words we taught each other" : CATEGORY_LABEL[c]}</h2>
          <ul className="divide-y divide-dashed divide-leaf/15">
            {list.map((w) => (
              <li key={w.key} className="flex items-start gap-3 py-2.5">
                <span className="mt-0.5 w-14 shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted">{LANG_LABEL[w.lang]}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg leading-tight">{w.phrase}</p>
                  <p className="text-sm text-muted">{w.meaning}</p>
                  {w.pronunciation && <p className="text-xs italic text-muted">say: {w.pronunciation}</p>}
                  {w.note && <p className="text-xs text-muted">{w.note}</p>}
                  {w.cat === "ours" && <p className="text-[11px] text-muted">taught by {nameOf(w.taught_by)}</p>}
                </div>
                {w.cat === "ours" && w.taught_by === myId && w.id && (
                  <div className="flex shrink-0 gap-1">
                    <button type="button" aria-label={`Edit ${w.phrase}`} onClick={() => { sessionStorage.setItem("olr-edit-word", w.id!); onEdit(); }} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-leaf-soft"><Pencil size={14} /></button>
                    <button type="button" aria-label={`Remove ${w.phrase}`} onClick={async () => { try { await deleteTaught(w.id!); onChange(); } catch (e) { setError(friendlyError(e)); } }} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-tomato-soft"><Trash2 size={14} /></button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-xs text-muted">Iban phrases checked by Vee. If anything could be said better, teach your version and it'll sit at the top.</p>
    </div>
  );
}

function Flashcards({ deck }: { deck: Card[] }) {
  const [order, setOrder] = useState(() => shuffle(deck));
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [meaningFirst, setMeaningFirst] = useState(false);
  if (!order.length) return <Box><p className="text-sm text-muted">No words here yet.</p></Box>;
  const c = order[i % order.length];
  const next = (again: boolean) => {
    if (again) setOrder([...order.slice(0, i + 1), ...order.slice(i + 1), c]);
    setI(i + 1); setFlipped(false);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Which side first">
        <button type="button" role="radio" aria-checked={!meaningFirst} className={chip(!meaningFirst)} onClick={() => { setMeaningFirst(false); setFlipped(false); }}>Word first</button>
        <button type="button" role="radio" aria-checked={meaningFirst} className={chip(meaningFirst)} onClick={() => { setMeaningFirst(true); setFlipped(false); }}>Meaning first · say it on a call</button>
      </div>
      <button type="button" onClick={() => setFlipped(!flipped)} aria-label={flipped ? "Show the front" : "Turn the card over"}
        className="flex min-h-[220px] w-full flex-col items-center justify-center gap-2 rounded-card bg-paper px-6 py-8 text-center shadow-card">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{LANG_LABEL[c.lang]}{LANG_NATIVE[c.lang] ? ` · ${LANG_NATIVE[c.lang]}` : ""}</span>
        {!flipped ? (
          <>
            <span className="font-display text-3xl leading-tight">{meaningFirst ? c.meaning : c.phrase}</span>
            <span className="text-xs text-muted">{meaningFirst ? `How do you say it in ${LANG_LABEL[c.lang]}? Tap to check` : "Tap to see what it means"}</span>
          </>
        ) : (
          <>
            <span className="font-display text-3xl leading-tight">{meaningFirst ? c.phrase : c.meaning}</span>
            {c.pronunciation && <span className="text-sm italic text-muted">say: {c.pronunciation}</span>}
            {c.note && <span className="text-xs text-muted">{c.note}</span>}
          </>
        )}
      </button>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => next(true)}><RotateCcw size={15} aria-hidden="true" /> Again later</Button>
        <Button onClick={() => next(false)}>Next</Button>
        <Button variant="ghost" onClick={() => { setOrder(shuffle(deck)); setI(0); setFlipped(false); }} aria-label="Shuffle"><Shuffle size={15} aria-hidden="true" /></Button>
      </div>
      <p className="text-xs text-muted">Card {(i % order.length) + 1} of {order.length}. Nothing is scored or saved.</p>
    </div>
  );
}

function Quiz({ deck, pool }: { deck: Card[]; pool: Card[] }) {
  const make = useCallback(() => shuffle(deck).slice(0, 5).map((c) => quizQuestion(c, pool)), [deck, pool]);
  const [qs, setQs] = useState(make);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState(0);
  if (deck.length < 2) return <Box><p className="text-sm text-muted">Add a few more words to play.</p></Box>;
  if (i >= qs.length) return (
    <Box className="space-y-3 text-center">
      <p className="font-hand text-2xl text-raspberry-deep">{right === qs.length ? "perfect!" : right >= qs.length / 2 ? "nicely done" : "practice makes progress"}</p>
      <p className="font-display text-4xl">{right} of {qs.length}</p>
      <Button onClick={() => { setQs(make()); setI(0); setPicked(null); setRight(0); }}>Play again</Button>
      <p className="text-xs text-muted">Just for fun — not saved anywhere.</p>
    </Box>
  );
  const q = qs[i];
  return (
    <div className="space-y-3">
      <div className="rounded-card bg-paper px-6 py-7 text-center shadow-card">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{LANG_LABEL[q.card.lang]} · {i + 1} of {qs.length}</p>
        <p className="mt-1 font-display text-3xl leading-tight">{q.card.phrase}</p>
        <p className="mt-1 text-xs text-muted">What does it mean?</p>
      </div>
      <div className="grid gap-2">
        {q.options.map((o, j) => {
          const state = picked === null ? "" : j === q.answer ? "border-leaf bg-leaf-soft" : j === picked ? "border-tomato bg-tomato-soft" : "opacity-60";
          return (
            <button key={j} type="button" disabled={picked !== null} onClick={() => { setPicked(j); if (j === q.answer) setRight(right + 1); }}
              className={`rounded-2xl border-2 border-leaf/15 bg-paper px-4 py-3 text-left text-sm font-semibold ${state}`}>{o}</button>
          );
        })}
      </div>
      {picked !== null && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted">{q.card.pronunciation ? `say: ${q.card.pronunciation}` : picked === q.answer ? "Yes!" : `It means “${q.card.meaning}”.`}</p>
          <Button onClick={() => { setI(i + 1); setPicked(null); }}>Next</Button>
        </div>
      )}
    </div>
  );
}

type Draft = { id?: string; language: Lang; phrase: string; meaning: string; pronunciation: string; note: string };
function Teach({ taught, myId, onChange }: { taught: TaughtWord[]; myId: string | null; onChange: () => void }) {
  const editId = sessionStorage.getItem("olr-edit-word");
  const editing = editId ? taught.find((w) => w.id === editId && w.added_by === myId) : undefined;
  const [d, setD] = useState<Draft>(editing ? { ...editing } : { language: "iban", phrase: "", meaning: "", pronunciation: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { sessionStorage.removeItem("olr-edit-word"); }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setSaved(false);
    if (!d.phrase.trim() || !d.meaning.trim()) return setError("Add the word and what it means.");
    setBusy(true);
    try { await teachWord(d); setD({ language: d.language, phrase: "", meaning: "", pronunciation: "", note: "" }); setSaved(true); onChange(); }
    catch (err) { setError(friendlyError(err)); }
    finally { setBusy(false); }
  };
  return (
    <Box>
      <form onSubmit={submit} className="space-y-4">
        <h2 className="text-xl">{d.id ? "Edit your word" : "Teach a word"}</h2>
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold text-leaf">Language</legend>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Language">
            {(["iban", "sv", "es", "ms", "en", "other"] as Lang[]).map((l) => (
              <button key={l} type="button" role="radio" aria-checked={d.language === l} className={chip(d.language === l)} onClick={() => setD({ ...d, language: l })}>{LANG_LABEL[l]}</button>
            ))}
          </div>
        </fieldset>
        <Field label="Word or phrase" htmlFor="tw-phrase"><input id="tw-phrase" className={inputCls} maxLength={120} value={d.phrase} placeholder="e.g. Aku rindu ka nuan" onChange={(e) => setD({ ...d, phrase: e.target.value })} /></Field>
        <Field label="What it means" htmlFor="tw-meaning"><input id="tw-meaning" className={inputCls} maxLength={200} value={d.meaning} placeholder="e.g. I miss you" onChange={(e) => setD({ ...d, meaning: e.target.value })} /></Field>
        <Field label="How to say it (optional)" htmlFor="tw-say"><input id="tw-say" className={inputCls} maxLength={120} value={d.pronunciation} placeholder="e.g. AH-ku RIN-doo kah NOO-an" onChange={(e) => setD({ ...d, pronunciation: e.target.value })} /></Field>
        <Field label="Note (optional)" htmlFor="tw-note"><input id="tw-note" className={inputCls} maxLength={200} value={d.note} placeholder="When to use it, a story behind it…" onChange={(e) => setD({ ...d, note: e.target.value })} /></Field>
        <ErrorNote>{error}</ErrorNote>
        {saved && <p className="text-sm text-leaf">Added to your phrasebook.</p>}
        <div className="flex gap-2">
          <Button type="submit" busy={busy}>{d.id ? "Save" : "Add to our phrasebook"}</Button>
          {d.id && <Button type="button" variant="ghost" onClick={() => setD({ language: d.language, phrase: "", meaning: "", pronunciation: "", note: "" })}>Cancel</Button>}
        </div>
      </form>
    </Box>
  );
}
