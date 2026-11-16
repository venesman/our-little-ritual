import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, MessageCircleHeart, Phone } from "lucide-react";
import { getCheckinWeek, type CheckinWeek } from "../lib/checkin";
import { Card } from "./ui";

/** Home: this week's check-in status (never its content) and any "let's talk on a call" reminder. */
export function CheckinCard({ partnerName }: { partnerName: string }) {
  const [d, setD] = useState<CheckinWeek | null>(null);
  useEffect(() => {
    const load = () => getCheckinWeek().then(setD).catch(() => {});
    void load();
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60000);
    return () => clearInterval(t);
  }, []);
  if (!d) return null;
  const mine = d.mine?.status;
  const myTalk = mine === "submitted" && d.mine?.talk_on_call && !d.mine.talk_done_at;
  const line = d.revealed ? "You've both shared ✦"
    : mine === "submitted" ? `Shared — waiting for ${partnerName}`
    : d.partner_submitted ? `${partnerName} has shared — your turn, whenever you're ready`
    : mine === "draft" ? "You have a draft saved"
    : "This week's check-in is open — every question optional";
  return (
    <Card className="space-y-3 !p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-raspberry-soft text-raspberry-deep"><MessageCircleHeart size={18} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg leading-snug">Weekly check-in</h2>
          <p className="text-sm text-muted">{line}</p>
        </div>
        <Link to="/checkin" aria-label="Open weekly check-in" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-[1.5px] border-leaf/15 bg-mustard text-leaf shadow-print-sm">
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </div>
      {(d.partner_wants_to_talk || myTalk) && (
        <p className="flex items-start gap-2 rounded-xl bg-raspberry-soft px-3 py-2 text-sm text-raspberry-deep">
          <Phone size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          {d.partner_wants_to_talk ? `${partnerName} would like to talk about their check-in on your next call.` : "You'd like to talk about your check-in on your next call."}
        </p>
      )}
    </Card>
  );
}
