import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatMoney } from '../utils/taxEngine';

const DENOMS = ['500', '200', '100', '50', '20', '10'];

export const AccountingFinanceModule: React.FC<{ initialTab?: 'cash' | 'expenses' | 'statements' | 'tax_bank' }> = ({
  initialTab = 'cash',
}) => {
  const { db, activeBranch, activeBranchId, currentStaff, mutate, notify } = useApp();
  const sym = activeBranch?.currencySymbol || '₹';

  const [tab, setTab] = useState<'cash' | 'expenses' | 'statements' | 'tax_bank'>(initialTab);
  const [denoms, setDenoms] = useState<Record<string, number>>({ '500': 10, '200': 5, '100': 8, '50': 4, '20': 2, '10': 5 });
  const [openingFloat, setOpeningFloat] = useState(5000);
  const [closeNotes, setCloseNotes] = useState('');

  // Expense form
  const [expCategory, setExpCategory] = useState('Utilities & Gas');
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState(1500);
  const [expPetty, setExpPetty] = useState(true);

  const branchOrders = useMemo(
    () => (db?.orders || []).filter((o) => o.branchId === activeBranchId && o.status === 'paid'),
    [db?.orders, activeBranchId]
  );

  const cashSalesToday = useMemo(
    () =>
      branchOrders.reduce(
        (s, o) => s + o.payments.filter((p) => p.method === 'cash').reduce((ps, p) => ps + p.amount, 0),
        0
      ),
    [branchOrders]
  );

  const countedCash = DENOMS.reduce((s, d) => s + Number(d) * (denoms[d] || 0), 0);
  const expectedCash = +(openingFloat + cashSalesToday).toFixed(2);
  const variance = +(countedCash - expectedCash).toFixed(2);

  // Financial Aggregations for P&L, Balance Sheet, Budgets, and Tax Summary
  const grossRevenue = branchOrders.reduce((s, o) => s + o.subtotal - o.discountAmount, 0);
  const totalTaxCollected = branchOrders.reduce((s, o) => s + o.taxTotal, 0);
  const cogs = (db?.productionRuns || []).reduce((s, r) => s + r.totalCost, 0) + (db?.grns || []).reduce((s, g) => s + g.invoiceAmount, 0) * 0.4;
  const operatingExpenses = (db?.expenses || [])
    .filter((e) => e.branchId === activeBranchId && (e.status === 'approved' || e.status === 'posted'))
    .reduce((s, e) => s + e.amount, 0);
  const payrollExpense = (db?.payslips || []).reduce((s, p) => s + p.netPay, 0);
  const netProfit = grossRevenue - cogs - operatingExpenses - payrollExpense;

  const inventoryAssetValue = (db?.ingredients || [])
    .filter((i) => i.branchId === activeBranchId)
    .reduce((s, i) => s + i.quantityOnHand * i.unitCost, 0);
  const supplierPayables = (db?.suppliers || []).reduce((s, x) => s + x.balanceDue, 0);

  const taxSummaryByRate = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of branchOrders) {
      for (const t of o.taxBreakdown) {
        map.set(t.label, (map.get(t.label) || 0) + t.amount);
      }
    }
    return Array.from(map.entries());
  }, [branchOrders]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1 p-1 bg-stone-100 dark:bg-stone-900 rounded-lg w-fit text-xs">
        {(
          [
            ['cash', 'Nightly Cash Close'],
            ['expenses', 'Expenses, Petty Cash & Budgets'],
            ['statements', 'P&L & Balance Sheet'],
            ['tax_bank', 'Tax Summary & Bank Rec'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-md font-semibold ${
              tab === id ? 'bg-white dark:bg-[#171412] shadow-sm' : 'text-stone-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'cash' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4">
            <h3 className="font-display font-semibold text-sm">Denomination Cash Drawer Close</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              {DENOMS.map((d) => (
                <label key={d} className="flex items-center justify-between p-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]">
                  <span className="font-mono font-semibold">
                    {sym}
                    {d} ×
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={denoms[d] || 0}
                    onChange={(e) => setDenoms((p) => ({ ...p, [d]: Math.max(0, Number(e.target.value)) }))}
                    className="w-16 text-right font-mono bg-transparent focus:outline-none"
                  />
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-stone-200 dark:border-stone-800">
              <div>
                <label className="block text-stone-500 mb-1">Opening Float</label>
                <input
                  type="number"
                  value={openingFloat}
                  onChange={(e) => setOpeningFloat(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
                />
              </div>
              <div>
                <label className="block text-stone-500 mb-1">Notes</label>
                <input
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  placeholder="Optional variance note"
                  className="w-full px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
                />
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#FAF9F6] dark:bg-[#12100E] border border-stone-200 dark:border-stone-800 text-xs space-y-1 font-mono">
              <div className="flex justify-between">
                <span>Expected Cash (Float + Cash Sales):</span>
                <span>{formatMoney(expectedCash, sym)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Counted Cash:</span>
                <span>{formatMoney(countedCash, sym)}</span>
              </div>
              <div className={`flex justify-between font-bold ${variance < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                <span>Variance:</span>
                <span>{formatMoney(variance, sym)}</span>
              </div>
            </div>
            <button
              onClick={async () => {
                await mutate('close_cash_drawer', {
                  branchId: activeBranchId,
                  date: new Date().toISOString().slice(0, 10),
                  openingFloat,
                  expectedCash,
                  countedCash,
                  variance,
                  denominations: denoms,
                  closedBy: currentStaff?.name || 'Cashier',
                  notes: closeNotes,
                });
                notify('Nightly cash close saved & audited', 'success');
              }}
              className="w-full py-2.5 rounded-lg bg-amber-700 text-white text-xs font-semibold"
            >
              Submit Nightly Cash Close
            </button>
          </div>

          <div className="lg:col-span-6 bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-3">
            <h3 className="font-display font-semibold text-sm">Cash Close History</h3>
            <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
              {(db?.cashClosings || []).map((c) => (
                <div key={c.id} className="py-2.5 flex justify-between">
                  <div>
                    <div className="font-mono font-semibold">
                      {c.date} · {c.closedBy}
                    </div>
                    <div className="text-stone-500">{c.notes || 'Standard shift close'}</div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="font-semibold">{formatMoney(c.countedCash, sym)}</div>
                    <div className={c.variance < 0 ? 'text-red-600' : 'text-emerald-700'}>Var {formatMoney(c.variance, sym)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'expenses' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4">
            <h3 className="font-display font-semibold text-sm">Expense & Petty Cash Approvals</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <select
                value={expCategory}
                onChange={(e) => setExpCategory(e.target.value)}
                className="px-2.5 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
              >
                <option value="Utilities & Gas">Utilities & Gas</option>
                <option value="Supplies & Packaging">Supplies & Packaging</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Food & Raw Materials">Food & Raw Materials</option>
              </select>
              <input
                value={expDesc}
                onChange={(e) => setExpDesc(e.target.value)}
                placeholder="Description"
                className="px-2.5 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
              />
              <input
                type="number"
                value={expAmount}
                onChange={(e) => setExpAmount(Number(e.target.value))}
                className="px-2.5 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
              />
              <button
                onClick={async () => {
                  if (!expDesc.trim()) return;
                  await mutate('add_expense', {
                    branchId: activeBranchId,
                    category: expCategory,
                    description: expDesc,
                    amount: expAmount,
                    taxAmount: +(expAmount * 0.12).toFixed(2),
                    isPettyCash: expPetty,
                    submittedBy: currentStaff?.name || 'Staff',
                    date: new Date().toISOString().slice(0, 10),
                  });
                  setExpDesc('');
                  notify('Expense submitted for approval', 'success');
                }}
                className="px-3 py-2 rounded-lg bg-amber-700 text-white font-semibold"
              >
                Submit
              </button>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-stone-500">
              <input type="checkbox" checked={expPetty} onChange={(e) => setExpPetty(e.target.checked)} />
              <span>Petty Cash Register Draw</span>
            </label>

            <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
              {(db?.expenses || []).map((ex) => (
                <div key={ex.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">
                      {ex.description} {ex.isPettyCash ? '· Petty Cash' : ''}
                    </div>
                    <div className="text-stone-500">
                      {ex.category} · {ex.date} · {ex.submittedBy}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold">{formatMoney(ex.amount, sym)}</span>
                    {ex.status === 'submitted' ? (
                      <>
                        <button
                          onClick={() => mutate('update_expense_status', { id: ex.id, status: 'approved' })}
                          className="px-2 py-1 rounded bg-emerald-700 text-white font-semibold"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => mutate('update_expense_status', { id: ex.id, status: 'rejected' })}
                          className="px-2 py-1 rounded border border-red-300 text-red-700"
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <span className="capitalize font-medium text-stone-500">{ex.status}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-3">
            <h3 className="font-display font-semibold text-sm">Monthly Budgets vs Actual</h3>
            <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
              {(db?.budgets || []).map((b) => {
                const actual = (db?.expenses || [])
                  .filter((e) => e.category === b.category && e.status !== 'rejected')
                  .reduce((s, e) => s + e.amount, 0);
                const pct = Math.min(100, Math.round((actual / Math.max(1, b.budgetAmount)) * 100));
                return (
                  <div key={b.id} className="py-3 space-y-1.5">
                    <div className="flex justify-between">
                      <span className="font-medium">{b.category}</span>
                      <span className="font-mono">
                        {formatMoney(actual, sym)} / {formatMoney(b.budgetAmount, sym)} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct > 90 ? 'bg-red-600' : 'bg-amber-700'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'statements' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-3 text-xs">
            <h3 className="font-display font-semibold text-sm">Profit & Loss Statement (P&L)</h3>
            <div className="divide-y divide-stone-100 dark:divide-stone-800 font-mono">
              <div className="py-2 flex justify-between">
                <span>Net Sales Revenue</span>
                <span className="font-semibold">{formatMoney(grossRevenue, sym)}</span>
              </div>
              <div className="py-2 flex justify-between text-stone-500">
                <span>Cost of Goods Sold (COGS)</span>
                <span>-{formatMoney(cogs, sym)}</span>
              </div>
              <div className="py-2 flex justify-between text-stone-500">
                <span>Operating Expenses & Petty Cash</span>
                <span>-{formatMoney(operatingExpenses, sym)}</span>
              </div>
              <div className="py-2 flex justify-between text-stone-500">
                <span>Staff Payroll</span>
                <span>-{formatMoney(payrollExpense, sym)}</span>
              </div>
              <div className="py-2.5 flex justify-between text-sm font-bold">
                <span>Net Operating Profit</span>
                <span className={netProfit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'}>
                  {formatMoney(netProfit, sym)}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-3 text-xs">
            <h3 className="font-display font-semibold text-sm">Balance Sheet Snapshot</h3>
            <div className="divide-y divide-stone-100 dark:divide-stone-800 font-mono">
              <div className="py-2 flex justify-between">
                <span>Cash & Bank Settlements</span>
                <span>{formatMoney(countedCash + grossRevenue, sym)}</span>
              </div>
              <div className="py-2 flex justify-between">
                <span>Inventory Stock Valuation</span>
                <span>{formatMoney(inventoryAssetValue, sym)}</span>
              </div>
              <div className="py-2 flex justify-between text-red-600">
                <span>Supplier Accounts Payable</span>
                <span>-{formatMoney(supplierPayables, sym)}</span>
              </div>
              <div className="py-2 flex justify-between text-stone-500">
                <span>Tax Liability Payable</span>
                <span>-{formatMoney(totalTaxCollected, sym)}</span>
              </div>
              <div className="py-2.5 flex justify-between text-sm font-bold">
                <span>Net Working Equity</span>
                <span>{formatMoney(countedCash + grossRevenue + inventoryAssetValue - supplierPayables - totalTaxCollected, sym)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'tax_bank' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-3 text-xs">
            <h3 className="font-display font-semibold text-sm">Tax Summary by Rate ({activeBranch?.taxRegime})</h3>
            <div className="divide-y divide-stone-100 dark:divide-stone-800 font-mono">
              {taxSummaryByRate.map(([label, amt]) => (
                <div key={label} className="py-2 flex justify-between">
                  <span>{label}</span>
                  <span className="font-semibold">{formatMoney(amt, sym)}</span>
                </div>
              ))}
              <div className="py-2.5 flex justify-between font-bold text-sm">
                <span>Total Tax Collected</span>
                <span>{formatMoney(totalTaxCollected, sym)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-3 text-xs">
            <h3 className="font-display font-semibold text-sm">Bank-Statement Reconciliation</h3>
            <div className="divide-y divide-stone-100 dark:divide-stone-800">
              {(db?.bankEntries || []).map((be) => (
                <div key={be.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{be.description}</div>
                    <div className="text-stone-500 font-mono">{be.date}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-mono font-semibold ${be.type === 'credit' ? 'text-emerald-700' : 'text-red-600'}`}>
                      {be.type === 'credit' ? '+' : '-'}
                      {formatMoney(be.amount, sym)}
                    </span>
                    <button
                      onClick={() => mutate('reconcile_bank', { id: be.id })}
                      className={`px-2.5 py-1 rounded border font-semibold ${
                        be.reconciled ? 'border-emerald-600 text-emerald-700' : 'border-amber-600 text-amber-800'
                      }`}
                    >
                      {be.reconciled ? 'Matched' : 'Match'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
