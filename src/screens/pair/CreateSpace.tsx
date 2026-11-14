import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createRelationship } from "../../lib/api";
import { friendlyError } from "../../lib/errors";
import { useAuth } from "../../hooks/useAuth";
import { useSpace } from "../../hooks/useSpace";
import { Button, Card, ErrorNote, Field, OuterPage, inputCls } from "../../components/ui";

export function CreateSpace() {
  const { signOut } = useAuth();
  const { profile, refresh } = useSpace();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await createRelationship(name.trim());
      await refresh();
      navigate("/", { replace: true });
    } catch (err) {
      setError(friendlyError(err, "We couldn't create your space. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OuterPage>
      <p className="font-hand text-2xl text-raspberry-deep">page one</p>
      <h1 className="mt-1 text-4xl leading-tight">Hello{profile?.display_name ? `, ${profile.display_name}` : ""}.</h1>
      <p className="mt-2 text-muted">Let's make a space for the two of you. You'll invite your partner next.</p>
      <Card className="mt-6">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name your journal (optional)" htmlFor="space" hint="Only the two of you will see this. You can change it later.">
            <input id="space" className={inputCls} placeholder="e.g. Kuching ↔ Santiago" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" busy={busy} className="w-full">Create our space</Button>
        </form>
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        Did your partner already send you a link? Open it on this device instead.
        <br />
        <button onClick={signOut} className="mt-3 text-leaf hover:underline">Sign out</button>
      </p>
    </OuterPage>
  );
}
