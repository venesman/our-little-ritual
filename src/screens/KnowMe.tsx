import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Heart, X } from "lucide-react";
import { usePeople } from "../hooks/usePeople";
import { useForYou } from "../hooks/useForYou";
import { knowMeAnswer, knowMeEnd, knowMeGuess, knowMeHistory, knowMeMark, knowMeStart, knowMeState, MARKS, type KnowMeGame, type KnowMeHistory, type KnowMeRound } from "../lib/knowme";
import { friendlyError } from "../lib/errors";
import { Button, ErrorNote, Spinner, inputCls } from "../components/ui";
import { SaveToScrapbook } from "../components/ScrapbookBits";

/** Quiz Time card: start or continue. */
export function KnowMeCard() {
  const nav = useNavigate();
  const { myId, partner } = usePeople();
  const pName = partner?.display_name || "your partner";
  const [game, setGame] = useState<KnowMeGame | null | undefined>(undefined);
  const [hist, setHist] = useState<KnowMeHistory[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    knowMeState().then(setGame).catch(() => setGame(null));
    knowMeHistory().then(setHist).catch(() => {});
  }, []);
  const last = hist[0];
  return (
    <section className="postcard space-y-3 !p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 rotate-6 place-items-center rounded-sm border-2 border-dashed border-raspberry bg-raspberry-soft text-raspberry-deep" aria-hidden="true"><Heart size={20} /></span>
        <div>
          <h2 className="text-2xl leading-tight">How well do you know me?</h2>
          <p className="text-sm text-muted">Five questions about each of you. Answer about yourself, guess about {pName}, then mark the guesses.</p>
        </div>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {game === undefined ? null : game ? (
        <Button onClick={() => nav("/play/knowme")}>Continue your game</Button>
      ) : (
        <Button variant="outline" busy={busy} onClick={async () => {
          setBusy(true); setError(null);
          try { await knowMeStart(); nav("/play/knowme"); } catch (e) { setError(friendlyError(e)); setBusy(false); }
        }}>Start a game</Button>
      )}
      {last && myId && (
        <p className="text-xs text-muted">Last time: you knew {pName} {last.scores[Object.keys(last.scores).find((k) => k !== myId) ?? ""] ?? 0}/10 · they knew you {last.scores[myId] ?? 0}/10</p>
      )}
    </section>
  );
}

export function KnowMeScreen() {
  const nav = useNavigate();
  const { myId, partner } = usePeople();
  const { refresh } = useForYou();
  const pName = partner?.display_name || "your partner";
  const [game, setGame] = useState<KnowMeGame | null | undefined>(undefined);
  const [lastId, setLastId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const g = await knowMeState(lastId ?? undefined);
      setGame(g); if (g) setLastId(g.id);
      refresh();
    } catch (e) { setError(friendlyError(e)); setGame(null); }
  }, [lastId, refresh]);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    return () => clearInterval(t);
  }, [load]);

  const back = <Link to="/play?mode=quiz" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted"><ArrowLeft size={16} aria-hidden="true" /> Quiz Time</Link>;
  if (game === undefined) return <Spinner label="Opening the game" />;
  if (!game) return <div className="space-y-3">{back}<p className="font-hand text-xl text-muted">no game going — start one from Quiz Time</p></div>;

  const mine = game.rounds.find((r) => r.subject_id === myId);
  const theirs = game.rounds.find((r) => r.subject_id !== myId);

  return (
    <div className="fade-up space-y-5">
      {back}
      <header>
        <p className="font-hand text-2xl text-raspberry-deep">how well do you know me?</p>
        {game.status === "finished" && mine && theirs && (
          <p className="font-display text-xl font-semibold">You knew {pName} {theirs.score}/10 · {pName} knew you {mine.score}/10 ✦</p>
        )}
      </header>
      <ErrorNote>{error}</ErrorNote>
      {mine && <AboutMe r={mine} pName={pName} onDone={load} />}
      {theirs && <AboutThem r={theirs} pName={pName} onDone={load} />}
      {game.status === "finished" && <SaveToScrapbook kind="knowme" refId={game.id} prompt />}
      {game.status === "active" && (
        <Button variant="ghost" onClick={async () => {
          if (!window.confirm("End this game? It won't be saved.")) return;
          try { await knowMeEnd(game.id); nav("/play?mode=quiz"); } catch (e) { setError(friendlyError(e)); }
        }}><X size={14} aria-hidden="true" /> End game</Button>
      )}
    </div>
  );
}

function FiveFields({ questions, label, onSubmit }: { questions: string[]; label: string; onSubmit: (v: string[]) => Promise<void> }) {
  const [vals, setVals] = useState<string[]>(["", "", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null);
      try { await onSubmit(vals); } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
    }}>
      {questions.map((q, i) => (
        <label key={i} className="block space-y-1">
          <span className="text-sm font-semibold">{i + 1}. {q}</span>
          <input className={inputCls} maxLength={200} required value={vals[i]} onChange={(e) => setVals((v) => { const n = [...v]; n[i] = e.target.value; return n; })} />
        </label>
      ))}
      <ErrorNote>{error}</ErrorNote>
      <Button type="submit" busy={busy}>{label}</Button>
    </form>
  );
}

/** Round about me: answer → (partner guesses) → mark their guesses. */
function AboutMe({ r, pName, onDone }: { r: KnowMeRound; pName: string; onDone: () => Promise<void> }) {
  const [marks, setMarks] = useState<number[]>([-1, -1, -1, -1, -1]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="postcard space-y-3 !p-5" aria-label="About you">
      <p className="font-display text-lg font-semibold">About you</p>
      {!r.answered ? (
        <>
          <p className="text-sm text-muted">Answer honestly — {pName} won't see these until they've guessed.</p>
          <FiveFields questions={r.questions} label="Save my answers" onSubmit={async (v) => { await knowMeAnswer(r.id, v); await onDone(); }} />
        </>
      ) : !r.guessed ? (
        <p className="text-sm text-muted">Answers saved. Waiting for {pName} to guess…</p>
      ) : (
        <div className="space-y-3">
          {r.questions.map((q, i) => (
            <div key={i} className="rounded-2xl bg-cream p-3">
              <p className="text-xs font-semibold text-muted">{q}</p>
              <p className="text-sm">You: <b>{r.answers?.[i]}</b></p>
              <p className="text-sm">{pName} guessed: <b>{r.guesses?.[i]}</b></p>
              {r.marked ? <p className="mt-1 text-xs font-semibold text-leaf">{MARKS[r.marks?.[i] ?? 0]}</p> : (
                <div className="mt-2 flex gap-1.5" role="group" aria-label="How close was the guess?">
                  {[2, 1, 0].map((m) => (
                    <button key={m} type="button" aria-pressed={marks[i] === m} onClick={() => setMarks((x) => { const n = [...x]; n[i] = m; return n; })}
                      className={`min-h-[34px] rounded-full border-2 px-3 text-xs font-semibold ${marks[i] === m ? "border-leaf bg-leaf text-cream" : "border-leaf/30 bg-paper text-leaf"}`}>{MARKS[m]}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {r.marked ? <p className="font-semibold">{pName} scored {r.score}/10 on you.</p> : (
            <>
              <ErrorNote>{error}</ErrorNote>
              <Button busy={busy} disabled={marks.some((m) => m < 0)} onClick={async () => {
                setBusy(true); setError(null);
                try { await knowMeMark(r.id, marks); await onDone(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
              }}>Done marking</Button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** Round about my partner: guess → see their answers (after they've answered) → see their marks. */
function AboutThem({ r, pName, onDone }: { r: KnowMeRound; pName: string; onDone: () => Promise<void> }) {
  return (
    <section className="postcard space-y-3 !p-5" aria-label={`About ${pName}`}>
      <p className="font-display text-lg font-semibold">About {pName}</p>
      {!r.guessed ? (
        <>
          <p className="text-sm text-muted">What would {pName} say? Go with your gut.</p>
          <FiveFields questions={r.questions} label="Save my guesses" onSubmit={async (v) => { await knowMeGuess(r.id, v); await onDone(); }} />
        </>
      ) : !r.answered ? (
        <p className="text-sm text-muted">Guesses saved. You'll see {pName}'s answers once they've filled theirs in.</p>
      ) : (
        <div className="space-y-2">
          {r.questions.map((q, i) => (
            <div key={i} className="rounded-2xl bg-cream p-3">
              <p className="text-xs font-semibold text-muted">{q}</p>
              <p className="text-sm">{pName}: <b>{r.answers?.[i]}</b></p>
              <p className="text-sm">You guessed: <b>{r.guesses?.[i]}</b></p>
              {r.marked && <p className="mt-1 text-xs font-semibold text-leaf">{MARKS[r.marks?.[i] ?? 0]}</p>}
            </div>
          ))}
          <p className="font-semibold">{r.marked ? `You scored ${r.score}/10 on ${pName}.` : `Waiting for ${pName} to mark your guesses…`}</p>
        </div>
      )}
    </section>
  );
}
