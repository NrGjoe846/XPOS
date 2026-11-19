import React, { useMemo, useState } from 'react';
import { Bell, Receipt, ShieldCheck, Star, Clock, Share2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { MenuItem, Order, OrderItem } from '../types/pos';
import { formatMoney } from '../utils/taxEngine';
import { playUpiSuccessChime } from '../utils/hardware';

export const OnlineOrderingPortal: React.FC = () => {
  const { db, activeBranch, activeBranchId, createOrder, payOrder, refreshState, notify } = useApp();
  const sym = activeBranch?.currencySymbol || '₹';

  const [mode, setMode] = useState<'qr_table' | 'click_collect' | 'scheduled'>('qr_table');
  const [tableId, setTableId] = useState(db?.tables[0]?.id || 'tbl-1');
  const [liveCodeInput, setLiveCodeInput] = useState('');
  const [codeVerified, setCodeVerified] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('2026-11-18T20:00');
  const [payMode, setPayMode] = useState<'pay_at_register' | 'pay_on_phone'>('pay_on_phone');
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [idempotencyKey, setIdempotencyKey] = useState(() => `qr-${Date.now()}`);
  const [submittedOrder, setSubmittedOrder] = useState<Order | null>(null);
  const [ratingScore, setRatingScore] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingDone, setRatingDone] = useState(false);

  const tables = useMemo(
    () => (db?.tables || []).filter((t) => t.branchId === activeBranchId),
    [db?.tables, activeBranchId]
  );

  const selectedTable = tables.find((t) => t.id === tableId);

  const verifyLiveTableCode = async () => {
    const res = await fetch('/api/qr/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableId, code: liveCodeInput }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCodeVerified(false);
      notify(data.error || 'Invalid live code', 'error');
      return;
    }
    setCodeVerified(true);
    notify(`Table ${data.table.label} unlocked for QR ordering`, 'success');
  };

  const addItem = (m: MenuItem) => {
    setCart((prev) => {
      const ex = prev.find((p) => p.menuItemId === m.id);
      if (ex) return prev.map((p) => (p.id === ex.id ? { ...p, quantity: p.quantity + 1 } : p));
      return [
        ...prev,
        {
          id: `qr-it-${Date.now()}-${m.id}`,
          menuItemId: m.id,
          name: m.name,
          quantity: 1,
          unitPrice: m.price,
          taxRate: m.taxRate,
          station: m.station,
          modifiers: [{ name: 'Medium Classic', priceDelta: 0 }],
        },
      ];
    });
  };

  const submitCustomerOrder = async () => {
    if (cart.length === 0) return;
    if (mode === 'qr_table' && !codeVerified) {
      notify('Enter the live 4-digit table code shown by staff first.', 'error');
      return;
    }

    const res = await createOrder({
      channel: mode === 'qr_table' ? 'qr_table' : 'click_collect',
      tableId: mode === 'qr_table' ? tableId : undefined,
      tableSessionCode: mode === 'qr_table' ? liveCodeInput : undefined,
      scheduledFor: mode === 'scheduled' ? scheduledFor : undefined,
      payMode: mode === 'qr_table' ? payMode : 'pay_on_phone',
      idempotencyKey,
      items: cart,
    });
    if (res.error) {
      notify(res.error, 'error');
      return;
    }
    if (res.duplicate) {
      notify('Duplicate submission blocked safely (idempotent)', 'info');
    } else {
      notify(
        payMode === 'pay_on_phone'
          ? 'Order created & held from kitchen until phone payment completes'
          : 'Order sent to kitchen! Pay at the register anytime.',
        'success'
      );
    }
    setSubmittedOrder(res.order || null);
    setCart([]);
    setIdempotencyKey(`qr-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`);
  };

  const completePhonePayment = async () => {
    if (!submittedOrder) return;
    const paid = await payOrder(submittedOrder.id, [
      { method: 'upi', amount: submittedOrder.grandTotal, reference: `QR-UPI-${Date.now().toString().slice(-5)}` },
    ]);
    if (paid) {
      playUpiSuccessChime();
      setSubmittedOrder(paid);
      notify('Phone payment confirmed — KOT released to Kitchen KDS!', 'success');
    }
  };

  const triggerTableAlert = async (type: 'waiter' | 'bill') => {
    await fetch(`/api/tables/${tableId}/alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    });
    await refreshState();
    notify(type === 'waiter' ? 'Waiter notified!' : 'Bill requested!', 'success');
  };

  const cartTotal = cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Dining Room Banner */}
      <div className="relative rounded-xl overflow-hidden border border-stone-200 dark:border-stone-800 h-44">
        <img
          src="/src/assets/images/hero_dining_ambiance_1795061819168.jpg"
          alt="Nodedr OrderRestro Dining Room"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-end p-5">
          <div className="text-white">
            <div className="text-xs opacity-85">{activeBranch?.name} · Guest Self-Order Portal</div>
            <h2 className="font-display font-bold text-xl">Table QR, Click & Collect & Scheduled Ordering</h2>
          </div>
        </div>
      </div>

      {/* Mode & Live Table Security Gate */}
      <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-stone-900 rounded-lg text-xs">
            {(
              [
                ['qr_table', 'QR Table Order'],
                ['click_collect', 'Click & Collect'],
                ['scheduled', 'Scheduled Order'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                className={`px-3 py-1.5 rounded-md font-semibold ${
                  mode === id ? 'bg-white dark:bg-[#1C1917] shadow-sm' : 'text-stone-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'qr_table' && (
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => triggerTableAlert('waiter')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-900"
              >
                <Bell className="w-3.5 h-3.5 text-amber-700" /> Call Waiter
              </button>
              <button
                onClick={() => triggerTableAlert('bill')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-900"
              >
                <Receipt className="w-3.5 h-3.5 text-amber-700" /> Request Bill
              </button>
            </div>
          )}
        </div>

        {mode === 'qr_table' && (
          <div className="p-4 rounded-lg bg-[#FAF9F6] dark:bg-[#12100E] border border-stone-200 dark:border-stone-800 flex flex-wrap items-center gap-3 text-xs">
            <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
            <select
              value={tableId}
              onChange={(e) => {
                setTableId(e.target.value);
                setCodeVerified(false);
              }}
              className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#171412]"
            >
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  Table {t.label} ({t.sessionCodeActive ? `Active code: ${t.sessionCode}` : 'Session closed'})
                </option>
              ))}
            </select>
            <input
              value={liveCodeInput}
              onChange={(e) => setLiveCodeInput(e.target.value)}
              placeholder="Enter live 4-digit table code"
              className="w-48 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#171412] font-mono"
            />
            <button onClick={verifyLiveTableCode} className="px-3.5 py-1.5 rounded-lg bg-amber-700 text-white font-semibold">
              Unlock Table
            </button>
            {codeVerified && <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Verified for {selectedTable?.label}</span>}
          </div>
        )}

        {mode === 'scheduled' && (
          <div className="flex items-center gap-2 text-xs">
            <Clock className="w-4 h-4 text-amber-700" />
            <span>Pickup Time:</span>
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            />
          </div>
        )}
      </div>

      {/* Menu & Guest Basket */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(db?.menuItems || [])
            .filter((m) => m.available)
            .map((m) => (
              <div key={m.id} className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden flex flex-col">
                {m.imageUrl && (
                  <img src={m.imageUrl} alt={m.name} referrerPolicy="no-referrer" className="h-32 w-full object-cover" />
                )}
                <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
                  <div>
                    <div className="font-display font-semibold text-sm">{m.name}</div>
                    <p className="text-xs text-stone-500 line-clamp-2 mt-0.5">{m.description}</p>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-mono font-bold text-sm text-amber-700 dark:text-amber-400">
                      {formatMoney(m.price, sym)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          navigator.clipboard?.writeText(`${window.location.origin}/?mode=qr&dish=${m.id}&ref=ROHAN50`);
                          notify('Copied dish referral link!', 'info');
                        }}
                        className="p-1.5 rounded border border-stone-200 dark:border-stone-800"
                        title="Share dish referral"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => addItem(m)}
                        className="px-3 py-1.5 rounded-lg bg-amber-700 text-white text-xs font-semibold"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4">
          <h3 className="font-display font-bold text-base">Your Order Basket</h3>
          {cart.length === 0 ? (
            <div className="text-xs text-stone-500 py-6">Tap any dish to add it to your order.</div>
          ) : (
            <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
              {cart.map((c) => (
                <div key={c.id} className="py-2 flex justify-between">
                  <span>
                    {c.quantity}× {c.name}
                  </span>
                  <span className="font-mono">{formatMoney(c.unitPrice * c.quantity, sym)}</span>
                </div>
              ))}
            </div>
          )}

          {mode === 'qr_table' && (
            <div className="space-y-1.5 text-xs">
              <div className="font-semibold">Payment Choice</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPayMode('pay_on_phone')}
                  className={`py-2 px-2.5 rounded-lg border text-xs font-medium ${
                    payMode === 'pay_on_phone' ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/40' : 'border-stone-200 dark:border-stone-800'
                  }`}
                >
                  Pay on Phone (Held from KDS until paid)
                </button>
                <button
                  onClick={() => setPayMode('pay_at_register')}
                  className={`py-2 px-2.5 rounded-lg border text-xs font-medium ${
                    payMode === 'pay_at_register' ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/40' : 'border-stone-200 dark:border-stone-800'
                  }`}
                >
                  Pay at Register
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-between font-bold text-sm pt-2 border-t border-stone-200 dark:border-stone-800">
            <span>Estimated Subtotal</span>
            <span className="font-mono">{formatMoney(cartTotal, sym)}</span>
          </div>

          <button
            onClick={submitCustomerOrder}
            disabled={cart.length === 0}
            className="w-full py-2.5 rounded-lg bg-amber-700 text-white text-xs font-semibold disabled:opacity-40"
          >
            Place Order
          </button>

          {submittedOrder && (
            <div className="p-4 rounded-xl bg-[#FAF9F6] dark:bg-[#12100E] border border-stone-200 dark:border-stone-800 space-y-3 text-xs">
              <div className="flex justify-between font-bold">
                <span>Order {submittedOrder.orderNumber}</span>
                <span className="uppercase text-amber-700">{submittedOrder.status.replace('_', ' ')}</span>
              </div>
              {submittedOrder.status === 'awaiting_payment' && (
                <button
                  onClick={completePhonePayment}
                  className="w-full py-2 rounded-lg bg-emerald-700 text-white font-semibold"
                >
                  Complete Phone Payment ({formatMoney(submittedOrder.grandTotal, sym)}) & Release to Kitchen
                </button>
              )}
              {submittedOrder.status === 'paid' && !ratingDone && (
                <div className="space-y-2 pt-2 border-t border-stone-200 dark:border-stone-800">
                  <div className="font-semibold inline-flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-600" /> Rate Your Experience
                  </div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        onClick={() => setRatingScore(s)}
                        className={`px-2 py-1 rounded border font-mono ${
                          ratingScore >= s ? 'bg-amber-600 text-white border-amber-600' : 'border-stone-300'
                        }`}
                      >
                        {s}★
                      </button>
                    ))}
                  </div>
                  <input
                    value={ratingComment}
                    onChange={(e) => setRatingComment(e.target.value)}
                    placeholder="Optional feedback..."
                    className="w-full px-2.5 py-1.5 rounded border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#171412]"
                  />
                  <button
                    onClick={async () => {
                      await fetch(`/api/orders/${submittedOrder.id}/rate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ score: ratingScore, comment: ratingComment }),
                      });
                      setRatingDone(true);
                      notify('Thank you for your feedback!', 'success');
                    }}
                    className="px-3 py-1.5 rounded bg-stone-900 text-white font-semibold"
                  >
                    Submit Rating
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
