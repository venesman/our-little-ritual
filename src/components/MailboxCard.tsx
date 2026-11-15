import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Mail, MailOpen } from "lucide-react";
import { mailboxSummary, type MailboxSummary } from "../lib/mailbox";
import { formatInZone } from "../lib/time";

/** Home: a tiny mailbox preview — counts and dates only, never letter content. */
export function MailboxCard({ timeZone }: { timeZone: string }) {
  const [s, setS] = useState<MailboxSummary | null>(null);
  useEffect(() => {
    const load = () => mailboxSummary().then(setS).catch(() => {});
    void load();
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60000);
    return () => clearInterval(t);
  }, []);
  if (!s) return null;
  const line = s.unread > 0 ? (s.unread === 1 ? "1 letter waiting" : `${s.unread} letters waiting`)
    : s.next_reveal_at ? `A sealed letter opens ${formatInZone(new Date(s.next_reveal_at), timeZone)}`
    : "Nothing new — write one whenever you like";
  return (
    <Link to="/mailbox" aria-label="Open mailbox" className="flex -rotate-[1deg] items-center gap-3 bg-cornflower px-4 py-3.5 text-leaf shadow-card transition hover:rotate-0">
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-1.5 font-sans text-[11px] font-bold uppercase tracking-[0.12em]">
          {s.unread ? <Mail size={13} aria-hidden="true" /> : <MailOpen size={13} aria-hidden="true" />} Mailbox
        </h2>
        <p className="mt-1.5 font-display text-2xl leading-[1.05] text-cream">{line}</p>
      </div>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[4px] border-[1.5px] border-leaf bg-mustard text-leaf shadow-print-sm">
        <ArrowRight size={17} aria-hidden="true" />
      </span>
    </Link>
  );
}
