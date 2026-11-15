import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { currentPlayState, type PlayState } from "../lib/play";
import { friendlyError } from "../lib/errors";

/**
 * The couple's live Play With Me session. Kept in sync three ways:
 *  - every action returns the fresh state (instant on your own phone)
 *  - Supabase Realtime tells us when the other phone changed something
 *  - a light poll every 3 s while visible, in case Realtime isn't connected
 * `skewMs` corrects for this phone's clock differing from the server's, so
 * both phones show the same countdown.
 */
export function usePlaySession(enabled: boolean) {
  const [state, setState] = useState<PlayState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skewMs, setSkewMs] = useState(0);
  const latest = useRef<string | null>(null);

  const apply = useCallback((s: PlayState | null) => {
    if (s?.server_now) setSkewMs(Date.parse(s.server_now) - Date.now());
    latest.current = s?.updated_at ?? null;
    setState(s);
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try { apply(await currentPlayState()); setError(null); }
    catch (e) { setError(friendlyError(e, "We couldn't reach your play session. Check your connection.")); }
    finally { setLoading(false); }
  }, [enabled, apply]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Poll while the app is visible.
  useEffect(() => {
    if (!enabled) return;
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 3000);
    const onVis = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [enabled, refresh]);

  // Realtime: hear the other phone's taps right away.
  const sessionId = state?.session_id ?? null;
  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel(`play-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "play_sessions", filter: `id=eq.${sessionId}` }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [sessionId, refresh]);

  return { state, loading, error, skewMs, apply, refresh, setError };
}
