/**
 * Invitation links look like  https://<app>/join#t=<token>
 * The token lives in the URL fragment, which browsers never send to the server,
 * so it doesn't end up in hosting logs or Referer headers.
 *
 * While the invitee signs up and confirms their email, the token is kept in
 * localStorage for at most 7 days (a temporary draft, never shared data) and
 * removed as soon as the invitation is accepted or rejected.
 */
const KEY = "olr.pendingInvite";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;

export function inviteUrl(token: string): string {
  return `${window.location.origin}/join#t=${token}`;
}

export function tokenFromHash(hash: string): string | null {
  const t = new URLSearchParams(hash.replace(/^#/, "")).get("t");
  return t && TOKEN_RE.test(t) ? t : null;
}

export function savePendingInvite(token: string): void {
  try { localStorage.setItem(KEY, JSON.stringify({ token, at: Date.now() })); } catch { /* storage unavailable */ }
}

export function getPendingInvite(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { token, at } = JSON.parse(raw) as { token: string; at: number };
    if (!TOKEN_RE.test(token) || Date.now() - at > MAX_AGE_MS) { clearPendingInvite(); return null; }
    return token;
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
