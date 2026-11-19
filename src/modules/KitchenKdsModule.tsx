import React, { useEffect, useMemo, useState } from 'react';
import { Clock, CheckCircle2, Flame, RotateCcw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { KotStation, KotStatus } from '../types/pos';

const STATIONS: ('All' | KotStation)[] = [
  'All',
  'Main Kitchen',
  'Tandoor & Grill',
  'South Indian',
  'Bar & Beverages',
  'Pastry',
];

export const KitchenKdsModule: React.FC = () => {
  const { db, activeBranchId, refreshState, notify } = useApp();
  const [station, setStation] = useState<'All' | KotStation>('All');
  const [tab, setTab] = useState<'board' | 'performance'>('board');
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);

  const kots = useMemo(() => {
    return (db?.kots || []).filter(
      (k) => k.branchId === activeBranchId && (station === 'All' || k.station === station)
    );
  }, [db?.kots, activeBranchId, station]);

  const activeKots = kots.filter((k) => k.status !== 'served');
  const completedKots = kots.filter((k) => k.status === 'served');

  const bumpKot = async (kotId: string, nextStatus: KotStatus) => {
    const res = await fetch(`/api/kots/${kotId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (res.ok) {
      await refreshState();
      notify(`KOT moved to ${nextStatus}`, 'success');
    }
  };

  const stationMetrics = useMemo(() => {
    return STATIONS.filter((s) => s !== 'All').map((st) => {
      const list = (db?.kots || []).filter((k) => k.branchId === activeBranchId && k.station === st);
      const served = list.filter((k) => k.readyAt);
      const avgMins =
        served.length > 0
          ? Math.round(
              served.reduce(
                (s, k) => s + (new Date(k.readyAt!).getTime() - new Date(k.createdAt).getTime()) / 60000,
                0
              ) / served.length
            )
          : 11;
      return { station: st, total: list.length, active: list.filter((k) => k.status !== 'served').length, avgMins };
    });
  }, [db?.kots, activeBranchId]);

  return (
    <div className="space-y-5">
      {/* Station Router & View Switcher */}
      <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {STATIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStation(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                station === s
                  ? 'bg-amber-700 text-white'
                  : 'bg-stone-100 dark:bg-stone-900 text-stone-600 dark:text-stone-400'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-stone-900 rounded-lg text-xs">
          <button
            onClick={() => setTab('board')}
            className={`px-3 py-1 rounded-md font-semibold ${
              tab === 'board' ? 'bg-white dark:bg-[#1C1917] shadow-sm' : 'text-stone-500'
            }`}
          >
            Live KOT Board ({activeKots.length})
          </button>
          <button
            onClick={() => setTab('performance')}
            className={`px-3 py-1 rounded-md font-semibold ${
              tab === 'performance' ? 'bg-white dark:bg-[#1C1917] shadow-sm' : 'text-stone-500'
            }`}
          >
            Prep Performance
          </button>
        </div>
      </div>

      {tab === 'board' ? (
        <div className="space-y-4">
          {activeKots.length === 0 ? (
            <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-12 text-center text-sm text-stone-500">
              All kitchen tickets for {station} are cleared.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeKots.map((kot) => {
                const elapsedMin = Math.max(0, Math.floor((nowMs - new Date(kot.createdAt).getTime()) / 60000));
                const urgent = elapsedMin >= 15;
                return (
                  <div
                    key={kot.id}
                    className={`bg-white dark:bg-[#171412] border rounded-xl p-4 flex flex-col justify-between space-y-4 ${
                      urgent ? 'border-red-500' : 'border-stone-200 dark:border-stone-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-2.5">
                        <div>
                          <div className="font-mono font-bold text-sm">{kot.kotNumber}</div>
                          <div className="text-xs text-stone-500">
                            {kot.orderNumber} · {kot.tableLabel} · {kot.station}
                          </div>
                        </div>
                        <div className={`inline-flex items-center gap-1 text-xs font-mono font-semibold ${urgent ? 'text-red-600' : 'text-amber-700 dark:text-amber-400'}`}>
                          <Clock className="w-3.5 h-3.5" />
                          <span>{elapsedMin}m</span>
                        </div>
                      </div>

                      <div className="mt-3 space-y-2">
                        {kot.items.map((it) => (
                          <div key={it.id} className="text-sm flex items-start gap-2">
                            <span className="font-mono font-bold text-amber-700 dark:text-amber-400">{it.quantity}×</span>
                            <div>
                              <div className="font-medium">{it.name}</div>
                              {it.modifiers.length > 0 && (
                                <div className="text-xs text-stone-500">{it.modifiers.map((m) => m.name).join(', ')}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">{kot.status}</span>
                      <div className="flex gap-1.5">
                        {kot.status === 'queued' && (
                          <button
                            onClick={() => bumpKot(kot.id, 'preparing')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-700 text-white text-xs font-semibold"
                          >
                            <Flame className="w-3.5 h-3.5" /> Start Prep
                          </button>
                        )}
                        {kot.status === 'preparing' && (
                          <button
                            onClick={() => bumpKot(kot.id, 'ready')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Mark Ready
                          </button>
                        )}
                        {kot.status === 'ready' && (
                          <button
                            onClick={() => bumpKot(kot.id, 'served')}
                            className="px-3 py-1.5 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-semibold"
                          >
                            Bump Served
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {completedKots.length > 0 && (
            <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-4">
              <div className="text-xs font-semibold text-stone-500 mb-2">Recently Served (Recall)</div>
              <div className="flex flex-wrap gap-2">
                {completedKots.slice(0, 6).map((k) => (
                  <button
                    key={k.id}
                    onClick={() => bumpKot(k.id, 'ready')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 text-xs hover:bg-stone-50 dark:hover:bg-stone-900"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Recall {k.kotNumber} ({k.tableLabel})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5">
          <h3 className="font-display font-semibold text-sm mb-4">Station Prep Performance & SLA</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-800 text-stone-500 text-left">
                <th className="py-2">Kitchen Station</th>
                <th className="py-2 text-right">Total KOTs</th>
                <th className="py-2 text-right">Active Queue</th>
                <th className="py-2 text-right">Avg Prep Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {stationMetrics.map((m) => (
                <tr key={m.station}>
                  <td className="py-2.5 font-medium">{m.station}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums">{m.total}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums">{m.active}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums">{m.avgMins} mins</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
