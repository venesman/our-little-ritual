import { CalendarHeart, Hourglass, Sparkles } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useSpace } from "../hooks/useSpace";
import { formatInZone, nextRelease, relativeFromNow } from "../lib/time";
import { Card } from "../components/ui";
import { InvitePanel } from "./pair/InvitePanel";

export function Home() {
  const { session } = useAuth();
  const { space, profile } = useSpace();
  if (!space) return null;

  const me = space.members.find((m) => m.user_id === session?.user.id);
  const partner = space.members.find((m) => m.user_id !== session?.user.id);
  const myTz = profile?.timezone ?? "UTC";
  const release = nextRelease();
  const myName = me?.profile?.display_name || "you";
  const partnerName = partner?.profile?.display_name || "your partner";

  if (space.relationship.status === "pending" || !partner) {
    return (
      <div className="fade-up space-y-6">
        <header>
          <p className="text-sm uppercase tracking-[0.18em] text-tangerine-deep">{space.relationship.name}</p>
          <h1 className="mt-1 text-4xl">Hello, {myName}.</h1>
          <p className="mt-2 text-bark">Your space is ready. It begins once your partner joins.</p>
        </header>
        <Card>
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-blush-soft text-cherry"><Hourglass size={18} aria-hidden="true" /></span>
            <div>
              <h2 className="text-xl">Invite your partner</h2>
              <p className="text-sm text-bark">Send them a private link. It works once, only for them.</p>
            </div>
          </div>
          <InvitePanel />
        </Card>
        <p className="text-center text-xs text-bark">This page updates by itself when they join.</p>
      </div>
    );
  }

  const partnerTz = partner.profile?.timezone ?? "UTC";
  return (
    <div className="fade-up space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.18em] text-tangerine-deep">{space.relationship.name}</p>
        <h1 className="mt-1 text-4xl">Hello, you two.</h1>
        <p className="mt-2 text-bark">{myName} &amp; {partnerName}</p>
      </header>

      <Card className="relative overflow-hidden">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-tangerine-soft" aria-hidden="true" />
        <div className="absolute -bottom-8 -right-4 h-16 w-16 rounded-full bg-blush-soft" aria-hidden="true" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-soft px-3 py-1 text-xs text-forest">
            <Sparkles size={13} className="text-cherry" aria-hidden="true" /> Coming soon
          </span>
          <h2 className="mt-4 text-2xl">Your weekly rituals are on their way</h2>
          <p className="mt-2 text-sm text-bark">
            Each Monday you'll both receive the same small activity, to do whenever suits you. Answers stay hidden until you've both shared.
          </p>
        </div>
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-tangerine-soft text-tangerine-deep"><CalendarHeart size={18} aria-hidden="true" /></span>
          <div className="text-sm">
            <h2 className="text-lg">Next Monday release · {relativeFromNow(release)}</h2>
            <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-bark">
              <dt>For you</dt><dd className="text-ink">{formatInZone(release, myTz)}</dd>
              <dt>For {partnerName}</dt><dd className="text-ink">{formatInZone(release, partnerTz)}</dd>
            </dl>
          </div>
        </div>
      </Card>
    </div>
  );
}
