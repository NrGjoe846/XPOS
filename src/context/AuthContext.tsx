import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { ShieldAlert, KeyRound, Mail } from 'lucide-react';
import { ModuleId, useApp } from './AppContext';
import { useAuth } from '../hooks/useAuth';
import { StaffUser } from '../types/pos';

const PIN_SESSION_STORAGE_KEY = 'orderrestro_pin_staff_id';

const MODULE_PERMISSIONS: Record<ModuleId, string[]> = {
  dashboard: ['pos.bill', 'kds.view', 'tables.manage'],
  pos: ['pos.bill'],
  tables: ['tables.manage', 'pos.bill'],
  kds: ['kds.view'],
  menu: ['menu.edit', 'menu.view'],
  inventory: ['inventory.manage'],
  procurement: ['procurement.approve', 'inventory.manage'],
  crm: ['crm.manage', 'crm.view'],
  staff: ['staff.payroll'],
  accounting: ['accounting.view'],
  finance: ['accounting.view'],
  delivery: ['delivery.dispatch', 'pos.bill'],
  online_qr: ['pos.bill', 'tables.manage'],
  branches: ['accounting.view', 'analytics.export'],
  analytics: ['analytics.export'],
  marketing: ['marketing.send'],
  maintenance: ['inventory.manage', 'accounting.view'],
  documents: ['accounting.view', 'staff.payroll', 'inventory.manage'],
  security: ['*'],
  integrations: ['*'],
  admin: ['*'],
};

export interface AuthProtectionContextValue {
  session: Session | null;
  user: User | null;
  supabaseAuthenticated: boolean;
  pinSessionActive: boolean;
  isSessionActive: boolean;
  authLoading: boolean;
  authError: string | null;
  clearError: () => void;
  isSupabaseConfigured: boolean;
  activeStaff: StaffUser | null;
  signInWithGoogle: ReturnType<typeof useAuth>['signInWithGoogle'];
  signInWithOtp: ReturnType<typeof useAuth>['signInWithOtp'];
  signInWithPassword: ReturnType<typeof useAuth>['signInWithPassword'];
  signUp: ReturnType<typeof useAuth>['signUp'];
  resendConfirmation: ReturnType<typeof useAuth>['resendConfirmation'];
  signOut: () => Promise<void>;
  unlockWithPin: (pin: string) => Promise<{ ok: boolean; error?: string; staff?: StaffUser }>;
  activateOwnerSession: (staff: StaffUser) => void;
  lockSession: () => void;
  hasModuleAccess: (moduleId: ModuleId) => boolean;
}

const AuthProtectionContext = createContext<AuthProtectionContextValue | null>(null);

export const AuthProtectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { db, loading: appLoading, currentStaff, setCurrentStaff, setPinModalOpen, notify } = useApp();
  const {
    session,
    user,
    isAuthenticated: supabaseAuthenticated,
    isConfigured: isSupabaseConfigured,
    loading: supabaseLoading,
    error: authError,
    clearError,
    signInWithGoogle,
    signInWithOtp,
    signInWithPassword,
    signUp,
    resendConfirmation,
    signOut: supabaseSignOut,
  } = useAuth();

  const [pinStaffId, setPinStaffId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(PIN_SESSION_STORAGE_KEY);
  });

  const pinStaff = useMemo(() => {
    if (!db || !pinStaffId) return null;
    return db.staff.find((s) => s.id === pinStaffId && s.active) || null;
  }, [db, pinStaffId]);

  const pinSessionActive = Boolean(pinStaff);
  const isSessionActive = supabaseAuthenticated || pinSessionActive;
  const authLoading = supabaseLoading || appLoading;

  // Resolve the active staff profile from operator override or matched Supabase user email
  const activeStaff = useMemo(() => {
    if (pinStaff) return pinStaff;
    if (supabaseAuthenticated && db) {
      const emailMatch = user?.email
        ? db.staff.find((s) => s.email.toLowerCase() === user.email!.toLowerCase() && s.active)
        : null;
      return emailMatch || db.staff.find((s) => s.active) || null;
    }
    return null;
  }, [db, pinStaff, supabaseAuthenticated, user?.email]);

  // Keep AppContext's currentStaff synchronized with authenticated operator
  useEffect(() => {
    if (authLoading) return;
    if (activeStaff) {
      if (!currentStaff || currentStaff.id !== activeStaff.id) {
        setCurrentStaff(activeStaff);
      }
    } else if (currentStaff !== null) {
      setCurrentStaff(null);
    }
  }, [activeStaff, authLoading, currentStaff, setCurrentStaff]);

  // Listen for inactivity timeout lock events from AppContext (only if already signed in)
  useEffect(() => {
    const handleInactivityLock = () => {
      if (!isSessionActive) return;
      sessionStorage.removeItem(PIN_SESSION_STORAGE_KEY);
      setPinStaffId(null);
      setPinModalOpen(true);
    };
    window.addEventListener('orderrestro:session-lock', handleInactivityLock);
    return () => window.removeEventListener('orderrestro:session-lock', handleInactivityLock);
  }, [isSessionActive, setPinModalOpen]);

  const hasModuleAccessForStaff = useCallback(
    (moduleId: ModuleId, staff: StaffUser | null, isSupaAuth: boolean): boolean => {
      if (isSupaAuth && !staff) return true;
      if (!db || !staff) return false;
      const role = db.roles.find((r) => r.id === staff.roleId);
      if (!role) return false;
      if (role.permissions.includes('*')) return true;
      const required = MODULE_PERMISSIONS[moduleId] || [];
      if (required.length === 0) return true;
      return required.some((perm) => role.permissions.includes(perm));
    },
    [db]
  );

  const hasModuleAccess = useCallback(
    (moduleId: ModuleId): boolean => {
      if (!isSessionActive) return false;
      if (supabaseAuthenticated && !pinStaff && !activeStaff) return true;
      return hasModuleAccessForStaff(moduleId, activeStaff, supabaseAuthenticated);
    },
    [activeStaff, hasModuleAccessForStaff, isSessionActive, pinStaff, supabaseAuthenticated]
  );

  const activateOwnerSession = useCallback(
    (staff: StaffUser) => {
      sessionStorage.setItem(PIN_SESSION_STORAGE_KEY, staff.id);
      setPinStaffId(staff.id);
      setCurrentStaff(staff);
      setPinModalOpen(false);
    },
    [setCurrentStaff, setPinModalOpen]
  );

  const unlockWithPin = useCallback(
    async (pin: string): Promise<{ ok: boolean; error?: string; staff?: StaffUser }> => {
      try {
        const res = await fetch('/api/auth/pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin }),
        });
        const data = await res.json();
        if (!res.ok) {
          return { ok: false, error: data.error || 'Invalid PIN' };
        }
        const verifiedStaff = data.staff as StaffUser;
        sessionStorage.setItem(PIN_SESSION_STORAGE_KEY, verifiedStaff.id);
        setPinStaffId(verifiedStaff.id);
        setCurrentStaff(verifiedStaff);
        setPinModalOpen(false);
        return { ok: true, staff: verifiedStaff };
      } catch {
        return { ok: false, error: 'Unable to verify PIN right now' };
      }
    },
    [setCurrentStaff, setPinModalOpen]
  );

  const lockSession = useCallback(() => {
    sessionStorage.removeItem(PIN_SESSION_STORAGE_KEY);
    setPinStaffId(null);
    setCurrentStaff(null);
    setPinModalOpen(true);
    notify('Register locked — enter staff PIN or sign in', 'info');
  }, [notify, setCurrentStaff, setPinModalOpen]);

  const signOut = useCallback(async () => {
    sessionStorage.removeItem(PIN_SESSION_STORAGE_KEY);
    setPinStaffId(null);
    setCurrentStaff(null);
    setPinModalOpen(false);
    await supabaseSignOut();
  }, [setCurrentStaff, setPinModalOpen, supabaseSignOut]);

  return (
    <AuthProtectionContext.Provider
      value={{
        session,
        user,
        supabaseAuthenticated,
        pinSessionActive,
        isSessionActive,
        authLoading,
        authError,
        clearError,
        isSupabaseConfigured,
        activeStaff,
        signInWithGoogle,
        signInWithOtp,
        signInWithPassword,
        signUp,
        resendConfirmation,
        signOut,
        unlockWithPin,
        activateOwnerSession,
        lockSession,
        hasModuleAccess,
      }}
    >
      {children}
    </AuthProtectionContext.Provider>
  );
};

export function useAuthProtection() {
  const ctx = useContext(AuthProtectionContext);
  if (!ctx) {
    throw new Error('useAuthProtection must be used within AuthProtectionProvider');
  }
  return ctx;
}

interface AuthProtectionOptions {
  requireActiveModuleAccess?: boolean;
}

/**
 * Higher-Order Component that protects restaurant management routes and modules
 * using useAuth / AuthProtectionProvider and enforces role permissions.
 */
export function withAuthProtection<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options: AuthProtectionOptions = { requireActiveModuleAccess: true }
): React.FC<P> {
  const ProtectedComponent: React.FC<P> = (props) => {
    const { activeModule, setActiveModule, setPinModalOpen, setOnboardingOpen } = useApp();
    const { isSessionActive, authLoading, activeStaff, hasModuleAccess } = useAuthProtection();

    const firstAllowedModule = useMemo(() => {
      const candidates: ModuleId[] = ['dashboard', 'pos', 'kds', 'tables', 'inventory', 'menu', 'crm'];
      return candidates.find((m) => hasModuleAccess(m)) || 'pos';
    }, [hasModuleAccess]);

    if (authLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6] dark:bg-[#0C0A09] text-sm text-stone-500">
          Verifying UNAI POS session...
        </div>
      );
    }

    if (!isSessionActive) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6] dark:bg-[#0C0A09] p-6">
          <div className="max-w-sm w-full bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-2xl p-6 text-center space-y-4">
            <div className="w-11 h-11 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 flex items-center justify-center mx-auto">
              <Mail className="w-5 h-5 text-amber-700 dark:text-amber-400" />
            </div>
            <div className="space-y-1">
              <h2 className="font-display font-bold text-base text-stone-900 dark:text-stone-100">
                Sign In to UNAI POS
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Sign in with Gmail or your account credentials to access your brand dashboard and POS modules.
              </p>
            </div>
            <button
              onClick={() => setOnboardingOpen(true)}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <span>Continue to Sign In / Sign Up</span>
            </button>
          </div>
        </div>
      );
    }

    if (options.requireActiveModuleAccess && !hasModuleAccess(activeModule)) {
      return (
        <div className="max-w-md mx-auto my-12 bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-6 text-center space-y-4">
          <div className="w-11 h-11 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-5 h-5 text-amber-700 dark:text-amber-400" />
          </div>
          <div className="space-y-1">
            <h3 className="font-display font-bold text-base text-stone-900 dark:text-stone-100">
              Restricted Module Access
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Current operator <span className="font-semibold text-stone-700 dark:text-stone-200">{activeStaff?.name || 'Staff'}</span> ({activeStaff?.roleName || 'Restricted'}) does not have permission for this module.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setPinModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Switch Operator</span>
            </button>
            <button
              onClick={() => setActiveModule(firstAllowedModule)}
              className="px-4 py-2 rounded-lg border border-stone-200 dark:border-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900 whitespace-nowrap shrink-0"
            >
              Go to Authorized View
            </button>
          </div>
        </div>
      );
    }

    return <WrappedComponent {...props} />;
  };

  ProtectedComponent.displayName = `withAuthProtection(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;
  return ProtectedComponent;
}
