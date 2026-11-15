import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Gift, Trophy, Hourglass, Mail, MessageCircleHeart, Stamp as StampIcon, X } from "lucide-react";
import { usePeople } from "../hooks/usePeople";
import { getSeen, markSeen, useForYou } from "../hooks/useForYou";

/** Home: only what's waiting for you right now. Hidden when there's nothing new. */
export function ForYouLine({ partnerName, ritualId }: { partnerName: string; ritualId?: string }) {
  const { data } = useForYou();
  const { myId } = usePeople();
  if (!data) return null;
  const items: { to: string; icon: typeof Mail; text: string }[] = [];
  if (data.ritual_partner_shared && ritualId) items.push({ to: `/rituals/${ritualId}`, icon: StampIcon, text: `${partnerName} shared this week's ritual` });
  if (data.checkin_partner_shared) items.push({ to: "/checkin", icon: MessageCircleHeart, text: `${partnerName} shared their check-in` });
  if ((data.letters_unread ?? 0) > 0) items.push({ to: "/mailbox", icon: Mail, text: data.letters_unread === 1 ? "A letter arrived for you" : `${data.letters_unread} letters arrived for you` });
  if ((data.apart_my_turn ?? 0) > 0) items.push({ to: "/play?mode=apart", icon: Hourglass, text: data.apart_my_turn === 1 ? "Your turn in an Apart mission" : `Your turn in ${data.apart_my_turn} Apart missions` });
  if (data.quiz_your_move) items.push({ to: "/play?mode=quiz", icon: Trophy, text: `Your move in Quiz Duel with ${partnerName}` });
  if (data.whim_from_partner_at && myId && new Date(data.whim_from_partner_at).getTime() > getSeen(myId, "whims"))
    items.push({ to: "/mailbox?section=whims", icon: Gift, text: `${partnerName} added a little whim` });
  if (!items.length) return null;
  return (
    <section aria-label="For you" className="space-y-1.5">
      <p className="font-hand text-xl text-raspberry-deep">for you ✦</p>
      <ul className="space-y-1.5">
        {items.map(({ to, icon: Icon, text }) => (
          <li key={to}>
            <Link to={to} className="flex items-center gap-3 rounded-2xl border-2 border-raspberry/60 bg-paper px-4 py-2.5 text-sm font-semibold text-leaf shadow-card transition hover:-translate-y-px">
              <Icon size={16} className="shrink-0 text-raspberry-deep" aria-hidden="true" />
              <span className="flex-1">{text}</span>
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Home: a gentle "Welcome back" after a quiet stretch (12+ days since you last
 * opened Home on this phone). Says what's waiting and one easy thing to do —
 * never "you missed". The last-visit time stays on this phone.
 */
export function WelcomeBack({ userId, ritualId }: { userId: string; ritualId?: string }) {
  const { data } = useForYou();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const last = getSeen(userId, "home");
    setShow(last > 0 && Date.now() - last > 12 * 24 * 3600 * 1000);
    markSeen(userId, "home");
  }, [userId]);
  if (!show || !data) return null;
  const waiting = [
    (data.older_rituals_waiting ?? 0) + (data.ritual_partner_shared ? 1 : 0) > 0 && `${(data.older_rituals_waiting ?? 0) + (data.ritual_partner_shared ? 1 : 0)} ritual${(data.older_rituals_waiting ?? 0) + (data.ritual_partner_shared ? 1 : 0) === 1 ? "" : "s"} with an answer waiting`,
    (data.letters_unread ?? 0) > 0 && `${data.letters_unread} letter${data.letters_unread === 1 ? "" : "s"}`,
    (data.apart_my_turn ?? 0) > 0 && `${data.apart_my_turn} Apart mission${data.apart_my_turn === 1 ? "" : "s"}`,
  ].filter(Boolean) as string[];
  return (
    <section className="postcard relative !p-5" aria-label="Welcome back">
      <button type="button" onClick={() => setShow(false)} aria-label="Close" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-leaf-soft"><X size={15} /></button>
      <p className="font-hand text-2xl text-raspberry-deep">welcome back ✦</p>
      <p className="mt-1 text-sm">{waiting.length ? "Lovely to see you. A few things are waiting just below — no rush." : "Lovely to see you. Pick up wherever feels easy."}</p>
      {ritualId && data.ritual_open && (
        <Link to={`/rituals/${ritualId}`} className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-full border-2 border-leaf bg-mustard px-4 text-sm font-semibold text-leaf shadow-print-sm">
          Start with this week's ritual <ArrowRight size={15} aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
