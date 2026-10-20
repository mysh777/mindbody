import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const INACTIVITY_LIMIT_MS = 12 * 60 * 60 * 1000; // 12 hours
const LAST_ACTIVITY_KEY = 'breeze_last_activity';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, user: null, loading: true });
  const lastActivityRef = useRef<number>(Number(sessionStorage.getItem(LAST_ACTIVITY_KEY) || Date.now()));

  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    sessionStorage.setItem(LAST_ACTIVITY_KEY, String(lastActivityRef.current));
  }, []);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'touchstart', 'click'];
    events.forEach(e => window.addEventListener(e, updateActivity, { passive: true }));
    return () => events.forEach(e => window.removeEventListener(e, updateActivity));
  }, [updateActivity]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const session = data.session;
      if (session) {
        const elapsed = Date.now() - lastActivityRef.current;
        if (elapsed > INACTIVITY_LIMIT_MS) {
          supabase.auth.signOut();
          setState({ session: null, user: null, loading: false });
          return;
        }
      }
      setState({ session, user: session?.user ?? null, loading: false });
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        if (session) updateActivity();
        if (mounted) setState({ session, user: session?.user ?? null, loading: false });
      })();
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [updateActivity]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    sessionStorage.removeItem(LAST_ACTIVITY_KEY);
    await supabase.auth.signOut();
    setState({ session: null, user: null, loading: false });
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${window.location.pathname}#reset-password`,
    });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut, resetPassword, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
