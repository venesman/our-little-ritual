import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HeartHandshake } from "lucide-react";
import { acceptInvitation, previewInvitation } from "../../lib/api";
import { friendlyError } from "../../lib/errors";
import { clearPendingInvite, getPendingInvite, savePendingInvite, tokenFromHash } from "../../lib/invite";
import { useAuth } from "../../hooks/useAuth";
import { useSpace } from "../../hooks/useSpace";
import { Button, Card, ErrorNote, OuterPage, Spinner } from "../../components/ui";
import { AuthForm } from "../auth/AuthForm";

type Preview = { relationship_name: string; inviter_name: string; expires_at: string };

export function Join() {
  const { session, loading: authLoading, signOut } = useAuth();
  const { space, loading: spaceLoading, refresh } = useSpace();
  const navigate = useNavigate();

  // Capture the token once, then strip it from the address bar.
  const [token] = useState<string | null>(() => {
    const fromUrl = tokenFromHash(window.location.hash);
    if (fromUrl) {
      savePendingInvite(fromUrl);
      window.history.replaceState(null, "", "/join");
      return fromUrl;
    }
    return getPendingInvite();
  });

  const [preview, setPreview] = useState<Preview | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !token || space) return;
    previewInvitation(token)
      .then((p) => { setPreview(p); if (!p) clearPendingInvite(); })
      .catch((e) => { setPreview(null); setError(friendlyError(e)); });
  }, [session, token, space]);

  useEffect(() => { if (space) clearPendingInvite(); }, [space]);

  const accept = async () => {
    if (!token) return;
    setBusy(true); setError(null);
    try {
      await acceptInvitation(token);
      clearPendingInvite();
      await refresh();
      navigate("/", { replace: true });
    } catch (e) {
      setError(friendlyError(e, "We couldn't join this space. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || (session && spaceLoading)) return <Spinner label="Opening your invitation" />;

  if (!token) {
    return (
      <OuterPage>
        <h1 className="text-3xl">This link looks incomplete</h1>
        <p className="mt-3 text-muted">Ask your partner to send the invitation link again, and open the whole link on this device.</p>
        <p className="mt-6"><Link to="/" className="text-leaf hover:underline">Go to the app</Link></p>
      </OuterPage>
    );
  }

  if (!session) {
    return (
      <OuterPage>
        <p className="font-hand text-2xl text-raspberry-deep">you've got post</p>
        <h1 className="mt-1 text-4xl leading-tight">You've been invited</h1>
        <p className="mt-2 text-muted">Someone special has made a little space for the two of you. Create an account (or sign in) to join.</p>
        <Card className="mt-6"><AuthForm initialMode="signup" redirectPath="/join" /></Card>
      </OuterPage>
    );
  }

  if (space) {
    return (
      <OuterPage>
        <h1 className="text-3xl">You already have a space</h1>
        <p className="mt-3 text-muted">
          This account is already part of <strong className="text-leaf">{space.relationship.name}</strong>. Each account can belong to one space.
          If this invitation was meant for a different account, sign out and sign in with that one.
        </p>
        <div className="mt-6 flex gap-2">
          <Button onClick={() => navigate("/")}>Go to my space</Button>
          <Button variant="ghost" onClick={signOut}>Sign out</Button>
        </div>
      </OuterPage>
    );
  }

  if (preview === undefined) return <Spinner label="Checking your invitation" />;

  if (!preview) {
    return (
      <OuterPage>
        <h1 className="text-3xl">This invitation isn't available</h1>
        <p className="mt-3 text-muted">It may have expired, been replaced with a newer link, or already been used. Ask your partner for a fresh link.</p>
        <ErrorNote>{error}</ErrorNote>
        <p className="mt-6"><Link to="/start" className="text-leaf hover:underline">Or create your own space</Link></p>
      </OuterPage>
    );
  }

  return (
    <OuterPage>
      <HeartHandshake className="text-tomato" size={36} aria-hidden="true" />
      <p className="mt-2 font-hand text-2xl text-raspberry-deep">a little journal for two</p>
      <h1 className="mt-1 text-4xl leading-tight">{preview.inviter_name} invited you</h1>
      <p className="mt-2 text-muted">to share <strong className="text-leaf">{preview.relationship_name}</strong> — a private space just for the two of you.</p>
      <Card className="mt-6 space-y-4">
        <ul className="space-y-2 text-sm text-muted">
          <li>• One small ritual every Monday, at your own pace.</li>
          <li>• Your answers stay private until you've both taken part.</li>
          <li>• No streaks, no scores, no pressure.</li>
        </ul>
        <ErrorNote>{error}</ErrorNote>
        <Button onClick={accept} busy={busy} className="w-full">Join {preview.inviter_name}</Button>
      </Card>
    </OuterPage>
  );
}
