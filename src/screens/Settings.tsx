import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, LogOut, Share, Smartphone } from "lucide-react";
import { canPromptInstall, isInstalled, isIOS, onInstallChange, promptInstall } from "../lib/install";
import { useAuth } from "../hooks/useAuth";
import { useSpace } from "../hooks/useSpace";
import { renameRelationship, updateMyProfile } from "../lib/api";
import { setIncludeJustUsWeekly } from "../lib/story";
import { friendlyError } from "../lib/errors";
import { detectTimezone, isValidTimezone, listTimezones } from "../lib/time";
import { Button, Card, ErrorNote, Field, inputCls } from "../components/ui";
import { InvitePanel } from "./pair/InvitePanel";
import { RemindersCard } from "../components/RemindersCard";

export function Settings() {
  const { session, signOut } = useAuth();
  const { profile, space, refresh } = useSpace();
  const userId = session!.user.id;

  const [name, setName] = useState(profile?.display_name ?? "");
  const [tz, setTz] = useState(profile?.timezone ?? detectTimezone());
  const [spaceName, setSpaceName] = useState(space?.relationship.name ?? "");
  const [freeFrom, setFreeFrom] = useState(profile?.free_from?.slice(0, 5) ?? "");
  const [freeTo, setFreeTo] = useState(profile?.free_to?.slice(0, 5) ?? "");
  const [busy, setBusy] = useState<"profile" | "space" | "free" | null>(null);
  const [saved, setSaved] = useState<"profile" | "space" | "free" | null>(null);
  const [, setInstallTick] = useState(0);
  useEffect(() => onInstallChange(() => setInstallTick((n) => n + 1)), []);
  const [error, setError] = useState<string | null>(null);
  const zones = useMemo(() => listTimezones(), []);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setSaved(null);
    if (!name.trim()) return setError("Please enter a name.");
    if (!isValidTimezone(tz)) return setError("Please choose a valid time zone.");
    setBusy("profile");
    try { await updateMyProfile(userId, { display_name: name.trim().slice(0, 40), timezone: tz }); await refresh(); setSaved("profile"); }
    catch (err) { setError(friendlyError(err)); }
    finally { setBusy(null); }
  };

  const saveSpace = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setSaved(null);
    setBusy("space");
    try { await renameRelationship(spaceName); await refresh(); setSaved("space"); }
    catch (err) { setError(friendlyError(err)); }
    finally { setBusy(null); }
  };

  const saveFree = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setSaved(null);
    if ((freeFrom && !freeTo) || (!freeFrom && freeTo)) return setError("Please set both a start and an end time — or clear both.");
    if (freeFrom && freeFrom === freeTo) return setError("Start and end can't be the same time.");
    setBusy("free");
    try { await updateMyProfile(userId, { free_from: freeFrom || null, free_to: freeTo || null }); await refresh(); setSaved("free"); }
    catch (err) { setError(friendlyError(err)); }
    finally { setBusy(null); }
  };

  const partner = space?.members.find((m) => m.user_id !== userId);

  return (
    <div className="fade-up space-y-6">
      <h1 className="text-4xl">Settings</h1>
      <ErrorNote>{error}</ErrorNote>

      <Card>
        <h2 className="mb-4 text-xl">You</h2>
        <form onSubmit={saveProfile} className="space-y-4">
          <Field label="Display name" htmlFor="dn">
            <input id="dn" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          </Field>
          <Field label="Time zone" htmlFor="tz" hint="Used to show Monday's release in your local time.">
            <select id="tz" className={inputCls} value={tz} onChange={(e) => setTz(e.target.value)}>
              {!zones.includes(tz) && <option value={tz}>{tz}</option>}
              {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
            </select>
          </Field>
          <p className="text-xs text-muted">Signed in as {session?.user.email}</p>
          <Button type="submit" busy={busy === "profile"}>{saved === "profile" ? "Saved" : "Save"}</Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-1 text-xl">When you're usually free</h2>
        <p className="mb-4 text-sm text-muted">In your own time. We'll show you both the best overlap for a call. It can run past midnight (e.g. 10 pm – 1 am).</p>
        <form onSubmit={saveFree} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" htmlFor="free-from"><input id="free-from" type="time" className={inputCls} value={freeFrom} onChange={(e) => setFreeFrom(e.target.value)} /></Field>
            <Field label="To" htmlFor="free-to"><input id="free-to" type="time" className={inputCls} value={freeTo} onChange={(e) => setFreeTo(e.target.value)} /></Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" busy={busy === "free"}>{saved === "free" ? "Saved" : "Save"}</Button>
            {(freeFrom || freeTo) && <Button type="button" variant="ghost" onClick={() => { setFreeFrom(""); setFreeTo(""); }}>Clear</Button>}
          </div>
        </form>
      </Card>

      {space?.relationship.status === "active" && <RemindersCard userId={userId} partnerName={partner?.profile?.display_name || "your partner"} />}

      {space && <JustUsMondaysCard on={space.relationship.include_just_us_weekly} onChange={async (v) => {
        setError(null);
        try { await setIncludeJustUsWeekly(v); await refresh(); } catch (err) { setError(friendlyError(err)); }
      }} />}

      <InstallCard />

      {space && (
        <Card>
          <h2 className="mb-4 text-xl">Our space</h2>
          <form onSubmit={saveSpace} className="space-y-4">
            <Field label="Space name" htmlFor="sn" hint="Only the two of you see this.">
              <input id="sn" className={inputCls} value={spaceName} onChange={(e) => setSpaceName(e.target.value)} maxLength={60} />
            </Field>
            <Button type="submit" variant="outline" busy={busy === "space"}>{saved === "space" ? "Saved" : "Rename"}</Button>
          </form>
          <div className="mt-6 border-t border-leaf/15 pt-4 text-sm">
            <h3 className="mb-2 font-sans text-sm font-medium text-leaf">Members</h3>
            <ul className="space-y-1 text-muted">
              {space.members.map((m) => (
                <li key={m.user_id}>
                  {m.profile?.display_name || "—"}{m.user_id === userId ? " (you)" : ""} · {m.profile?.timezone.replace(/_/g, " ")}
                  {" · "}{m.profile?.free_from && m.profile?.free_to
                    ? `free ${m.profile.free_from.slice(0, 5)}–${m.profile.free_to.slice(0, 5)}`
                    : "free hours not set"}
                </li>
              ))}
            </ul>
            {!partner && <div className="mt-4"><InvitePanel /></div>}
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 text-xl">Privacy</h2>
        <p className="text-sm text-muted">
          Your space is visible only to its two members. Access is checked by the database on every request, not just by this app.
          There are no public profiles, feeds or sharing.
        </p>
      </Card>

      <Button variant="outline" onClick={signOut}><LogOut size={16} />Sign out</Button>
    </div>
  );
}

function JustUsMondaysCard({ on, onChange }: { on: boolean; onChange: (v: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Card className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-xl">Just us rituals on Mondays</h2>
        <p className="mt-1 text-sm text-muted">
          Adds six personal rituals to the Monday rotation. Applies to you both, from next week.
        </p>
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label="Include Just us rituals on Mondays" disabled={busy}
        onClick={async () => { setBusy(true); try { await onChange(!on); } finally { setBusy(false); } }}
        className={`relative mt-1 h-8 w-14 shrink-0 rounded-full border-2 border-leaf/20 transition ${on ? "bg-visa-green" : "bg-white"} disabled:opacity-60`}>
        <span className={`absolute top-0.5 h-6 w-6 rounded-full transition-all ${on ? "left-[26px] bg-mustard" : "left-0.5 bg-leaf/40"}`} />
      </button>
    </Card>
  );
}

function InstallCard() {
  if (isInstalled()) {
    return (
      <Card className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-leaf text-cream"><Check size={17} aria-hidden="true" /></span>
        <p className="text-sm">Installed on this device — it opens from your home screen like an app.</p>
      </Card>
    );
  }
  return (
    <Card>
      <div className="mb-3 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-mustard-soft text-mustard-deep"><Smartphone size={17} aria-hidden="true" /></span>
        <h2 className="text-xl">Add to your home screen</h2>
      </div>
      {canPromptInstall() ? (
        <Button onClick={() => void promptInstall()}>Install the app</Button>
      ) : isIOS() ? (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Open this page in <strong className="text-leaf">Safari</strong>.</li>
          <li>Tap the <Share size={14} className="inline" aria-label="Share" /> <strong className="text-leaf">Share</strong> button.</li>
          <li>Choose <strong className="text-leaf">Add to Home Screen</strong>, then <strong className="text-leaf">Add</strong>.</li>
        </ol>
      ) : (
        <p className="text-sm text-muted">Open your browser's menu (⋮) and choose <strong className="text-leaf">Install app</strong> or <strong className="text-leaf">Add to Home screen</strong>.</p>
      )}
    </Card>
  );
}
