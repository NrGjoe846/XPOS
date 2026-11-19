import React, { useMemo, useState } from 'react';
import { Bike, MapPin } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatMoney } from '../utils/taxEngine';

export const DeliveryModule: React.FC = () => {
  const { db, activeBranch, activeBranchId, mutate, createOrder, notify } = useApp();
  const sym = activeBranch?.currencySymbol || '₹';

  const [pincode, setPincode] = useState('');
  const [areaName, setAreaName] = useState('');
  const [fee, setFee] = useState(35);
  const [minOrder, setMinOrder] = useState(300);
  const [eta, setEta] = useState(30);

  const deliveryOrders = useMemo(
    () => (db?.orders || []).filter((o) => o.branchId === activeBranchId && o.channel === 'delivery'),
    [db?.orders, activeBranchId]
  );

  const simulateAggregatorOrder = async () => {
    const firstDish = db?.menuItems[0];
    if (!firstDish) return;
    await createOrder({
      channel: 'delivery',
      customerName: 'Aggregator Guest (Swiggy/Zomato Sim)',
      customerPhone: '+91 98000 12345',
      deliveryAddress: '22, 12th Main, HSR Layout Sector 2',
      deliveryPincode: '560102',
      items: [
        {
          id: `agg-${Date.now()}`,
          menuItemId: firstDish.id,
          name: firstDish.name,
          quantity: 1,
          unitPrice: firstDish.price,
          taxRate: firstDish.taxRate,
          station: firstDish.station,
          modifiers: [],
        },
      ],
    });
    notify('Simulated 3rd-party delivery order injected & fired to KDS', 'success');
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Live Dispatch Queue */}
        <div className="lg:col-span-7 bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold text-sm inline-flex items-center gap-2">
              <Bike className="w-4 h-4 text-amber-700" /> Delivery Dispatch & Driver Assignment
            </h3>
            <button
              onClick={simulateAggregatorOrder}
              className="px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 text-xs font-medium hover:bg-stone-50 dark:hover:bg-stone-900"
            >
              + Simulate Aggregator Order
            </button>
          </div>

          <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
            {deliveryOrders.map((o) => (
              <div key={o.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-mono font-semibold">
                    {o.orderNumber} · {o.deliveryPincode || 'Local'} · {formatMoney(o.grandTotal, sym)}
                  </div>
                  <div className="text-stone-500">
                    {o.customerName} · {o.deliveryAddress || 'Address on file'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={o.driverId || ''}
                    onChange={(e) =>
                      mutate('assign_driver', {
                        orderId: o.id,
                        driverId: e.target.value,
                        deliveryStatus: o.deliveryStatus === 'unassigned' ? 'assigned' : o.deliveryStatus || 'assigned',
                      })
                    }
                    className="px-2 py-1.5 rounded border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
                  >
                    <option value="">Assign Driver...</option>
                    {(db?.drivers || []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.vehicleNumber})
                      </option>
                    ))}
                  </select>
                  <select
                    value={o.deliveryStatus || 'unassigned'}
                    onChange={(e) =>
                      mutate('assign_driver', {
                        orderId: o.id,
                        driverId: o.driverId,
                        deliveryStatus: e.target.value,
                      })
                    }
                    className="px-2 py-1.5 rounded border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-semibold"
                  >
                    <option value="unassigned">Unassigned</option>
                    <option value="assigned">Assigned</option>
                    <option value="out_for_delivery">Out for Delivery</option>
                    <option value="delivered">Delivered</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pincode Zones */}
        <div className="lg:col-span-5 bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4">
          <h3 className="font-display font-semibold text-sm inline-flex items-center gap-2">
            <MapPin className="w-4 h-4 text-amber-700" /> Pincode Delivery Zones
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <input
              value={pincode}
              onChange={(e) => setPincode(e.target.value)}
              placeholder="Pincode (560095)"
              className="px-2.5 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
            />
            <input
              value={areaName}
              onChange={(e) => setAreaName(e.target.value)}
              placeholder="Area name"
              className="px-2.5 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            />
            <input
              type="number"
              value={fee}
              onChange={(e) => setFee(Number(e.target.value))}
              placeholder="Fee"
              className="px-2.5 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
            />
            <input
              type="number"
              value={minOrder}
              onChange={(e) => setMinOrder(Number(e.target.value))}
              placeholder="Min order"
              className="px-2.5 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
            />
          </div>
          <button
            onClick={async () => {
              if (!pincode.trim()) return;
              await mutate('add_delivery_zone', {
                branchId: activeBranchId,
                pincode,
                areaName: areaName || 'Local Zone',
                deliveryFee: fee,
                minOrder,
                etaMinutes: eta,
              });
              setPincode('');
              setAreaName('');
            }}
            className="w-full py-2 rounded-lg bg-amber-700 text-white text-xs font-semibold"
          >
            Add Pincode Zone
          </button>

          <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
            {(db?.deliveryZones || [])
              .filter((z) => z.branchId === activeBranchId)
              .map((z) => (
                <div key={z.id} className="py-2.5 flex justify-between">
                  <div>
                    <div className="font-mono font-semibold">
                      {z.pincode} · {z.areaName}
                    </div>
                    <div className="text-stone-500">
                      Min {formatMoney(z.minOrder, sym)} · ETA {z.etaMinutes}m
                    </div>
                  </div>
                  <span className="font-mono font-bold">{formatMoney(z.deliveryFee, sym)}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};
