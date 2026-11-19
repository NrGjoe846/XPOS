import React, { useState } from 'react';
import { KeyRound, Lock, Mail, LogOut, Store } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuthProtection } from '../context/AuthContext';

export const PinLoginModal: React.FC = () => {
  const { pinModalOpen, setPinModalOpen, setOnboardingOpen, notify, setActiveModule } = useApp();
  const {
    isSessionActive,
    supabaseAuthenticated,
    user,
    authLoading,
    authError,
    isSupabaseConfigured,
    signInWithGoogle,
    signInWithPassword,
    signUp,
    signOut,
    unlockWithPin,
    lockSession,
  } = useAuthProtection();

  const [mode, setMode] = useState<'pin' | 'email'>('pin');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSubmitting, setPinSubmitting] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (!pinModalOpen) return null;

  const submitPin = async (code: string) => {
    if (!code.trim() || pinSubmitting) return;
    setPinSubmitting(true);
    setPinError(null);
    const result = await unlockWithPin(code.trim());
    setPinSubmitting(false);

    if (!result.ok || !result.staff) {
      setPinError(result.error || 'Invalid PIN');
      notify(result.error || 'Invalid PIN', 'error');
      setPin('');
      return;
    }

    setPin('');
    if (result.staff.roleId === 'role-chef') {
      setActiveModule('kds');
    }
    notify(`Signed in as ${result.staff.name} (${result.staff.roleName})`, 'success');
  };

  const handleGoogleSignIn = async () => {
    const res = await signInWithGoogle();
    if (res.error) {
      notify(res.error.message, 'error');
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    const res = await signInWithPassword(email.trim(), password);
    if (!res.error) {
      setPassword('');
      setPinModalOpen(false);
      notify('Signed in via Supabase Auth', 'success');
    }
  };

  const handleEmailSignUp = async () => {
    if (!email.trim() || !password) return;
    const res = await signUp(email.trim(), password);
    if (!res.error) {
      notify('Account created — verify email if confirmation is enabled', 'success');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 backdrop-blur-[2px] p-4">
      <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl max-w-sm w-full p-6 space-y-4 shadow-xl">
        <div className="text-center space-y-1">
          <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 flex items-center justify-center mx-auto mb-2">
            {isSessionActive ? (
              <KeyRound className="w-4 h-4 text-amber-700 dark:text-amber-400" />
            ) : (
              <Lock className="w-4 h-4 text-amber-700 dark:text-amber-400" />
            )}
          </div>
          <h3 className="font-display font-bold text-base text-stone-900 dark:text-stone-100">
            {isSessionActive ? 'Switch Operator — UNAI POS' : 'Sign In to UNAI POS'}
          </h3>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {isSessionActive
              ? 'Enter another staff PIN or manage your active session.'
              : 'Authenticate with Gmail, email account, or staff PIN to access UNAI POS.'}
          </p>
        </div>

        {/* Auth Method Tabs */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-stone-100 dark:bg-stone-900 text-xs">
          <button
            type="button"
            onClick={() => {
              setMode('pin');
              setPinError(null);
            }}
            className={`inline-flex items-center justify-center gap-1.5 py-1.5 rounded-md font-semibold transition-colors whitespace-nowrap shrink-0 ${
              mode === 'pin'
                ? 'bg-white dark:bg-[#171412] text-stone-900 dark:text-stone-100 shadow-sm'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Operator PIN</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('email');
              setPinError(null);
            }}
            className={`inline-flex items-center justify-center gap-1.5 py-1.5 rounded-md font-semibold transition-colors whitespace-nowrap shrink-0 ${
              mode === 'email'
                ? 'bg-white dark:bg-[#171412] text-stone-900 dark:text-stone-100 shadow-sm'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Gmail / Account</span>
          </button>
        </div>

        {mode === 'pin' ? (
          <div className="space-y-3 text-center">
            <p className="text-[11px] text-stone-500 dark:text-stone-400">
              Demo PINs: 1111 (Owner) · 2222 (Manager) · 3333 (Cashier) · 4444 (Chef)
            </p>
            <input
              type="password"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                setPinError(null);
                setPin(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitPin(pin);
              }}
              placeholder="••••"
              autoFocus
              className="w-full text-center tracking-[0.5em] font-mono text-xl py-2.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-600"
            />
            {pinError && <div className="text-xs text-red-600 dark:text-red-400">{pinError}</div>}
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0', 'Unlock'].map((k) => (
                <button
                  key={k}
                  type="button"
                  disabled={pinSubmitting}
                  onClick={() => {
                    if (k === 'Clear') {
                      setPin('');
                      setPinError(null);
                    } else if (k === 'Unlock') {
                      submitPin(pin);
                    } else {
                      setPin((p) => (p.length < 6 ? p + k : p));
                    }
                  }}
                  className={`py-2.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    k === 'Unlock'
                      ? 'bg-amber-700 hover:bg-amber-800 text-white border-amber-700'
                      : 'border-stone-200 dark:border-stone-800 text-stone-800 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-900'
                  }`}
                >
                  {k === 'Unlock' && pinSubmitting ? 'Checking...' : k}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={handleEmailSignIn} className="space-y-3 text-xs">
            {supabaseAuthenticated && user ? (
              <div className="p-3 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] space-y-2">
                <div className="text-stone-500 dark:text-stone-400">Active Supabase Session</div>
                <div className="font-semibold text-stone-900 dark:text-stone-100 truncate">{user.email}</div>
                <button
                  type="button"
                  onClick={async () => {
                    await signOut();
                    notify('Signed out of Supabase session', 'info');
                  }}
                  disabled={authLoading}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-900 font-semibold whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <>
                {!isSupabaseConfigured && (
                  <div className="p-2.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-[11px]">
                    Supabase Auth environment variables are not configured. Use an Operator PIN above.
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={authLoading || !isSupabaseConfigured}
                  className="w-full py-2.5 px-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#1C1917] hover:bg-stone-50 dark:hover:bg-stone-900 flex items-center justify-center gap-2 font-semibold text-stone-900 dark:text-stone-100 disabled:opacity-50"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                    />
                  </svg>
                  <span>{authLoading ? 'Connecting Gmail...' : 'Continue with Gmail (Google)'}</span>
                </button>

                <div className="relative py-1 text-center text-[11px] text-stone-400">
                  <span className="bg-white dark:bg-[#171412] px-2 relative z-10">or email &amp; password</span>
                  <div className="absolute inset-x-0 top-1/2 border-t border-stone-200 dark:border-stone-800" />
                </div>

                <div className="space-y-2">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Staff email"
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] text-stone-900 dark:text-stone-100"
                  />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] text-stone-900 dark:text-stone-100"
                  />
                </div>
                {authError && <div className="text-red-600 dark:text-red-400">{authError}</div>}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="submit"
                    disabled={authLoading || !isSupabaseConfigured}
                    className="px-3 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white font-semibold whitespace-nowrap shrink-0"
                  >
                    {authLoading ? 'Signing in...' : 'Sign In'}
                  </button>
                  <button
                    type="button"
                    onClick={handleEmailSignUp}
                    disabled={authLoading || !isSupabaseConfigured}
                    className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-900 font-semibold whitespace-nowrap shrink-0"
                  >
                    Create Account
                  </button>
                </div>
              </>
            )}
          </form>
        )}

        <div className="pt-2 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between gap-2 text-xs">
          <button
            type="button"
            onClick={() => {
              setPinModalOpen(false);
              setOnboardingOpen(true);
            }}
            className="inline-flex items-center gap-1 text-stone-600 dark:text-stone-400 hover:text-amber-700 dark:hover:text-amber-400 font-medium whitespace-nowrap shrink-0"
          >
            <Store className="w-3.5 h-3.5" />
            <span>Restaurant Setup</span>
          </button>

          {isSessionActive && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={lockSession}
                className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 hover:underline font-medium whitespace-nowrap shrink-0"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Lock</span>
              </button>
              <button
                type="button"
                onClick={() => setPinModalOpen(false)}
                className="text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 font-medium whitespace-nowrap shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
