import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getMyProfile, getMySpace, updateMyProfile, type Profile, type Space } from "../lib/api";
import { friendlyError } from "../lib/errors";
import { detectTimezone } from "../lib/time";
import { useAuth } from "./useAuth";

interface SpaceState {
  profile: Profile | null;
  space: Space | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const SpaceContext = createContext<SpaceState | null>(null);

/** Loads the signed-in user's profile and relationship space from Supabase (the source of truth). */
export function SpaceProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [space, setSpace] = useState<Space | null>(null);
  // Which user the current data belongs to. Loading is derived from it, so there is never
  // a render where a freshly signed-in user looks like they have "no space".
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const loading = loadedFor !== userId;

  const refresh = useCallback(async () => {
    if (!userId) { setProfile(null); setSpace(null); setLoadedFor(null); return; }
    try {
      const [p, s] = await Promise.all([getMyProfile(userId), getMySpace(userId)]);
      // First visit from a device: record the time zone so release times show correctly.
      if (p && p.timezone === "UTC") {
        const tz = detectTimezone();
        if (tz !== "UTC") { await updateMyProfile(userId, { timezone: tz }); p.timezone = tz; }
      }
      setProfile(p);
      setSpace(s);
      setError(null);
    } catch (e) {
      setError(friendlyError(e, "We couldn't load your space. Please refresh."));
    } finally {
      setLoadedFor(userId);
    }
  }, [userId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Pick up changes made on the partner's device (e.g. they just joined).
  useEffect(() => {
    if (!userId) return;
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onFocus);
    const waiting = space?.relationship.status === "pending";
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, waiting ? 15000 : 60000);
    return () => { document.removeEventListener("visibilitychange", onFocus); clearInterval(timer); };
  }, [userId, refresh, space?.relationship.status]);

  return <SpaceContext.Provider value={{ profile, space, loading, error, refresh }}>{children}</SpaceContext.Provider>;
}

export function useSpace(): SpaceState {
  const ctx = useContext(SpaceContext);
  if (!ctx) throw new Error("useSpace must be used inside <SpaceProvider>");
  return ctx;
}
