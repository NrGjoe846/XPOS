import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProtectionProvider, useAuthProtection, withAuthProtection } from './context/AuthContext';
import { Layout } from './components/Layout';
import { OnboardingPage } from './components/OnboardingPage';
import { PinLoginModal } from './components/PinLoginModal';
import { BrandDashboardModule } from './modules/BrandDashboardModule';
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

const ModuleContent: React.FC = () => {
  const { activeModule } = useApp();

  switch (activeModule) {
    case 'dashboard':
      return <BrandDashboardModule />;
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

const ProtectedModuleContent = withAuthProtection(ModuleContent, { requireActiveModuleAccess: true });

const WorkspaceShell: React.FC = () => {
  return (
    <Layout>
      <ProtectedModuleContent />
    </Layout>
  );
};

const ProtectedWorkspace = withAuthProtection(WorkspaceShell, { requireActiveModuleAccess: false });

const MainRouter: React.FC = () => {
  const { db, loading, onboardingOpen, setOnboardingOpen } = useApp();
  const { isSessionActive, authLoading } = useAuthProtection();

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

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6] dark:bg-[#0C0A09] text-sm text-stone-500">
        Loading UNAI POS workspace...
      </div>
    );
  }

  const exitOnboarding = () => {
    setOnboardingOpen(false);
    if (typeof window !== 'undefined' && window.location.search.includes('mode=onboarding')) {
      window.history.replaceState({}, '', '/');
    }
  };

  if (!isSessionActive || onboardingOpen) {
    const initialMode = !isSessionActive && db?.onboarding?.completed ? 'signin' : 'onboarding';
    return (
      <OnboardingPage
        initialMode={initialMode}
        onCompleteToDashboard={exitOnboarding}
      />
    );
  }

  return (
    <>
      <ProtectedWorkspace />
      <PinLoginModal />
    </>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AuthProtectionProvider>
        <MainRouter />
      </AuthProtectionProvider>
    </AppProvider>
  );
}
