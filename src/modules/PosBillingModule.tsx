import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  GitMerge,
  Split,
  QrCode,
  Printer,
  RotateCcw,
  CreditCard,
  Banknote,
  Gift,
  Tag,
  Utensils,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ComboBundle, MenuItem, Order, OrderChannel, OrderItem, TenderMethod } from '../types/pos';
import { buildUpiUri, calculateMultiRegionTax, formatMoney } from '../utils/taxEngine';
import {
  formatThermalReceiptText,
  kickCashDrawerWebUSB,
  playUpiSuccessChime,
  printViaWebUSB,
} from '../utils/hardware';

export const PosBillingModule: React.FC = () => {
  const { db, activeBranch, activeBranchId, currentStaff, createOrder, payOrder, refreshState, notify, broadcastSecondScreen } =
    useApp();

  const [channel, setChannel] = useState<OrderChannel>('dine_in');
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [discountInput, setDiscountInput] = useState<number>(0);
  const [couponCode, setCouponCode] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [giftCardCode, setGiftCardCode] = useState('');
  const [giftCardApplied, setGiftCardApplied] = useState(0);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState(0);
  const [tipAmount, setTipAmount] = useState(0);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryPincode, setDeliveryPincode] = useState('560034');

  // Modals
  const [modifierTarget, setModifierTarget] = useState<MenuItem | null>(null);
  const [selectedMods, setSelectedMods] = useState<Record<string, string[]>>({});
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState('');
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [refundTarget, setRefundTarget] = useState<Order | null>(null);
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundReason, setRefundReason] = useState('Guest dissatisfaction');

  // Split & Tender Checkout state
  const [splitCount, setSplitCount] = useState(1);
  const [tenders, setTenders] = useState<{ method: TenderMethod; amount: number; reference?: string }[]>([]);
  const [tenderMethod, setTenderMethod] = useState<TenderMethod>('upi');
  const [tenderAmount, setTenderAmount] = useState<number>(0);
  const [upiQrDataUrl, setUpiQrDataUrl] = useState<string>('');
  const [gatewayModal, setGatewayModal] = useState<'razorpay' | 'stripe' | 'cashfree' | null>(null);

  const branch = activeBranch;
  const sym = branch?.currencySymbol || '₹';

  const branchTables = useMemo(
    () => (db?.tables || []).filter((t) => t.branchId === activeBranchId),
    [db?.tables, activeBranchId]
  );

  const openOrders = useMemo(
    () => (db?.orders || []).filter((o) => o.branchId === activeBranchId && o.status !== 'paid' && o.status !== 'voided' && o.status !== 'refunded'),
    [db?.orders, activeBranchId]
  );

  const activeOrder = useMemo(
    () => openOrders.find((o) => o.id === activeOrderId) || null,
    [openOrders, activeOrderId]
  );

  const filteredMenu = useMemo(() => {
    return (db?.menuItems || []).filter((item) => {
      if (!item.available) return false;
      if (selectedCategory !== 'all' && item.categoryId !== selectedCategory) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
      }
      return true;
    });
  }, [db?.menuItems, selectedCategory, search]);

  const effectiveItems = activeOrder ? activeOrder.items : cart;
  const subtotal = useMemo(() => {
    return +effectiveItems
      .reduce((s, it) => s + (it.unitPrice + it.modifiers.reduce((m, x) => m + x.priceDelta, 0)) * it.quantity, 0)
      .toFixed(2);
  }, [effectiveItems]);

  const effectiveDiscount = activeOrder ? activeOrder.discountAmount : discountInput;
  const taxCalc = useMemo(() => {
    if (!branch) return { taxTotal: 0, taxBreakdown: [] };
    return calculateMultiRegionTax(effectiveItems, effectiveDiscount, branch.taxRegime, {
      interstateIgst: db?.securitySettings?.interstateIgstEnabled,
      defaultRate: branch.defaultTaxRate,
    });
  }, [branch, effectiveItems, effectiveDiscount, db?.securitySettings?.interstateIgstEnabled]);

  const deliveryFee = useMemo(() => {
    if (channel !== 'delivery' || activeOrder) return activeOrder?.deliveryFee || 0;
    const z = db?.deliveryZones.find((d) => d.pincode === deliveryPincode && d.active);
    return z ? z.deliveryFee : 0;
  }, [channel, activeOrder, db?.deliveryZones, deliveryPincode]);

  const grandTotal = Math.max(
    0,
    +(subtotal - effectiveDiscount + taxCalc.taxTotal + deliveryFee + tipAmount).toFixed(2)
  );

  // Sync cart to Customer Second Screen via BroadcastChannel
  useEffect(() => {
    if (!branch) return;
    broadcastSecondScreen({
      branchName: branch.name,
      currencySymbol: sym,
      items: effectiveItems.map((it) => ({
        name: it.name,
        quantity: it.quantity,
        lineTotal: (it.unitPrice + it.modifiers.reduce((m, x) => m + x.priceDelta, 0)) * it.quantity,
        modifiers: it.modifiers.map((m) => m.name),
      })),
      subtotal,
      discount: effectiveDiscount,
      taxTotal: taxCalc.taxTotal,
      grandTotal,
      status: effectiveItems.length === 0 ? 'idle' : checkoutOpen && upiQrDataUrl ? 'awaiting_upi' : 'ringing',
      upiUri: upiQrDataUrl ? buildUpiUri(branch, grandTotal, activeOrder?.orderNumber || 'NEW') : undefined,
      orderNumber: activeOrder?.orderNumber,
    });
  }, [
    branch,
    sym,
    effectiveItems,
    subtotal,
    effectiveDiscount,
    taxCalc.taxTotal,
    grandTotal,
    checkoutOpen,
    upiQrDataUrl,
    activeOrder?.orderNumber,
    broadcastSecondScreen,
  ]);

  const addMenuItemToCart = (item: MenuItem, modifiers: { name: string; priceDelta: number }[] = []) => {
    if (activeOrderId) setActiveOrderId(null);
    setCart((prev) => {
      const modKey = modifiers.map((m) => m.name).sort().join('|');
      const existing = prev.find(
        (p) => p.menuItemId === item.id && p.modifiers.map((m) => m.name).sort().join('|') === modKey
      );
      if (existing) {
        return prev.map((p) => (p.id === existing.id ? { ...p, quantity: p.quantity + 1 } : p));
      }
      return [
        ...prev,
        {
          id: `ci-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          menuItemId: item.id,
          name: item.name,
          quantity: 1,
          unitPrice: item.price,
          taxRate: item.taxRate,
          station: item.station,
          modifiers,
        },
      ];
    });
  };

  const handleCardClick = (item: MenuItem) => {
    if (item.modifierGroupIds.length > 0) {
      const init: Record<string, string[]> = {};
      for (const gid of item.modifierGroupIds) {
        const g = db?.modifierGroups.find((x) => x.id === gid);
        if (g && g.required && g.options[0]) init[gid] = [g.options[0].id];
      }
      setSelectedMods(init);
      setModifierTarget(item);
    } else {
      addMenuItemToCart(item);
    }
  };

  const handleAddCombo = (combo: ComboBundle) => {
    const items = (db?.menuItems || []).filter((m) => combo.itemIds.includes(m.id));
    if (items.length === 0) return;
    const perItem = +(combo.comboPrice / items.length).toFixed(2);
    for (const m of items) {
      addMenuItemToCart({ ...m, price: perItem, name: `${m.name} (${combo.name})` });
    }
    notify(`Added combo: ${combo.name}`, 'success');
  };

  const applyCoupon = () => {
    const cpn = db?.coupons.find((c) => c.code.toUpperCase() === couponCode.trim().toUpperCase() && c.active);
    if (!cpn) {
      notify('Coupon code not found or inactive', 'error');
      return;
    }
    if (subtotal < cpn.minSpend) {
      notify(`Minimum spend of ${formatMoney(cpn.minSpend, sym)} required`, 'warning');
      return;
    }
    const disc = cpn.type === 'flat' ? cpn.value : +((subtotal * cpn.value) / 100).toFixed(2);
    setDiscountInput(disc);
    notify(`Applied ${cpn.code}: -${formatMoney(disc, sym)}`, 'success');
  };

  const applyGiftCard = () => {
    const gv = db?.giftVouchers.find((g) => g.code.toUpperCase() === giftCardCode.trim().toUpperCase() && g.active);
    if (!gv || gv.balance <= 0) {
      notify('Gift card invalid or zero balance', 'error');
      return;
    }
    const usable = Math.min(gv.balance, grandTotal);
    setGiftCardApplied(usable);
    notify(`Gift voucher ${gv.code} applied (${formatMoney(usable, sym)})`, 'success');
  };

  const fireOrderToKitchen = async () => {
    if (cart.length === 0) return;
    if (channel === 'dine_in' && !selectedTableId) {
      notify('Select a table for Dine-In order', 'warning');
      return;
    }
    const res = await createOrder({
      channel,
      tableId: channel === 'dine_in' ? selectedTableId : undefined,
      customerId: selectedCustomerId || undefined,
      deliveryAddress: channel === 'delivery' ? deliveryAddress : undefined,
      deliveryPincode: channel === 'delivery' ? deliveryPincode : undefined,
      items: cart,
      discountAmount: discountInput,
      couponCode: couponCode || undefined,
      referralCode: referralCode || undefined,
      giftCardCode: giftCardCode || undefined,
      giftCardRedeemed: giftCardApplied,
      loyaltyPointsRedeemed: loyaltyPointsToRedeem,
      tipAmount,
    });
    if (res.error) {
      notify(res.error, 'error');
      return;
    }
    notify(`Fired ${res.order?.orderNumber} to Kitchen KDS`, 'success');
    setCart([]);
    setDiscountInput(0);
    setGiftCardApplied(0);
    setLoyaltyPointsToRedeem(0);
    if (res.order) setActiveOrderId(res.order.id);
  };

  const openCheckout = async () => {
    let targetOrder = activeOrder;
    if (!targetOrder) {
      if (cart.length === 0) return;
      const res = await createOrder({
        channel,
        tableId: channel === 'dine_in' ? selectedTableId || undefined : undefined,
        customerId: selectedCustomerId || undefined,
        deliveryAddress: channel === 'delivery' ? deliveryAddress : undefined,
        deliveryPincode: channel === 'delivery' ? deliveryPincode : undefined,
        items: cart,
        discountAmount: discountInput,
        couponCode: couponCode || undefined,
        referralCode: referralCode || undefined,
        giftCardCode: giftCardCode || undefined,
        giftCardRedeemed: giftCardApplied,
        loyaltyPointsRedeemed: loyaltyPointsToRedeem,
        tipAmount,
      });
      if (res.error || !res.order) {
        notify(res.error || 'Unable to create order', 'error');
        return;
      }
      targetOrder = res.order;
      setCart([]);
      setActiveOrderId(targetOrder.id);
    }

    const remaining = Math.max(0, +(targetOrder.grandTotal - targetOrder.paidTotal).toFixed(2));
    setTenders([]);
    setTenderAmount(remaining);
    setSplitCount(targetOrder.splitCount || 1);
    setCheckoutOpen(true);

    if (branch) {
      const uri = buildUpiUri(branch, remaining || targetOrder.grandTotal, targetOrder.orderNumber);
      try {
        const r = await fetch(`/api/qrcode?text=${encodeURIComponent(uri)}`);
        const d = await r.json();
        setUpiQrDataUrl(d.dataUrl || '');
      } catch {
        setUpiQrDataUrl('');
      }
    }
  };

  const addTenderLine = () => {
    if (tenderAmount <= 0) return;
    setTenders((prev) => [...prev, { method: tenderMethod, amount: +tenderAmount.toFixed(2) }]);
    const already = tenders.reduce((s, t) => s + t.amount, 0) + tenderAmount;
    const target = activeOrder ? activeOrder.grandTotal - activeOrder.paidTotal : grandTotal;
    setTenderAmount(Math.max(0, +(target - already).toFixed(2)));
  };

  const settleOrder = async (overridePayments?: { method: TenderMethod; amount: number; reference?: string }[]) => {
    if (!activeOrder) return;
    const remaining = Math.max(0, +(activeOrder.grandTotal - activeOrder.paidTotal).toFixed(2));
    const toPay =
      overridePayments && overridePayments.length > 0
        ? overridePayments
        : tenders.length > 0
        ? tenders
        : [{ method: tenderMethod, amount: remaining }];

    const updated = await payOrder(activeOrder.id, toPay, tipAmount);
    if (!updated) return;

    if (toPay.some((p) => p.method === 'upi' || p.method === 'razorpay' || p.method === 'cashfree')) {
      playUpiSuccessChime();
    }

    notify(`Settled ${updated.orderNumber} (${formatMoney(updated.paidTotal, sym)})`, 'success');
    if (branch) {
      broadcastSecondScreen({
        branchName: branch.name,
        currencySymbol: sym,
        items: updated.items.map((i) => ({ name: i.name, quantity: i.quantity, lineTotal: i.unitPrice * i.quantity })),
        subtotal: updated.subtotal,
        discount: updated.discountAmount,
        taxTotal: updated.taxTotal,
        grandTotal: updated.grandTotal,
        orderNumber: updated.orderNumber,
        status: 'paid',
      });
    }
    setCheckoutOpen(false);
    setReceiptOrder(updated);
    setActiveOrderId(null);
  };

  const handleVoidOrder = async () => {
    if (!activeOrder) return;
    const res = await fetch(`/api/orders/${activeOrder.id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: 'Voided at POS register',
        actorName: currentStaff?.name || 'Cashier',
      }),
    });
    if (res.ok) {
      await refreshState();
      setActiveOrderId(null);
      notify(`Voided ${activeOrder.orderNumber}`, 'info');
    } else {
      notify('Unable to void order', 'error');
    }
  };

  const handleMergeBills = async () => {
    if (!activeOrder || !mergeSourceId) return;
    const res = await fetch('/api/orders/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetOrderId: activeOrder.id,
        sourceOrderId: mergeSourceId,
        actorName: currentStaff?.name || 'Cashier',
      }),
    });
    if (res.ok) {
      await refreshState();
      setMergeModalOpen(false);
      notify('Bills merged cleanly', 'success');
    } else {
      notify('Merge failed', 'error');
    }
  };

  const handleRefund = async () => {
    if (!refundTarget || refundAmount <= 0) return;
    const res = await fetch(`/api/orders/${refundTarget.id}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: refundAmount,
        reason: refundReason,
        method: 'cash',
        processedBy: currentStaff?.name || 'Manager',
      }),
    });
    if (res.ok) {
      await refreshState();
      setRefundTarget(null);
      notify('Refund recorded & logged to audit trail', 'success');
    }
  };

  const recentPaidOrders = useMemo(
    () => (db?.orders || []).filter((o) => o.branchId === activeBranchId && o.status === 'paid').slice(0, 6),
    [db?.orders, activeBranchId]
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Menu & Open Bills */}
        <div className="xl:col-span-7 space-y-4">
          {/* Channel & Table Selector */}
          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-stone-900 rounded-lg">
              {(['dine_in', 'takeaway', 'click_collect', 'delivery'] as OrderChannel[]).map((ch) => (
                <button
                  key={ch}
                  onClick={() => {
                    setChannel(ch);
                    setActiveOrderId(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    channel === ch
                      ? 'bg-white dark:bg-[#1C1917] text-stone-900 dark:text-stone-100 shadow-sm'
                      : 'text-stone-600 dark:text-stone-400'
                  }`}
                >
                  {ch === 'dine_in'
                    ? 'Dine-In'
                    : ch === 'takeaway'
                    ? 'Takeaway'
                    : ch === 'click_collect'
                    ? 'Pickup'
                    : 'Delivery'}
                </button>
              ))}
            </div>

            {channel === 'dine_in' && (
              <select
                value={selectedTableId}
                onChange={(e) => {
                  const tId = e.target.value;
                  setSelectedTableId(tId);
                  const tbl = branchTables.find((t) => t.id === tId);
                  if (tbl?.currentOrderId) setActiveOrderId(tbl.currentOrderId);
                  else setActiveOrderId(null);
                }}
                className="rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] px-3 py-1.5 text-xs font-medium"
              >
                <option value="">Select Table...</option>
                {branchTables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} ({t.seats} seats · {t.status})
                  </option>
                ))}
              </select>
            )}

            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search dishes..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] text-xs focus:outline-none focus:ring-2 focus:ring-amber-600"
              />
            </div>
          </div>

          {/* Open Bills Strip */}
          {openOrders.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-xs font-medium text-stone-500 whitespace-nowrap">Open Bills:</span>
              {openOrders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setActiveOrderId(o.id)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap transition-colors ${
                    activeOrderId === o.id
                      ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                      : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-[#171412] text-stone-700 dark:text-stone-300'
                  }`}
                >
                  {o.orderNumber} · {o.tableLabel || o.channel} · <span className="font-mono tabular-nums">{formatMoney(o.grandTotal, sym)}</span>
                </button>
              ))}
              {activeOrderId && (
                <button
                  onClick={() => setActiveOrderId(null)}
                  className="px-2.5 py-1.5 rounded-lg text-xs text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 whitespace-nowrap"
                >
                  + New Cart
                </button>
              )}
            </div>
          )}

          {/* Category Filter Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                selectedCategory === 'all'
                  ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                  : 'bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400'
              }`}
            >
              All Categories
            </button>
            {(db?.categories || []).map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                  selectedCategory === cat.id
                    ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                    : 'bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Menu Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {filteredMenu.map((item) => (
              <button
                key={item.id}
                onClick={() => handleCardClick(item)}
                className="text-left bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden hover:border-amber-600/70 transition-colors flex flex-col"
              >
                <div className="h-28 w-full bg-stone-100 dark:bg-stone-900 relative overflow-hidden">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-stone-400">
                      <Utensils className="w-6 h-6" />
                    </div>
                  )}
                </div>
                <div className="p-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="text-[11px] text-stone-500 dark:text-stone-400">
                      {item.dietary === 'veg' ? 'Veg' : item.dietary === 'vegan' ? 'Vegan' : 'Non-Veg'} · {item.station}
                    </div>
                    <h4 className="font-display font-semibold text-sm text-stone-900 dark:text-stone-100 mt-0.5 line-clamp-1">
                      {item.name}
                    </h4>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-mono font-semibold text-sm tabular-nums text-amber-700 dark:text-amber-400">
                      {formatMoney(item.price, sym)}
                    </span>
                    <span className="text-[11px] text-stone-400 font-mono">{item.taxRate}% tax</span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Combo Bundles Quick Add */}
          {(db?.combos || []).filter((c) => c.active).length > 0 && (
            <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-4">
              <div className="text-xs font-semibold text-stone-700 dark:text-stone-300 mb-2">Quick Combo Bundles</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(db?.combos || [])
                  .filter((c) => c.active)
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleAddCombo(c)}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-stone-200 dark:border-stone-800 hover:border-amber-600 text-left"
                    >
                      <div className="pr-2 min-w-0">
                        <div className="text-xs font-semibold truncate">{c.name}</div>
                        <div className="text-[11px] text-stone-500 truncate">{c.description}</div>
                      </div>
                      <span className="font-mono text-xs font-semibold text-amber-700 dark:text-amber-400 shrink-0">
                        {formatMoney(c.comboPrice, sym)}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Active Bill & Checkout Register */}
        <div className="xl:col-span-5 bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-3">
            <div>
              <h3 className="font-display font-bold text-base">
                {activeOrder ? `Bill ${activeOrder.orderNumber}` : 'Current Order Cart'}
              </h3>
              <div className="text-xs text-stone-500 dark:text-stone-400">
                {activeOrder ? `${activeOrder.tableLabel || activeOrder.channel} · ${activeOrder.status}` : `${channel.replace('_', ' ')}`}
              </div>
            </div>
            {activeOrder && (
              <div className="flex items-center gap-2 shrink-0">
                {openOrders.length > 1 && (
                  <button
                    onClick={() => setMergeModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 text-xs font-medium hover:bg-stone-50 dark:hover:bg-stone-900 whitespace-nowrap"
                  >
                    <GitMerge className="w-3.5 h-3.5" />
                    <span>Merge Bill</span>
                  </button>
                )}
                <button
                  onClick={handleVoidOrder}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/30 whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Void</span>
                </button>
              </div>
            )}
          </div>

          {/* Delivery Details if delivery */}
          {channel === 'delivery' && !activeOrder && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <input
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Delivery address..."
                className="col-span-2 px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
              />
              <select
                value={deliveryPincode}
                onChange={(e) => setDeliveryPincode(e.target.value)}
                className="col-span-2 px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
              >
                {(db?.deliveryZones || []).map((z) => (
                  <option key={z.id} value={z.pincode}>
                    {z.pincode} — {z.areaName} (Fee {formatMoney(z.deliveryFee, sym)} · {z.etaMinutes}m)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Items List */}
          <div className="max-h-72 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800">
            {effectiveItems.length === 0 ? (
              <div className="py-10 text-center text-xs text-stone-500">
                Select dishes from the menu to start ringing up an order.
              </div>
            ) : (
              effectiveItems.map((it) => {
                const modCost = it.modifiers.reduce((m, x) => m + x.priceDelta, 0);
                const lineTotal = (it.unitPrice + modCost) * it.quantity;
                return (
                  <div key={it.id} className="py-2.5 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">{it.name}</div>
                      {it.modifiers.length > 0 && (
                        <div className="text-[11px] text-stone-500">
                          {it.modifiers.map((m) => m.name).join(', ')}
                        </div>
                      )}
                      <div className="text-[11px] font-mono text-stone-400">
                        {formatMoney(it.unitPrice + modCost, sym)} × {it.quantity}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!activeOrder && (
                        <div className="flex items-center border border-stone-200 dark:border-stone-800 rounded-md">
                          <button
                            onClick={() =>
                              setCart((prev) =>
                                prev
                                  .map((x) => (x.id === it.id ? { ...x, quantity: x.quantity - 1 } : x))
                                  .filter((x) => x.quantity > 0)
                              )
                            }
                            className="p-1 hover:bg-stone-100 dark:hover:bg-stone-800"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2 text-xs font-mono tabular-nums">{it.quantity}</span>
                          <button
                            onClick={() =>
                              setCart((prev) => prev.map((x) => (x.id === it.id ? { ...x, quantity: x.quantity + 1 } : x)))
                            }
                            className="p-1 hover:bg-stone-100 dark:hover:bg-stone-800"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                      <span className="font-mono text-xs font-semibold tabular-nums w-20 text-right">
                        {formatMoney(lineTotal, sym)}
                      </span>
                      {!activeOrder && (
                        <button
                          onClick={() => setCart((prev) => prev.filter((x) => x.id !== it.id))}
                          className="p-1 text-stone-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Discounts, Coupons, Gift Cards, Customer Loyalty & Tip */}
          {!activeOrder && (
            <div className="space-y-2 pt-2 border-t border-stone-200 dark:border-stone-800 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex gap-1">
                  <input
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    placeholder="Coupon (WELCOME100)"
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
                  />
                  <button onClick={applyCoupon} className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 font-medium">
                    <Tag className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex gap-1">
                  <input
                    value={giftCardCode}
                    onChange={(e) => setGiftCardCode(e.target.value)}
                    placeholder="Gift Card (FESTIVE500)"
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
                  />
                  <button onClick={applyGiftCard} className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 font-medium">
                    <Gift className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
                >
                  <option value="">Walk-in Guest (CRM)</option>
                  {(db?.customers || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.loyaltyPoints} pts)
                    </option>
                  ))}
                </select>
                <input
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value)}
                  placeholder="Referral Code (ROHAN50)"
                  className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
                />
              </div>
            </div>
          )}

          {/* Totals & Tax Breakdown */}
          <div className="bg-[#FAF9F6] dark:bg-[#12100E] border border-stone-200 dark:border-stone-800 rounded-lg p-3.5 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-stone-500">Subtotal</span>
              <span className="font-mono tabular-nums">{formatMoney(subtotal, sym)}</span>
            </div>
            {effectiveDiscount > 0 && (
              <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                <span>Discount</span>
                <span className="font-mono tabular-nums">-{formatMoney(effectiveDiscount, sym)}</span>
              </div>
            )}
            {taxCalc.taxBreakdown.map((t, idx) => (
              <div key={idx} className="flex justify-between text-stone-500">
                <span>{t.label}</span>
                <span className="font-mono tabular-nums">{formatMoney(t.amount, sym)}</span>
              </div>
            ))}
            {deliveryFee > 0 && (
              <div className="flex justify-between text-stone-500">
                <span>Delivery Fee</span>
                <span className="font-mono tabular-nums">{formatMoney(deliveryFee, sym)}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1">
              <span className="text-stone-500">Tip / Gratuity</span>
              <input
                type="number"
                min={0}
                value={tipAmount}
                onChange={(e) => setTipAmount(Math.max(0, Number(e.target.value)))}
                className="w-24 text-right px-2 py-1 rounded border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#171412] font-mono tabular-nums"
              />
            </div>
            <div className="flex justify-between text-sm font-bold pt-2 border-t border-stone-200 dark:border-stone-800">
              <span>Grand Total</span>
              <span className="font-mono tabular-nums text-amber-700 dark:text-amber-400">{formatMoney(grandTotal, sym)}</span>
            </div>
          </div>

          {/* Primary Actions */}
          <div className="grid grid-cols-2 gap-2.5">
            {!activeOrder && (
              <button
                onClick={fireOrderToKitchen}
                disabled={cart.length === 0}
                className="py-2.5 px-4 rounded-lg border border-stone-300 dark:border-stone-700 font-semibold text-xs hover:bg-stone-50 dark:hover:bg-stone-900 disabled:opacity-40"
              >
                Fire KOT (Hold Bill)
              </button>
            )}
            <button
              onClick={openCheckout}
              disabled={effectiveItems.length === 0}
              className={`${activeOrder ? 'col-span-2' : ''} py-2.5 px-4 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-semibold text-xs disabled:opacity-40`}
            >
              Checkout & Split / UPI QR
            </button>
          </div>
        </div>
      </div>

      {/* Recent Paid Bills with Reprint & Refund */}
      <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-semibold text-sm">Recent Paid Invoices & Refunds</h3>
          <button
            onClick={async () => {
              const r = await kickCashDrawerWebUSB();
              notify(r.message, r.ok ? 'success' : 'info');
            }}
            className="px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 text-xs font-medium hover:bg-stone-50 dark:hover:bg-stone-900"
          >
            Kick Cash Drawer
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-800 text-stone-500 text-left">
                <th className="py-2">Order</th>
                <th className="py-2">Channel</th>
                <th className="py-2">Tenders</th>
                <th className="py-2 text-right">Total</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {recentPaidOrders.map((o) => (
                <tr key={o.id} className="hover:bg-stone-50/70 dark:hover:bg-stone-900/40">
                  <td className="py-2.5 font-mono font-medium">{o.orderNumber}</td>
                  <td className="py-2.5">{o.tableLabel || o.channel}</td>
                  <td className="py-2.5 text-stone-500">
                    {o.payments.map((p) => `${p.method.toUpperCase()} (${formatMoney(p.amount, sym)})`).join(', ')}
                  </td>
                  <td className="py-2.5 text-right font-mono tabular-nums font-semibold">
                    {formatMoney(o.grandTotal, sym)}
                  </td>
                  <td className="py-2.5 text-right space-x-2">
                    <button
                      onClick={() => setReceiptOrder(o)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800"
                    >
                      <Printer className="w-3 h-3" />
                      <span>Receipt</span>
                    </button>
                    <button
                      onClick={() => {
                        setRefundTarget(o);
                        setRefundAmount(o.paidTotal);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Refund</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modifier Modal */}
      {modifierTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl max-w-md w-full p-5 space-y-4">
            <h4 className="font-display font-bold text-base">{modifierTarget.name}</h4>
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {modifierTarget.modifierGroupIds.map((gid) => {
                const grp = db?.modifierGroups.find((g) => g.id === gid);
                if (!grp) return null;
                const chosen = selectedMods[gid] || [];
                return (
                  <div key={gid} className="space-y-1.5">
                    <div className="text-xs font-semibold">
                      {grp.name} {grp.required ? '(Required)' : '(Optional)'}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {grp.options.map((opt) => {
                        const active = chosen.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            onClick={() => {
                              setSelectedMods((prev) => {
                                const cur = prev[gid] || [];
                                if (grp.multiSelect) {
                                  return {
                                    ...prev,
                                    [gid]: active ? cur.filter((x) => x !== opt.id) : [...cur, opt.id],
                                  };
                                }
                                return { ...prev, [gid]: [opt.id] };
                              });
                            }}
                            className={`px-2.5 py-2 rounded-lg border text-xs text-left flex justify-between ${
                              active
                                ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/40 font-semibold'
                                : 'border-stone-200 dark:border-stone-800'
                            }`}
                          >
                            <span>{opt.name}</span>
                            {opt.priceDelta > 0 && <span className="font-mono">+{formatMoney(opt.priceDelta, sym)}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-stone-200 dark:border-stone-800">
              <button
                onClick={() => setModifierTarget(null)}
                className="px-4 py-2 rounded-lg border border-stone-200 dark:border-stone-800 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const flatMods: { name: string; priceDelta: number }[] = [];
                  for (const [gid, optIds] of Object.entries(selectedMods)) {
                    const grp = db?.modifierGroups.find((g) => g.id === gid);
                    for (const oid of optIds) {
                      const opt = grp?.options.find((o) => o.id === oid);
                      if (opt) flatMods.push({ name: opt.name, priceDelta: opt.priceDelta });
                    }
                  }
                  addMenuItemToCart(modifierTarget, flatMods);
                  setModifierTarget(null);
                }}
                className="px-4 py-2 rounded-lg bg-amber-700 text-white text-xs font-semibold"
              >
                Add to Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checkout & Split Tender + UPI QR Modal */}
      {checkoutOpen && activeOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl max-w-2xl w-full p-6 space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-3">
              <div>
                <h3 className="font-display font-bold text-lg">Settle {activeOrder.orderNumber}</h3>
                <div className="text-xs text-stone-500">
                  Total Due: <span className="font-mono font-bold text-stone-900 dark:text-stone-100">{formatMoney(activeOrder.grandTotal - activeOrder.paidTotal, sym)}</span>
                </div>
              </div>
              <button onClick={() => setCheckoutOpen(false)} className="text-xs text-stone-500 hover:text-stone-900">
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Left: Split Bill & Multi-Tender Builder */}
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-[#FAF9F6] dark:bg-[#12100E] border border-stone-200 dark:border-stone-800">
                  <div className="flex items-center justify-between text-xs font-semibold mb-2">
                    <span className="inline-flex items-center gap-1.5">
                      <Split className="w-3.5 h-3.5" /> Equal Bill Split
                    </span>
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4].map((n) => (
                        <button
                          key={n}
                          onClick={() => setSplitCount(n)}
                          className={`px-2 py-0.5 rounded text-xs font-mono ${
                            splitCount === n ? 'bg-amber-700 text-white' : 'bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800'
                          }`}
                        >
                          {n}x
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-stone-600 dark:text-stone-400">
                    <div>
                      Per guest share ({splitCount} ways):{' '}
                      <span className="font-mono font-bold text-stone-900 dark:text-stone-100">
                        {formatMoney((activeOrder.grandTotal - activeOrder.paidTotal) / splitCount, sym)}
                      </span>
                    </div>
                    {splitCount > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const share = +((activeOrder.grandTotal - activeOrder.paidTotal) / splitCount).toFixed(2);
                          setTenderAmount(share);
                        }}
                        className="px-2 py-1 rounded border border-amber-600/50 text-amber-800 dark:text-amber-300 text-[11px] font-semibold hover:bg-amber-50 dark:hover:bg-amber-950/30 whitespace-nowrap shrink-0"
                      >
                        Use Share
                      </button>
                    )}
                  </div>
                </div>

                {/* Split Tender Entry */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold">Split-Tender Payment</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['upi', 'cash', 'card'] as TenderMethod[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => setTenderMethod(m)}
                        className={`py-2 px-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                          tenderMethod === m
                            ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                            : 'border-stone-200 dark:border-stone-800'
                        }`}
                      >
                        {m === 'cash' ? <Banknote className="w-3.5 h-3.5" /> : m === 'upi' ? <QrCode className="w-3.5 h-3.5" /> : <CreditCard className="w-3.5 h-3.5" />}
                        <span>{m.toUpperCase()}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={tenderAmount}
                      onChange={(e) => setTenderAmount(Number(e.target.value))}
                      className="flex-1 px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono text-xs"
                    />
                    <button
                      onClick={addTenderLine}
                      className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 text-xs font-semibold hover:bg-stone-50 dark:hover:bg-stone-900 whitespace-nowrap shrink-0"
                    >
                      + Add Split
                    </button>
                  </div>
                  {tenderMethod === 'cash' && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setTenderAmount(+(activeOrder.grandTotal - activeOrder.paidTotal).toFixed(2))}
                        className="px-2 py-1 rounded border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800 font-mono"
                      >
                        Exact
                      </button>
                      {[100, 500, 1000, 2000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setTenderAmount(amt)}
                          className="px-2 py-1 rounded border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800 font-mono"
                        >
                          {sym}{amt}
                        </button>
                      ))}
                      {tenderAmount > activeOrder.grandTotal - activeOrder.paidTotal && (
                        <span className="ml-auto font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                          Change: {formatMoney(tenderAmount - (activeOrder.grandTotal - activeOrder.paidTotal), sym)}
                        </span>
                      )}
                    </div>
                  )}

                  {tenders.length > 0 && (
                    <div className="space-y-1 pt-1">
                      {tenders.map((t, i) => (
                        <div key={i} className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded bg-stone-100 dark:bg-stone-900">
                          <span className="font-medium">{t.method.toUpperCase()}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono tabular-nums">{formatMoney(t.amount, sym)}</span>
                            <button
                              type="button"
                              onClick={() => setTenders((prev) => prev.filter((_, idx) => idx !== i))}
                              className="text-stone-400 hover:text-red-600"
                              aria-label="Remove tender split"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between text-[11px] font-mono px-1 pt-1 text-stone-500">
                        <span>Remaining Balance</span>
                        <span>
                          {formatMoney(
                            Math.max(
                              0,
                              activeOrder.grandTotal - activeOrder.paidTotal - tenders.reduce((s, x) => s + x.amount, 0)
                            ),
                            sym
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Simulated Payment Gateways */}
                <div className="space-y-1.5">
                  <div className="text-[11px] text-stone-500 font-medium">Online Payment Gateways (Simulated)</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['razorpay', 'stripe', 'cashfree'] as const).map((gw) => (
                      <button
                        key={gw}
                        onClick={() => setGatewayModal(gw)}
                        className="py-1.5 px-2 rounded-lg border border-stone-200 dark:border-stone-800 text-xs font-medium capitalize hover:border-amber-600"
                      >
                        {gw}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Dynamic UPI QR Code with Payment Chime */}
              <div className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#12100E] flex flex-col items-center justify-center text-center space-y-3">
                <div className="text-xs font-semibold">Instant UPI QR Checkout</div>
                {upiQrDataUrl ? (
                  <img src={upiQrDataUrl} alt="UPI Payment QR" className="w-44 h-44 rounded-lg border border-stone-200 bg-white p-1.5" />
                ) : (
                  <div className="w-44 h-44 flex items-center justify-center border border-dashed border-stone-300 rounded-lg text-xs text-stone-400">
                    Generating QR...
                  </div>
                )}
                <div className="text-[11px] font-mono text-stone-500">
                  VPA: {branch?.upiVpa} · {formatMoney(activeOrder.grandTotal - activeOrder.paidTotal, sym)}
                </div>
                <button
                  onClick={() => {
                    playUpiSuccessChime();
                    settleOrder([{ method: 'upi', amount: +(activeOrder.grandTotal - activeOrder.paidTotal).toFixed(2), reference: `UPI-${Date.now().toString().slice(-6)}` }]);
                  }}
                  className="w-full py-2 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
                >
                  Confirm UPI Payment & Play Chime
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-200 dark:border-stone-800">
              <button onClick={() => setCheckoutOpen(false)} className="px-4 py-2 rounded-lg border border-stone-200 dark:border-stone-800 text-xs font-medium">
                Cancel
              </button>
              <button
                onClick={() => settleOrder()}
                className="px-5 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold"
              >
                Complete Settlement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Simulated Gateway Checkout Modal */}
      {gatewayModal && activeOrder && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl max-w-sm w-full p-5 space-y-4">
            <h4 className="font-display font-bold text-base capitalize">{gatewayModal} Hosted Checkout</h4>
            <p className="text-xs text-stone-500">
              Authorizing {formatMoney(activeOrder.grandTotal - activeOrder.paidTotal, sym)} for {activeOrder.orderNumber} ({branch?.name}).
            </p>
            <div className="p-3 rounded-lg bg-stone-50 dark:bg-stone-900 text-xs font-mono space-y-1">
              <div>Merchant: {branch?.upiMerchantName}</div>
              <div>Ref: {gatewayModal.toUpperCase()}_{Date.now().toString().slice(-6)}</div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setGatewayModal(null)} className="px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 text-xs">
                Abort
              </button>
              <button
                onClick={() => {
                  const gw = gatewayModal;
                  setGatewayModal(null);
                  settleOrder([
                    {
                      method: gw,
                      amount: +(activeOrder.grandTotal - activeOrder.paidTotal).toFixed(2),
                      reference: `${gw.toUpperCase()}-${Date.now().toString().slice(-5)}`,
                    },
                  ]);
                }}
                className="px-4 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold"
              >
                Simulate Payment Success
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge Bills Modal */}
      {mergeModalOpen && activeOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl max-w-sm w-full p-5 space-y-4">
            <h4 className="font-display font-bold text-base">Merge Bill into {activeOrder.orderNumber}</h4>
            <select
              value={mergeSourceId}
              onChange={(e) => setMergeSourceId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] text-xs"
            >
              <option value="">Select another open bill...</option>
              {openOrders
                .filter((o) => o.id !== activeOrder.id)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber} ({o.tableLabel || o.channel}) — {formatMoney(o.grandTotal, sym)}
                  </option>
                ))}
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setMergeModalOpen(false)} className="px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 text-xs">
                Cancel
              </button>
              <button onClick={handleMergeBills} className="px-4 py-1.5 rounded-lg bg-amber-700 text-white text-xs font-semibold">
                Merge Selected Bill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thermal ESC/POS Receipt Preview & Print Modal */}
      {receiptOrder && branch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl max-w-md w-full p-5 space-y-4">
            <h4 className="font-display font-bold text-base">Thermal Receipt — {receiptOrder.orderNumber}</h4>
            <pre className="p-3 rounded-lg bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 font-mono text-[11px] leading-relaxed overflow-x-auto whitespace-pre">
              {formatThermalReceiptText(receiptOrder, branch)}
            </pre>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setReceiptOrder(null)}
                className="px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 text-xs"
              >
                Close
              </button>
              <button
                onClick={async () => {
                  const txt = formatThermalReceiptText(receiptOrder, branch);
                  const r = await printViaWebUSB(txt, true);
                  notify(r.message, r.ok ? 'success' : 'info');
                }}
                className="px-3 py-1.5 rounded-lg border border-amber-600 text-amber-800 dark:text-amber-300 text-xs font-semibold"
              >
                WebUSB ESC/POS + Drawer
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-1.5 rounded-lg bg-amber-700 text-white text-xs font-semibold"
              >
                Print System Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {refundTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl max-w-sm w-full p-5 space-y-4">
            <h4 className="font-display font-bold text-base">Refund {refundTarget.orderNumber}</h4>
            <div className="space-y-2 text-xs">
              <label className="block font-medium">Amount ({sym})</label>
              <input
                type="number"
                max={refundTarget.paidTotal}
                value={refundAmount}
                onChange={(e) => setRefundAmount(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
              />
              <label className="block font-medium">Reason</label>
              <input
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRefundTarget(null)} className="px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 text-xs">
                Cancel
              </button>
              <button onClick={handleRefund} className="px-4 py-1.5 rounded-lg bg-red-700 text-white text-xs font-semibold">
                Issue Refund
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
