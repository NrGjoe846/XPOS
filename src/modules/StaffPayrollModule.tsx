import React, { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, Printer, Clock } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatMoney } from '../utils/taxEngine';
import { enqueueOfflinePunch, getQueuedPunches, OfflineAttendancePunch, removeQueuedPunch } from '../utils/offlineQueue';

export const StaffPayrollModule: React.FC = () => {
  const { db, activeBranch, activeBranchId, currentStaff, mutate, refreshState, notify } = useApp();
  const sym = activeBranch?.currencySymbol || '₹';

  const [tab, setTab] = useState<'attendance' | 'shifts' | 'payroll' | 'roster'>('attendance');
  const [simulateOffline, setSimulateOffline] = useState(false);
  const [queuedPunches, setQueuedPunches] = useState<OfflineAttendancePunch[]>([]);
  const [periodLabel, setPeriodLabel] = useState('Nov 2026 Pay Cycle');
  const [tipPoolOverride, setTipPoolOverride] = useState<string>('');

  // Shift & Staff forms
  const [shiftStaffId, setShiftStaffId] = useState(db?.staff[0]?.id || 'st-3');
  const [shiftDays, setShiftDays] = useState('Mon–Sat');
  const [shiftStart, setShiftStart] = useState('09:00');
  const [shiftEnd, setShiftEnd] = useState('18:00');
  const [shiftStation, setShiftStation] = useState('POS Counter');

  const loadQueue = async () => {
    setQueuedPunches(await getQueuedPunches());
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handleClockAction = async (action: 'clock_in' | 'clock_out') => {
    if (!currentStaff) return;
    const punch: OfflineAttendancePunch = {
      localId: `punch-${Date.now()}`,
      branchId: activeBranchId,
      staffId: currentStaff.id,
      staffName: currentStaff.name,
      action,
      timestamp: new Date().toISOString(),
    };

    if (simulateOffline || !navigator.onLine) {
      await enqueueOfflinePunch(punch);
      await loadQueue();
      notify(`Offline mode: queued ${action.replace('_', ' ')} locally in IndexedDB`, 'warning');
      return;
    }

    const res = await fetch('/api/attendance/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ punches: [punch] }),
    });
    if (res.ok) {
      await refreshState();
      notify(`${currentStaff.name} clocked ${action === 'clock_in' ? 'in' : 'out'}`, 'success');
    }
  };

  const syncOfflineQueue = async () => {
    if (queuedPunches.length === 0) return;
    const res = await fetch('/api/attendance/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ punches: queuedPunches }),
    });
    if (res.ok) {
      for (const p of queuedPunches) await removeQueuedPunch(p.localId);
      await loadQueue();
      await refreshState();
      notify(`Synced ${queuedPunches.length} offline mobile punches`, 'success');
    }
  };

  const generatePayroll = async () => {
    const res = await fetch('/api/payroll/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branchId: activeBranchId,
        periodLabel,
        tipPoolTotal: tipPoolOverride ? Number(tipPoolOverride) : undefined,
      }),
    });
    if (res.ok) {
      await refreshState();
      notify('Payroll & hour-weighted tip pool calculated', 'success');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1 p-1 bg-stone-100 dark:bg-stone-900 rounded-lg w-fit text-xs">
        {(
          [
            ['attendance', 'Attendance (Offline Capable)'],
            ['shifts', 'Shifts & Leave'],
            ['payroll', 'Payroll & Tip Pool Payslips'],
            ['roster', 'Staff Accounts & Rates'],
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

      {tab === 'attendance' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-display font-semibold text-sm inline-flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-700" /> Mobile & Terminal Clock-In / Clock-Out
              </h3>
              <p className="text-xs text-stone-500">
                Active Operator: <span className="font-semibold text-stone-900 dark:text-stone-100">{currentStaff?.name}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                onClick={() => setSimulateOffline((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border font-medium ${
                  simulateOffline
                    ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                    : 'border-stone-200 dark:border-stone-800'
                }`}
              >
                <WifiOff className="w-3.5 h-3.5" />
                <span>{simulateOffline ? 'Offline Mode Active' : 'Simulate Mobile Offline'}</span>
              </button>
              <button
                onClick={() => handleClockAction('clock_in')}
                className="px-4 py-2 rounded-lg bg-emerald-700 text-white font-semibold"
              >
                Clock In
              </button>
              <button
                onClick={() => handleClockAction('clock_out')}
                className="px-4 py-2 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-semibold"
              >
                Clock Out
              </button>
            </div>
          </div>

          {queuedPunches.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-4 flex items-center justify-between text-xs">
              <span>
                <strong>{queuedPunches.length} offline punch(es)</strong> stored in IndexedDB waiting to sync.
              </span>
              <button
                onClick={() => {
                  setSimulateOffline(false);
                  syncOfflineQueue();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-700 text-white font-semibold"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Sync Queued Punches
              </button>
            </div>
          )}

          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-800 text-stone-500 text-left">
                  <th className="py-2">Staff</th>
                  <th className="py-2">Date</th>
                  <th className="py-2">Clock In</th>
                  <th className="py-2">Clock Out</th>
                  <th className="py-2 text-right">Break / Late</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {(db?.attendance || []).map((a) => (
                  <tr key={a.id}>
                    <td className="py-2.5 font-medium">
                      {a.staffName} {a.offlineSynced ? <span className="text-[10px] text-amber-700">(Offline Synced)</span> : ''}
                    </td>
                    <td className="py-2.5 font-mono">{a.date}</td>
                    <td className="py-2.5 font-mono">{new Date(a.clockIn).toLocaleTimeString()}</td>
                    <td className="py-2.5 font-mono">{a.clockOut ? new Date(a.clockOut).toLocaleTimeString() : 'Active'}</td>
                    <td className="py-2.5 text-right font-mono">{a.breakMinutes}m / {a.lateMinutes}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'shifts' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-3">
            <h3 className="font-display font-semibold text-sm">Shift Scheduling</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <select
                value={shiftStaffId}
                onChange={(e) => setShiftStaffId(e.target.value)}
                className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
              >
                {(db?.staff || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input
                value={shiftDays}
                onChange={(e) => setShiftDays(e.target.value)}
                className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
              />
              <input type="time" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]" />
              <input type="time" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]" />
              <input
                value={shiftStation}
                onChange={(e) => setShiftStation(e.target.value)}
                className="col-span-2 px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
              />
            </div>
            <button
              onClick={() => {
                const st = db?.staff.find((s) => s.id === shiftStaffId);
                if (!st) return;
                mutate('add_shift', {
                  branchId: activeBranchId,
                  staffId: st.id,
                  staffName: st.name,
                  dayOfWeek: shiftDays,
                  startTime: shiftStart,
                  endTime: shiftEnd,
                  station: shiftStation,
                });
              }}
              className="px-4 py-2 rounded-lg bg-amber-700 text-white text-xs font-semibold"
            >
              Assign Shift
            </button>
            <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs pt-2">
              {(db?.shifts || []).map((sh) => (
                <div key={sh.id} className="py-2 flex justify-between">
                  <span className="font-semibold">
                    {sh.staffName} · {sh.station}
                  </span>
                  <span className="font-mono text-stone-500">
                    {sh.dayOfWeek} ({sh.startTime}–{sh.endTime})
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-3">
            <h3 className="font-display font-semibold text-sm">Leave Requests & Approvals</h3>
            <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
              {(db?.leaves || []).map((lv) => (
                <div key={lv.id} className="py-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{lv.staffName}</div>
                    <div className="text-stone-500">
                      {lv.fromDate} → {lv.toDate} · {lv.reason}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {lv.status === 'pending' ? (
                      <>
                        <button
                          onClick={() => mutate('update_leave', { id: lv.id, status: 'approved' })}
                          className="px-2.5 py-1 rounded bg-emerald-700 text-white font-semibold"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => mutate('update_leave', { id: lv.id, status: 'rejected' })}
                          className="px-2.5 py-1 rounded border border-red-300 text-red-700"
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <span className="capitalize font-semibold text-stone-500">{lv.status}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'payroll' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 flex flex-wrap items-end gap-3 text-xs">
            <div>
              <label className="block font-medium mb-1">Pay Period</label>
              <input
                value={periodLabel}
                onChange={(e) => setPeriodLabel(e.target.value)}
                className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Tip Pool Override (blank = live collected tips)</label>
              <input
                type="number"
                value={tipPoolOverride}
                onChange={(e) => setTipPoolOverride(e.target.value)}
                placeholder="Auto from orders"
                className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
              />
            </div>
            <button onClick={generatePayroll} className="px-4 py-2 rounded-lg bg-amber-700 text-white font-semibold">
              Run Payroll & Split Tips by Hours
            </button>
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800">
              <Printer className="w-3.5 h-3.5" /> Print Payslips
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(db?.payslips || []).map((p) => (
              <div key={p.id} className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-2 text-xs">
                <div className="flex justify-between border-b border-stone-100 dark:border-stone-800 pb-2">
                  <div>
                    <div className="font-display font-bold text-sm">{p.staffName}</div>
                    <div className="text-stone-500">{p.periodLabel}</div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-stone-500">Net Pay</div>
                    <div className="font-bold text-base text-amber-700 dark:text-amber-400">{formatMoney(p.netPay, sym)}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5 font-mono">
                  <div className="text-stone-500">Regular ({p.regularHours}h)</div>
                  <div className="text-right">{formatMoney(p.basePay, sym)}</div>
                  <div className="text-stone-500">Overtime ({p.overtimeHours}h)</div>
                  <div className="text-right">{formatMoney(p.overtimePay, sym)}</div>
                  <div className="text-stone-500">Hour-Weighted Tip Share</div>
                  <div className="text-right text-emerald-700 dark:text-emerald-400">+{formatMoney(p.tipPoolShare, sym)}</div>
                  <div className="text-stone-500">Late / Absence Deductions</div>
                  <div className="text-right text-red-600">-{formatMoney(p.lateDeductions, sym)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'roster' && (
        <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-800 text-stone-500 text-left">
                <th className="py-2">Name</th>
                <th className="py-2">Role</th>
                <th className="py-2">PIN</th>
                <th className="py-2 text-right">Hourly Rate</th>
                <th className="py-2 text-right">2FA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {(db?.staff || []).map((s) => (
                <tr key={s.id}>
                  <td className="py-2.5 font-medium">
                    {s.name}
                    <div className="text-[11px] text-stone-500">{s.email}</div>
                  </td>
                  <td className="py-2.5">{s.roleName}</td>
                  <td className="py-2.5 font-mono">{s.pin}</td>
                  <td className="py-2.5 text-right font-mono">{formatMoney(s.hourlyRate, sym)}/hr</td>
                  <td className="py-2.5 text-right">{s.twoFactorEnabled ? 'Enabled' : 'Off'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
