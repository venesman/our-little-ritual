import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False when the build has no Supabase keys; the app then shows a setup notice instead of failing. */
export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url ?? "http://localhost:54321", anonKey ?? "missing-key", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
