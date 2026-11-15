import { SaveToScrapbook } from "../components/ScrapbookBits";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, MailCheck } from "lucide-react";
import { getRitual, type WeeklyRitual } from "../lib/rituals";
import { getVisibleSubmissions, getWeekStatus, type MemberStatus, type Submission } from "../lib/submissions";
import { shapeFor } from "../lib/answerShape";
import { friendlyError } from "../lib/errors";
import { useAuth } from "../hooks/useAuth";
import { useSpace } from "../hooks/useSpace";
import { usePeople } from "../hooks/usePeople";
import { personalise } from "../lib/tokens";
import { formatInZone } from "../lib/time";
import { RitualPostcard } from "../components/RitualPostcard";
import { AnswerForm } from "../components/AnswerForm";
import { AnswerCard } from "../components/AnswerCard";
import { StatusPills } from "../components/WeekStatus";
import { ErrorNote, Spinner, Stamp } from "../components/ui";

const SEEN_KEY = (id: string) => `olr.revealSeen.${id}`;

export function RitualDetail() {
  const { weeklyId } = useParams();
  const { session } = useAuth();
  const { profile, space } = useSpace();
  const userId = session!.user.id;
  const tz = profile?.timezone ?? "UTC";
  const partner = space?.members.find((m) => m.user_id !== userId);
  const myName = profile?.display_name || "You";
  const partnerName = partner?.profile?.display_name || "Your partner";

  const [ritual, setRitual] = useState<WeeklyRitual | null | undefined>(undefined);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [status, setStatus] = useState<MemberStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [justRevealed, setJustRevealed] = useState(false);

  const load = useCallback(async () => {
    if (!weeklyId) return;
    try {
      const [r, s, st] = await Promise.all([getRitual(weeklyId), getVisibleSubmissions(weeklyId), getWeekStatus(weeklyId)]);
      setRitual(r); setSubs(s); setStatus(st); setError(null);
      const revealedNow = st.some((x) => x.revealed);
      if (revealedNow) {
        try {
          if (!localStorage.getItem(SEEN_KEY(weeklyId))) { setJustRevealed(true); localStorage.setItem(SEEN_KEY(weeklyId), "1"); }
        } catch { /* storage unavailable: just skip the animation memory */ }
      }
    } catch (e) {
      setRitual((prev) => prev ?? null);
      setError(friendlyError(e, "We couldn't open this ritual. Please try again."));
    }
  }, [weeklyId]);

  useEffect(() => { void load(); }, [load]);

  const mine = subs.find((s) => s.user_id === userId) ?? null;
  const theirs = subs.find((s) => s.user_id !== userId) ?? null;
  const revealed = status.some((x) => x.revealed);
  const partnerShared = status.find((x) => !x.is_me)?.has_submitted ?? false;
  const iShared = mine?.status === "submitted";

  // While waiting for the partner, check back every 20 s and whenever the app comes back into view.
  useEffect(() => {
    if (!iShared || revealed) return;
    const t = window.setInterval(() => void load(), 20000);
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [iShared, revealed, load]);

  const back = (
    <Link to="/rituals" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-leaf">
      <ArrowLeft size={16} aria-hidden="true" /> All rituals
    </Link>
  );

  if (ritual === undefined) return <Spinner label="Opening the postcard" />;
  if (!ritual) return <div className="fade-up space-y-4">{back}<ErrorNote>{error ?? "We couldn't find that ritual."}</ErrorNote></div>;

  const mode = shapeFor(ritual.activity).prompts?.mode;

  return (
    <div className="fade-up space-y-5">
      {back}
      <p className="font-hand text-xl text-raspberry-deep">
        {formatInZone(new Date(ritual.weekStart), tz)} — {formatInZone(new Date(ritual.nextRelease), tz)}
      </p>

      <RitualPostcard ritual={ritual} size={revealed ? "compact" : "full"}>
        {!revealed && (
          <div className="mt-5 space-y-5">
            <section>
              <h3 className="font-sans text-xs font-bold uppercase tracking-[0.16em] text-leaf">How it works</h3>
              <PersonalInstructions instructions={ritual.activity.instructions} fallback={ritual.activity.fallback_instructions} justUs={!!ritual.activity.just_us} />
            </section>
            {ritual.activity.guiding_questions.length > 0 && !mode && (
              <section>
                <h3 className="font-sans text-xs font-bold uppercase tracking-[0.16em] text-leaf">Little prompts, if you need them</h3>
                <ul className="mt-2 space-y-1.5">
                  {ritual.activity.guiding_questions.map((q) => (
                    <li key={q} className="flex gap-2 text-muted"><span className="text-raspberry" aria-hidden="true">✦</span>{q}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </RitualPostcard>

      <StatusPills myName={myName} partnerName={partnerName} mine={mine?.status === "submitted" ? "submitted" : mine ? "draft" : "none"} partnerShared={partnerShared} />
      <ErrorNote>{error}</ErrorNote>

      {revealed && mine && theirs ? (
        <section aria-label="Your answers, revealed" className="space-y-4">
          <div className="flex items-center gap-4">
            <Stamp top="opened" main="✦" bottom="together" />
            <div>
              <p className="font-hand text-2xl text-raspberry-deep">sealed until now…</p>
              <h2 className="text-3xl leading-tight">Revealed together</h2>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <AnswerCard submission={mine} name={myName} tone="mustard" mode={mode} delay={justRevealed ? 150 : 0} />
            <AnswerCard submission={theirs} name={partnerName} tone="raspberry" mode={mode} delay={justRevealed ? 450 : 0} />
          </div>
          <SaveToScrapbook kind="ritual" refId={ritual.weeklyId} prompt />
        </section>
      ) : iShared && mine ? (
        <section className="space-y-4">
          <div className="postcard flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-mustard-soft text-mustard-deep"><MailCheck size={18} aria-hidden="true" /></span>
            <div>
              <h2 className="text-xl">Sealed and sent</h2>
              <p className="mt-1 text-sm text-muted">
                {partnerShared ? "Opening…" : `Your answer is tucked away. When ${partnerName} shares theirs, you'll both see each other's at the same time. No rush for either of you.`}
              </p>
            </div>
          </div>
          <details className="postcard">
            <summary className="cursor-pointer text-sm font-semibold text-leaf">See what you sent</summary>
            <div className="mt-3"><AnswerCard submission={mine} name={myName} tone="mustard" mode={mode} /></div>
          </details>
        </section>
      ) : space ? (
        <AnswerForm
          key={ritual.weeklyId}
          ritual={ritual}
          relationshipId={space.relationship.id}
          userId={userId}
          myName={myName}
          partnerName={partnerName}
          draft={mine}
          onShared={() => void load()}
        />
      ) : null}
    </div>
  );
}

function PersonalInstructions({ instructions, fallback, justUs }: { instructions: string; fallback?: string | null; justUs: boolean }) {
  const { me, partner } = usePeople();
  const t = personalise(instructions, fallback, me, partner);
  return (
    <>
      <p className="mt-1.5 leading-relaxed">{t.text}</p>
      {justUs && !t.personal && fallback && (
        <p className="mt-1.5 text-xs text-muted">General version — fill in Our Story to make this one yours.</p>
      )}
    </>
  );
}
