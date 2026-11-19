import React, { useMemo, useState } from 'react';
import { Download, Printer, Mail, Building2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatMoney } from '../utils/taxEngine';
import { HorizontalProportionList, PeakHourHeatmap, SimpleBarChart } from '../components/Charts';
import { downloadCsv, downloadExcel, exportReportPdfPrint } from '../utils/export';

const REPORT_LIST = [
  '01. Sales Summary',
  '02. Peak Hours Heatmap',
  '03. Food Cost & Margins',
  '04. Menu Engineering Mix',
  '05. Category Breakdown',
  '06. Tax Collected by Rate',
  '07. Discounts & Coupons',
  '08. Payment Tender Mix',
  '09. Staff Sales Performance',
  '10. Table Turnover & Occupancy',
  '11. Customer Retention & Cohorts',
  '12. Loyalty & Referral ROI',
  '13. Inventory Valuation',
  '14. Food Waste Analysis',
  '15. Supplier Spend & Variance',
  '16. Delivery Zone Performance',
  '17. KDS Prep SLA Times',
  '18. Nightly Cash Variance',
] as const;

export const BranchesAnalyticsModule: React.FC<{ initialView?: 'analytics' | 'branches' }> = ({
  initialView = 'analytics',
}) => {
  const { db, activeBranch, activeBranchId, setActiveBranchId, mutate, notify } = useApp();
  const sym = activeBranch?.currencySymbol || '₹';

  const [view, setView] = useState<'analytics' | 'branches'>(initialView);
  const [selectedReport, setSelectedReport] = useState<string>(REPORT_LIST[0]);
  const [schedEmail, setSchedEmail] = useState('owner@unaipos.in');
  const [schedFreq, setSchedFreq] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [schedFormat, setSchedFormat] = useState<'CSV' | 'Excel' | 'PDF'>('Excel');

  // Branch transfer form
  const [xferIngId, setXferIngId] = useState(db?.ingredients[0]?.id || '');
  const [xferToBranchId, setXferToBranchId] = useState(db?.branches[1]?.id || 'br-atx-2');
  const [xferQty, setXferQty] = useState(2);

  const branchOrders = useMemo(
    () => (db?.orders || []).filter((o) => o.branchId === activeBranchId && o.status !== 'voided'),
    [db?.orders, activeBranchId]
  );

  const totalRevenue = branchOrders.reduce((s, o) => s + o.grandTotal, 0);
  const avgTicket = branchOrders.length > 0 ? totalRevenue / branchOrders.length : 0;

  const peakHours = useMemo(() => {
    const slots = Array.from({ length: 12 }, (_, idx) => {
      const hr = idx + 10;
      return { hour: `${hr}:00`, orders: 0, revenue: 0 };
    });
    for (const o of branchOrders) {
      const hr = new Date(o.createdAt).getHours();
      const idx = Math.max(0, Math.min(11, hr - 10));
      slots[idx].orders += 1;
      slots[idx].revenue += o.grandTotal;
    }
    return slots;
  }, [branchOrders]);

  // Dynamic Dataset Builder for All 18 Reports
  const reportTable = useMemo((): { headers: string[]; rows: (string | number)[][] } => {
    const orders = branchOrders;
    const items = db?.menuItems || [];
    const ingredients = (db?.ingredients || []).filter((i) => i.branchId === activeBranchId);

    switch (selectedReport) {
      case '01. Sales Summary':
        return {
          headers: ['Order #', 'Channel', 'Status', 'Subtotal', 'Tax', 'Grand Total'],
          rows: orders.map((o) => [o.orderNumber, o.channel, o.status, o.subtotal, o.taxTotal, o.grandTotal]),
        };
      case '02. Peak Hours Heatmap':
        return {
          headers: ['Hour Slot', 'Order Count', 'Revenue'],
          rows: peakHours.map((h) => [h.hour, h.orders, +h.revenue.toFixed(2)]),
        };
      case '03. Food Cost & Margins':
        return {
          headers: ['Dish', 'Selling Price', 'Unit Cost', 'Gross Margin %'],
          rows: items.map((m) => [
            m.name,
            m.price,
            m.lastCostPerUnit,
            m.price > 0 ? Math.round(((m.price - m.lastCostPerUnit) / m.price) * 100) : 0,
          ]),
        };
      case '04. Menu Engineering Mix': {
        const counts = new Map<string, { qty: number; rev: number }>();
        orders.forEach((o) =>
          o.items.forEach((it) => {
            const c = counts.get(it.name) || { qty: 0, rev: 0 };
            c.qty += it.quantity;
            c.rev += it.unitPrice * it.quantity;
            counts.set(it.name, c);
          })
        );
        return {
          headers: ['Dish', 'Units Sold', 'Revenue'],
          rows: Array.from(counts.entries()).map(([n, v]) => [n, v.qty, +v.rev.toFixed(2)]),
        };
      }
      case '05. Category Breakdown':
        return {
          headers: ['Category', 'Station', 'Schedule'],
          rows: (db?.categories || []).map((c) => [c.name, c.station, c.scheduleTag || 'All Day']),
        };
      case '06. Tax Collected by Rate': {
        const map = new Map<string, number>();
        orders.forEach((o) => o.taxBreakdown.forEach((t) => map.set(t.label, (map.get(t.label) || 0) + t.amount)));
        return {
          headers: ['Tax Component', 'Collected Amount'],
          rows: Array.from(map.entries()).map(([k, v]) => [k, +v.toFixed(2)]),
        };
      }
      case '07. Discounts & Coupons':
        return {
          headers: ['Coupon Code', 'Type', 'Value', 'Uses', 'Min Spend'],
          rows: (db?.coupons || []).map((c) => [c.code, c.type, c.value, c.usesCount, c.minSpend]),
        };
      case '08. Payment Tender Mix': {
        const tmap = new Map<string, number>();
        orders.forEach((o) => o.payments.forEach((p) => tmap.set(p.method.toUpperCase(), (tmap.get(p.method.toUpperCase()) || 0) + p.amount)));
        return {
          headers: ['Payment Method', 'Settled Amount'],
          rows: Array.from(tmap.entries()).map(([k, v]) => [k, +v.toFixed(2)]),
        };
      }
      case '09. Staff Sales Performance':
        return {
          headers: ['Staff Name', 'Role', 'Orders Handled', 'Hourly Rate'],
          rows: (db?.staff || []).map((s) => [
            s.name,
            s.roleName,
            orders.filter((o) => o.staffId === s.id).length,
            s.hourlyRate,
          ]),
        };
      case '10. Table Turnover & Occupancy':
        return {
          headers: ['Table', 'Seats', 'Status', 'Live Session'],
          rows: (db?.tables || [])
            .filter((t) => t.branchId === activeBranchId)
            .map((t) => [t.label, t.seats, t.status, t.sessionCodeActive ? 'Active' : 'Closed']),
        };
      case '11. Customer Retention & Cohorts':
        return {
          headers: ['Guest', 'Tier', 'Total Visits', 'Lifetime Spend'],
          rows: (db?.customers || []).map((c) => [c.name, c.membershipTier, c.totalVisits, c.totalSpent]),
        };
      case '12. Loyalty & Referral ROI':
        return {
          headers: ['Guest', 'Referral Code', 'Referred By', 'Points Balance'],
          rows: (db?.customers || []).map((c) => [c.name, c.referralCode, c.referredBy || 'Organic', c.loyaltyPoints]),
        };
      case '13. Inventory Valuation':
        return {
          headers: ['Ingredient', 'On Hand', 'Unit Cost', 'Total Asset Value'],
          rows: ingredients.map((i) => [i.name, `${i.quantityOnHand} ${i.unit}`, i.unitCost, +(i.quantityOnHand * i.unitCost).toFixed(2)]),
        };
      case '14. Food Waste Analysis':
        return {
          headers: ['Ingredient', 'Quantity', 'Reason', 'Loss Value'],
          rows: (db?.wasteLogs || []).map((w) => [w.ingredientName, w.quantity, w.reason, w.costValue]),
        };
      case '15. Supplier Spend & Variance':
        return {
          headers: ['Supplier', 'On-Time %', 'Quality', 'Balance Due'],
          rows: (db?.suppliers || []).map((s) => [s.name, `${s.onTimeRate}%`, s.qualityScore, s.balanceDue]),
        };
      case '16. Delivery Zone Performance':
        return {
          headers: ['Pincode', 'Area', 'Fee', 'Min Order', 'ETA (mins)'],
          rows: (db?.deliveryZones || []).map((z) => [z.pincode, z.areaName, z.deliveryFee, z.minOrder, z.etaMinutes]),
        };
      case '17. KDS Prep SLA Times':
        return {
          headers: ['KOT #', 'Station', 'Table', 'Status'],
          rows: (db?.kots || []).map((k) => [k.kotNumber, k.station, k.tableLabel, k.status]),
        };
      case '18. Nightly Cash Variance':
      default:
        return {
          headers: ['Date', 'Closed By', 'Expected Cash', 'Counted Cash', 'Variance'],
          rows: (db?.cashClosings || []).map((c) => [c.date, c.closedBy, c.expectedCash, c.countedCash, c.variance]),
        };
    }
  }, [selectedReport, branchOrders, db, activeBranchId, peakHours]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-stone-900 rounded-lg w-fit text-xs">
        <button
          onClick={() => setView('analytics')}
          className={`px-3 py-1.5 rounded-md font-semibold ${
            view === 'analytics' ? 'bg-white dark:bg-[#171412] shadow-sm' : 'text-stone-500'
          }`}
        >
          Live Analytics & 18 Reports
        </button>
        <button
          onClick={() => setView('branches')}
          className={`px-3 py-1.5 rounded-md font-semibold ${
            view === 'branches' ? 'bg-white dark:bg-[#171412] shadow-sm' : 'text-stone-500'
          }`}
        >
          Multi-Branch Overview & Transfers
        </button>
      </div>

      {view === 'analytics' ? (
        <div className="space-y-6">
          {/* Live KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-4">
              <div className="text-xs text-stone-500">Gross Revenue</div>
              <div className="font-mono font-bold text-2xl tabular-nums mt-1">{formatMoney(totalRevenue, sym)}</div>
            </div>
            <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-4">
              <div className="text-xs text-stone-500">Total Orders</div>
              <div className="font-mono font-bold text-2xl tabular-nums mt-1">{branchOrders.length}</div>
            </div>
            <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-4">
              <div className="text-xs text-stone-500">Avg Ticket Size</div>
              <div className="font-mono font-bold text-2xl tabular-nums mt-1">{formatMoney(avgTicket, sym)}</div>
            </div>
            <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-4">
              <div className="text-xs text-stone-500">Active KDS Tickets</div>
              <div className="font-mono font-bold text-2xl tabular-nums mt-1">
                {(db?.kots || []).filter((k) => k.branchId === activeBranchId && k.status !== 'served').length}
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4">
              <h3 className="font-display font-semibold text-sm">Peak Hours Service Heatmap</h3>
              <PeakHourHeatmap hours={peakHours} currencySymbol={sym} />
              <div className="pt-2">
                <SimpleBarChart
                  data={peakHours.slice(0, 8).map((h) => ({ label: h.hour, value: h.revenue }))}
                  formatValue={(v) => formatMoney(v, sym)}
                />
              </div>
            </div>

            <div className="lg:col-span-5 bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4">
              <h3 className="font-display font-semibold text-sm">Top Menu Margins</h3>
              <HorizontalProportionList
                items={(db?.menuItems || []).slice(0, 5).map((m) => ({
                  label: m.name,
                  value: m.price - m.lastCostPerUnit,
                  formatted: `${formatMoney(m.price - m.lastCostPerUnit, sym)} margin`,
                }))}
              />
            </div>
          </div>

          {/* 18-Report Explorer + Export + Scheduled Email */}
          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold">Select Report (18 Built-in):</label>
                <select
                  value={selectedReport}
                  onChange={(e) => setSelectedReport(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] text-xs font-semibold"
                >
                  {REPORT_LIST.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  onClick={() => downloadCsv(selectedReport.replace(/\s+/g, '_'), reportTable.headers, reportTable.rows)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 font-medium"
                >
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
                <button
                  onClick={() =>
                    downloadExcel(selectedReport.replace(/\s+/g, '_'), selectedReport, reportTable.headers, reportTable.rows)
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 font-medium"
                >
                  <Download className="w-3.5 h-3.5" /> Excel
                </button>
                <button
                  onClick={() => exportReportPdfPrint(selectedReport, reportTable.headers, reportTable.rows)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 font-medium"
                >
                  <Printer className="w-3.5 h-3.5" /> PDF / Print
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-stone-200 dark:border-stone-800 text-stone-500 text-left">
                    {reportTable.headers.map((h) => (
                      <th key={h} className="py-2 pr-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {reportTable.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((cell, ci) => (
                        <td key={ci} className="py-2 pr-3 font-mono tabular-nums">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Scheduled Email Reports */}
            <div className="pt-4 border-t border-stone-200 dark:border-stone-800 flex flex-wrap items-center gap-2 text-xs">
              <Mail className="w-4 h-4 text-amber-700" />
              <span className="font-semibold">Schedule Email Report:</span>
              <input
                value={schedEmail}
                onChange={(e) => setSchedEmail(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
              />
              <select
                value={schedFreq}
                onChange={(e) => setSchedFreq(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <select
                value={schedFormat}
                onChange={(e) => setSchedFormat(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
              >
                <option value="Excel">Excel</option>
                <option value="CSV">CSV</option>
                <option value="PDF">PDF</option>
              </select>
              <button
                onClick={async () => {
                  await mutate('add_scheduled_report', {
                    reportName: selectedReport,
                    recipientEmail: schedEmail,
                    frequency: schedFreq,
                    format: schedFormat,
                  });
                  notify(`Scheduled ${selectedReport} (${schedFreq} ${schedFormat})`, 'success');
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-700 text-white font-semibold"
              >
                Save Schedule
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Cross-Branch Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(db?.branches || []).map((b) => {
              const ords = (db?.orders || []).filter((o) => o.branchId === b.id);
              const rev = ords.reduce((s, o) => s + o.grandTotal, 0);
              return (
                <div key={b.id} className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 flex justify-between items-center">
                  <div>
                    <div className="font-display font-bold text-base inline-flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-amber-700" /> {b.name}
                    </div>
                    <div className="text-xs text-stone-500 mt-0.5">
                      {b.city} · {b.taxRegime} · {ords.length} orders
                    </div>
                    <div className="font-mono font-bold text-lg mt-2">{formatMoney(rev, b.currencySymbol)}</div>
                  </div>
                  <button
                    onClick={() => setActiveBranchId(b.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                      activeBranchId === b.id
                        ? 'bg-amber-700 text-white border-amber-700'
                        : 'border-stone-200 dark:border-stone-800'
                    }`}
                  >
                    {activeBranchId === b.id ? 'Active' : 'Switch'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Branch-to-Branch Stock Transfer */}
          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-3">
            <h3 className="font-display font-semibold text-sm">Branch-to-Branch Stock Transfer</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
              <select
                value={xferIngId}
                onChange={(e) => setXferIngId(e.target.value)}
                className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
              >
                {(db?.ingredients || []).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.quantityOnHand} {i.unit})
                  </option>
                ))}
              </select>
              <select
                value={xferToBranchId}
                onChange={(e) => setXferToBranchId(e.target.value)}
                className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
              >
                {(db?.branches || []).map((b) => (
                  <option key={b.id} value={b.id}>
                    To: {b.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={xferQty}
                onChange={(e) => setXferQty(Number(e.target.value))}
                className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
              />
              <button
                onClick={async () => {
                  const dest = db?.branches.find((b) => b.id === xferToBranchId);
                  if (!dest || !xferIngId) return;
                  await mutate('branch_stock_transfer', {
                    ingredientId: xferIngId,
                    toBranchId: dest.id,
                    toBranchName: dest.name,
                    qty: xferQty,
                  });
                  notify(`Dispatched stock transfer to ${dest.name}`, 'success');
                }}
                className="px-4 py-2 rounded-lg bg-amber-700 text-white font-semibold"
              >
                Transfer Stock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
