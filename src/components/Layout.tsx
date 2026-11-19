import React, { useState } from 'react';
import {
  LayoutGrid,
  UtensilsCrossed,
  ChefHat,
  BookOpen,
  Boxes,
  Truck,
  Users,
  UserCheck,
  Calculator,
  Wallet,
  Bike,
  QrCode,
  Building2,
  BarChart3,
  Megaphone,
  Wrench,
  FileText,
  ShieldCheck,
  Plug,
  Settings,
  Sun,
  Moon,
  Monitor,
  KeyRound,
  Lock,
  Menu,
  Store,
  Sparkles,
  X,
} from 'lucide-react';
import { ModuleId, useApp } from '../context/AppContext';
import { useAuthProtection } from '../context/AuthContext';
import { getContrastTextColor, hexToRgba } from '../utils/colorExtract';

interface NavGroup {
  label: string;
  items: { id: ModuleId; label: string; icon: React.FC<{ className?: string }> }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Front of House',
    items: [
      { id: 'dashboard', label: 'Brand Dashboard', icon: Sparkles },
      { id: 'pos', label: 'POS & Billing', icon: LayoutGrid },
      { id: 'tables', label: 'Tables & Floor', icon: UtensilsCrossed },
      { id: 'kds', label: 'Kitchen KDS', icon: ChefHat },
      { id: 'delivery', label: 'Delivery', icon: Bike },
      { id: 'online_qr', label: 'QR & Online', icon: QrCode },
    ],
  },
  {
    label: 'Catalog & Supply',
    items: [
      { id: 'menu', label: 'Menu Studio', icon: BookOpen },
      { id: 'inventory', label: 'Inventory & Costing', icon: Boxes },
      { id: 'procurement', label: 'Procurement', icon: Truck },
      { id: 'maintenance', label: 'Maintenance', icon: Wrench },
    ],
  },
  {
    label: 'People & Growth',
    items: [
      { id: 'crm', label: 'CRM & Loyalty', icon: Users },
      { id: 'staff', label: 'Staff & Payroll', icon: UserCheck },
      { id: 'marketing', label: 'Marketing', icon: Megaphone },
    ],
  },
  {
    label: 'Finance & Insights',
    items: [
      { id: 'accounting', label: 'Accounting', icon: Calculator },
      { id: 'finance', label: 'Finance & Budgets', icon: Wallet },
      { id: 'analytics', label: 'Analytics (18)', icon: BarChart3 },
      { id: 'branches', label: 'Branches', icon: Building2 },
    ],
  },
  {
    label: 'System & Admin',
    items: [
      { id: 'documents', label: 'Documents', icon: FileText },
      { id: 'security', label: 'Security & RBAC', icon: ShieldCheck },
      { id: 'integrations', label: 'Integrations & API', icon: Plug },
      { id: 'admin', label: 'Admin Panel', icon: Settings },
    ],
  },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    db,
    darkMode,
    toggleDarkMode,
    activeBranchId,
    setActiveBranchId,
    currentStaff,
    activeModule,
    setActiveModule,
    setPinModalOpen,
    setOnboardingOpen,
    toasts,
  } = useApp();
  const { user, lockSession } = useAuthProtection();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const openSecondScreen = () => {
    const url = `${window.location.origin}/?mode=display`;
    window.open(url, 'OrderRestroSecondScreen', 'noopener,noreferrer');
  };

  const currentLabel =
    NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === activeModule)?.label || 'Brand Dashboard';

  const brandName = db?.onboarding?.restaurantName || 'UNAI POS';
  const brandLogo = db?.onboarding?.brandLogo;
  const brandColor = db?.onboarding?.brandColor || '#B45309';
  const brandFg = getContrastTextColor(brandColor);

  return (
    <div className="min-h-screen flex bg-[#FAF9F6] text-[#1C1917] dark:bg-[#0C0A09] dark:text-[#F5F5F4] transition-colors duration-200">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 border-r border-stone-200 dark:border-stone-800 bg-white dark:bg-[#141210] no-print">
        <button
          type="button"
          onClick={() => setActiveModule('dashboard')}
          className="h-16 px-4 flex items-center gap-2.5 border-b border-stone-200 dark:border-stone-800 text-left hover:bg-stone-50 dark:hover:bg-stone-900/50 transition-colors"
        >
          {brandLogo ? (
            <img
              src={brandLogo}
              alt={brandName}
              className="w-8 h-8 rounded-lg object-contain bg-white border border-stone-200 p-0.5 shrink-0"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center font-display font-bold text-sm shrink-0"
              style={{ backgroundColor: brandColor, color: brandFg }}
            >
              {brandName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <span className="font-display text-base font-bold tracking-tight truncate">
            {brandName}
          </span>
        </button>

        <div className="p-3 border-b border-stone-200 dark:border-stone-800">
          <label className="block text-[11px] font-medium text-stone-500 dark:text-stone-400 mb-1 px-1">
            Active Branch
          </label>
          <select
            value={activeBranchId}
            onChange={(e) => setActiveBranchId(e.target.value)}
            className="w-full rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] px-2.5 py-2 text-xs font-medium text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-600"
          >
            {(db?.branches || []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.currencySymbol} · {b.taxRegime})
              </option>
            ))}
          </select>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-2.5 mb-1.5 text-[11px] font-semibold tracking-wide text-stone-400 dark:text-stone-500">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = activeModule === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveModule(item.id)}
                      style={
                        active
                          ? { backgroundColor: hexToRgba(brandColor, 0.14), color: brandColor }
                          : undefined
                      }
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'font-semibold'
                          : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-900 hover:text-stone-900 dark:hover:text-stone-100'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-stone-200 dark:border-stone-800 text-xs text-stone-500 dark:text-stone-400 flex items-center justify-between">
          <div className="truncate pr-2">
            <div className="font-medium text-stone-900 dark:text-stone-100 truncate">{currentStaff?.name || 'Operator'}</div>
            <div className="text-[11px] truncate">{user?.email || currentStaff?.roleName || 'Staff'}</div>
          </div>
          <button
            onClick={() => setPinModalOpen(true)}
            title="Switch Operator PIN"
            className="p-2 rounded-lg border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-900 transition-colors shrink-0"
          >
            <KeyRound className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
          <aside className="relative z-10 w-72 max-w-[85vw] bg-white dark:bg-[#141210] h-full flex flex-col border-r border-stone-200 dark:border-stone-800">
            <div className="h-14 px-4 flex items-center justify-between border-b border-stone-200 dark:border-stone-800">
              <div className="flex items-center gap-2 min-w-0">
                {brandLogo ? (
                  <img src={brandLogo} alt={brandName} className="w-6 h-6 rounded object-contain bg-white border border-stone-200 p-0.5 shrink-0" />
                ) : (
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center font-display font-bold text-xs shrink-0"
                    style={{ backgroundColor: brandColor, color: brandFg }}
                  >
                    {brandName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span className="font-display font-bold truncate">{brandName}</span>
              </div>
              <button onClick={() => setMobileNavOpen(false)} className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-900">
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-4">
              {NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <div className="px-2 mb-1 text-[11px] font-semibold text-stone-400">{group.label}</div>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = activeModule === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveModule(item.id);
                          setMobileNavOpen(false);
                        }}
                        style={
                          active
                            ? { backgroundColor: hexToRgba(brandColor, 0.14), color: brandColor }
                            : undefined
                        }
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium ${
                          active
                            ? 'font-semibold'
                            : 'text-stone-600 dark:text-stone-400'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Clean 3-Zone Top Bar */}
        <header className="h-16 px-4 lg:px-6 border-b border-stone-200 dark:border-stone-800 bg-white/90 dark:bg-[#141210]/90 backdrop-blur flex items-center justify-between gap-8 no-print">
          {/* Zone 1: Brand / Context */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-stone-200 dark:border-stone-800 shrink-0"
              aria-label="Open navigation"
            >
              <Menu className="w-4 h-4" />
            </button>
            <span className="font-display font-semibold text-base text-stone-900 dark:text-stone-100 whitespace-nowrap truncate">
              {currentLabel}
            </span>
          </div>

          {/* Zone 2: 4 Clean Quick-Switch Text Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-stone-600 dark:text-stone-400">
            <button
              onClick={() => setActiveModule('dashboard')}
              style={activeModule === 'dashboard' ? { color: brandColor } : undefined}
              className={`hover:text-stone-900 dark:hover:text-stone-100 transition-colors whitespace-nowrap shrink-0 ${
                activeModule === 'dashboard' ? 'underline underline-offset-4 font-semibold' : ''
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveModule('pos')}
              style={activeModule === 'pos' ? { color: brandColor } : undefined}
              className={`hover:text-stone-900 dark:hover:text-stone-100 transition-colors whitespace-nowrap shrink-0 ${
                activeModule === 'pos' ? 'underline underline-offset-4 font-semibold' : ''
              }`}
            >
              POS Register
            </button>
            <button
              onClick={() => setActiveModule('tables')}
              style={activeModule === 'tables' ? { color: brandColor } : undefined}
              className={`hover:text-stone-900 dark:hover:text-stone-100 transition-colors whitespace-nowrap shrink-0 ${
                activeModule === 'tables' ? 'underline underline-offset-4 font-semibold' : ''
              }`}
            >
              Floor Plan
            </button>
            <button
              onClick={() => setActiveModule('kds')}
              style={activeModule === 'kds' ? { color: brandColor } : undefined}
              className={`hover:text-stone-900 dark:hover:text-stone-100 transition-colors whitespace-nowrap shrink-0 ${
                activeModule === 'kds' ? 'underline underline-offset-4 font-semibold' : ''
              }`}
            >
              Kitchen KDS
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setActiveModule('pos')}
              style={{ backgroundColor: brandColor, color: brandFg }}
              className="px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-95 whitespace-nowrap shrink-0"
            >
              New Order
            </button>
          </div>
        </header>

        {/* Workspace Sub-Toolbar (Theme Toggle, Second Screen, PIN Switch) */}
        <div className="px-4 lg:px-6 py-2 border-b border-stone-200/80 dark:border-stone-800/80 bg-[#FAF9F6] dark:bg-[#0C0A09] flex flex-wrap items-center justify-between gap-3 text-xs no-print">
          <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400">
            <span>{db?.branches.find((b) => b.id === activeBranchId)?.name || 'Branch'}</span>
            <span aria-hidden="true">·</span>
            <span>{db?.branches.find((b) => b.id === activeBranchId)?.taxRegime || 'IN_GST'}</span>
            <span aria-hidden="true">·</span>
            <span>Operator: {currentStaff?.name || 'Admin'}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setOnboardingOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#171412] text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900 whitespace-nowrap shrink-0"
            >
              <Store className="w-3.5 h-3.5" />
              <span>Setup</span>
            </button>
            <button
              onClick={openSecondScreen}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#171412] text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900 whitespace-nowrap shrink-0"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Second Screen</span>
            </button>
            <button
              onClick={() => setPinModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#171412] text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900 whitespace-nowrap shrink-0"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Switch PIN</span>
            </button>
            <button
              onClick={lockSession}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#171412] text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900 whitespace-nowrap shrink-0"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Lock</span>
            </button>
            <button
              onClick={toggleDarkMode}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#171412] text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900 whitespace-nowrap shrink-0"
              aria-label="Toggle dark mode"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{darkMode ? 'Light' : 'Dark'}</span>
            </button>
          </div>
        </div>

        {/* Main Viewport */}
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">{children}</main>
      </div>

      {/* Live Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm no-print">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-lg border text-xs font-medium shadow-sm ${
              t.tone === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100'
                : t.tone === 'warning'
                ? 'bg-amber-50 dark:bg-amber-950/90 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100'
                : t.tone === 'error'
                ? 'bg-red-50 dark:bg-red-950/90 border-red-200 dark:border-red-800 text-red-900 dark:text-red-100'
                : 'bg-white dark:bg-[#171412] border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
};
