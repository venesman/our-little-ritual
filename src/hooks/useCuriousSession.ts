import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { currentCuriousState, type CuriousState } from "../lib/curious";
import { friendlyError } from "../lib/errors";

/**
 * The couple's live Curious Club session — same sync approach as Play With Me:
 * each action returns fresh state, Realtime hears the other phone, and a 3 s poll
 * covers the gaps. `skewMs` corrects this phone's clock so timers match.
 */
export function useCuriousSession() {
  const [state, setState] = useState<CuriousState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skewMs, setSkewMs] = useState(0);

  const apply = useCallback((s: CuriousState | null) => {
    if (s?.server_now) setSkewMs(Date.parse(s.server_now) - Date.now());
    setState(s);
  }, []);

  const refresh = useCallback(async () => {
    try { apply(await currentCuriousState()); setError(null); }
    catch (e) { setError(friendlyError(e, "We couldn't reach The Curious Club. Check your connection.")); }
    finally { setLoading(false); }
  }, [apply]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 3000);
    const onVis = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [refresh]);

  const sessionId = state?.session_id ?? null;
  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel(`curious-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "curious_sessions", filter: `id=eq.${sessionId}` }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [sessionId, refresh]);

  return { state, loading, error, skewMs, apply, refresh, setError };
}
