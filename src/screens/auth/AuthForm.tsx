import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { Button, ErrorNote, Field, inputCls } from "../../components/ui";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Sign in / create account. Used on the Welcome screen and on the invitation screen. */
export function AuthForm({ initialMode = "signin", redirectPath = "/" }: { initialMode?: "signin" | "signup"; redirectPath?: string }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(email.trim())) return setError("Please enter a valid email address.");
    if (mode === "signup") {
      if (!name.trim()) return setError("What should your partner call you?");
      if (password.length < 8) return setError("Please use at least 8 characters for your password.");
    } else if (!password) {
      return setError("Please enter your password.");
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { needsConfirmation } = await signUp(name, email, password, redirectPath);
        if (needsConfirmation) setSentTo(email.trim());
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <div className="space-y-4 text-center">
        <MailCheck className="mx-auto text-tangerine" size={36} aria-hidden="true" />
        <h2 className="text-2xl">Check your inbox</h2>
        <p className="text-sm text-bark">
          We sent a confirmation link to <strong className="text-ink">{sentTo}</strong>. Open it on this device to continue.
          It can take a minute or two — check spam if it doesn't arrive.
        </p>
        <Button variant="ghost" onClick={() => { setSentTo(null); setMode("signin"); }}>Back to sign in</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {mode === "signup" && (
        <Field label="Your name" htmlFor="name" hint="This is what your partner will see.">
          <input id="name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="given-name" />
        </Field>
      )}
      <Field label="Email" htmlFor="email">
        <input id="email" type="email" inputMode="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </Field>
      <Field label="Password" htmlFor="password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
        <input
          id="password" type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
        />
      </Field>
      <ErrorNote>{error}</ErrorNote>
      <Button type="submit" busy={busy} className="w-full">{mode === "signup" ? "Create account" : "Sign in"}</Button>
      <div className="flex flex-col items-center gap-1 pt-1 text-sm">
        <button type="button" className="text-forest underline-offset-4 hover:underline" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(null); }}>
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
        {mode === "signin" && <Link to="/forgot" className="text-bark underline-offset-4 hover:underline">Forgot your password?</Link>}
      </div>
    </form>
  );
}
