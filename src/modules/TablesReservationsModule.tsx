import React, { useMemo, useState } from 'react';
import { BellRing, QrCode, ArrowRightLeft, Save, Users, CalendarClock } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { RestaurantTable, TableStatus } from '../types/pos';

const STATUS_STYLE: Record<TableStatus, string> = {
  free: 'border-stone-300 dark:border-stone-700 bg-white dark:bg-[#171412]',
  ordering: 'border-sky-400 bg-sky-50/70 dark:bg-sky-950/40',
  preparing: 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/40',
  served: 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40',
  billing: 'border-purple-500 bg-purple-50/70 dark:bg-purple-950/40',
  cleaning: 'border-stone-400 bg-stone-100 dark:bg-stone-900',
  reserved: 'border-indigo-400 bg-indigo-50/70 dark:bg-indigo-950/40',
};

export const TablesReservationsModule: React.FC = () => {
  const { db, activeBranchId, mutate, refreshState, notify, setActiveModule } = useApp();
  const [activeLayoutId, setActiveLayoutId] = useState<string>('lay-main');
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [qrPreview, setQrPreview] = useState<{ table: RestaurantTable; dataUrl: string } | null>(null);
  const [transferFrom, setTransferFrom] = useState('');
  const [transferTo, setTransferTo] = useState('');

  // Reservation & Waitlist forms
  const [resName, setResName] = useState('');
  const [resPhone, setResPhone] = useState('');
  const [resParty, setResParty] = useState(4);
  const [resTime, setResTime] = useState('2026-11-18T20:00');
  const [wlName, setWlName] = useState('');
  const [wlPhone, setWlPhone] = useState('');
  const [wlParty, setWlParty] = useState(2);

  const layouts = useMemo(
    () => (db?.floorLayouts || []).filter((l) => l.branchId === activeBranchId),
    [db?.floorLayouts, activeBranchId]
  );

  const tables = useMemo(
    () =>
      (db?.tables || []).filter(
        (t) => t.branchId === activeBranchId && (layouts.length === 0 || t.layoutId === activeLayoutId)
      ),
    [db?.tables, activeBranchId, activeLayoutId, layouts.length]
  );

  const openSessionCode = async (tableId: string) => {
    const res = await fetch(`/api/tables/${tableId}/open-session`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      await refreshState();
      notify(`Live table code opened: ${data.code}`, 'success');
    }
  };

  const showTableQr = async (tbl: RestaurantTable) => {
    const qrUrl = `${window.location.origin}/?mode=qr&branch=${tbl.branchId}&table=${tbl.id}`;
    const res = await fetch(`/api/qrcode?text=${encodeURIComponent(qrUrl)}`);
    const data = await res.json();
    setQrPreview({ table: tbl, dataUrl: data.dataUrl || '' });
  };

  const saveLayout = async () => {
    const payload = tables.map((t) => ({
      id: t.id,
      x: positions[t.id]?.x ?? t.x,
      y: positions[t.id]?.y ?? t.y,
    }));
    await mutate('save_table_layout', { tables: payload });
    setEditMode(false);
    notify('Floor plan layout saved', 'success');
  };

  const handleBulkStatus = async (status: TableStatus) => {
    if (selectedIds.length === 0) return;
    await mutate('bulk_table_status', { tableIds: selectedIds, status });
    setSelectedIds([]);
    notify(`Updated ${selectedIds.length} tables to ${status}`, 'success');
  };

  const handleTransfer = async () => {
    if (!transferFrom || !transferTo || transferFrom === transferTo) return;
    await fetch('/api/tables/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromTableId: transferFrom, toTableId: transferTo }),
    });
    await refreshState();
    setTransferFrom('');
    setTransferTo('');
    notify('Table order transferred', 'success');
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-stone-900 rounded-lg">
            {layouts.map((l) => (
              <button
                key={l.id}
                onClick={() => setActiveLayoutId(l.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap ${
                  activeLayoutId === l.id
                    ? 'bg-white dark:bg-[#1C1917] text-stone-900 dark:text-stone-100 shadow-sm'
                    : 'text-stone-600 dark:text-stone-400'
                }`}
              >
                {l.name}
              </button>
            ))}
          </div>

          <button
            onClick={() => (editMode ? saveLayout() : setEditMode(true))}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              editMode
                ? 'bg-amber-700 text-white border-amber-700'
                : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-900'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>{editMode ? 'Save Layout' : 'Edit Positions'}</span>
          </button>
        </div>

        {/* Bulk Table Tools & Table Transfer */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-stone-500">{selectedIds.length} selected:</span>
              <button onClick={() => handleBulkStatus('free')} className="px-2.5 py-1 rounded border border-stone-200 dark:border-stone-800">
                Mark Free
              </button>
              <button onClick={() => handleBulkStatus('cleaning')} className="px-2.5 py-1 rounded border border-stone-200 dark:border-stone-800">
                Mark Cleaning
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <select
              value={transferFrom}
              onChange={(e) => setTransferFrom(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            >
              <option value="">Transfer From...</option>
              {tables
                .filter((t) => t.currentOrderId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
            </select>
            <ArrowRightLeft className="w-3.5 h-3.5 text-stone-400" />
            <select
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            >
              <option value="">To Free Table...</option>
              {tables
                .filter((t) => t.status === 'free')
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
            </select>
            <button onClick={handleTransfer} className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 font-medium">
              Move
            </button>
          </div>
        </div>
      </div>

      {/* Visual Floor Plan Canvas */}
      <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5">
        <div className="relative w-full min-h-[360px] rounded-lg border border-dashed border-stone-300 dark:border-stone-700 bg-[#FAF9F6] dark:bg-[#100E0C] overflow-x-auto p-4">
          <div className="relative min-w-[600px] h-[330px]">
            {tables.map((t) => {
              const pos = positions[t.id] || { x: t.x, y: t.y };
              const checked = selectedIds.includes(t.id);
              return (
                <div
                  key={t.id}
                  style={{ left: pos.x, top: pos.y }}
                  className={`absolute w-36 p-3 border-2 transition-shadow ${
                    t.shape === 'round' ? 'rounded-2xl' : 'rounded-xl'
                  } ${STATUS_STYLE[t.status]}`}
                >
                  <div className="flex items-center justify-between">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setSelectedIds((prev) =>
                            e.target.checked ? [...prev, t.id] : prev.filter((x) => x !== t.id)
                          )
                        }
                        className="rounded"
                      />
                      <span className="font-display font-bold text-sm">{t.label}</span>
                    </label>
                    <span className="text-[11px] font-mono text-stone-500">{t.seats}p</span>
                  </div>

                  <div className="mt-1 text-[11px] capitalize font-medium text-stone-600 dark:text-stone-300">
                    {t.status} · Code{' '}
                    <span className="font-mono font-bold text-stone-900 dark:text-stone-100">
                      {t.sessionCodeActive ? t.sessionCode : 'Closed'}
                    </span>
                  </div>

                  {(t.waiterAlert || t.billAlert) && (
                    <div className="mt-1.5 flex items-center justify-between text-[11px] font-semibold text-red-700 dark:text-red-400">
                      <span>{t.billAlert ? 'Bill Requested' : 'Waiter Called'}</span>
                      <button
                        onClick={async () => {
                          await fetch(`/api/tables/${t.id}/alert`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ type: 'clear' }),
                          });
                          refreshState();
                        }}
                        className="underline"
                      >
                        Ack
                      </button>
                    </div>
                  )}

                  {editMode ? (
                    <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
                      <button
                        onClick={() => setPositions((p) => ({ ...p, [t.id]: { x: Math.max(10, pos.x - 20), y: pos.y } }))}
                        className="border rounded py-0.5"
                      >
                        ← Left
                      </button>
                      <button
                        onClick={() => setPositions((p) => ({ ...p, [t.id]: { x: pos.x + 20, y: pos.y } }))}
                        className="border rounded py-0.5"
                      >
                        Right →
                      </button>
                      <button
                        onClick={() => setPositions((p) => ({ ...p, [t.id]: { x: pos.x, y: Math.max(10, pos.y - 20) } }))}
                        className="border rounded py-0.5"
                      >
                        ↑ Up
                      </button>
                      <button
                        onClick={() => setPositions((p) => ({ ...p, [t.id]: { x: pos.x, y: pos.y + 20 } }))}
                        className="border rounded py-0.5"
                      >
                        Down ↓
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2.5 flex items-center justify-between gap-1">
                      <button
                        onClick={() => openSessionCode(t.id)}
                        className="px-2 py-1 rounded bg-amber-700 text-white text-[10px] font-semibold"
                        title="Open or rotate live 4-digit table code"
                      >
                        Live Code
                      </button>
                      <button
                        onClick={() => showTableQr(t)}
                        className="p-1 rounded border border-stone-200 dark:border-stone-700"
                        title="Table QR & NFC"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => mutate('toggle_buzzer', { tableId: t.id })}
                        className={`p-1 rounded border ${t.buzzerActive ? 'bg-amber-600 text-white border-amber-600' : 'border-stone-200 dark:border-stone-700'}`}
                        title={`Page buzzer ${t.buzzerNumber || ''}`}
                      >
                        <BellRing className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Reservations & Waitlist Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Reservations */}
        <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold text-sm inline-flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-amber-700" /> Table Reservations
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <input
              value={resName}
              onChange={(e) => setResName(e.target.value)}
              placeholder="Guest name"
              className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            />
            <input
              value={resPhone}
              onChange={(e) => setResPhone(e.target.value)}
              placeholder="Phone"
              className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            />
            <input
              type="number"
              min={1}
              value={resParty}
              onChange={(e) => setResParty(Number(e.target.value))}
              className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
            />
            <button
              onClick={async () => {
                if (!resName.trim()) return;
                await mutate('add_reservation', {
                  branchId: activeBranchId,
                  customerName: resName,
                  phone: resPhone,
                  partySize: resParty,
                  dateTime: resTime,
                  status: 'confirmed',
                });
                setResName('');
                setResPhone('');
              }}
              className="px-3 py-1.5 rounded-lg bg-amber-700 text-white font-semibold"
            >
              Book
            </button>
          </div>
          <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
            {(db?.reservations || [])
              .filter((r) => r.branchId === activeBranchId)
              .map((r) => (
                <div key={r.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">
                      {r.customerName} · {r.partySize} guests
                    </div>
                    <div className="text-stone-500">
                      {new Date(r.dateTime).toLocaleString()} · {r.phone}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium capitalize text-stone-500">{r.status}</span>
                    {r.status === 'confirmed' && (
                      <button
                        onClick={() => mutate('update_reservation_status', { id: r.id, status: 'seated' })}
                        className="px-2 py-1 rounded border border-emerald-600 text-emerald-700 dark:text-emerald-400 font-medium"
                      >
                        Seat
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Waitlist & Buzzer Queue */}
        <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4">
          <h3 className="font-display font-semibold text-sm inline-flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-700" /> Walk-in Waitlist & Paging Buzzers
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <input
              value={wlName}
              onChange={(e) => setWlName(e.target.value)}
              placeholder="Guest name"
              className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            />
            <input
              value={wlPhone}
              onChange={(e) => setWlPhone(e.target.value)}
              placeholder="Phone"
              className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            />
            <input
              type="number"
              min={1}
              value={wlParty}
              onChange={(e) => setWlParty(Number(e.target.value))}
              className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
            />
            <button
              onClick={async () => {
                if (!wlName.trim()) return;
                await mutate('add_waitlist', {
                  branchId: activeBranchId,
                  customerName: wlName,
                  phone: wlPhone,
                  partySize: wlParty,
                  quotedMinutes: 15,
                  buzzerNumber: `BZ-${Math.floor(10 + Math.random() * 80)}`,
                });
                setWlName('');
                setWlPhone('');
              }}
              className="px-3 py-1.5 rounded-lg bg-amber-700 text-white font-semibold"
            >
              Add Queue
            </button>
          </div>
          <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
            {(db?.waitlist || [])
              .filter((w) => w.branchId === activeBranchId)
              .map((w) => (
                <div key={w.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">
                      {w.customerName} ({w.partySize}p) · Buzzer {w.buzzerNumber}
                    </div>
                    <div className="text-stone-500">
                      Quoted {w.quotedMinutes}m · Status: {w.status}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {w.status === 'waiting' && (
                      <button
                        onClick={() => mutate('update_waitlist', { id: w.id, status: 'paged' })}
                        className="px-2 py-1 rounded border border-amber-600 text-amber-800 dark:text-amber-300 font-medium"
                      >
                        Page Buzzer
                      </button>
                    )}
                    {w.status !== 'seated' && (
                      <button
                        onClick={() => mutate('update_waitlist', { id: w.id, status: 'seated' })}
                        className="px-2 py-1 rounded border border-emerald-600 text-emerald-700 dark:text-emerald-400 font-medium"
                      >
                        Seat
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Table QR & Live Code Modal */}
      {qrPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl max-w-sm w-full p-6 text-center space-y-4">
            <h4 className="font-display font-bold text-base">Table {qrPreview.table.label} — QR & NFC Ordering</h4>
            {qrPreview.dataUrl && (
              <img src={qrPreview.dataUrl} alt="Table QR" className="w-48 h-48 mx-auto rounded-lg border bg-white p-2" />
            )}
            <div className="p-3 rounded-lg bg-[#FAF9F6] dark:bg-[#12100E] border border-stone-200 dark:border-stone-800 text-xs space-y-1">
              <div>
                Live Staff Code:{' '}
                <span className="font-mono font-bold text-base text-amber-700 dark:text-amber-400">
                  {qrPreview.table.sessionCodeActive ? qrPreview.table.sessionCode : 'INACTIVE'}
                </span>
              </div>
              <div className="text-stone-500">
                A photo of this QR cannot place an order without the active 4-digit staff table code.
              </div>
            </div>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => setQrPreview(null)}
                className="px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 text-xs"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setQrPreview(null);
                  setActiveModule('online_qr');
                }}
                className="px-4 py-1.5 rounded-lg bg-amber-700 text-white text-xs font-semibold"
              >
                Test Guest QR Flow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
