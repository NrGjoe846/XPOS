import React, { useEffect, useState } from 'react';
import { SecondScreenPayload } from '../context/AppContext';
import { formatMoney } from '../utils/taxEngine';

export const SecondScreenDisplay: React.FC = () => {
  const [payload, setPayload] = useState<SecondScreenPayload>(() => {
    try {
      const saved = localStorage.getItem('orderrestro_second_screen_state');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {
      branchName: 'Nodedr OrderRestro',
      currencySymbol: '₹',
      items: [],
      subtotal: 0,
      discount: 0,
      taxTotal: 0,
      grandTotal: 0,
      status: 'idle',
    };
  });
  const [qrUrl, setQrUrl] = useState('');

  useEffect(() => {
    const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('orderrestro_second_screen') : null;
    if (bc) {
      bc.onmessage = (ev) => {
        setPayload(ev.data);
      };
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'orderrestro_second_screen_state' && e.newValue) {
        setPayload(JSON.parse(e.newValue));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      bc?.close();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    if (payload.upiUri) {
      fetch(`/api/qrcode?text=${encodeURIComponent(payload.upiUri)}`)
        .then((r) => r.json())
        .then((d) => setQrUrl(d.dataUrl || ''))
        .catch(() => setQrUrl(''));
    } else {
      setQrUrl('');
    }
  }, [payload.upiUri]);

  const sym = payload.currencySymbol || '₹';

  return (
    <div className="min-h-screen bg-[#FAF9F6] dark:bg-[#0C0A09] text-[#1C1917] dark:text-[#F5F5F4] grid grid-cols-1 lg:grid-cols-12">
      {/* Left: Hospitality Ambiance Showcase */}
      <div className="lg:col-span-7 relative min-h-[300px]">
        <img
          src="/src/assets/images/hero_dining_ambiance_1795061819168.jpg"
          alt="Restaurant Dining Room"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex flex-col justify-end p-10 text-white">
          <div className="text-sm opacity-80">Customer-Facing Display</div>
          <h1 className="font-display font-bold text-4xl mt-1">{payload.branchName}</h1>
          <p className="text-sm opacity-90 mt-2 max-w-md">
            Welcome! Watch your order items, GST tax breakdown, and instant UPI QR payment right here.
          </p>
        </div>
      </div>

      {/* Right: Live Bill & UPI QR */}
      <div className="lg:col-span-5 p-8 lg:p-10 flex flex-col justify-between bg-white dark:bg-[#141210] border-l border-stone-200 dark:border-stone-800">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-4">
            <h2 className="font-display font-bold text-xl">
              {payload.status === 'paid'
                ? 'Payment Confirmed — Thank You!'
                : payload.orderNumber
                ? `Order ${payload.orderNumber}`
                : 'Your Current Order'}
            </h2>
            <span className="text-xs font-mono uppercase text-amber-700 dark:text-amber-400">{payload.status}</span>
          </div>

          {payload.items.length === 0 ? (
            <div className="py-16 text-center text-stone-400 text-sm">Ready for the next guest...</div>
          ) : (
            <div className="divide-y divide-stone-100 dark:divide-stone-800 text-sm">
              {payload.items.map((it, idx) => (
                <div key={idx} className="py-3 flex justify-between gap-2">
                  <div>
                    <div className="font-medium">
                      {it.quantity}× {it.name}
                    </div>
                    {it.modifiers && it.modifiers.length > 0 && (
                      <div className="text-xs text-stone-500">{it.modifiers.join(', ')}</div>
                    )}
                  </div>
                  <span className="font-mono font-semibold tabular-nums">{formatMoney(it.lineTotal, sym)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5 pt-6 border-t border-stone-200 dark:border-stone-800">
          {qrUrl && payload.status === 'awaiting_upi' && (
            <div className="flex flex-col items-center p-4 rounded-xl bg-[#FAF9F6] dark:bg-[#1C1917] border border-stone-200 dark:border-stone-800">
              <div className="text-xs font-semibold mb-2">Scan with any UPI App to Pay</div>
              <img src={qrUrl} alt="Customer UPI QR" className="w-44 h-44 bg-white p-1.5 rounded-lg" />
            </div>
          )}

          <div className="space-y-1.5 text-sm font-mono">
            <div className="flex justify-between text-stone-500">
              <span>Subtotal</span>
              <span>{formatMoney(payload.subtotal, sym)}</span>
            </div>
            {payload.discount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Discount</span>
                <span>-{formatMoney(payload.discount, sym)}</span>
              </div>
            )}
            <div className="flex justify-between text-stone-500">
              <span>Taxes</span>
              <span>{formatMoney(payload.taxTotal, sym)}</span>
            </div>
            <div className="flex justify-between text-xl font-bold pt-2 border-t border-stone-200 dark:border-stone-800">
              <span>Total</span>
              <span className="text-amber-700 dark:text-amber-400">{formatMoney(payload.grandTotal, sym)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
