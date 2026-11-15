import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, CircleHelp, Flag, Plus, Sparkles, Trash2, Trophy, X } from "lucide-react";
import { usePeople } from "../hooks/usePeople";
import { useForYou } from "../hooks/useForYou";
import {
  addQuestion, answerQuestion, catLabel, deleteQuestion, endMatch, listMatches, matchState, myQuestions, openQuestion, pickCategory, QUIZ_CATEGORY,
  reportQuestion, scoreLine, startMatch, verdict, type AnswerResult, type OpenQuestion, type OwnQuestion, type QuizMatch, type QuizMatchSummary, type QuizRound,
} from "../lib/quiz";
import { friendlyError } from "../lib/errors";
import { Button, ErrorNote, Field, Spinner, Ticket, inputCls } from "../components/ui";
import { SaveToScrapbook } from "../components/ScrapbookBits";

const shortDate = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

function Credit() {
  return (
    <p className="text-[11px] leading-snug text-muted">
      Some questions come from <a href="https://opentdb.com" target="_blank" rel="noopener noreferrer" className="underline">Open Trivia DB</a>, used under{" "}
      <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer" className="underline">CC BY-SA 4.0</a>.
      Only you two can see your matches. No leaderboards, no streaks.
    </p>
  );
}

/* ===================================================== Play → Quiz Time */

export function QuizTab() {
  const nav = useNavigate();
  const { myId, me, partner } = usePeople();
  const pName = partner?.display_name || "your partner";
  const [matches, setMatches] = useState<QuizMatchSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { listMatches().then(setMatches).catch((e) => { setError(friendlyError(e)); setMatches([]); }); }, []);
  if (matches === null) return <Spinner label="Shuffling the questions" />;
  const active = matches.find((m) => m.status === "active");
  const past = matches.filter((m) => m.status === "finished");

  return (
    <div className="space-y-5">
      <section className="postcard space-y-3 !p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 -rotate-6 place-items-center rounded-sm border-2 border-dashed border-mustard bg-mustard-soft text-mustard-deep" aria-hidden="true"><Trophy size={20} /></span>
          <div>
            <h2 className="text-2xl leading-tight">Quiz Duel</h2>
            <p className="text-sm text-muted">6 rounds · 3 questions each · 20 seconds a question. Take turns picking the category.</p>
          </div>
        </div>
        <ErrorNote>{error}</ErrorNote>
        {active ? (
          <Button onClick={() => nav(`/play/quiz/${active.id}`)}>Continue your match</Button>
        ) : (
          <Button busy={busy} onClick={async () => {
            setBusy(true); setError(null);
            try { nav(`/play/quiz/${await startMatch()}`); } catch (e) { setError(friendlyError(e)); setBusy(false); }
          }}>Start a match with {pName}</Button>
        )}
        <Link to="/play/quiz/questions" className="inline-flex items-center gap-1.5 text-sm font-semibold text-leaf underline underline-offset-4">
          <Plus size={14} aria-hidden="true" /> Add your own questions
        </Link>
      </section>

      {past.length > 0 && (
        <section className="space-y-2" aria-label="Past matches">
          <p className="font-hand text-2xl text-raspberry-deep">past matches</p>
          <ul className="space-y-2">
            {past.map((m) => (
              <li key={m.id}>
                <Link to={`/play/quiz/${m.id}`} className="postcard flex items-center gap-3 !p-4 transition hover:-translate-y-px">
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg font-semibold">{scoreLine(m.scores, myId, me?.display_name || "You", partner?.display_name || "Partner")}</p>
                    <p className="truncate text-xs text-muted">{shortDate(m.finished_at ?? m.created_at)} · {m.categories.map(catLabel).join(" · ")}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Credit />
    </div>
  );
}

/* ======================================================== one match */

export function QuizMatchScreen() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { myId, me, partner } = usePeople();
  const { refresh } = useForYou();
  const pName = partner?.display_name || "your partner";
  const myName = me?.display_name || "You";
  const [m, setM] = useState<QuizMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [playing, setPlaying] = useState<QuizRound | null>(null);

  const load = useCallback(async () => {
    try { setM(await matchState(id)); setError(null); } catch (e) { setError(friendlyError(e)); }
  }, [id]);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => { if (document.visibilityState === "visible" && !playing) void load(); }, 20000);
    return () => clearInterval(t);
  }, [load, playing]);

  if (!m) return error ? <ErrorNote>{error}</ErrorNote> : <Spinner label="Opening the match" />;
  if (playing) return <PlayRound round={playing} partnerName={pName} onDone={async () => { setPlaying(null); await load(); refresh(); }} />;

  const current = m.rounds.find((r) => r.round_no === m.next_round);
  const over = m.status !== "active";

  return (
    <div className="fade-up space-y-5">
      <Link to="/play?mode=quiz" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted"><ArrowLeft size={16} aria-hidden="true" /> Quiz Time</Link>
      <header className="postcard !p-5 text-center">
        <p className="font-hand text-xl text-raspberry-deep">quiz duel</p>
        <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div><p className="truncate text-sm font-semibold text-muted">{myName}</p><p className="font-display text-4xl">{m.my_score}</p></div>
          <p className="font-display text-2xl text-muted">–</p>
          <div><p className="truncate text-sm font-semibold text-muted">{partner?.display_name || "Partner"}</p><p className="font-display text-4xl">{m.partner_score}</p></div>
        </div>
        {m.status === "finished" && <p className="mt-2 font-display text-lg font-semibold">{verdict(m.my_score, m.partner_score, pName)}</p>}
        {m.status === "active" && <p className="mt-2 text-xs text-muted">{pName}'s score only counts questions you've both answered — no peeking.</p>}
        {m.status === "ended" && <p className="mt-2 text-sm text-muted">This match was ended early.</p>}
      </header>
      <ErrorNote>{error}</ErrorNote>

      {/* what to do now */}
      {!over && m.next === "pick" && current && (
        <section className="postcard space-y-3 !p-5" aria-label="Pick a category">
          <p className="font-display text-lg font-semibold">Round {current.round_no}: your pick</p>
          <div className="grid gap-2">
            {current.offered.map((c) => (
              <button key={c} type="button" disabled={!!busy} onClick={async () => {
                setBusy(c); setError(null);
                try { await pickCategory(current.id, c); const s = await matchState(id); setM(s); setPlaying(s.rounds.find((r) => r.id === current.id) ?? null); }
                catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
              }} className="min-h-[52px] rounded-2xl border-2 border-leaf bg-paper px-4 text-left font-display text-lg font-semibold text-leaf shadow-print-sm transition hover:-translate-y-px">
                {catLabel(c)}
              </button>
            ))}
          </div>
        </section>
      )}
      {!over && m.next === "play" && current && (
        <section className="postcard space-y-3 !p-5">
          <p className="font-display text-lg font-semibold">Round {current.round_no} · {catLabel(current.category)}</p>
          <p className="text-sm text-muted">{current.picker_id === myId ? "You picked this one." : `${pName} picked this one.`} 3 questions, 20 seconds each.</p>
          <Button onClick={() => setPlaying(current)}>{current.my_done > 0 ? "Carry on" : "Play the round"}</Button>
        </section>
      )}
      {!over && m.next === "wait" && (
        <p className="rounded-[20px] border-2 border-dashed border-leaf/20 px-5 py-6 text-center font-hand text-xl text-muted">
          {current ? `waiting for ${pName} to pick round ${current.round_no}` : `all done — waiting for ${pName} to finish`}
        </p>
      )}
      {m.status === "finished" && <SaveToScrapbook kind="quiz" refId={m.id} prompt />}

      {/* the six rounds */}
      <ol className="space-y-2" aria-label="Rounds">
        {m.rounds.map((r) => <RoundRow key={r.id} r={r} myId={myId} pName={pName} showReview={r.my_done === 3 || over} />)}
      </ol>

      {!over && (
        <Button variant="ghost" busy={busy === "end"} onClick={async () => {
          if (!window.confirm("End this match early? It won't count.")) return;
          setBusy("end"); try { await endMatch(m.id); nav("/play?mode=quiz"); } catch (e) { setError(friendlyError(e)); setBusy(null); }
        }}><X size={14} aria-hidden="true" /> End match</Button>
      )}
      <Credit />
    </div>
  );
}

function Mark({ v, hiddenLabel }: { v: { correct: boolean } | "hidden" | null; hiddenLabel: string }) {
  if (v === null) return <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-dashed border-leaf/25" aria-label="Not played yet" />;
  if (v === "hidden") return <span className="grid h-6 w-6 place-items-center rounded-full bg-leaf-soft text-[10px] font-bold text-leaf" aria-label={hiddenLabel}>?</span>;
  return v.correct
    ? <span className="grid h-6 w-6 place-items-center rounded-full bg-leaf text-cream" aria-label="Right"><Check size={13} /></span>
    : <span className="grid h-6 w-6 place-items-center rounded-full bg-tomato-soft text-tomato-deep" aria-label="Wrong"><X size={13} /></span>;
}

function RoundRow({ r, myId, pName, showReview }: { r: QuizRound; myId: string | null | undefined; pName: string; showReview: boolean }) {
  const [open, setOpen] = useState(false);
  const [reported, setReported] = useState<string | null>(null);
  return (
    <li className="rounded-2xl bg-paper p-3 shadow-card">
      <button type="button" onClick={() => setOpen((v) => !v)} disabled={!showReview} className="flex w-full items-center gap-3 text-left">
        <span className="font-display text-sm font-semibold text-muted">R{r.round_no}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{catLabel(r.category)}</span>
          <span className="block text-[11px] text-muted">picked by {r.picker_id === myId ? "you" : pName}</span>
        </span>
        <span className="flex flex-col gap-1">
          <span className="flex items-center gap-1"><span className="w-8 text-right text-[10px] text-muted">you</span>{[0, 1, 2].map((i) => <Mark key={i} v={r.questions[i]?.mine ?? null} hiddenLabel="" />)}</span>
          <span className="flex items-center gap-1"><span className="w-8 truncate text-right text-[10px] text-muted">{pName.slice(0, 6)}</span>{[0, 1, 2].map((i) => <Mark key={i} v={r.questions[i]?.partner ?? null} hiddenLabel={`${pName} has answered — play it to see`} />)}</span>
        </span>
      </button>
      {open && showReview && (
        <div className="mt-3 space-y-3 border-t border-dashed border-leaf/20 pt-3">
          {r.questions.map((q) => q.review && (
            <div key={q.index} className="space-y-1">
              <p className="text-sm font-semibold">{q.review.question}</p>
              <p className="text-xs"><span className="font-semibold text-leaf">✓ {q.review.options[q.review.right]}</span>
                {q.mine && !q.mine.correct && <span className="text-muted"> · you: {q.mine.choice < 0 ? "time ran out" : q.review.options[q.mine.choice]}</span>}
                {q.partner && q.partner !== "hidden" && !q.partner.correct && <span className="text-muted"> · {pName}: {q.partner.choice < 0 ? "time ran out" : q.review.options[q.partner.choice]}</span>}
              </p>
              <ReportLink id={q.review.question_id} done={reported === q.review.question_id} onDone={() => setReported(q.review!.question_id)} />
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

function ReportLink({ id, done, onDone }: { id: string; done: boolean; onDone: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  if (done) return <p className="text-[11px] text-muted">Thanks — this question won't come up again.</p>;
  return (
    <>
      <button type="button" onClick={async () => {
        try { await reportQuestion(id, "This answer seems wrong"); onDone(); } catch (e) { setErr(friendlyError(e)); }
      }} className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted underline underline-offset-2"><Flag size={11} aria-hidden="true" />This answer seems wrong</button>
      {err && <p className="text-[11px] text-tomato-deep">{err}</p>}
    </>
  );
}

/* ======================================================= playing a round */

function PlayRound({ round, partnerName, onDone }: { round: QuizRound; partnerName: string; onDone: () => Promise<void> }) {
  const [idx, setIdx] = useState(round.my_done);
  const [q, setQ] = useState<OpenQuestion | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [left, setLeft] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);
  const sent = useRef(false);

  useEffect(() => {
    if (idx > 2) return;
    setQ(null); setResult(null); setReported(false); sent.current = false;
    openQuestion(round.id, idx).then((o) => { setQ(o); setLeft(o.seconds_left); }).catch((e) => setError(friendlyError(e)));
  }, [round.id, idx]);

  const answer = useCallback(async (choice: number) => {
    if (sent.current) return;
    sent.current = true;
    try { setResult(await answerQuestion(round.id, idx, choice)); } catch (e) { setError(friendlyError(e)); }
  }, [round.id, idx]);

  // the clock (the server keeps the real time; this is just what you see)
  useEffect(() => {
    if (!q || result) return;
    const started = Date.now(), from = q.seconds_left;
    const t = window.setInterval(() => {
      const l = Math.max(0, from - (Date.now() - started) / 1000);
      setLeft(l);
      if (l <= 0) { clearInterval(t); void answer(-1); }
    }, 100);
    return () => clearInterval(t);
  }, [q, result, answer]);

  if (idx > 2) {
    return (
      <div className="fade-up space-y-4 text-center">
        <p className="font-hand text-2xl text-raspberry-deep">round {round.round_no} done ✦</p>
        <Button onClick={() => void onDone()}>Back to the match</Button>
      </div>
    );
  }
  return (
    <div className="fade-up space-y-4">
      <div className="flex items-center justify-between">
        <Ticket tone="mustard">{catLabel(round.category)}</Ticket>
        <p className="text-sm font-semibold text-muted">Round {round.round_no} · {idx + 1} of 3</p>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {!q ? <Spinner label="Next question" /> : (
        <section className="postcard space-y-4 !p-5" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-leaf-soft" role="progressbar" aria-label="Time left" aria-valuemin={0} aria-valuemax={20} aria-valuenow={Math.ceil(left)}>
            <div className={`h-full rounded-full transition-[width] duration-100 ${left < 6 ? "bg-tomato" : "bg-mustard"}`} style={{ width: `${(left / 20) * 100}%` }} />
          </div>
          <p className="font-display text-xl font-semibold leading-snug">{q.question}</p>
          <div className="grid gap-2">
            {q.options.map((o, i) => {
              const isRight = result && i === result.right;
              const isMineWrong = result && i === result.choice && !result.correct;
              const partnerHere = result?.partner && result.partner.choice === i;
              return (
                <button key={i} type="button" disabled={!!result} onClick={() => void answer(i)}
                  className={`relative min-h-[52px] rounded-2xl border-2 px-4 py-2 text-left font-semibold transition ${
                    isRight ? "border-leaf bg-leaf text-cream" : isMineWrong ? "border-tomato bg-tomato-soft text-tomato-deep" : "border-leaf/30 bg-paper text-leaf hover:border-leaf"}`}>
                  {o}
                  {partnerHere && <span className="absolute -right-1 -top-2 rounded-full bg-raspberry px-2 py-0.5 text-[10px] font-bold text-leaf">{partnerName.slice(0, 10)}</span>}
                </button>
              );
            })}
          </div>
          {result && (
            <div className="space-y-2">
              <p className="font-display text-lg font-semibold">{result.timed_out ? "Time's up!" : result.correct ? "Right! ✦" : "Not quite"}</p>
              {result.partner
                ? <p className="text-sm text-muted">{partnerName} {result.partner.correct ? "got it right" : result.partner.choice < 0 ? "ran out of time" : "missed this one"}.</p>
                : <p className="text-sm text-muted">{partnerName} hasn't played this one yet.</p>}
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => setIdx((i) => i + 1)}>{idx < 2 ? "Next question" : "Finish round"}</Button>
                {reported ? <span className="text-[11px] text-muted">Thanks — it won't come up again.</span>
                  : <ReportLink id={q.question_id} done={false} onDone={() => setReported(true)} />}
              </div>
            </div>
          )}
          {q.source === "opentdb" && <p className="text-[10px] text-muted">Question from Open Trivia DB · CC BY-SA 4.0</p>}
          {q.source === "ours" && <p className="text-[10px] text-muted"><Sparkles size={10} className="inline" aria-hidden="true" /> One of your own questions</p>}
        </section>
      )}
    </div>
  );
}

/* ================================================== your own questions */

export function QuizQuestions() {
  const [list, setList] = useState<OwnQuestion[] | null>(null);
  const [category, setCategory] = useState("ours");
  const [question, setQuestion] = useState("");
  const [correct, setCorrect] = useState("");
  const [wrong, setWrong] = useState<[string, string, string]>(["", "", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = () => myQuestions().then(setList).catch((e) => { setError(friendlyError(e)); setList([]); });
  useEffect(() => { void load(); }, []);

  return (
    <div className="fade-up space-y-5">
      <Link to="/play?mode=quiz" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted"><ArrowLeft size={16} aria-hidden="true" /> Quiz Time</Link>
      <header>
        <p className="font-hand text-2xl text-raspberry-deep">for future matches</p>
        <h1 className="text-4xl">Your own questions</h1>
        <p className="mt-1 text-sm text-muted">Only you can see the answers to questions you write. They'll pop up in your partner's matches.</p>
      </header>
      <form className="postcard space-y-3 !p-5" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(null);
        try { await addQuestion({ category, question, correct, wrong }); setQuestion(""); setCorrect(""); setWrong(["", "", ""]); await load(); }
        catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
      }}>
        <Field label="Category" htmlFor="qq-cat">
          <select id="qq-cat" className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(QUIZ_CATEGORY).sort(([a], [b]) => (a === "ours" ? -1 : b === "ours" ? 1 : 0)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Question" htmlFor="qq-q">
          <textarea id="qq-q" rows={2} className={inputCls} maxLength={400} required value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. What did I order on our first café date?" />
        </Field>
        <Field label="Right answer" htmlFor="qq-c"><input id="qq-c" className={inputCls} maxLength={200} required value={correct} onChange={(e) => setCorrect(e.target.value)} /></Field>
        {[0, 1, 2].map((i) => (
          <Field key={i} label={`Wrong answer ${i + 1}`} htmlFor={`qq-w${i}`}>
            <input id={`qq-w${i}`} className={inputCls} maxLength={200} required value={wrong[i]}
              onChange={(e) => setWrong((w) => { const n = [...w] as [string, string, string]; n[i] = e.target.value; return n; })} />
          </Field>
        ))}
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" busy={busy}><Plus size={16} aria-hidden="true" /> Add question</Button>
      </form>

      {list === null ? <Spinner label="Loading" /> : list.length === 0 ? (
        <p className="rounded-[20px] border-2 border-dashed border-leaf/20 px-5 py-6 text-center font-hand text-xl text-muted">no questions of your own yet</p>
      ) : (
        <ul className="space-y-2">
          {list.map((q) => (
            <li key={q.id} className="flex items-start gap-3 rounded-2xl bg-paper p-3 shadow-card">
              <CircleHelp size={16} className="mt-0.5 shrink-0 text-raspberry-deep" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{catLabel(q.category)}</p>
                <p className="font-semibold">{q.question}</p>
                <p className="text-xs text-muted">✓ {q.correct} · {q.wrong.join(" · ")}</p>
              </div>
              <button type="button" aria-label="Delete question" onClick={async () => {
                if (!window.confirm("Delete this question?")) return;
                try { await deleteQuestion(q.id); await load(); } catch (e) { setError(friendlyError(e)); }
              }} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-leaf-soft"><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
