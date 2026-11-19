import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { KotStation } from '../types/pos';
import { formatMoney } from '../utils/taxEngine';

export const MenuManagementModule: React.FC = () => {
  const { db, activeBranch, mutate, notify } = useApp();
  const sym = activeBranch?.currencySymbol || '₹';

  const [tab, setTab] = useState<'items' | 'categories' | 'combos' | 'seasonal'>('items');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState(db?.categories[0]?.id || 'cat-mains');
  const [price, setPrice] = useState(250);
  const [taxRate, setTaxRate] = useState(5);
  const [station, setStation] = useState<KotStation>('Main Kitchen');
  const [dietary, setDietary] = useState<'veg' | 'non_veg' | 'vegan'>('veg');
  const [availFrom, setAvailFrom] = useState('07:00');
  const [availTo, setAvailTo] = useState('23:00');

  const [catName, setCatName] = useState('');
  const [catSchedule, setCatSchedule] = useState('All Day');
  const [comboName, setComboName] = useState('');
  const [comboPrice, setComboPrice] = useState(499);
  const [seasonalName, setSeasonalName] = useState('');

  const addDish = async () => {
    if (!name.trim()) return;
    await mutate('upsert_menu_item', {
      name,
      categoryId,
      description: 'House specialty prepared fresh to order.',
      price: Number(price),
      taxRate: Number(taxRate),
      station,
      dietary,
      modifierGroupIds: ['mg-spice'],
      available: true,
      availableFrom: availFrom,
      availableTo: availTo,
    });
    setName('');
    notify('Menu item saved', 'success');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-stone-900 rounded-lg w-fit text-xs">
        {(
          [
            ['items', 'Menu Items & Scheduling'],
            ['categories', 'Categories'],
            ['combos', 'Combo Bundles'],
            ['seasonal', 'Seasonal Menus'],
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

      {tab === 'items' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-3">
            <h3 className="font-display font-semibold text-sm">Add Dish & Availability Schedule</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dish name"
                className="sm:col-span-2 px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
              />
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
              >
                {(db?.categories || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                placeholder="Price"
                className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
              />
              <select
                value={station}
                onChange={(e) => setStation(e.target.value as KotStation)}
                className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
              >
                <option value="Main Kitchen">Main Kitchen</option>
                <option value="Tandoor & Grill">Tandoor & Grill</option>
                <option value="South Indian">South Indian</option>
                <option value="Bar & Beverages">Bar & Beverages</option>
                <option value="Pastry">Pastry</option>
              </select>
              <button onClick={addDish} className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-amber-700 text-white font-semibold">
                <Plus className="w-3.5 h-3.5" /> Add Dish
              </button>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-stone-500 items-center">
              <label className="flex items-center gap-1.5">
                Tax %:
                <input
                  type="number"
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                  className="w-16 px-2 py-1 rounded border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
                />
              </label>
              <label className="flex items-center gap-1.5">
                Dietary:
                <select
                  value={dietary}
                  onChange={(e) => setDietary(e.target.value as any)}
                  className="px-2 py-1 rounded border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
                >
                  <option value="veg">Veg</option>
                  <option value="non_veg">Non-Veg</option>
                  <option value="vegan">Vegan</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                Window:
                <input type="time" value={availFrom} onChange={(e) => setAvailFrom(e.target.value)} className="px-2 py-1 rounded border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]" />
                <span>to</span>
                <input type="time" value={availTo} onChange={(e) => setAvailTo(e.target.value)} className="px-2 py-1 rounded border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]" />
              </label>
            </div>
          </div>

          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-800 text-stone-500 text-left">
                  <th className="py-2">Dish Name</th>
                  <th className="py-2">Station</th>
                  <th className="py-2 text-right">Price</th>
                  <th className="py-2 text-right">Last Cost</th>
                  <th className="py-2 text-right">Margin</th>
                  <th className="py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {(db?.menuItems || []).map((m) => {
                  const margin = m.price > 0 ? Math.round(((m.price - m.lastCostPerUnit) / m.price) * 100) : 0;
                  return (
                    <tr key={m.id}>
                      <td className="py-2.5 font-medium">
                        {m.name}
                        <span className="ml-2 text-[11px] text-stone-400">
                          {m.availableFrom ? `${m.availableFrom}-${m.availableTo}` : 'All Day'}
                        </span>
                      </td>
                      <td className="py-2.5 text-stone-500">{m.station}</td>
                      <td className="py-2.5 text-right font-mono tabular-nums font-semibold">{formatMoney(m.price, sym)}</td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-stone-500">{formatMoney(m.lastCostPerUnit, sym)}</td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">{margin}%</td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => mutate('upsert_menu_item', { id: m.id, available: !m.available })}
                          className={`px-2.5 py-1 rounded border text-[11px] font-semibold ${
                            m.available
                              ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                              : 'border-stone-300 text-stone-500'
                          }`}
                        >
                          {m.available ? 'Available' : '86d / Off'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'categories' && (
        <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4">
          <div className="flex gap-2 text-xs">
            <input
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="New category name"
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            />
            <input
              value={catSchedule}
              onChange={(e) => setCatSchedule(e.target.value)}
              placeholder="Schedule (e.g. Happy Hour 16-19)"
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            />
            <button
              onClick={() => {
                if (!catName.trim()) return;
                mutate('add_category', { name: catName, sortOrder: (db?.categories.length || 0) + 1, station: 'Main Kitchen', scheduleTag: catSchedule });
                setCatName('');
              }}
              className="px-4 py-2 rounded-lg bg-amber-700 text-white font-semibold"
            >
              Add Category
            </button>
          </div>
          <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
            {(db?.categories || []).map((c) => (
              <div key={c.id} className="py-2.5 flex justify-between">
                <span className="font-semibold">{c.name}</span>
                <span className="text-stone-500">{c.station} · {c.scheduleTag || 'All Day'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'combos' && (
        <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4">
          <div className="flex gap-2 text-xs">
            <input
              value={comboName}
              onChange={(e) => setComboName(e.target.value)}
              placeholder="Combo title"
              className="flex-1 px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            />
            <input
              type="number"
              value={comboPrice}
              onChange={(e) => setComboPrice(Number(e.target.value))}
              className="w-28 px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
            />
            <button
              onClick={() => {
                if (!comboName.trim()) return;
                mutate('add_combo', {
                  name: comboName,
                  description: 'Curated meal bundle',
                  itemIds: (db?.menuItems || []).slice(0, 2).map((m) => m.id),
                  comboPrice: Number(comboPrice),
                  active: true,
                });
                setComboName('');
              }}
              className="px-4 py-2 rounded-lg bg-amber-700 text-white font-semibold"
            >
              Create Combo
            </button>
          </div>
          <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
            {(db?.combos || []).map((c) => (
              <div key={c.id} className="py-2.5 flex justify-between">
                <div>
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-stone-500">{c.description}</div>
                </div>
                <span className="font-mono font-semibold">{formatMoney(c.comboPrice, sym)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'seasonal' && (
        <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4">
          <div className="flex gap-2 text-xs">
            <input
              value={seasonalName}
              onChange={(e) => setSeasonalName(e.target.value)}
              placeholder="Seasonal menu campaign name"
              className="flex-1 px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            />
            <button
              onClick={() => {
                if (!seasonalName.trim()) return;
                mutate('add_seasonal_menu', { name: seasonalName, startDate: '2026-11-18', endDate: '2027-01-15', active: true });
                setSeasonalName('');
              }}
              className="px-4 py-2 rounded-lg bg-amber-700 text-white font-semibold"
            >
              Add Seasonal Menu
            </button>
          </div>
          <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
            {(db?.seasonalMenus || []).map((s) => (
              <div key={s.id} className="py-2.5 flex justify-between">
                <span className="font-semibold">{s.name}</span>
                <span className="font-mono text-stone-500">{s.startDate} → {s.endDate}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
