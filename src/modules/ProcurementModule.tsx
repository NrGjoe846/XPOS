import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatMoney } from '../utils/taxEngine';

export const ProcurementModule: React.FC = () => {
  const { db, activeBranch, activeBranchId, mutate, notify } = useApp();
  const sym = activeBranch?.currencySymbol || '₹';

  const [tab, setTab] = useState<'pos' | 'rfqs' | 'grns' | 'suppliers'>('pos');
  const [poSupplierId, setPoSupplierId] = useState(db?.suppliers[0]?.id || 'sup-1');
  const [poIngId, setPoIngId] = useState(db?.ingredients[0]?.id || 'ing-paneer');
  const [poQty, setPoQty] = useState(10);
  const [rfqSupplierId, setRfqSupplierId] = useState(db?.suppliers[0]?.id || 'sup-1');
  const [rfqIngredient, setRfqIngredient] = useState('Fresh Malai Paneer');
  const [rfqPrice, setRfqPrice] = useState(380);

  const ingredients = useMemo(
    () => (db?.ingredients || []).filter((i) => i.branchId === activeBranchId),
    [db?.ingredients, activeBranchId]
  );

  const reorderSuggestions = ingredients.filter((i) => i.quantityOnHand <= i.parLevel);

  const createPo = async () => {
    const sup = db?.suppliers.find((s) => s.id === poSupplierId);
    const ing = ingredients.find((i) => i.id === poIngId);
    if (!sup || !ing) return;
    await mutate('create_po', {
      branchId: activeBranchId,
      supplierId: sup.id,
      supplierName: sup.name,
      items: [{ ingredientId: ing.id, ingredientName: ing.name, qty: poQty, unitPrice: ing.unitCost }],
      totalAmount: +(poQty * ing.unitCost).toFixed(2),
      expectedDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    });
    notify(`Purchase Order issued to ${sup.name}`, 'success');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1 p-1 bg-stone-100 dark:bg-stone-900 rounded-lg w-fit text-xs">
        {(
          [
            ['pos', 'Purchase Orders & Reorder'],
            ['rfqs', 'Vendor Quotations (RFQ)'],
            ['grns', 'GRN, Invoices & Variance'],
            ['suppliers', 'Suppliers & Scorecard'],
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

      {tab === 'pos' && (
        <div className="space-y-5">
          {reorderSuggestions.length > 0 && (
            <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-4 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-semibold">Reorder Suggestions:</span>{' '}
                {reorderSuggestions.map((r) => `${r.name} (${r.quantityOnHand}/${r.parLevel} ${r.unit})`).join(' · ')}
              </div>
              <button
                onClick={() => {
                  setPoIngId(reorderSuggestions[0].id);
                  setPoQty(Math.max(5, Math.ceil(reorderSuggestions[0].parLevel * 2)));
                }}
                className="px-3 py-1 rounded-lg bg-amber-700 text-white font-semibold"
              >
                Pre-fill PO
              </button>
            </div>
          )}

          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4">
            <h3 className="font-display font-semibold text-sm">Create Purchase Order</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
              <select
                value={poSupplierId}
                onChange={(e) => setPoSupplierId(e.target.value)}
                className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
              >
                {(db?.suppliers || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                value={poIngId}
                onChange={(e) => setPoIngId(e.target.value)}
                className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
              >
                {ingredients.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({formatMoney(i.unitCost, sym)}/{i.unit})
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={poQty}
                onChange={(e) => setPoQty(Number(e.target.value))}
                className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
              />
              <button onClick={createPo} className="px-4 py-2 rounded-lg bg-amber-700 text-white font-semibold">
                Issue PO
              </button>
            </div>

            <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
              {(db?.purchaseOrders || []).map((po) => (
                <div key={po.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-mono font-semibold">
                      {po.poNumber} · {po.supplierName}
                    </div>
                    <div className="text-stone-500">
                      {po.items.map((x) => `${x.qty}× ${x.ingredientName}`).join(', ')} · Status: {po.status}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold">{formatMoney(po.totalAmount, sym)}</span>
                    {po.status !== 'received' && po.status !== 'returned' && (
                      <>
                        <button
                          onClick={async () => {
                            await mutate('receive_grn', {
                              poId: po.id,
                              branchId: po.branchId,
                              supplierName: po.supplierName,
                              receivedItems: po.items.map((it) => ({
                                ingredientId: it.ingredientId,
                                ingredientName: it.ingredientName,
                                qtyReceived: it.qty,
                                unitCost: it.unitPrice,
                                batchNumber: `LOT-${Date.now().toString().slice(-5)}`,
                                expiryDate: '2026-12-30',
                              })),
                              invoiceNumber: `INV-${Date.now().toString().slice(-4)}`,
                              invoiceAmount: po.totalAmount,
                              priceVariance: 0,
                              paid: false,
                            });
                            notify(`GRN received & inventory updated for ${po.poNumber}`, 'success');
                          }}
                          className="px-2.5 py-1 rounded bg-emerald-700 text-white font-semibold"
                        >
                          Receive GRN
                        </button>
                        <button
                          onClick={() => mutate('return_po', { poId: po.id })}
                          className="px-2.5 py-1 rounded border border-red-300 text-red-700 dark:text-red-400"
                        >
                          Return
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'rfqs' && (
        <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
            <select
              value={rfqSupplierId}
              onChange={(e) => setRfqSupplierId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            >
              {(db?.suppliers || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              value={rfqIngredient}
              onChange={(e) => setRfqIngredient(e.target.value)}
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            />
            <input
              type="number"
              value={rfqPrice}
              onChange={(e) => setRfqPrice(Number(e.target.value))}
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
            />
            <button
              onClick={() => {
                const sup = db?.suppliers.find((s) => s.id === rfqSupplierId);
                if (!sup) return;
                mutate('add_rfq', {
                  supplierId: sup.id,
                  supplierName: sup.name,
                  ingredientName: rfqIngredient,
                  quotedPrice: rfqPrice,
                  unit: 'kg',
                  leadTimeDays: 1,
                });
              }}
              className="px-4 py-2 rounded-lg bg-amber-700 text-white font-semibold"
            >
              Log Vendor Quote
            </button>
          </div>
          <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
            {(db?.quotations || []).map((q) => (
              <div key={q.id} className="py-2.5 flex justify-between items-center">
                <div>
                  <div className="font-semibold">
                    {q.ingredientName} — {q.supplierName}
                  </div>
                  <div className="text-stone-500">
                    Lead time {q.leadTimeDays}d · Status: {q.status}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold">
                    {formatMoney(q.quotedPrice, sym)}/{q.unit}
                  </span>
                  {q.status === 'pending' && (
                    <button
                      onClick={() => mutate('select_rfq', { id: q.id })}
                      className="px-2.5 py-1 rounded border border-emerald-600 text-emerald-700 dark:text-emerald-400"
                    >
                      Award Quote
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'grns' && (
        <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-800 text-stone-500 text-left">
                <th className="py-2">GRN</th>
                <th className="py-2">Supplier</th>
                <th className="py-2">Invoice</th>
                <th className="py-2 text-right">Amount</th>
                <th className="py-2 text-right">Price Variance</th>
                <th className="py-2 text-right">Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {(db?.grns || []).map((g) => (
                <tr key={g.id}>
                  <td className="py-2.5 font-mono font-semibold">{g.grnNumber}</td>
                  <td className="py-2.5">{g.supplierName}</td>
                  <td className="py-2.5 font-mono">{g.invoiceNumber}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums">{formatMoney(g.invoiceAmount, sym)}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums">{formatMoney(g.priceVariance, sym)}</td>
                  <td className="py-2.5 text-right">
                    {g.paid ? (
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Paid</span>
                    ) : (
                      <button
                        onClick={() => mutate('pay_supplier', { grnId: g.id })}
                        className="px-2.5 py-1 rounded bg-amber-700 text-white font-semibold"
                      >
                        Record Payment
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'suppliers' && (
        <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-800 text-stone-500 text-left">
                <th className="py-2">Supplier</th>
                <th className="py-2">Category</th>
                <th className="py-2 text-right">On-Time Delivery</th>
                <th className="py-2 text-right">Quality Rating</th>
                <th className="py-2 text-right">Payable Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {(db?.suppliers || []).map((s) => (
                <tr key={s.id}>
                  <td className="py-2.5 font-medium">
                    {s.name}
                    <div className="text-[11px] text-stone-500">{s.contactName} · {s.phone}</div>
                  </td>
                  <td className="py-2.5 text-stone-500">{s.category}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums">{s.onTimeRate}%</td>
                  <td className="py-2.5 text-right font-mono tabular-nums">{s.qualityScore}/5.0</td>
                  <td className="py-2.5 text-right font-mono tabular-nums font-semibold">{formatMoney(s.balanceDue, sym)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
