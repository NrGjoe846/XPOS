import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Layout } from './components/Layout';
import { PosBillingModule } from './modules/PosBillingModule';
import { TablesReservationsModule } from './modules/TablesReservationsModule';
import { KitchenKdsModule } from './modules/KitchenKdsModule';
import { MenuManagementModule } from './modules/MenuManagementModule';
import { InventoryProductionModule } from './modules/InventoryProductionModule';
import { ProcurementModule } from './modules/ProcurementModule';
import { CrmLoyaltyModule } from './modules/CrmLoyaltyModule';
import { StaffPayrollModule } from './modules/StaffPayrollModule';
import { AccountingFinanceModule } from './modules/AccountingFinanceModule';
import { DeliveryModule } from './modules/DeliveryModule';
import { OnlineOrderingPortal } from './modules/OnlineOrderingPortal';
import { SecondScreenDisplay } from './modules/SecondScreenDisplay';
import { BranchesAnalyticsModule } from './modules/BranchesAnalyticsModule';
import { MarketingMaintenanceDocsModule } from './modules/MarketingMaintenanceDocsModule';
import { SecurityIntegrationsAdminModule } from './modules/SecurityIntegrationsAdminModule';

const PinLoginModal: React.FC = () => {
  const { pinModalOpen, setPinModalOpen, setCurrentStaff, notify } = useApp();
  const [pin, setPin] = useState('');

  if (!pinModalOpen) return null;

  const submitPin = async (code: string) => {
    const res = await fetch('/api/auth/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: code }),
    });
    const data = await res.json();
    if (!res.ok) {
      notify(data.error || 'Invalid PIN', 'error');
      setPin('');
      return;
    }
    setCurrentStaff(data.staff);
    setPin('');
    setPinModalOpen(false);
    notify(`Switched operator to ${data.staff.name} (${data.staff.roleName})`, 'success');
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl max-w-xs w-full p-6 space-y-4 text-center">
        <h3 className="font-display font-bold text-base">Quick Operator PIN Switch</h3>
        <p className="text-xs text-stone-500">Demo PINs: 1111 (Owner), 2222 (Manager), 3333 (Cashier), 4444 (Chef)</p>
        <input
          type="password"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="••••"
          className="w-full text-center tracking-[0.5em] font-mono text-xl py-2.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
        />
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0', 'Unlock'].map((k) => (
            <button
              key={k}
              onClick={() => {
                if (k === 'Clear') setPin('');
                else if (k === 'Unlock') submitPin(pin);
                else setPin((p) => (p.length < 6 ? p + k : p));
              }}
              className={`py-2.5 rounded-lg border text-xs font-semibold ${
                k === 'Unlock'
                  ? 'bg-amber-700 text-white border-amber-700'
                  : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-900'
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <button onClick={() => setPinModalOpen(false)} className="text-xs text-stone-400 hover:text-stone-700">
          Dismiss
        </button>
      </div>
    </div>
  );
};

const MainRouter: React.FC = () => {
  const { loading, activeModule } = useApp();

  const urlMode = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('mode') : null;
  if (urlMode === 'display') {
    return <SecondScreenDisplay />;
  }
  if (urlMode === 'qr') {
    return (
      <div className="min-h-screen bg-[#FAF9F6] dark:bg-[#0C0A09] p-4 sm:p-6">
        <OnlineOrderingPortal />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6] dark:bg-[#0C0A09] text-sm text-stone-500">
        Loading Nodedr OrderRestro workspace...
      </div>
    );
  }

  const renderModule = () => {
    switch (activeModule) {
      case 'pos':
        return <PosBillingModule />;
      case 'tables':
        return <TablesReservationsModule />;
      case 'kds':
        return <KitchenKdsModule />;
      case 'menu':
        return <MenuManagementModule />;
      case 'inventory':
        return <InventoryProductionModule />;
      case 'procurement':
        return <ProcurementModule />;
      case 'crm':
        return <CrmLoyaltyModule />;
      case 'staff':
        return <StaffPayrollModule />;
      case 'accounting':
        return <AccountingFinanceModule initialTab="cash" />;
      case 'finance':
        return <AccountingFinanceModule initialTab="expenses" />;
      case 'delivery':
        return <DeliveryModule />;
      case 'online_qr':
        return <OnlineOrderingPortal />;
      case 'branches':
        return <BranchesAnalyticsModule initialView="branches" />;
      case 'analytics':
        return <BranchesAnalyticsModule initialView="analytics" />;
      case 'marketing':
        return <MarketingMaintenanceDocsModule initialTab="marketing" />;
      case 'maintenance':
        return <MarketingMaintenanceDocsModule initialTab="maintenance" />;
      case 'documents':
        return <MarketingMaintenanceDocsModule initialTab="documents" />;
      case 'security':
        return <SecurityIntegrationsAdminModule initialTab="security" />;
      case 'integrations':
        return <SecurityIntegrationsAdminModule initialTab="integrations" />;
      case 'admin':
        return <SecurityIntegrationsAdminModule initialTab="admin" />;
      default:
        return <PosBillingModule />;
    }
  };

  return (
    <Layout>
      {renderModule()}
      <PinLoginModal />
    </Layout>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainRouter />
    </AppProvider>
  );
}
