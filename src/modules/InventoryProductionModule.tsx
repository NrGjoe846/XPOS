import React, { useMemo, useState } from 'react';
import { Factory, ClipboardList, AlertTriangle, ArrowLeftRight, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatMoney } from '../utils/taxEngine';

export const InventoryProductionModule: React.FC = () => {
  const { db, activeBranch, activeBranchId, currentStaff, mutate, refreshState, notify } = useApp();
  const sym = activeBranch?.currencySymbol || '₹';

  const [tab, setTab] = useState<'stock' | 'production' | 'journal' | 'shopping' | 'waste'>('stock');

  // Production Batch state
  const [prodMenuId, setProdMenuId] = useState(db?.menuItems[0]?.id || 'item-butter-chicken');
  const [unitsProduced, setUnitsProduced] = useState(20);
  const [extraCosts, setExtraCosts] = useState(400);
  const [updatePriceFlag, setUpdatePriceFlag] = useState(false);
  const [newMenuPrice, setNewMenuPrice] = useState<number>(480);
  const [customQtys, setCustomQtys] = useState<Record<string, number>>({});

  // Stock Take & Transfer state
  const [stockTakeQtys, setStockTakeQtys] = useState<Record<string, number>>({});
  const [transferIngId, setTransferIngId] = useState('');
  const [transferAreaId, setTransferAreaId] = useState('');

  // Waste Log state
  const [wasteIngId, setWasteIngId] = useState(db?.ingredients[0]?.id || '');
  const [wasteQty, setWasteQty] = useState(0.5);
  const [wasteReason, setWasteReason] = useState<'Spoilage' | 'Prep Error' | 'Expired' | 'Customer Return'>('Spoilage');

  const ingredients = useMemo(
    () => (db?.ingredients || []).filter((i) => i.branchId === activeBranchId),
    [db?.ingredients, activeBranchId]
  );

  const areas = useMemo(
    () => (db?.stockAreas || []).filter((a) => a.branchId === activeBranchId),
    [db?.stockAreas, activeBranchId]
  );

  const selectedMenu = (db?.menuItems || []).find((m) => m.id === prodMenuId);

  const previewBatchCost = useMemo(() => {
    if (!selectedMenu) return { material: 0, total: 0, perUnit: 0 };
    let material = 0;
    for (const r of selectedMenu.recipe) {
      const ing = ingredients.find((i) => i.id === r.ingredientId);
      const q = customQtys[r.ingredientId] ?? +(r.quantity * unitsProduced).toFixed(2);
      if (ing) material += q * ing.unitCost;
    }
    const total = material + extraCosts;
    return {
      material: +material.toFixed(2),
      total: +total.toFixed(2),
      perUnit: unitsProduced > 0 ? +(total / unitsProduced).toFixed(2) : 0,
    };
  }, [selectedMenu, ingredients, customQtys, unitsProduced, extraCosts]);

  const handleRunProduction = async () => {
    if (!selectedMenu) return;
    const usages = selectedMenu.recipe.map((r) => ({
      ingredientId: r.ingredientId,
      qtyUsed: customQtys[r.ingredientId] ?? +(r.quantity * unitsProduced).toFixed(2),
    }));
    const res = await fetch('/api/production-runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branchId: activeBranchId,
        menuItemId: selectedMenu.id,
        unitsProduced,
        ingredientUsages: usages,
        extraCosts,
        newMenuPrice: updatePriceFlag ? newMenuPrice : undefined,
        actorName: currentStaff?.name || 'Chef',
      }),
    });
    if (res.ok) {
      await refreshState();
      notify(`Logged production batch (${unitsProduced} units · ${formatMoney(previewBatchCost.perUnit, sym)}/unit)`, 'success');
    }
  };

  const shoppingList = ingredients.filter((i) => i.quantityOnHand <= i.parLevel);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1 p-1 bg-stone-100 dark:bg-stone-900 rounded-lg w-fit text-xs">
        {(
          [
            ['stock', 'Stock, Lots & Take'],
            ['production', 'Daily Production & Costing'],
            ['journal', 'Stock Journal'],
            ['shopping', `Shopping List (${shoppingList.length})`],
            ['waste', 'Food Waste'],
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

      {tab === 'stock' && (
        <div className="space-y-5">
          {/* Area Transfer Bar */}
          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-4 flex flex-wrap items-center gap-3 text-xs">
            <span className="font-semibold inline-flex items-center gap-1.5">
              <ArrowLeftRight className="w-3.5 h-3.5 text-amber-700" /> Internal Area Transfer:
            </span>
            <select
              value={transferIngId}
              onChange={(e) => setTransferIngId(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            >
              <option value="">Select Ingredient...</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.batchNumber})
                </option>
              ))}
            </select>
            <select
              value={transferAreaId}
              onChange={(e) => setTransferAreaId(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            >
              <option value="">Destination Stock Area...</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <button
              onClick={async () => {
                const area = areas.find((a) => a.id === transferAreaId);
                if (!transferIngId || !area) return;
                await mutate('transfer_stock_area', {
                  ingredientId: transferIngId,
                  toAreaId: area.id,
                  toAreaName: area.name,
                });
                notify(`Moved stock to ${area.name}`, 'success');
              }}
              className="px-3 py-1.5 rounded-lg bg-amber-700 text-white font-semibold"
            >
              Move Stock
            </button>
          </div>

          {/* Stock & Stock Take Table */}
          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-800 text-stone-500 text-left">
                  <th className="py-2">Ingredient</th>
                  <th className="py-2">Area</th>
                  <th className="py-2">Batch / Expiry</th>
                  <th className="py-2 text-right">On Hand</th>
                  <th className="py-2 text-right">Par Level</th>
                  <th className="py-2 text-right">Unit Cost</th>
                  <th className="py-2 text-right">Stock Take Adjust</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {ingredients.map((ing) => {
                  const low = ing.quantityOnHand <= ing.parLevel;
                  const areaName = areas.find((a) => a.id === ing.areaId)?.name || 'Main';
                  const expiringSoon = new Date(ing.expiryDate).getTime() - Date.now() < 4 * 86400000;
                  return (
                    <tr key={ing.id}>
                      <td className="py-2.5 font-medium">
                        {ing.name} <span className="text-stone-400 font-mono">({ing.sku})</span>
                      </td>
                      <td className="py-2.5 text-stone-500">{areaName}</td>
                      <td className="py-2.5 font-mono">
                        {ing.batchNumber} ·{' '}
                        <span className={expiringSoon ? 'text-red-600 font-semibold' : 'text-stone-500'}>
                          {ing.expiryDate}
                        </span>
                      </td>
                      <td className={`py-2.5 text-right font-mono tabular-nums font-semibold ${low ? 'text-amber-700 dark:text-amber-400' : ''}`}>
                        {ing.quantityOnHand} {ing.unit}
                      </td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-stone-500">
                        {ing.parLevel} {ing.unit}
                      </td>
                      <td className="py-2.5 text-right font-mono tabular-nums">{formatMoney(ing.unitCost, sym)}</td>
                      <td className="py-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            step="0.1"
                            value={stockTakeQtys[ing.id] ?? ing.quantityOnHand}
                            onChange={(e) => setStockTakeQtys((p) => ({ ...p, [ing.id]: Number(e.target.value) }))}
                            className="w-20 px-2 py-1 rounded border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono text-right"
                          />
                          <button
                            onClick={async () => {
                              const newQty = stockTakeQtys[ing.id] ?? ing.quantityOnHand;
                              await mutate('stock_adjustment', {
                                ingredientId: ing.id,
                                newQuantity: newQty,
                                reason: 'Physical Stock Take',
                              });
                              notify(`Stock adjusted for ${ing.name}`, 'success');
                            }}
                            className="px-2 py-1 rounded border border-stone-200 dark:border-stone-800 font-medium hover:bg-stone-50 dark:hover:bg-stone-900"
                          >
                            Save
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'production' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4">
            <h3 className="font-display font-semibold text-sm inline-flex items-center gap-2">
              <Factory className="w-4 h-4 text-amber-700" /> Daily Production & Manufacturing Run
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium mb-1">Recipe / Dish</label>
                <select
                  value={prodMenuId}
                  onChange={(e) => setProdMenuId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
                >
                  {(db?.menuItems || []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} (Current {formatMoney(m.price, sym)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Actual Units Produced</label>
                <input
                  type="number"
                  min={1}
                  value={unitsProduced}
                  onChange={(e) => setUnitsProduced(Math.max(1, Number(e.target.value)))}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
                />
              </div>
            </div>

            {selectedMenu && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-stone-500">Actual Raw Ingredient Quantities Consumed</div>
                {selectedMenu.recipe.map((r) => {
                  const ing = ingredients.find((i) => i.id === r.ingredientId);
                  if (!ing) return null;
                  const val = customQtys[r.ingredientId] ?? +(r.quantity * unitsProduced).toFixed(2);
                  return (
                    <div key={r.ingredientId} className="flex items-center justify-between text-xs gap-2">
                      <span>
                        {ing.name} ({formatMoney(ing.unitCost, sym)}/{ing.unit})
                      </span>
                      <input
                        type="number"
                        step="0.1"
                        value={val}
                        onChange={(e) => setCustomQtys((p) => ({ ...p, [r.ingredientId]: Number(e.target.value) }))}
                        className="w-24 px-2 py-1 rounded border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono text-right"
                      />
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-stone-200 dark:border-stone-800">
              <div>
                <label className="block font-medium mb-1">Extra Costs (Labor / Gas / Packaging)</label>
                <input
                  type="number"
                  value={extraCosts}
                  onChange={(e) => setExtraCosts(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
                />
              </div>
              <div className="p-2.5 rounded-lg bg-[#FAF9F6] dark:bg-[#12100E] border border-stone-200 dark:border-stone-800">
                <div className="text-stone-500">Calculated Cost / Unit</div>
                <div className="font-mono font-bold text-base text-amber-700 dark:text-amber-400">
                  {formatMoney(previewBatchCost.perUnit, sym)}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 text-xs pt-1">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={updatePriceFlag}
                  onChange={(e) => setUpdatePriceFlag(e.target.checked)}
                />
                <span>Update Menu Selling Price & Log History</span>
              </label>
              {updatePriceFlag && (
                <input
                  type="number"
                  value={newMenuPrice}
                  onChange={(e) => setNewMenuPrice(Number(e.target.value))}
                  className="w-24 px-2 py-1 rounded border border-stone-200 dark:border-stone-800 font-mono"
                />
              )}
            </div>

            <button
              onClick={handleRunProduction}
              className="w-full py-2.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold"
            >
              Record Production Run & Deduct Stock
            </button>
          </div>

          {/* Production History & Price Changes */}
          <div className="lg:col-span-6 bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4">
            <h3 className="font-display font-semibold text-sm">Production Costing & Price Change History</h3>
            <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
              {(db?.productionRuns || []).map((run) => (
                <div key={run.id} className="py-3 space-y-1">
                  <div className="flex justify-between font-semibold">
                    <span>
                      {run.menuItemName} ({run.unitsProduced} units)
                    </span>
                    <span className="font-mono text-amber-700 dark:text-amber-400">
                      {formatMoney(run.costPerUnit, sym)} / unit
                    </span>
                  </div>
                  <div className="text-stone-500 font-mono">
                    Material {formatMoney(run.materialCost, sym)} + Extra {formatMoney(run.extraCosts, sym)} = Total{' '}
                    {formatMoney(run.totalCost, sym)}
                    {run.updatedMenuPrice ? ` · Menu Price → ${formatMoney(run.updatedMenuPrice, sym)}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'journal' && (
        <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 overflow-x-auto">
          <h3 className="font-display font-semibold text-sm mb-3 inline-flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-amber-700" /> Stock Movement Journal
          </h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-800 text-stone-500 text-left">
                <th className="py-2">Time</th>
                <th className="py-2">Ingredient</th>
                <th className="py-2">Event</th>
                <th className="py-2">Reference</th>
                <th className="py-2 text-right">Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {(db?.stockJournal || []).slice(0, 30).map((j) => (
                <tr key={j.id}>
                  <td className="py-2 font-mono text-stone-500">{new Date(j.createdAt).toLocaleString()}</td>
                  <td className="py-2 font-medium">{j.ingredientName}</td>
                  <td className="py-2 capitalize text-stone-500">{j.type.replace(/_/g, ' ')}</td>
                  <td className="py-2 font-mono">{j.reference}</td>
                  <td className={`py-2 text-right font-mono tabular-nums font-semibold ${j.delta < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                    {j.delta > 0 ? `+${j.delta}` : j.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'shopping' && (
        <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-3">
          <h3 className="font-display font-semibold text-sm inline-flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700" /> Automated Par-Level Shopping List
          </h3>
          {shoppingList.length === 0 ? (
            <div className="text-xs text-stone-500 py-6">All ingredients are above par level.</div>
          ) : (
            <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
              {shoppingList.map((i) => (
                <div key={i.id} className="py-2.5 flex justify-between">
                  <span className="font-semibold">{i.name}</span>
                  <span className="font-mono text-amber-700 dark:text-amber-400">
                    On hand {i.quantityOnHand} {i.unit} / Par {i.parLevel} {i.unit} · Suggest order{' '}
                    {Math.max(1, i.parLevel * 2 - i.quantityOnHand).toFixed(1)} {i.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'waste' && (
        <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4">
          <h3 className="font-display font-semibold text-sm inline-flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-red-600" /> Food Waste & Spoilage Log
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
            <select
              value={wasteIngId}
              onChange={(e) => setWasteIngId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            >
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.unit})
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.1"
              value={wasteQty}
              onChange={(e) => setWasteQty(Number(e.target.value))}
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
            />
            <select
              value={wasteReason}
              onChange={(e) => setWasteReason(e.target.value as any)}
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            >
              <option value="Spoilage">Spoilage</option>
              <option value="Prep Error">Prep Error</option>
              <option value="Expired">Expired</option>
              <option value="Customer Return">Customer Return</option>
            </select>
            <button
              onClick={async () => {
                if (!wasteIngId || wasteQty <= 0) return;
                await mutate('log_waste', { ingredientId: wasteIngId, quantity: wasteQty, reason: wasteReason });
                notify('Food waste logged & stock updated', 'success');
              }}
              className="px-4 py-2 rounded-lg bg-red-700 text-white font-semibold"
            >
              Log Waste
            </button>
          </div>
          <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
            {(db?.wasteLogs || []).map((w) => (
              <div key={w.id} className="py-2.5 flex justify-between">
                <span>
                  {w.ingredientName} ({w.quantity}) · {w.reason} · by {w.loggedBy}
                </span>
                <span className="font-mono text-red-600 font-semibold">{formatMoney(w.costValue, sym)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
