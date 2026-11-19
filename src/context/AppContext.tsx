import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppDatabase, Branch, Order, StaffUser, TenderMethod } from '../types/pos';
import { playKitchenAlertChime, playUpiSuccessChime } from '../utils/hardware';

export type ModuleId =
  | 'dashboard'
  | 'pos'
  | 'tables'
  | 'kds'
  | 'menu'
  | 'inventory'
  | 'procurement'
  | 'crm'
  | 'staff'
  | 'accounting'
  | 'finance'
  | 'delivery'
  | 'online_qr'
  | 'branches'
  | 'analytics'
  | 'marketing'
  | 'maintenance'
  | 'documents'
  | 'security'
  | 'integrations'
  | 'admin';

export interface SecondScreenPayload {
  branchName: string;
  currencySymbol: string;
  items: { name: string; quantity: number; lineTotal: number; modifiers?: string[] }[];
  subtotal: number;
  discount: number;
  taxTotal: number;
  grandTotal: number;
  upiUri?: string;
  orderNumber?: string;
  status: 'idle' | 'ringing' | 'awaiting_upi' | 'paid';
}

interface ToastItem {
  id: string;
  message: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}

interface AppContextValue {
  db: AppDatabase | null;
  loading: boolean;
  darkMode: boolean;
  toggleDarkMode: () => void;
  activeBranchId: string;
  setActiveBranchId: (id: string) => void;
  activeBranch: Branch | null;
  currentStaff: StaffUser | null;
  setCurrentStaff: (s: StaffUser | null) => void;
  activeModule: ModuleId;
  setActiveModule: (m: ModuleId) => void;
  toasts: ToastItem[];
  notify: (message: string, tone?: ToastItem['tone']) => void;
  refreshState: () => Promise<void>;
  mutate: (type: string, payload: unknown) => Promise<AppDatabase | null>;
  createOrder: (input: Record<string, unknown>) => Promise<{ order?: Order; duplicate?: boolean; error?: string }>;
  payOrder: (
    orderId: string,
    payments: { method: TenderMethod; amount: number; reference?: string }[],
    tipAmount?: number
  ) => Promise<Order | null>;
  broadcastSecondScreen: (payload: SecondScreenPayload) => void;
  pinModalOpen: boolean;
  setPinModalOpen: (v: boolean) => void;
  onboardingOpen: boolean;
  setOnboardingOpen: (v: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<AppDatabase | null>(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('orderrestro_theme');
    return saved === 'dark';
  });
  const [activeBranchId, setActiveBranchId] = useState<string>('br-blr-1');
  const [currentStaff, setCurrentStaff] = useState<StaffUser | null>(null);
  const [activeModule, setActiveModule] = useState<ModuleId>('pos');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpenState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('mode') === 'onboarding';
  });

  const bcRef = useRef<BroadcastChannel | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const checkedOnboardingRef = useRef<boolean>(false);

  const setOnboardingOpen = useCallback((v: boolean) => {
    setOnboardingOpenState(v);
    if (!v && typeof window !== 'undefined') {
      sessionStorage.setItem('orderrestro_onboarding_dismissed', '1');
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('orderrestro_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => !prev);
  }, []);

  const notify = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  const refreshState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error('Failed to load state');
      const data = (await res.json()) as AppDatabase;
      setDb(data);
      setCurrentStaff((prev) => {
        if (prev) {
          return data.staff.find((s) => s.id === prev.id) || null;
        }
        return null;
      });
      setActiveBranchId((prev) => (data.branches.some((b) => b.id === prev) ? prev : data.branches[0]?.id || 'br-blr-1'));
      if (!checkedOnboardingRef.current) {
        checkedOnboardingRef.current = true;
        const dismissed = typeof window !== 'undefined' && sessionStorage.getItem('orderrestro_onboarding_dismissed') === '1';
        const urlMode = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('mode') : null;
        if (urlMode === 'onboarding' || (!data.onboarding?.completed && !dismissed)) {
          setOnboardingOpenState(true);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  // BroadcastChannel for Customer Second Screen mirroring
  useEffect(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      bcRef.current = new BroadcastChannel('orderrestro_second_screen');
    }
    return () => bcRef.current?.close();
  }, []);

  const broadcastSecondScreen = useCallback((payload: SecondScreenPayload) => {
    localStorage.setItem('orderrestro_second_screen_state', JSON.stringify(payload));
    bcRef.current?.postMessage(payload);
  }, []);

  // WebSocket live connection with automatic reconnect
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let closed = false;

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.event === 'sync:connected') return;
          if (msg.event === 'table:alert') {
            playKitchenAlertChime();
            const label = msg.payload?.type === 'bill' ? 'Bill requested at table' : 'Waiter called at table';
            notify(label, 'warning');
          } else if (msg.event === 'kot:created') {
            playKitchenAlertChime();
          } else if (msg.event === 'order:updated' && msg.payload?.order?.status === 'paid') {
            playUpiSuccessChime();
          }
          refreshState();
        } catch {
          // Ignore malformed frame
        }
      };
      ws.onclose = () => {
        if (!closed) {
          reconnectTimer = window.setTimeout(connect, 2500);
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [notify, refreshState]);

  // Session expiry inactivity tracker
  useEffect(() => {
    const bump = () => {
      lastActivityRef.current = Date.now();
    };
    window.addEventListener('pointerdown', bump);
    window.addEventListener('keydown', bump);
    const timer = window.setInterval(() => {
      const mins = db?.securitySettings?.sessionTimeoutMinutes || 30;
      if (Date.now() - lastActivityRef.current > mins * 60 * 1000) {
        window.dispatchEvent(new CustomEvent('orderrestro:session-lock'));
        setPinModalOpen(true);
        lastActivityRef.current = Date.now();
      }
    }, 30000);
    return () => {
      window.removeEventListener('pointerdown', bump);
      window.removeEventListener('keydown', bump);
      clearInterval(timer);
    };
  }, [db?.securitySettings?.sessionTimeoutMinutes]);

  const mutate = useCallback(
    async (type: string, payload: unknown): Promise<AppDatabase | null> => {
      try {
        const res = await fetch('/api/mutate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, payload, actorName: currentStaff?.name || 'Admin' }),
        });
        const data = await res.json();
        if (!res.ok) {
          notify(data.error || 'Action failed', 'error');
          return null;
        }
        setDb(data.state);
        return data.state;
      } catch {
        notify('Network error saving changes', 'error');
        return null;
      }
    },
    [currentStaff?.name, notify]
  );

  const createOrder = useCallback(
    async (input: Record<string, unknown>) => {
      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            branchId: activeBranchId,
            staffId: currentStaff?.id,
            staffName: currentStaff?.name,
            ...input,
          }),
        });
        const data = await res.json();
        if (!res.ok) return { error: data.error || 'Order failed' };
        if (data.state) setDb(data.state);
        return { order: data.order, duplicate: data.duplicate };
      } catch {
        return { error: 'Network error submitting order' };
      }
    },
    [activeBranchId, currentStaff?.id, currentStaff?.name]
  );

  const payOrder = useCallback(
    async (
      orderId: string,
      payments: { method: TenderMethod; amount: number; reference?: string }[],
      tipAmount?: number
    ): Promise<Order | null> => {
      try {
        const res = await fetch(`/api/orders/${orderId}/pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payments, tipAmount }),
        });
        const data = await res.json();
        if (!res.ok) {
          notify(data.error || 'Payment failed', 'error');
          return null;
        }
        if (data.state) setDb(data.state);
        return data.order;
      } catch {
        notify('Payment request failed', 'error');
        return null;
      }
    },
    [notify]
  );

  const activeBranch = useMemo(() => {
    if (!db) return null;
    return db.branches.find((b) => b.id === activeBranchId) || db.branches[0] || null;
  }, [db, activeBranchId]);

  return (
    <AppContext.Provider
      value={{
        db,
        loading,
        darkMode,
        toggleDarkMode,
        activeBranchId,
        setActiveBranchId,
        activeBranch,
        currentStaff,
        setCurrentStaff,
        activeModule,
        setActiveModule,
        toasts,
        notify,
        refreshState,
        mutate,
        createOrder,
        payOrder,
        broadcastSecondScreen,
        pinModalOpen,
        setPinModalOpen,
        onboardingOpen,
        setOnboardingOpen,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
