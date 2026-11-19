import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuthError, Session, User } from '@supabase/supabase-js';
import { createClient } from '../utils/supabase/client';

interface SessionState {
  session: Session | null;
  loading: boolean;
  error: AuthError | Error | null;
  refreshSession: () => Promise<Session | null>;
}

/**
 * Tracks the active Supabase Auth session via getSession() and onAuthStateChange().
 */
export function useSession(): SessionState {
  const supabase = useMemo(() => createClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(supabase));
  const [error, setError] = useState<AuthError | Error | null>(null);

  const refreshSession = useCallback(async () => {
    if (!supabase) return null;
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        setError(sessionError);
        return null;
      }
      setSession(data.session);
      setError(null);
      return data.session;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load Supabase session'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;

    supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return;
        if (sessionError) setError(sessionError);
        else setSession(data.session);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err : new Error('Failed to fetch session'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  return { session, loading, error, refreshSession };
}

/**
 * Returns the authenticated Supabase User derived from the active session.
 */
export function useUser(): { user: User | null; loading: boolean; error: AuthError | Error | null } {
  const { session, loading, error } = useSession();
  return {
    user: session?.user ?? null,
    loading,
    error,
  };
}

/**
 * Unified authentication hook wrapping useSession and useUser with Google/Gmail OAuth
 * (popup-safe for iframe previews), Magic Link OTP, email/password sign-in & sign-up,
 * confirmation resend, and sign-out helpers.
 */
export function useAuth() {
  const supabase = useMemo(() => createClient(), []);
  const { session, loading: sessionLoading, error: sessionError, refreshSession } = useSession();
  const { user, loading: userLoading } = useUser();
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Listen for postMessage OAuth callback from the /auth/callback popup window
  useEffect(() => {
    if (!supabase) return;

    const handleOAuthMessage = async (event: MessageEvent) => {
      const origin = event.origin;
      if (
        origin !== window.location.origin &&
        !origin.endsWith('.run.app') &&
        !origin.includes('localhost')
      ) {
        return;
      }

      const payload = event.data;
      if (!payload || payload.type !== 'SUPABASE_OAUTH_CALLBACK') return;

      setActionLoading(true);
      setActionError(null);
      try {
        if (payload.error) {
          setActionError(payload.errorDescription || payload.error);
          return;
        }
        if (payload.code) {
          const { error: exchErr } = await supabase.auth.exchangeCodeForSession(payload.code);
          if (exchErr) setActionError(exchErr.message);
          else await refreshSession();
        } else if (payload.accessToken && payload.refreshToken) {
          const { error: setErr } = await supabase.auth.setSession({
            access_token: payload.accessToken,
            refresh_token: payload.refreshToken,
          });
          if (setErr) setActionError(setErr.message);
          else await refreshSession();
        }
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Google OAuth session exchange failed');
      } finally {
        setActionLoading(false);
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [refreshSession, supabase]);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) {
      const msg = 'Supabase client is not configured';
      setActionError(msg);
      return { data: null, error: new Error(msg) };
    }
    setActionLoading(true);
    setActionError(null);
    try {
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        setActionError(error.message);
        setActionLoading(false);
        return { data, error };
      }

      if (data?.url) {
        const popup = window.open(
          data.url,
          'supabase_google_oauth',
          'width=540,height=680,menubar=no,toolbar=no,location=yes'
        );
        if (!popup) {
          const blockedMsg = 'Popup was blocked by your browser. Please allow popups for this site and try again.';
          setActionError(blockedMsg);
          setActionLoading(false);
          return { data, error: new Error(blockedMsg) };
        }
        const pollTimer = window.setInterval(() => {
          if (popup.closed) {
            window.clearInterval(pollTimer);
            setActionLoading(false);
          }
        }, 500);
      } else {
        setActionLoading(false);
      }

      return { data, error: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to start Google Sign-In';
      setActionError(msg);
      setActionLoading(false);
      return { data: null, error: new Error(msg) };
    }
  }, [supabase]);

  const signInWithOtp = useCallback(
    async (email: string) => {
      if (!supabase) {
        const msg = 'Supabase client is not configured';
        setActionError(msg);
        return { data: null, error: new Error(msg) };
      }
      setActionLoading(true);
      setActionError(null);
      try {
        const result = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (result.error) setActionError(result.error.message);
        return result;
      } finally {
        setActionLoading(false);
      }
    },
    [supabase]
  );

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!supabase) {
        const msg = 'Supabase client is not configured';
        setActionError(msg);
        return { data: null, error: new Error(msg) };
      }
      const cleanEmail = email.trim();
      if (!cleanEmail || !password) {
        const msg = 'Email and password are required';
        setActionError(msg);
        return { data: null, error: new Error(msg) };
      }
      setActionLoading(true);
      setActionError(null);
      try {
        const result = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (result.error) {
          setActionError(result.error.message);
        } else if (result.data.session) {
          await refreshSession();
        }
        return result;
      } finally {
        setActionLoading(false);
      }
    },
    [refreshSession, supabase]
  );

  const signUp = useCallback(
    async (email: string, password: string, fullName?: string) => {
      if (!supabase) {
        const msg = 'Supabase client is not configured';
        setActionError(msg);
        return { data: null, error: new Error(msg), needsEmailConfirmation: false };
      }
      const cleanEmail = email.trim();
      if (!cleanEmail) {
        const msg = 'Please enter a valid email address';
        setActionError(msg);
        return { data: null, error: new Error(msg), needsEmailConfirmation: false };
      }
      if (password.length < 6) {
        const msg = 'Password must be at least 6 characters';
        setActionError(msg);
        return { data: null, error: new Error(msg), needsEmailConfirmation: false };
      }
      setActionLoading(true);
      setActionError(null);
      try {
        const result = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: fullName ? { full_name: fullName.trim() } : undefined,
          },
        });
        if (result.error) {
          setActionError(result.error.message);
          return { ...result, needsEmailConfirmation: false };
        }
        // Supabase returns empty identities if the email is already registered
        const identities = result.data.user?.identities;
        if (result.data.user && Array.isArray(identities) && identities.length === 0) {
          const msg = 'An account with this email already exists. Please sign in instead.';
          setActionError(msg);
          return { data: result.data, error: new Error(msg), needsEmailConfirmation: false };
        }
        if (result.data.session) {
          await refreshSession();
          return { ...result, needsEmailConfirmation: false };
        }
        return { ...result, needsEmailConfirmation: true };
      } finally {
        setActionLoading(false);
      }
    },
    [refreshSession, supabase]
  );

  const resendConfirmation = useCallback(
    async (email: string) => {
      if (!supabase) {
        const msg = 'Supabase client is not configured';
        setActionError(msg);
        return { error: new Error(msg) };
      }
      setActionLoading(true);
      setActionError(null);
      try {
        const result = await supabase.auth.resend({
          type: 'signup',
          email: email.trim(),
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (result.error) setActionError(result.error.message);
        return result;
      } finally {
        setActionLoading(false);
      }
    },
    [supabase]
  );

  const signOut = useCallback(async () => {
    if (!supabase) return { error: null };
    setActionLoading(true);
    setActionError(null);
    try {
      const result = await supabase.auth.signOut();
      if (result.error) setActionError(result.error.message);
      return result;
    } finally {
      setActionLoading(false);
    }
  }, [supabase]);

  return {
    session,
    user,
    isAuthenticated: Boolean(session && user),
    isConfigured: Boolean(supabase),
    loading: sessionLoading || userLoading || actionLoading,
    error: actionError || sessionError?.message || null,
    clearError: () => setActionError(null),
    refreshSession,
    signInWithGoogle,
    signInWithOtp,
    signInWithPassword,
    signUp,
    resendConfirmation,
    signOut,
  };
}
