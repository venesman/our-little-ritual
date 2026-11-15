import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";

export interface ForYou {
  ritual_partner_shared?: boolean; ritual_open?: boolean; older_rituals_waiting?: number;
  checkin_partner_shared?: boolean; letters_unread?: number; apart_my_turn?: number; latest_memory_at?: string | null; whim_from_partner_at?: string | null; quiz_your_move?: boolean; quiz_live_waiting?: string | null;
}

const Ctx = createContext<{ data: ForYou | null; refresh: () => void }>({ data: null, refresh: () => {} });

/** What's waiting for you (counts only). Refreshes every minute and whenever the app comes back into view. */
export function ForYouProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ForYou | null>(null);
  const refresh = useCallback(() => {
    supabase.rpc("for_you").then(({ data: d, error }) => { if (!error) setData((d ?? {}) as ForYou); });
  }, []);
  useEffect(() => {
    refresh();
    const t = window.setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 60_000);
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [refresh]);
  return <Ctx.Provider value={{ data, refresh }}>{children}</Ctx.Provider>;
}

export const useForYou = () => useContext(Ctx);

/** "Seen" times are kept on this phone only (never sent anywhere). */
export const seenKey = (userId: string, what: string) => `olr.seen.${userId}.${what}`;
export function getSeen(userId: string, what: string): number {
  try { return Number(localStorage.getItem(seenKey(userId, what)) ?? 0); } catch { return 0; }
}
export function markSeen(userId: string, what: string, at = Date.now()) {
  try { localStorage.setItem(seenKey(userId, what), String(at)); } catch { /* private mode: fine */ }
}
