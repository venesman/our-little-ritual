import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, RotateCcw, Sparkles } from "lucide-react";
import { usePeople } from "../hooks/usePeople";
import { PERSONALITY, personalityState, quizByCode, submitPersonality, type PersonalityEntry, type PQuiz } from "../lib/personality";
import { friendlyError } from "../lib/errors";
import { Button, ErrorNote, Spinner, Ticket } from "../components/ui";
import { SaveToScrapbook } from "../components/ScrapbookBits";

const LETTER = ["A", "B", "C", "D"];

/** Quiz Time → the 12 personality quizzes, with where each of you is. */
export function PersonalityList() {
  const { partner } = usePeople();
  const pName = partner?.display_name || "your partner";
  const [state, setState] = useState<PersonalityEntry[] | null>(null);
  useEffect(() => { personalityState().then(setState).catch(() => setState([])); }, []);
  const byCode = new Map((state ?? []).map((e) => [e.quiz, e]));
  return (
    <section className="space-y-3" aria-label="Personality quizzes">
      <div>
        <h2 className="text-2xl leading-tight">Personality quizzes</h2>
        <p className="text-sm text-muted">Six quick questions, then compare your cards. Just for fun — not psychology tests.</p>
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {PERSONALITY.map((q) => {
          const e = byCode.get(q.code);
          const status = e?.mine && e.partner ? "Compare ✦" : e?.mine ? `Waiting for ${pName}` : e?.partner_taken ? `${pName} took it — your turn` : "New";
          return (
            <li key={q.code}>
              <Link to={`/play/personality/${q.code}`} className="flex h-full flex-col justify-between rounded-2xl bg-paper p-3 shadow-card transition hover:-translate-y-px">
                <p className="font-display text-sm leading-snug">{q.title}</p>
                <p className={`mt-2 text-[11px] font-semibold ${e?.partner_taken && !e?.mine ? "text-raspberry-deep" : "text-muted"}`}>{state === null ? "…" : status}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ResultCard({ quiz, result, who, tone }: { quiz: PQuiz; result: number; who: string; tone: "mustard" | "raspberry" }) {
  const r = quiz.results[result];
  return (
    <div className={`rounded-card border-2 p-4 shadow-card ${tone === "mustard" ? "border-mustard bg-mustard-soft/50" : "border-raspberry bg-raspberry-soft/50"}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{who}</p>
      <p className="font-display text-2xl leading-tight">{r.name}</p>
      <p className="mt-1 text-sm">{r.text}</p>
      <p className="mt-2 font-hand text-lg leading-snug text-raspberry-deep">For you two: {r.us}</p>
    </div>
  );
}

export function PersonalityQuiz() {
  const { code = "" } = useParams();
  const quiz = quizByCode(code);
  const { me, partner } = usePeople();
  const myName = me?.display_name || "You";
  const pName = partner?.display_name || "your partner";
  const [entry, setEntry] = useState<PersonalityEntry | null | undefined>(undefined);
  const [step, setStep] = useState<"intro" | "guess" | "questions">("intro");
  const [guess, setGuess] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => personalityState().then((s) => setEntry(s.find((e) => e.quiz === code) ?? null)).catch((e) => { setError(friendlyError(e)); setEntry(null); });
  useEffect(() => { void load(); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!quiz) return <ErrorNote>We couldn't find that quiz.</ErrorNote>;
  if (entry === undefined) return <Spinner label="Opening the quiz" />;

  const back = <Link to="/play?mode=quiz" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted"><ArrowLeft size={16} aria-hidden="true" /> Quiz Time</Link>;
  const start = () => { setAnswers([]); setGuess(null); setStep(entry?.partner_taken && !entry?.mine ? "guess" : "questions"); };

  // results
  if (entry?.mine && step === "intro") {
    const g = entry.mine.guess, pg = entry.partner?.guess;
    return (
      <div className="fade-up space-y-4">
        {back}
        <header><Ticket tone="mustard">Personality quiz</Ticket><h1 className="mt-2 text-3xl leading-tight">{quiz.title}</h1></header>
        <ResultCard quiz={quiz} result={entry.mine.result} who={myName} tone="mustard" />
        {entry.partner ? (
          <>
            <ResultCard quiz={quiz} result={entry.partner.result} who={pName} tone="raspberry" />
            {(g != null || pg != null) && (
              <div className="rounded-2xl bg-paper p-4 text-sm shadow-card">
                {g != null && <p>You guessed {pName} would be <b>{quiz.results[g].name}</b> — {g === entry.partner.result ? "spot on! ✦" : "not quite."}</p>}
                {pg != null && <p>{pName} guessed you'd be <b>{quiz.results[pg].name}</b> — {pg === entry.mine.result ? "they know you! ✦" : "a surprise!"}</p>}
              </div>
            )}
            {entry.my_row && <SaveToScrapbook kind="personality" refId={entry.my_row} prompt />}
          </>
        ) : (
          <p className="rounded-card border-2 border-dashed border-leaf/20 px-5 py-6 text-center font-hand text-xl text-muted">{pName}'s card appears once they've taken it too</p>
        )}
        <Button variant="ghost" onClick={start}><RotateCcw size={14} aria-hidden="true" /> Retake</Button>
      </div>
    );
  }

  if (step === "intro") {
    return (
      <div className="fade-up space-y-4">
        {back}
        <header><Ticket tone="mustard">Personality quiz</Ticket><h1 className="mt-2 text-3xl leading-tight">{quiz.title}</h1></header>
        <p className="text-sm text-muted">Six quick questions. Go with your first instinct — there are no wrong answers.</p>
        {entry?.partner_taken && <p className="text-sm font-semibold text-raspberry-deep">{pName} has already taken this one — you'll see their card when you finish.</p>}
        <Button onClick={start}>Start</Button>
      </div>
    );
  }

  if (step === "guess") {
    return (
      <div className="fade-up space-y-4">
        {back}
        <h1 className="text-2xl leading-tight">First, a guess: which one is {pName}?</h1>
        <div className="grid gap-2">
          {quiz.results.map((r, i) => (
            <button key={i} type="button" onClick={() => { setGuess(i); setStep("questions"); }}
              className="min-h-[52px] rounded-2xl border-2 border-leaf/30 bg-paper px-4 text-left font-semibold text-leaf hover:border-leaf">{r.name}</button>
          ))}
        </div>
        <button type="button" onClick={() => setStep("questions")} className="text-sm font-semibold text-muted underline underline-offset-4">Skip the guess</button>
      </div>
    );
  }

  // questions
  const i = answers.length;
  if (i >= quiz.questions.length) return <Spinner label="Working out your card" />;
  const q = quiz.questions[i];
  return (
    <div className="fade-up space-y-4">
      {back}
      <div className="flex items-center justify-between"><Ticket tone="mustard">{quiz.title}</Ticket><p className="text-sm font-semibold text-muted">{i + 1} of 6</p></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-leaf-soft"><div className="h-full rounded-full bg-mustard" style={{ width: `${(i / 6) * 100}%` }} /></div>
      <section className="postcard space-y-4 !p-5">
        <p className="font-display text-xl leading-snug">{q.q}</p>
        <div className="grid gap-2">
          {q.a.map((a, k) => (
            <button key={k} type="button" disabled={busy} onClick={async () => {
              const next = [...answers, k];
              setAnswers(next);
              if (next.length === 6) {
                setBusy(true); setError(null);
                try { await submitPersonality(quiz.code, next, guess); await load(); setStep("intro"); }
                catch (e) { setError(friendlyError(e)); setAnswers(answers); }
                finally { setBusy(false); }
              }
            }} className="min-h-[52px] rounded-2xl border-2 border-leaf/30 bg-paper px-4 py-2 text-left font-semibold text-leaf hover:border-leaf">
              <span className="sr-only">{LETTER[k]}. </span>{a}
            </button>
          ))}
        </div>
        {i > 0 && <button type="button" onClick={() => setAnswers(answers.slice(0, -1))} className="text-xs font-semibold text-muted underline">Back</button>}
      </section>
      <ErrorNote>{error}</ErrorNote>
      <p className="inline-flex items-center gap-1 text-[11px] text-muted"><Sparkles size={11} aria-hidden="true" /> Just for fun — not a psychology test.</p>
    </div>
  );
}
