import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { Button, Card, ErrorNote, Field, OuterPage, inputCls } from "../../components/ui";

export function ForgotPassword() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.includes("@")) return setError("Please enter your email address.");
    setBusy(true);
    try { await sendPasswordReset(email); setSent(true); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <OuterPage>
      <h1 className="text-3xl">Reset your password</h1>
      <Card className="mt-6">
        {sent ? (
          <p className="text-sm text-bark">If there's an account for <strong className="text-ink">{email}</strong>, a reset link is on its way.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Email" htmlFor="email">
              <input id="email" type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </Field>
            <ErrorNote>{error}</ErrorNote>
            <Button type="submit" busy={busy} className="w-full">Send reset link</Button>
          </form>
        )}
      </Card>
      <p className="mt-6 text-center text-sm"><Link to="/welcome" className="text-forest hover:underline">Back to sign in</Link></p>
    </OuterPage>
  );
}

/** Reached from the password-reset email; Supabase signs the user in with a recovery session. */
export function UpdatePassword() {
  const { session, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Please use at least 8 characters.");
    setBusy(true);
    try { await updatePassword(password); navigate("/", { replace: true }); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <OuterPage>
      <h1 className="text-3xl">Choose a new password</h1>
      <Card className="mt-6">
        {!session ? (
          <p className="text-sm text-bark">This reset link has expired or was already used. <Link to="/forgot" className="text-forest underline">Request a new one</Link>.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="New password" htmlFor="pw" hint="At least 8 characters.">
              <input id="pw" type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </Field>
            <ErrorNote>{error}</ErrorNote>
            <Button type="submit" busy={busy} className="w-full">Save password</Button>
          </form>
        )}
      </Card>
    </OuterPage>
  );
}
