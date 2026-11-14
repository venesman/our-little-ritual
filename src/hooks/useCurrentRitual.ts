import { useCallback, useEffect, useState } from "react";
import { getCurrentRitual, type WeeklyRitual } from "../lib/rituals";
import { friendlyError } from "../lib/errors";

/**
 * This week's shared ritual. Re-fetches by itself when Monday 12:00 UTC passes
 * while the app is open, and when the app comes back into view.
 */
export function useCurrentRitual(enabled: boolean) {
  const [ritual, setRitual] = useState<WeeklyRitual | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      setRitual(await getCurrentRitual());
      setError(null);
    } catch (e) {
      setError(friendlyError(e, "We couldn't load this week's ritual. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!ritual) return;
    const ms = new Date(ritual.nextRelease).getTime() - Date.now() + 2000;
    // setTimeout can't wait longer than ~24.8 days; a week is fine.
    const t = window.setTimeout(() => void load(), Math.max(ms, 1000));
    const onVisible = () => { if (document.visibilityState === "visible" && Date.now() >= new Date(ritual.nextRelease).getTime()) void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearTimeout(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [ritual, load]);

  return { ritual, loading, error, reload: load };
}
