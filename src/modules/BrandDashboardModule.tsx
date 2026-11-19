import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  ChefHat,
  CloudCheck,
  LayoutGrid,
  Palette,
  RefreshCw,
  ShieldCheck,
  UtensilsCrossed,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuthProtection } from '../context/AuthContext';
import { getContrastTextColor, hexToRgba } from '../utils/colorExtract';
import { formatMoney } from '../utils/taxEngine';

export const BrandDashboardModule: React.FC = () => {
  const { db, activeBranch, activeBranchId, setActiveModule, setOnboardingOpen, notify } = useApp();
  const { user, supabaseAuthenticated } = useAuthProtection();
  const [syncing, setSyncing] = useState(false);

  const onboarding = db?.onboarding;
  const brandName = onboarding?.restaurantName || activeBranch?.name || 'UNAI POS';
  const brandLogo = onboarding?.brandLogo || '';
  const brandColor = onboarding?.brandColor || '#B45309';
  const brandFg = getContrastTextColor(brandColor);
  const sym = activeBranch?.currencySymbol || '₹';

  const metrics = useMemo(() => {
    const branchOrders = (db?.orders || []).filter(
      (o) => o.branchId === activeBranchId && o.status !== 'voided'
    );
    const revenue = branchOrders.reduce((sum, o) => sum + o.grandTotal, 0);
    const openBills = branchOrders.filter(
      (o) => o.status !== 'paid' && o.status !== 'refunded'
    ).length;
    const branchTables = (db?.tables || []).filter((t) => t.branchId === activeBranchId);
    const activeTables = branchTables.filter((t) => t.status !== 'free').length;
    const activeKots = (db?.kots || []).filter(
      (k) => k.branchId === activeBranchId && k.status !== 'served'
    ).length;

    return {
      revenue,
      orderCount: branchOrders.length,
      openBills,
      activeTables,
      totalTables: branchTables.length,
      activeKots,
      menuCount: (db?.menuItems || []).filter((m) => m.available).length,
    };
  }, [db, activeBranchId]);

  const handleBackupSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/supabase/sync', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.ok) {
        notify('Cloud backup synced to Supabase', 'success');
      } else {
        notify(data.message || 'Local backup up to date; run supabase/schema.sql for cloud table sync', 'info');
      }
    } catch {
      notify('Unable to reach backup endpoint', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const quickActions = [
    {
      id: 'pos' as const,
      title: 'POS & Billing',
      desc: 'Ring up dine-in, takeaway, pickup & UPI QR checkout',
      icon: LayoutGrid,
      primary: true,
    },
    {
      id: 'tables' as const,
      title: 'Floor & Tables',
      desc: `${metrics.activeTables} of ${metrics.totalTables} tables active`,
      icon: UtensilsCrossed,
    },
    {
      id: 'kds' as const,
      title: 'Kitchen KDS',
      desc: `${metrics.activeKots} active kitchen tickets`,
      icon: ChefHat,
    },
    {
      id: 'menu' as const,
      title: 'Menu Studio',
      desc: `${metrics.menuCount} live dishes configured`,
      icon: BookOpen,
    },
    {
      id: 'analytics' as const,
      title: 'Analytics & Reports',
      desc: '18 operational & GST reports',
      icon: BarChart3,
    },
  ];

  const backupEmail = user?.email || onboarding?.ownerEmail;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Brand Identity Hero Banner themed dynamically with brandColor & brandLogo */}
      <div
        className="rounded-2xl border p-6 sm:p-8 bg-white dark:bg-[#171412] flex flex-col md:flex-row md:items-center md:justify-between gap-6 transition-colors"
        style={{
          borderColor: hexToRgba(brandColor, 0.3),
          backgroundImage: `linear-gradient(135deg, ${hexToRgba(brandColor, 0.08)} 0%, transparent 55%)`,
        }}
      >
        <div className="flex items-center gap-4 min-w-0">
          {brandLogo ? (
            <img
              src={brandLogo}
              alt={`${brandName} logo`}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-contain bg-white border border-stone-200 dark:border-stone-700 p-2 shrink-0 shadow-sm"
            />
          ) : (
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center font-display font-bold text-2xl shrink-0 shadow-sm"
              style={{ backgroundColor: brandColor, color: brandFg }}
            >
              {brandName.slice(0, 1).toUpperCase()}
            </div>
          )}

          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-stone-500 dark:text-stone-400">
              <span className="inline-flex items-center gap-1 font-semibold" style={{ color: brandColor }}>
                <Palette className="w-3 h-3" />
                <span>{brandColor}</span>
              </span>
              {onboarding?.isGstRegistered && (onboarding.gstin || activeBranch?.gstin) && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-stone-700 dark:text-stone-300">
                    GSTIN {onboarding.gstin || activeBranch?.gstin}
                  </span>
                </>
              )}
              {onboarding?.ownerName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Owner: {onboarding.ownerName}</span>
                </>
              )}
            </div>

            <h1 className="font-display font-bold text-2xl sm:text-3xl tracking-tight text-stone-900 dark:text-stone-50 truncate">
              {brandName}
            </h1>

            <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
              {activeBranch?.city || 'Flagship Branch'} · {activeBranch?.taxRegime || 'IN_GST'} ·{' '}
              {onboarding?.ownerContact || activeBranch?.phone || 'POS Ready'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setOnboardingOpen(true)}
            className="px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#141210] text-xs font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-900 whitespace-nowrap shrink-0"
          >
            Edit Brand &amp; Theme
          </button>
          <button
            type="button"
            onClick={() => setActiveModule('pos')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold transition-opacity hover:opacity-95 whitespace-nowrap shrink-0 shadow-sm"
            style={{ backgroundColor: brandColor, color: brandFg }}
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Open POS Register</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Key Operational Metrics & Backup Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-1">
          <div className="text-xs text-stone-500 dark:text-stone-400">Gross Sales</div>
          <div
            className="font-mono font-bold text-2xl tabular-nums"
            style={{ color: brandColor }}
          >
            {formatMoney(metrics.revenue, sym)}
          </div>
          <div className="text-[11px] text-stone-500">{metrics.orderCount} orders recorded</div>
        </div>

        <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-1">
          <div className="text-xs text-stone-500 dark:text-stone-400">Active Open Bills</div>
          <div className="font-mono font-bold text-2xl tabular-nums text-stone-900 dark:text-stone-100">
            {metrics.openBills}
          </div>
          <div className="text-[11px] text-stone-500">{metrics.activeKots} KOTs in kitchen</div>
        </div>

        <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-1">
          <div className="text-xs text-stone-500 dark:text-stone-400">Floor Occupancy</div>
          <div className="font-mono font-bold text-2xl tabular-nums text-stone-900 dark:text-stone-100">
            {metrics.activeTables}/{metrics.totalTables}
          </div>
          <div className="text-[11px] text-stone-500">Tables currently seated</div>
        </div>

        <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 flex flex-col justify-between gap-2">
          <div>
            <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
              <span>Gmail Cloud Backup</span>
              {supabaseAuthenticated ? (
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              ) : (
                <CloudCheck className="w-4 h-4 text-stone-400" />
              )}
            </div>
            <div className="font-semibold text-xs text-stone-900 dark:text-stone-100 truncate mt-1">
              {backupEmail || 'Local Terminal Backup'}
            </div>
          </div>
          <button
            type="button"
            disabled={syncing}
            onClick={handleBackupSync}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 text-[11px] font-semibold hover:bg-stone-50 dark:hover:bg-stone-900 w-full whitespace-nowrap"
          >
            <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing...' : 'Sync Backup Now'}</span>
          </button>
        </div>
      </div>

      {/* Quick Navigation Modules */}
      <div className="space-y-3">
        <h2 className="font-display font-semibold text-sm text-stone-800 dark:text-stone-200">
          Workspace Launchpad
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickActions.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setActiveModule(card.id)}
                className="text-left bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 hover:border-stone-300 dark:hover:border-stone-700 transition-all flex items-start justify-between gap-4 group"
                style={card.primary ? { borderColor: hexToRgba(brandColor, 0.45) } : undefined}
              >
                <div className="space-y-1.5 min-w-0">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{
                      backgroundColor: card.primary ? brandColor : hexToRgba(brandColor, 0.12),
                      color: card.primary ? brandFg : brandColor,
                    }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="font-display font-bold text-sm text-stone-900 dark:text-stone-100">
                    {card.title}
                  </div>
                  <div className="text-xs text-stone-500 dark:text-stone-400">{card.desc}</div>
                </div>
                <ArrowRight className="w-4 h-4 text-stone-400 group-hover:translate-x-0.5 transition-transform shrink-0 mt-1" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
