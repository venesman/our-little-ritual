import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { friendlyError } from "../lib/errors";

interface AuthState {
  session: Session | null;
  loading: boolean;
  /** True after the user arrives from a password-reset email. */
  recovering: boolean;
  signUp: (displayName: string, email: string, password: string, redirectPath?: string) => Promise<{ needsConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    session,
    loading,
    recovering,

    async signUp(displayName, email, password, redirectPath = "/") {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { display_name: displayName.trim().slice(0, 40) },
          emailRedirectTo: `${window.location.origin}${redirectPath}`,
        },
      });
      if (error) throw new Error(friendlyError(error, "We couldn't create your account. Please try again."));
      // Supabase returns a user with no identities when the email already exists (to avoid leaking accounts).
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        throw new Error("There's already an account with that email. Try signing in instead.");
      }
      return { needsConfirmation: !data.session };
    },

    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(friendlyError(error, "We couldn't sign you in. Please try again."));
    },

    async sendPasswordReset(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw new Error(friendlyError(error, "We couldn't send the email. Please try again."));
    },

    async updatePassword(password) {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(friendlyError(error, "We couldn't update your password. Please try again."));
      setRecovering(false);
    },

    async signOut() {
      await supabase.auth.signOut();
      setSession(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
