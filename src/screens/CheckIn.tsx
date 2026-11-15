import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Lock, MailCheck, MessageCircleHeart, Phone, Send } from "lucide-react";
import { usePeople } from "../hooks/usePeople";
import { supabase } from "../lib/supabase";
import { useSpace } from "../hooks/useSpace";
import {
  CORE_QUESTIONS, getCheckinWeek, listCheckinWeeks, markCheckinTalked, MOOD_WORDS, saveCheckin,
  type CheckinDraft, type CheckinRow, type CheckinWeek, type CheckinWeekStatus,
} from "../lib/checkin";
import { friendlyError } from "../lib/errors";
import { Button, Card, ErrorNote, Field, Spinner, inputCls } from "../components/ui";

const weekLabel = (iso: string, tz: string) =>
  `Week of ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: tz }).format(new Date(iso))}`;

const emptyDraft = (r: CheckinRow | null): CheckinDraft => ({
  feeling: r?.feeling ?? "", happy: r?.happy ?? "", need: r?.need ?? "", bonus: r?.bonus ?? "",
  mood_words: r?.mood_words ?? [], talk_on_call: r?.talk_on_call ?? false,
});

/**
 * Weekly check-in: optional and gentle. Answers stay private until both of you
 * have shared (enforced by the database). No scores, streaks or charts.
 */
export function CheckIn() {
  const [params, setParams] = useSearchParams();
  const week = params.get("week");
  const { profile, space } = useSpace();
  const { partner } = usePeople();
  const tz = profile?.timezone ?? "UTC";
  const pName = partner?.display_name || "your partner";
  const [data, setData] = useState<CheckinWeek | null>(null);
  const [draft, setDraft] = useState<CheckinDraft>(emptyDraft(null));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "share" | "talked" | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const loadedFor = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await getCheckinWeek(week);
      setData(d);
      // Only seed the form once per week, so polling never overwrites what you're typing.
      if (loadedFor.current !== d.week_start) { setDraft(emptyDraft(d.mine)); loadedFor.current = d.week_start; }
      setError(null);
    } catch (e) { setError(friendlyError(e)); }
  }, [week]);

  useEffect(() => {
    loadedFor.current = null;
    void load();
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    return () => clearInterval(t);
  }, [load]);

  if (space?.relationship.status !== "active") {
    return <div className="space-y-3"><h1 className="text-4xl">Weekly check-in</h1><p className="font-hand text-xl text-muted">opens once your partner has joined</p></div>;
  }
  if (!data) return error ? <ErrorNote>{error}</ErrorNote> : <Spinner label="Opening this week's check-in" />;

  const shared = data.mine?.status === "submitted";
  const save = async (submit: boolean) => {
    setBusy(submit ? "share" : "save"); setError(null);
    try { const d = await saveCheckin(data.week_start, draft, submit); setData(d); setSavedAt(Date.now()); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };
  const toggleWord = (w: string) => {
    const has = draft.mood_words.includes(w);
    if (!has && draft.mood_words.length >= 3) return;
    setDraft({ ...draft, mood_words: has ? draft.mood_words.filter((x) => x !== w) : [...draft.mood_words, w] });
    setSavedAt(null);
  };

  return (
    <div className="fade-up space-y-6">
      <header>
        <p className="font-hand text-2xl text-raspberry-deep">just checking in, gently</p>
        <h1 className="text-4xl">Weekly check-in</h1>
        <p className="mt-1 text-sm text-muted">{weekLabel(data.week_start, tz)} · every question is optional{data.is_current ? "" : " · a past week"}</p>
      </header>
      <ErrorNote>{error}</ErrorNote>

      {data.partner_wants_to_talk && <TalkBanner name={pName} busy={busy === "talked"} onDone={async () => {
        setBusy("talked");
        try { setData(await markCheckinTalked(data.week_start)); } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
      }} />}

      {data.revealed && data.mine && data.partner ? (
        <section className="space-y-4" aria-label="Both check-ins">
          <p className="inline-flex items-center gap-2 font-hand text-xl text-leaf"><MailCheck size={18} aria-hidden="true" /> you've both shared ✦</p>
          <AnswersCard row={data.partner} title={`${pName}'s check-in`} bonusText={data.bonus?.text} tone="partner" />
          <AnswersCard row={data.mine} title="Your check-in" bonusText={data.bonus?.text} tone="mine" />
          <Card className="!p-5 text-sm text-muted">
            Read gently. If something feels big, it might be one for your next call rather than a message.
          </Card>
        </section>
      ) : shared && data.mine ? (
        <section className="space-y-4">
          <div className="flex items-center gap-3 rounded-card border-2 border-dashed border-raspberry px-5 py-4 text-raspberry-deep">
            <Lock size={18} aria-hidden="true" />
            <p className="text-sm font-semibold">Shared. {pName}'s answers — and yours, for them — open once they've shared too.</p>
          </div>
          <AnswersCard row={data.mine} title="Your check-in" bonusText={data.bonus?.text} tone="mine" />
        </section>
      ) : (
        <section className="space-y-4">
          {data.partner_submitted && (
            <p className="rounded-xl bg-mustard-soft px-4 py-2 text-sm text-mustard-deep">{pName} has shared their check-in. It opens when you share yours — no rush.</p>
          )}
          <Card className="space-y-5">
            {CORE_QUESTIONS.map((q) => (
              <Field key={q.key} label={q.label} htmlFor={`ci-${q.key}`}>
                <textarea id={`ci-${q.key}`} rows={3} maxLength={1500} className={inputCls} value={draft[q.key]}
                  onChange={(e) => { setDraft({ ...draft, [q.key]: e.target.value }); setSavedAt(null); }} />
              </Field>
            ))}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-leaf">A few words for this week <span className="font-normal normal-case tracking-normal text-muted">(up to 3, optional)</span></p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MOOD_WORDS.map((w) => {
                  const on = draft.mood_words.includes(w);
                  return (
                    <button key={w} type="button" aria-pressed={on} onClick={() => toggleWord(w)} disabled={!on && draft.mood_words.length >= 3}
                      className={`rounded-full border-2 px-3 py-1 text-sm font-semibold transition disabled:opacity-40 ${on ? "border-raspberry bg-raspberry text-leaf" : "border-leaf/15 text-muted hover:border-leaf/40"}`}>
                      {w}
                    </button>
                  );
                })}
              </div>
            </div>
            {data.bonus && (
              <Field label={`Bonus · ${data.bonus.text}`} htmlFor="ci-bonus" hint="Optional — skip it if you like">
                <textarea id="ci-bonus" rows={2} maxLength={1500} className={inputCls} value={draft.bonus}
                  onChange={(e) => { setDraft({ ...draft, bonus: e.target.value }); setSavedAt(null); }} />
              </Field>
            )}
            <label className="flex items-start gap-3 rounded-2xl bg-cream px-4 py-3">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-[#0C1020]" checked={draft.talk_on_call}
                onChange={(e) => { setDraft({ ...draft, talk_on_call: e.target.checked }); setSavedAt(null); }} />
              <span className="text-sm"><strong className="text-leaf">Let's talk about this on a call</strong><span className="block text-muted">Adds a gentle reminder on both Home screens once you share.</span></span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button busy={busy === "share"} onClick={() => void save(true)}><Send size={16} aria-hidden="true" /> Share with {pName}</Button>
              <Button variant="outline" busy={busy === "save"} onClick={() => void save(false)}>{savedAt ? <><Check size={15} aria-hidden="true" /> Draft saved</> : "Save draft"}</Button>
            </div>
            <p className="text-xs text-muted">Drafts are only visible to you. Once shared, it's locked — like posting a postcard.</p>
          </Card>
        </section>
      )}

      <History current={data.week_start} tz={tz} onPick={(w) => setParams(w ? { week: w } : {})} />
    </div>
  );
}

function TalkBanner({ name, busy, onDone }: { name: string; busy: boolean; onDone: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-card bg-raspberry-soft px-5 py-4 text-raspberry-deep">
      <Phone size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1">
        <p className="text-sm font-semibold">{name} would like to talk about their check-in on your next call.</p>
        <button type="button" disabled={busy} onClick={onDone} className="mt-1 text-sm font-semibold underline underline-offset-4">We talked about it ✓</button>
      </div>
    </div>
  );
}

function AnswersCard({ row, title, bonusText, tone }: { row: CheckinRow; title: string; bonusText?: string; tone: "mine" | "partner" }) {
  const items = [
    ...CORE_QUESTIONS.map((q) => ({ q: q.label, a: row[q.key] })),
    ...(bonusText ? [{ q: bonusText, a: row.bonus }] : []),
  ].filter((x) => x.a.trim());
  return (
    <Card className={`space-y-3 ${tone === "partner" ? "border-l-4 border-raspberry" : ""}`}>
      <h2 className="inline-flex items-center gap-2 text-xl"><MessageCircleHeart size={18} className="text-raspberry" aria-hidden="true" />{title}</h2>
      {row.mood_words.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">{row.mood_words.map((w) => <li key={w} className="rounded-full bg-raspberry-soft px-3 py-1 text-xs font-semibold text-raspberry-deep">{w}</li>)}</ul>
      )}
      {items.length === 0 && row.mood_words.length === 0 && <p className="font-hand text-lg text-muted">shared without words this week</p>}
      {items.map((x) => (
        <div key={x.q}>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{x.q}</p>
          <p className="mt-0.5 whitespace-pre-wrap">{x.a}</p>
        </div>
      ))}
      {row.talk_on_call && <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-tomato-deep"><Phone size={13} aria-hidden="true" />{row.talk_done_at ? "talked about on a call ✓" : "would like to talk about this on a call"}</p>}
    </Card>
  );
}

function History({ current, tz, onPick }: { current: string; tz: string; onPick: (week: string | null) => void }) {
  const [weeks, setWeeks] = useState<CheckinWeekStatus[] | null>(null);
  const { myId, partner } = usePeople();
  // Mood words for each week: yours, and your partner's once you've both shared (the database only returns those).
  const [moods, setMoods] = useState<Record<string, { mine: string[]; theirs: string[] }>>({});
  useEffect(() => {
    listCheckinWeeks().then(setWeeks).catch(() => setWeeks([]));
    supabase.from("checkins").select("week_start, user_id, mood_words").eq("status", "submitted").then(({ data }) => {
      const m: Record<string, { mine: string[]; theirs: string[] }> = {};
      for (const r of (data ?? []) as { week_start: string; user_id: string; mood_words: string[] }[]) {
        const k = new Date(r.week_start).toISOString();
        m[k] ??= { mine: [], theirs: [] };
        if (r.user_id === myId) m[k].mine = r.mood_words; else m[k].theirs = r.mood_words;
      }
      setMoods(m);
    });
  }, [current, myId]);
  if (!weeks || weeks.length <= 1) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-2xl">Past check-ins</h2>
      <ul className="divide-y divide-dashed divide-leaf/20 rounded-card bg-paper shadow-card">
        {weeks.map((w, i) => {
          const status = w.revealed ? "Both shared" : w.my_status === "submitted" ? "You shared" : w.partner_submitted ? `${partner?.display_name || "Partner"} shared` : w.my_status === "draft" ? "Draft" : "Not done";
          const isOpen = w.week_start === current;
          return (
            <li key={w.week_start}>
              <button type="button" onClick={() => onPick(i === 0 ? null : w.week_start)} aria-current={isOpen ? "true" : undefined}
                className={`flex w-full items-center justify-between gap-3 px-5 py-3 text-left ${isOpen ? "bg-mustard-soft" : ""}`}>
                <span className="min-w-0">
                  <span className="block font-display text-base">{i === 0 ? "This week" : weekLabel(w.week_start, tz)}</span>
                  {w.revealed && <MoodRow m={moods[new Date(w.week_start).toISOString()]} partnerName={partner?.display_name || "Them"} />}
                </span>
                <span className="shrink-0 text-xs font-semibold text-muted">{status}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {current !== weeks[0]?.week_start && (
        <Link to="/checkin" className="inline-flex items-center gap-1.5 text-sm font-semibold text-leaf"><ArrowLeft size={14} aria-hidden="true" /> Back to this week</Link>
      )}
    </section>
  );
}

/** Both of your mood words for a week, side by side. No scores, no charts. */
function MoodRow({ m, partnerName }: { m?: { mine: string[]; theirs: string[] }; partnerName: string }) {
  if (!m || (!m.mine.length && !m.theirs.length)) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      {m.mine.map((w) => <span key={"m" + w} className="rounded-full bg-mustard-soft px-2 py-0.5 text-[11px] font-semibold text-mustard-deep">{w}</span>)}
      {m.mine.length > 0 && m.theirs.length > 0 && <span className="text-[11px] text-faint" aria-hidden="true">·</span>}
      {m.theirs.map((w) => <span key={"t" + w} className="rounded-full bg-raspberry-soft px-2 py-0.5 text-[11px] font-semibold text-raspberry-deep" title={partnerName}>{w}</span>)}
    </span>
  );
}
