import { useState } from "react";
import { Check, Copy, Link2, Share2 } from "lucide-react";
import { createInvitation } from "../../lib/api";
import { friendlyError } from "../../lib/errors";
import { inviteUrl } from "../../lib/invite";
import { formatInZone } from "../../lib/time";
import { useSpace } from "../../hooks/useSpace";
import { Button, ErrorNote } from "../../components/ui";

/**
 * Creates the one-time invitation link. The raw link is shown only in this
 * browser, right after creation — the database keeps just a hash, so a lost
 * link can't be recovered, only replaced (which disables the old one).
 */
export function InvitePanel() {
  const { space, profile, refresh } = useSpace();
  const [link, setLink] = useState<string | null>(null);
  const [expires, setExpires] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tz = profile?.timezone ?? "UTC";
  const open = space?.openInvitation;

  const make = async () => {
    setBusy(true); setError(null); setCopied(false);
    try {
      const { token, expires_at } = await createInvitation();
      setLink(inviteUrl(token));
      setExpires(expires_at);
      void refresh();
    } catch (e) {
      setError(friendlyError(e, "We couldn't create a link. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setError("Couldn't copy — press and hold the link to copy it."); }
  };

  const share = async () => {
    if (!link) return;
    try {
      await navigator.share({ title: "Our Little Ritual", text: "Join me on Our Little Ritual — a little something, every week.", url: link });
    } catch { /* cancelled */ }
  };

  if (link) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-2xl border border-tangerine/50 bg-tangerine-soft/50 p-3">
          <Link2 size={16} className="shrink-0 text-tangerine-deep" aria-hidden="true" />
          <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Invitation link" className="w-full truncate bg-transparent text-sm text-ink focus:outline-none" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={copy} variant="primary">{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy link"}</Button>
          {"share" in navigator && <Button onClick={share} variant="outline"><Share2 size={16} />Share</Button>}
        </div>
        <p className="text-xs text-bark">
          Works once, for one person{expires ? `, until ${formatInZone(new Date(expires), tz)}` : ""}. Send it privately — anyone holding it can join until your partner does.
        </p>
        <ErrorNote>{error}</ErrorNote>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {open && (
        <p className="text-sm text-bark">
          A link is active until {formatInZone(new Date(open.expires_at), tz)}. For your privacy we don't keep a copy — make a new one if you've lost it (the old one stops working).
        </p>
      )}
      <Button onClick={make} busy={busy}><Link2 size={16} />{open ? "Make a new link" : "Create invitation link"}</Button>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
