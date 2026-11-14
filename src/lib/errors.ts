/**
 * Turns Supabase / network errors into a sentence a person can act on.
 * Messages raised by our own database functions (errcode P0001) are already
 * written for people, so they pass through. Raw SQL or stack traces never do.
 */
export function friendlyError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const e = err as { message?: string; code?: string } | null;
  const msg = e?.message ?? "";
  const m = msg.toLowerCase();

  if (e?.code === "P0001" || e?.code === "22001" || e?.code === "28000") return msg;
  if (m.includes("invalid login credentials")) return "That email and password don't match. Please try again.";
  if (m.includes("user already registered")) return "There's already an account with that email. Try signing in instead.";
  if (m.includes("email not confirmed")) return "Please confirm your email first — check your inbox for the link.";
  if (m.includes("password should be") || m.includes("weak password")) return "Please choose a stronger password (at least 8 characters).";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts just now. Please wait a minute and try again.";
  if (m.includes("failed to fetch") || m.includes("network")) return "We couldn't reach the server. Check your connection and try again.";
  if (import.meta.env.DEV && msg) console.error(err);
  return fallback;
}
