import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Mail, MailOpen } from "lucide-react";
import { mailboxSummary, type MailboxSummary } from "../lib/mailbox";
import { formatInZone } from "../lib/time";
import { Card } from "./ui";

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
  const line = s.unread > 0 ? (s.unread === 1 ? "You have a letter ✉" : `You have ${s.unread} letters ✉`)
    : s.next_reveal_at ? `A sealed letter opens ${formatInZone(new Date(s.next_reveal_at), timeZone)}`
    : "Nothing new — write one whenever you like";
  return (
    <Card className={`flex items-center gap-3 !p-5 ${s.unread ? "ring-2 ring-raspberry" : ""}`}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${s.unread ? "bg-raspberry text-leaf" : "bg-leaf-soft text-leaf"}`}>
        {s.unread ? <Mail size={18} aria-hidden="true" /> : <MailOpen size={18} aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg leading-snug">Our Mailbox</h2>
        <p className="text-sm text-muted">{line}</p>
      </div>
      <Link to="/mailbox" aria-label="Open mailbox" className="grid h-11 w-11 shrink-0 place-items-center rounded-[4px] border-[1.5px] border-leaf bg-mustard text-leaf shadow-print-sm">
        <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </Card>
  );
}
