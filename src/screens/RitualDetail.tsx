import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Lock } from "lucide-react";
import { getRitual, type WeeklyRitual } from "../lib/rituals";
import { friendlyError } from "../lib/errors";
import { useSpace } from "../hooks/useSpace";
import { formatInZone } from "../lib/time";
import { RitualPostcard } from "../components/RitualPostcard";
import { Card, ErrorNote, Spinner } from "../components/ui";

export function RitualDetail() {
  const { weeklyId } = useParams();
  const { profile } = useSpace();
  const [ritual, setRitual] = useState<WeeklyRitual | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const tz = profile?.timezone ?? "UTC";

  useEffect(() => {
    if (!weeklyId) return;
    getRitual(weeklyId).then(setRitual).catch((e) => { setRitual(null); setError(friendlyError(e)); });
  }, [weeklyId]);

  if (ritual === undefined) return <Spinner label="Opening the postcard" />;

  const back = (
    <Link to="/rituals" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-leaf">
      <ArrowLeft size={16} aria-hidden="true" /> All rituals
    </Link>
  );

  if (!ritual) {
    return (
      <div className="fade-up space-y-4">
        {back}
        <ErrorNote>{error ?? "We couldn't find that ritual."}</ErrorNote>
      </div>
    );
  }

  const isCurrent = Date.now() < new Date(ritual.nextRelease).getTime();

  return (
    <div className="fade-up space-y-5">
      {back}
      <p className="font-hand text-xl text-raspberry-deep">
        {formatInZone(new Date(ritual.weekStart), tz)} — {formatInZone(new Date(ritual.nextRelease), tz)}
      </p>

      <RitualPostcard ritual={ritual}>
        <div className="mt-5 space-y-5">
          <section>
            <h3 className="font-sans text-xs font-bold uppercase tracking-[0.16em] text-leaf">How it works</h3>
            <p className="mt-1.5 leading-relaxed">{ritual.activity.instructions}</p>
          </section>
          {ritual.activity.guiding_questions.length > 0 && (
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
      </RitualPostcard>

      {isCurrent && (
        <Card className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-mustard-soft text-mustard-deep"><Lock size={17} aria-hidden="true" /></span>
          <div className="text-sm">
            <h3 className="text-lg">Answering opens in the next update</h3>
            <p className="mt-1 text-muted">
              Have a think in the meantime. When it opens, your answers stay sealed until you've both shared — then they're revealed together.
              There's no deadline; any time this week is perfect.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
