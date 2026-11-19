import React, { useState } from 'react';
import { ShieldCheck, Plug, Settings, Volume2, Printer, Send, Terminal, Download, Upload } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuthProtection } from '../context/AuthContext';
import { TaxRegime } from '../types/pos';
import { downloadJson } from '../utils/export';
import { kickCashDrawerWebUSB, playUpiSuccessChime, printViaWebUSB } from '../utils/hardware';
import { getRegimeDisplayLabel } from '../utils/taxEngine';

const ALL_PERMS = [
  'pos.bill',
  'pos.refund',
  'pos.void',
  'tables.manage',
  'kds.view',
  'menu.edit',
  'inventory.manage',
  'procurement.approve',
  'crm.manage',
  'staff.payroll',
  'accounting.view',
  'analytics.export',
  'marketing.send',
];

export const SecurityIntegrationsAdminModule: React.FC<{ initialTab?: 'security' | 'integrations' | 'admin' }> = ({
  initialTab = 'security',
}) => {
  const { db, activeBranch, currentStaff, mutate, refreshState, notify, setPinModalOpen } = useApp();
  const {
    user,
    supabaseAuthenticated: isAuthenticated,
    authLoading,
    authError,
    signInWithPassword,
    signUp,
    signOut,
  } = useAuthProtection();
  const [tab, setTab] = useState<'security' | 'integrations' | 'admin'>(initialTab);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');

  // 2FA verification test
  const [twoFaCode, setTwoFaCode] = useState('');

  // Webhook & REST / MCP Explorer
  const [whUrl, setWhUrl] = useState('https://hooks.example.com/pos');
  const [apiEndpoint, setApiEndpoint] = useState('/api/openapi.json');
  const [apiResponse, setApiResponse] = useState('');
  const [mcpTool, setMcpTool] = useState('get_live_sales_summary');
  const [mcpResponse, setMcpResponse] = useState('');

  // Branch admin settings
  const [branchName, setBranchName] = useState(activeBranch?.name || '');
  const [taxRegime, setTaxRegime] = useState<TaxRegime>(activeBranch?.taxRegime || 'IN_GST');
  const [upiVpa, setUpiVpa] = useState(activeBranch?.upiVpa || 'orderrestro@hdfcbank');
  const [upiName, setUpiName] = useState(activeBranch?.upiMerchantName || 'Nodedr OrderRestro');

  const verify2FA = async () => {
    if (!currentStaff) return;
    const res = await fetch('/api/auth/verify-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: currentStaff.id, code: twoFaCode }),
    });
    const d = await res.json();
    if (res.ok) notify(`2FA verified via ${d.method}`, 'success');
    else notify(d.error || 'Verification failed', 'error');
  };

  const runApiExplorer = async () => {
    const res = await fetch(apiEndpoint);
    const json = await res.json();
    setApiResponse(JSON.stringify(json, null, 2));
  };

  const runMcpTool = async () => {
    const res = await fetch('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: mcpTool, arguments: { branchId: activeBranch?.id, query: 'Dosa' } },
      }),
    });
    const json = await res.json();
    setMcpResponse(JSON.stringify(json, null, 2));
  };

  const handleBackupRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        await mutate('restore_backup', parsed);
        await refreshState();
        notify('Full database backup restored', 'success');
      } catch {
        notify('Invalid JSON backup file', 'error');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1 p-1 bg-stone-100 dark:bg-stone-900 rounded-lg w-fit text-xs">
        <button
          onClick={() => setTab('security')}
          className={`px-3 py-1.5 rounded-md font-semibold ${tab === 'security' ? 'bg-white dark:bg-[#171412] shadow-sm' : 'text-stone-500'}`}
        >
          Security, 2FA & Audit
        </button>
        <button
          onClick={() => setTab('integrations')}
          className={`px-3 py-1.5 rounded-md font-semibold ${tab === 'integrations' ? 'bg-white dark:bg-[#171412] shadow-sm' : 'text-stone-500'}`}
        >
          Hardware, Webhooks, Swagger & MCP
        </button>
        <button
          onClick={() => setTab('admin')}
          className={`px-3 py-1.5 rounded-md font-semibold ${tab === 'admin' ? 'bg-white dark:bg-[#171412] shadow-sm' : 'text-stone-500'}`}
        >
          Admin Panel & RBAC
        </button>
      </div>

      {tab === 'security' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-3 text-xs">
              <h3 className="font-display font-semibold text-sm">Supabase Account Session</h3>
              {isAuthenticated && user ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate">
                    <div className="font-semibold truncate">{user.email}</div>
                    <div className="text-stone-500">Signed in</div>
                  </div>
                  <button
                    onClick={async () => {
                      await signOut();
                      notify('Signed out of Supabase session', 'info');
                    }}
                    disabled={authLoading}
                    className="px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 font-semibold shrink-0"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="email"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="Email"
                      className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
                    />
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="Password"
                      className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
                    />
                  </div>
                  {authError && <div className="text-red-600">{authError}</div>}
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        const res = await signInWithPassword(authEmail, authPassword);
                        if (!res.error) notify('Signed in via Supabase Auth', 'success');
                      }}
                      disabled={authLoading}
                      className="px-3 py-1.5 rounded-lg bg-amber-700 text-white font-semibold"
                    >
                      Sign In
                    </button>
                    <button
                      onClick={async () => {
                        const res = await signUp(authEmail, authPassword);
                        if (!res.error) notify('Account created — check inbox if confirmation is enabled', 'success');
                      }}
                      disabled={authLoading}
                      className="px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 font-semibold"
                    >
                      Register
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-3 text-xs">
              <h3 className="font-display font-semibold text-sm inline-flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-700" /> Two-Factor Auth & Recovery Codes
              </h3>
              <div className="flex items-center justify-between">
                <span>Operator: {currentStaff?.name}</span>
                <button
                  onClick={() => currentStaff && mutate('toggle_2fa', { staffId: currentStaff.id })}
                  className="px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 font-semibold"
                >
                  {currentStaff?.twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA'}
                </button>
              </div>
              {currentStaff?.twoFactorEnabled && (
                <div className="p-3 rounded-lg bg-[#FAF9F6] dark:bg-[#12100E] border border-stone-200 dark:border-stone-800 space-y-2">
                  <div>Recovery Codes (single-use):</div>
                  <div className="font-mono text-[11px] flex flex-wrap gap-2">
                    {currentStaff.recoveryCodes.map((c) => (
                      <span key={c} className="px-2 py-0.5 rounded bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800">
                        {c}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <input
                      value={twoFaCode}
                      onChange={(e) => setTwoFaCode(e.target.value)}
                      placeholder="6-digit TOTP or recovery code"
                      className="flex-1 px-2.5 py-1.5 rounded border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#171412] font-mono"
                    />
                    <button onClick={verify2FA} className="px-3 py-1.5 rounded bg-amber-700 text-white font-semibold">
                      Verify
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-3 text-xs">
              <h3 className="font-display font-semibold text-sm">Backup, Restore & Session Expiry</h3>
              <div className="flex items-center justify-between">
                <span>Auto-Lock Timeout (minutes)</span>
                <input
                  type="number"
                  value={db?.securitySettings.sessionTimeoutMinutes || 30}
                  onChange={(e) => mutate('update_security_settings', { sessionTimeoutMinutes: Number(e.target.value) })}
                  className="w-20 px-2 py-1 rounded border border-stone-200 dark:border-stone-800 font-mono text-right"
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => downloadJson(`orderrestro-backup-${Date.now()}.json`, db)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 font-medium"
                >
                  <Download className="w-3.5 h-3.5" /> Export Backup JSON
                </button>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 font-medium cursor-pointer">
                  <Upload className="w-3.5 h-3.5" /> Restore JSON
                  <input type="file" accept=".json" onChange={handleBackupRestore} className="hidden" />
                </label>
                <button
                  onClick={() => setPinModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-semibold"
                >
                  Lock Terminal (PIN)
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-3">
            <h3 className="font-display font-semibold text-sm">Immutable Security Audit Log</h3>
            <div className="max-h-96 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800 text-xs">
              {(db?.auditLogs || []).map((log) => (
                <div key={log.id} className="py-2.5 flex justify-between gap-4">
                  <div>
                    <div className="font-mono font-semibold text-amber-800 dark:text-amber-300">
                      {log.action} · {log.target}
                    </div>
                    <div className="text-stone-500">
                      {log.actorName} — {log.details}
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-stone-400 shrink-0">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'integrations' && (
        <div className="space-y-6">
          {/* Hardware & Peripheral Triggers */}
          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-3">
            <h3 className="font-display font-semibold text-sm inline-flex items-center gap-2">
              <Plug className="w-4 h-4 text-amber-700" /> Hardware Peripherals, Audio Chime & Second Screen
            </h3>
            <div className="flex flex-wrap gap-2.5 text-xs">
              <button
                onClick={() => {
                  playUpiSuccessChime();
                  notify('Played UPI payment-received audio chime', 'success');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-stone-200 dark:border-stone-800 font-medium"
              >
                <Volume2 className="w-3.5 h-3.5 text-emerald-700" /> Test UPI Payment Chime
              </button>
              <button
                onClick={async () => {
                  const r = await printViaWebUSB('NODEDR ORDERRESTRO\nTEST ESC/POS THERMAL RECEIPT\nOK\n', true);
                  notify(r.message, r.ok ? 'success' : 'info');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-stone-200 dark:border-stone-800 font-medium"
              >
                <Printer className="w-3.5 h-3.5 text-amber-700" /> Pair WebUSB ESC/POS Printer
              </button>
              <button
                onClick={async () => {
                  const r = await kickCashDrawerWebUSB();
                  notify(r.message, r.ok ? 'success' : 'info');
                }}
                className="px-3.5 py-2 rounded-lg border border-stone-200 dark:border-stone-800 font-medium"
              >
                Pulse Cash Drawer
              </button>
              <button
                onClick={() => window.open(`${window.location.origin}/?mode=display`, 'OrderRestroSecondScreen')}
                className="px-3.5 py-2 rounded-lg bg-amber-700 text-white font-semibold"
              >
                Open Customer Second Screen
              </button>
            </div>
          </div>

          {/* Signed Webhooks & SMTP */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-3 text-xs">
              <h3 className="font-display font-semibold text-sm">Signed HMAC-SHA256 Webhooks</h3>
              <div className="flex gap-2">
                <input
                  value={whUrl}
                  onChange={(e) => setWhUrl(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
                />
                <button
                  onClick={() =>
                    mutate('add_webhook', {
                      url: whUrl,
                      events: ['order.paid', 'kot.ready'],
                      secret: `whsec_${Date.now()}`,
                    })
                  }
                  className="px-3 py-1.5 rounded-lg bg-amber-700 text-white font-semibold"
                >
                  Add Hook
                </button>
              </div>
              <div className="divide-y divide-stone-100 dark:divide-stone-800">
                {(db?.webhooks || []).map((w) => (
                  <div key={w.id} className="py-2 flex items-center justify-between gap-2">
                    <div className="truncate font-mono">{w.url}</div>
                    <button
                      onClick={async () => {
                        await mutate('test_webhook', { id: w.id });
                        notify('Signed HMAC test event dispatched', 'success');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-stone-200 dark:border-stone-800 shrink-0"
                    >
                      <Send className="w-3 h-3" /> Test
                    </button>
                  </div>
                ))}
              </div>
              <div className="text-[11px] font-mono text-stone-500 pt-1">
                Latest delivery: {db?.webhookDeliveries[0]?.event} ({db?.webhookDeliveries[0]?.signature})
              </div>
            </div>

            {/* Interactive REST / OpenAPI Swagger Explorer */}
            <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-3 text-xs">
              <h3 className="font-display font-semibold text-sm inline-flex items-center gap-2">
                <Terminal className="w-4 h-4 text-amber-700" /> Interactive REST / OpenAPI Explorer
              </h3>
              <div className="flex gap-2">
                <select
                  value={apiEndpoint}
                  onChange={(e) => setApiEndpoint(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
                >
                  <option value="/api/openapi.json">GET /api/openapi.json (Swagger Spec)</option>
                  <option value="/api/health">GET /api/health</option>
                  <option value="/api/state">GET /api/state</option>
                </select>
                <button onClick={runApiExplorer} className="px-3.5 py-1.5 rounded-lg bg-amber-700 text-white font-semibold">
                  Execute
                </button>
              </div>
              {apiResponse && (
                <pre className="max-h-40 overflow-auto p-3 rounded-lg bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 font-mono text-[11px]">
                  {apiResponse}
                </pre>
              )}
            </div>
          </div>

          {/* Live MCP Server Inspector */}
          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-3 text-xs">
            <h3 className="font-display font-semibold text-sm">Model Context Protocol (MCP) Server Endpoint (/api/mcp)</h3>
            <div className="flex flex-wrap gap-2">
              <select
                value={mcpTool}
                onChange={(e) => setMcpTool(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
              >
                <option value="get_live_sales_summary">tools/call → get_live_sales_summary</option>
                <option value="get_low_stock_alerts">tools/call → get_low_stock_alerts</option>
                <option value="list_active_kots">tools/call → list_active_kots</option>
                <option value="search_menu">tools/call → search_menu</option>
              </select>
              <button onClick={runMcpTool} className="px-4 py-1.5 rounded-lg bg-amber-700 text-white font-semibold">
                Invoke MCP Tool
              </button>
            </div>
            {mcpResponse && (
              <pre className="max-h-44 overflow-auto p-3 rounded-lg bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 font-mono text-[11px]">
                {mcpResponse}
              </pre>
            )}
          </div>
        </div>
      )}

      {tab === 'admin' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4 text-xs">
            <h3 className="font-display font-semibold text-sm inline-flex items-center gap-2">
              <Settings className="w-4 h-4 text-amber-700" /> Branch Tax Regime & UPI Payee Settings
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block font-medium mb-1">Branch Name</label>
                <input
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Tax Regime</label>
                <select
                  value={taxRegime}
                  onChange={(e) => setTaxRegime(e.target.value as TaxRegime)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
                >
                  {(['IN_GST', 'US_TAX', 'EU_VAT', 'ES_IVA'] as TaxRegime[]).map((r) => (
                    <option key={r} value={r}>
                      {getRegimeDisplayLabel(r)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium mb-1">UPI Payee VPA</label>
                  <input
                    value={upiVpa}
                    onChange={(e) => setUpiVpa(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">UPI Merchant Name</label>
                  <input
                    value={upiName}
                    onChange={(e) => setUpiName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
                  />
                </div>
              </div>
              <button
                onClick={async () => {
                  if (!activeBranch) return;
                  await mutate('update_branch', {
                    id: activeBranch.id,
                    name: branchName,
                    taxRegime,
                    upiVpa,
                    upiMerchantName: upiName,
                  });
                  notify('Branch settings updated', 'success');
                }}
                className="px-4 py-2 rounded-lg bg-amber-700 text-white font-semibold"
              >
                Save Branch Configuration
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4 text-xs">
            <h3 className="font-display font-semibold text-sm">Roles & RBAC Permissions Matrix</h3>
            <div className="space-y-4">
              {(db?.roles || []).map((role) => (
                <div key={role.id} className="p-3 rounded-lg bg-[#FAF9F6] dark:bg-[#12100E] border border-stone-200 dark:border-stone-800 space-y-2">
                  <div className="font-semibold">{role.name}</div>
                  {role.permissions.includes('*') ? (
                    <div className="text-stone-500">Full unrestricted administrative access (*)</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_PERMS.map((perm) => {
                        const has = role.permissions.includes(perm);
                        return (
                          <button
                            key={perm}
                            onClick={() => {
                              const next = has
                                ? role.permissions.filter((p) => p !== perm)
                                : [...role.permissions, perm];
                              mutate('update_role_permissions', { id: role.id, permissions: next });
                            }}
                            className={`px-2 py-0.5 rounded border font-mono text-[10px] ${
                              has
                                ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                                : 'border-stone-200 dark:border-stone-800 text-stone-400'
                            }`}
                          >
                            {perm}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
