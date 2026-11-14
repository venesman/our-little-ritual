import { useMemo, useState, type FormEvent } from "react";
import { LogOut } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useSpace } from "../hooks/useSpace";
import { renameRelationship, updateMyProfile } from "../lib/api";
import { friendlyError } from "../lib/errors";
import { detectTimezone, isValidTimezone, listTimezones } from "../lib/time";
import { Button, Card, ErrorNote, Field, inputCls } from "../components/ui";
import { InvitePanel } from "./pair/InvitePanel";

export function Settings() {
  const { session, signOut } = useAuth();
  const { profile, space, refresh } = useSpace();
  const userId = session!.user.id;

  const [name, setName] = useState(profile?.display_name ?? "");
  const [tz, setTz] = useState(profile?.timezone ?? detectTimezone());
  const [spaceName, setSpaceName] = useState(space?.relationship.name ?? "");
  const [busy, setBusy] = useState<"profile" | "space" | null>(null);
  const [saved, setSaved] = useState<"profile" | "space" | null>(null);
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
                <li key={m.user_id}>{m.profile?.display_name || "—"}{m.user_id === userId ? " (you)" : ""} · {m.profile?.timezone.replace(/_/g, " ")}</li>
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
