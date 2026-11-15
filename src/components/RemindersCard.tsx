import { useEffect, useState } from "react";
import { Bell, BellOff, Share } from "lucide-react";
import {
  currentSubscription, getReminderPrefs, reminderSupport, sendTestReminder, setReminderPrefs, turnOffReminders, turnOnReminders,
  type ReminderPrefs,
} from "../lib/reminders";
import { friendlyError } from "../lib/errors";
import { Button, Card } from "./ui";

/** Settings: gentle reminders on this phone. Opt-in, never more than two a week, nothing private in them. */
export function RemindersCard({ userId }: { userId: string }) {
  const [support] = useState(reminderSupport);
  const [on, setOn] = useState<boolean | null>(null);
  const [prefs, setPrefs] = useState<ReminderPrefs | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    currentSubscription().then((s) => setOn(!!s)).catch(() => setOn(false));
    getReminderPrefs(userId).then(setPrefs).catch(() => setPrefs(null));
  }, [userId]);

  const toggle = async (k: keyof ReminderPrefs) => {
    if (!prefs) return;
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next);
    try { await setReminderPrefs({ [k]: next[k] }); } catch (e) { setPrefs(prefs); setNote(friendlyError(e)); }
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-raspberry-soft text-raspberry-deep"><Bell size={17} aria-hidden="true" /></span>
        <div>
          <h2 className="text-xl">Gentle reminders</h2>
          <p className="text-sm text-muted">At most two a week. Never anything private in them.</p>
        </div>
      </div>

      {support === "not-configured" && <p className="text-sm text-muted">Reminders aren't set up on the server yet.</p>}
      {support === "unsupported" && <p className="text-sm text-muted">This browser can't show reminders. Try Chrome on Android, or the app on your iPhone's Home Screen.</p>}
      {support === "denied" && <p className="text-sm text-muted">Notifications are blocked for this app. Allow them in your phone's settings, then come back.</p>}
      {support === "ios-needs-home-screen" && (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Open this app from its icon on your Home Screen (not from Safari).</li>
          <li>Not there yet? In Safari tap <Share size={13} className="inline" aria-label="Share" /> <strong className="text-leaf">Share</strong> → <strong className="text-leaf">Add to Home Screen</strong>.</li>
          <li>Then come back to Settings to turn reminders on.</li>
        </ol>
      )}

      {support === "ok" && on !== null && (
        on ? (
          <div className="space-y-3">
            {prefs && (
              <ul className="space-y-2">
                {([
                  ["remind_monday", "Monday — when the new postcard arrives"],
                  ["remind_midweek", "Thursday evening — only if something's still waiting"],
                  ["remind_letters", "When a letter arrives"],
                ] as [keyof ReminderPrefs, string][]).map(([k, label]) => (
                  <li key={k}>
                    <label className="flex items-center justify-between gap-3 text-sm">
                      {label}
                      <input type="checkbox" className="h-5 w-5 accent-[#20492F]" checked={prefs[k]} onChange={() => void toggle(k)} />
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="!min-h-[38px] !px-3 text-xs" busy={busy === "test"} onClick={async () => {
                setBusy("test"); setNote(null);
                try { setNote(await sendTestReminder()); } finally { setBusy(null); }
              }}>Send a test reminder</Button>
              <Button variant="ghost" className="!min-h-[38px] !px-3 text-xs" busy={busy === "off"} onClick={async () => {
                setBusy("off"); setNote(null);
                try { await turnOffReminders(); setOn(false); } catch (e) { setNote(friendlyError(e)); } finally { setBusy(null); }
              }}><BellOff size={14} aria-hidden="true" /> Turn off on this phone</Button>
            </div>
          </div>
        ) : (
          <Button busy={busy === "on"} onClick={async () => {
            setBusy("on"); setNote(null);
            try { await turnOnReminders(); setOn(true); if (!prefs) setPrefs(await getReminderPrefs(userId)); }
            catch (e) { setNote(e instanceof Error && !("code" in e) ? e.message : friendlyError(e)); }
            finally { setBusy(null); }
          }}><Bell size={16} aria-hidden="true" /> Turn on reminders on this phone</Button>
        )
      )}
      {note && <p className="text-sm text-muted" aria-live="polite">{note}</p>}
    </Card>
  );
}
