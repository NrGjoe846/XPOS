import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  AppDatabase,
  AttendanceLog,
  Order,
  OrderItem,
  PaymentRecord,
  Payslip,
  ProductionRun,
  TenderMethod,
} from '../src/types/pos.ts';
import { calculateMultiRegionTax } from '../src/utils/taxEngine.ts';
import { createSeedDatabase } from './seed.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'orderrestro-db.json');

export class PosStore {
  private db: AppDatabase;
  private onBroadcast?: (event: string, payload: unknown) => void;

  constructor(onBroadcast?: (event: string, payload: unknown) => void) {
    this.onBroadcast = onBroadcast;
    this.db = this.load();
  }

  public setBroadcaster(fn: (event: string, payload: unknown) => void) {
    this.onBroadcast = fn;
  }

  private load(): AppDatabase {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as AppDatabase;
        if (parsed && Array.isArray(parsed.branches) && parsed.branches.length > 0) {
          return parsed;
        }
      }
    } catch (err) {
      console.error('Failed to load DB file, re-seeding:', err);
    }
    const seeded = createSeedDatabase();
    this.save(seeded);
    return seeded;
  }

  private save(nextDb?: AppDatabase): void {
    if (nextDb) this.db = nextDb;
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmp = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2), 'utf-8');
    fs.renameSync(tmp, DB_FILE);
  }

  public getState(): AppDatabase {
    return this.db;
  }

  public mutate(fn: (db: AppDatabase) => void, event?: string, payload?: unknown): AppDatabase {
    fn(this.db);
    this.save();
    if (event && this.onBroadcast) {
      this.onBroadcast(event, payload ?? {});
    }
    return this.db;
  }

  public logAudit(actorName: string, action: string, target: string, details: string) {
    this.db.auditLogs.unshift({
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      actorName,
      action,
      target,
      details,
      createdAt: new Date().toISOString(),
    });
    if (this.db.auditLogs.length > 250) {
      this.db.auditLogs.length = 250;
    }
  }

  public dispatchWebhooks(event: string, payload: unknown) {
    const activeHooks = this.db.webhooks.filter((w) => w.active && w.events.includes(event));
    for (const hook of activeHooks) {
      const signature = crypto
        .createHmac('sha256', hook.secret || process.env.WEBHOOK_SIGNING_SECRET || 'orderrestro')
        .update(JSON.stringify({ event, payload }))
        .digest('hex');

      this.db.webhookDeliveries.unshift({
        id: `whd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        webhookId: hook.id,
        event,
        statusCode: 200,
        signature: `sha256=${signature.slice(0, 24)}...`,
        deliveredAt: new Date().toISOString(),
      });
    }
    if (this.db.webhookDeliveries.length > 100) {
      this.db.webhookDeliveries.length = 100;
    }
  }

  public createOrder(input: {
    branchId: string;
    channel: Order['channel'];
    tableId?: string;
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    deliveryAddress?: string;
    deliveryPincode?: string;
    scheduledFor?: string;
    idempotencyKey?: string;
    payMode?: 'pay_at_register' | 'pay_on_phone';
    tableSessionCode?: string;
    items: OrderItem[];
    discountAmount?: number;
    couponCode?: string;
    referralCode?: string;
    giftCardCode?: string;
    giftCardRedeemed?: number;
    loyaltyPointsRedeemed?: number;
    tipAmount?: number;
    splitCount?: number;
    staffId?: string;
    staffName?: string;
    payments?: { method: TenderMethod; amount: number; reference?: string }[];
  }): { order: Order; duplicate?: boolean; error?: string } {
    // Prevent duplicate submissions from QR / slow mobile connections
    if (input.idempotencyKey) {
      const existing = this.db.orders.find((o) => o.idempotencyKey === input.idempotencyKey);
      if (existing) {
        return { order: existing, duplicate: true };
      }
    }

    const branch = this.db.branches.find((b) => b.id === input.branchId) || this.db.branches[0];

    // Live table code check for QR table ordering
    let tableLabel = '';
    if (input.tableId) {
      const table = this.db.tables.find((t) => t.id === input.tableId);
      if (!table) return { order: null as unknown as Order, error: 'Table not found.' };
      tableLabel = table.label;
      if (input.channel === 'qr_table') {
        if (!table.sessionCodeActive || table.sessionCode !== input.tableSessionCode) {
          return {
            order: null as unknown as Order,
            error: 'Invalid or inactive live table code. Ask staff to open your table session.',
          };
        }
      }
    }

    const subtotal = +input.items
      .reduce((sum, item) => {
        const modSum = item.modifiers.reduce((m, mod) => m + mod.priceDelta, 0);
        return sum + (item.unitPrice + modSum) * item.quantity;
      }, 0)
      .toFixed(2);

    const discountAmount = Math.min(subtotal, +(input.discountAmount || 0).toFixed(2));
    const { taxTotal, taxBreakdown } = calculateMultiRegionTax(input.items, discountAmount, branch.taxRegime, {
      interstateIgst: this.db.securitySettings.interstateIgstEnabled,
      defaultRate: branch.defaultTaxRate,
    });

    let deliveryFee = 0;
    if (input.channel === 'delivery' && input.deliveryPincode) {
      const zone = this.db.deliveryZones.find((z) => z.pincode === input.deliveryPincode && z.active);
      if (zone) deliveryFee = zone.deliveryFee;
    }

    const serviceCharge = +((subtotal - discountAmount) * (branch.serviceChargeRate / 100)).toFixed(2);
    const tipAmount = +(input.tipAmount || 0).toFixed(2);
    const giftCardRedeemed = +(input.giftCardRedeemed || 0).toFixed(2);
    const loyaltyPointsRedeemed = +(input.loyaltyPointsRedeemed || 0).toFixed(2);
    const grandTotal = Math.max(
      0,
      +(subtotal - discountAmount + taxTotal + serviceCharge + deliveryFee + tipAmount).toFixed(2)
    );

    const now = new Date().toISOString();
    const payments: PaymentRecord[] = (input.payments || []).map((p, i) => ({
      id: `pay-${Date.now()}-${i}`,
      method: p.method,
      amount: +p.amount.toFixed(2),
      reference: p.reference,
      paidAt: now,
    }));

    const paidTotal = +(
      payments.reduce((s, p) => s + p.amount, 0) +
      giftCardRedeemed +
      loyaltyPointsRedeemed
    ).toFixed(2);

    // "Pay on Phone" QR orders stay in awaiting_payment & are HELD from KDS until paid!
    const holdFromKitchen = input.channel === 'qr_table' && input.payMode === 'pay_on_phone' && paidTotal < grandTotal;
    const isPaid = paidTotal >= grandTotal && grandTotal > 0;
    const status: Order['status'] = holdFromKitchen ? 'awaiting_payment' : isPaid ? 'paid' : 'in_kitchen';

    const orderNum = `ORD-${2404 + this.db.orders.length}`;
    const order: Order = {
      id: `ord-${Date.now()}`,
      orderNumber: orderNum,
      branchId: branch.id,
      channel: input.channel,
      status,
      tableId: input.tableId,
      tableLabel: tableLabel || undefined,
      customerId: input.customerId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      deliveryAddress: input.deliveryAddress,
      deliveryPincode: input.deliveryPincode,
      deliveryStatus: input.channel === 'delivery' ? 'unassigned' : undefined,
      scheduledFor: input.scheduledFor,
      idempotencyKey: input.idempotencyKey,
      payMode: input.payMode,
      items: input.items,
      subtotal,
      discountAmount,
      couponCode: input.couponCode,
      referralCode: input.referralCode,
      giftCardCode: input.giftCardCode,
      giftCardRedeemed,
      loyaltyPointsRedeemed,
      serviceCharge,
      deliveryFee,
      tipAmount,
      taxTotal,
      taxBreakdown,
      grandTotal,
      paidTotal,
      payments,
      refunds: [],
      splitCount: input.splitCount || 1,
      staffId: input.staffId,
      staffName: input.staffName,
      createdAt: now,
      updatedAt: now,
    };

    this.db.orders.unshift(order);

    // Update table state if dine-in / QR
    if (input.tableId) {
      const table = this.db.tables.find((t) => t.id === input.tableId);
      if (table) {
        table.status = isPaid ? 'free' : holdFromKitchen ? 'ordering' : 'preparing';
        table.currentOrderId = isPaid ? undefined : order.id;
        if (!isPaid) table.sessionCodeActive = true;
      }
    }

    // Increment coupon usage
    if (input.couponCode) {
      const cpn = this.db.coupons.find((c) => c.code.toUpperCase() === input.couponCode?.toUpperCase());
      if (cpn) cpn.usesCount += 1;
    }

    // Deduct gift card balance
    if (input.giftCardCode && giftCardRedeemed > 0) {
      const gv = this.db.giftVouchers.find((g) => g.code.toUpperCase() === input.giftCardCode?.toUpperCase());
      if (gv) gv.balance = Math.max(0, +(gv.balance - giftCardRedeemed).toFixed(2));
    }

    // Dispatch KOTs grouped by station UNLESS held awaiting phone payment
    if (!holdFromKitchen) {
      this.emitKotsForOrder(order);
      this.deductInventoryForOrder(order);
    }

    if (isPaid) {
      this.applyLoyaltyAndReferrals(order);
      this.dispatchWebhooks('order.paid', { orderId: order.id, orderNumber: order.orderNumber, grandTotal });
    }

    this.save();
    this.onBroadcast?.('order:created', { order });
    return { order };
  }

  public emitKotsForOrder(order: Order) {
    const byStation = new Map<OrderItem['station'], OrderItem[]>();
    for (const item of order.items) {
      const list = byStation.get(item.station) || [];
      list.push(item);
      byStation.set(item.station, list);
    }
    for (const [station, items] of byStation.entries()) {
      const kot = {
        id: `kot-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        kotNumber: `KOT-${883 + this.db.kots.length}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        branchId: order.branchId,
        tableLabel: order.tableLabel || (order.channel === 'takeaway' ? 'Takeaway' : 'Delivery'),
        channel: order.channel,
        station,
        status: 'queued' as const,
        items,
        createdAt: new Date().toISOString(),
      };
      this.db.kots.unshift(kot);
      this.onBroadcast?.('kot:created', { kot });
    }
  }

  private deductInventoryForOrder(order: Order) {
    for (const oi of order.items) {
      const menu = this.db.menuItems.find((m) => m.id === oi.menuItemId);
      if (!menu) continue;
      for (const rec of menu.recipe) {
        const ing = this.db.ingredients.find((i) => i.id === rec.ingredientId);
        if (!ing) continue;
        const delta = +(rec.quantity * oi.quantity).toFixed(3);
        ing.quantityOnHand = Math.max(0, +(ing.quantityOnHand - delta).toFixed(3));
        this.db.stockJournal.unshift({
          id: `sj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          branchId: order.branchId,
          ingredientId: ing.id,
          ingredientName: ing.name,
          type: 'sale_deduction',
          delta: -delta,
          unitCost: ing.unitCost,
          reference: order.orderNumber,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  private applyLoyaltyAndReferrals(order: Order) {
    if (order.customerId) {
      const cust = this.db.customers.find((c) => c.id === order.customerId);
      if (cust) {
        const earned = Math.floor(order.grandTotal / 20); // 1 pt per ₹20
        cust.loyaltyPoints = Math.max(0, cust.loyaltyPoints - order.loyaltyPointsRedeemed + earned);
        cust.totalVisits += 1;
        cust.totalSpent = +(cust.totalSpent + order.grandTotal).toFixed(2);
        cust.lastVisitAt = new Date().toISOString();
      }
    }
    // Two-sided referral bonus: 100 pts to referrer + 50 pts to referred customer
    if (order.referralCode) {
      const referrer = this.db.customers.find(
        (c) => c.referralCode.toUpperCase() === order.referralCode?.toUpperCase()
      );
      if (referrer) {
        referrer.loyaltyPoints += 100;
        if (order.customerId) {
          const guest = this.db.customers.find((c) => c.id === order.customerId);
          if (guest && guest.id !== referrer.id) guest.loyaltyPoints += 50;
        }
      }
    }
  }

  public addPaymentsToOrder(
    orderId: string,
    payments: { method: TenderMethod; amount: number; reference?: string }[],
    tipAmount?: number
  ): Order | null {
    const order = this.db.orders.find((o) => o.id === orderId);
    if (!order) return null;
    const wasAwaiting = order.status === 'awaiting_payment';
    const now = new Date().toISOString();

    if (typeof tipAmount === 'number' && tipAmount > 0 && tipAmount !== order.tipAmount) {
      const diff = tipAmount - order.tipAmount;
      order.tipAmount = +tipAmount.toFixed(2);
      order.grandTotal = +(order.grandTotal + diff).toFixed(2);
    }

    for (const p of payments) {
      order.payments.push({
        id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        method: p.method,
        amount: +p.amount.toFixed(2),
        reference: p.reference,
        paidAt: now,
      });
    }

    order.paidTotal = +(
      order.payments.reduce((s, p) => s + p.amount, 0) +
      order.giftCardRedeemed +
      order.loyaltyPointsRedeemed
    ).toFixed(2);
    order.updatedAt = now;

    if (order.paidTotal >= order.grandTotal - 0.01) {
      order.status = 'paid';
      // Release held Pay-on-Phone QR order to KDS now that payment is confirmed!
      if (wasAwaiting) {
        this.emitKotsForOrder(order);
        this.deductInventoryForOrder(order);
      }
      if (order.tableId) {
        const tbl = this.db.tables.find((t) => t.id === order.tableId);
        if (tbl && tbl.currentOrderId === order.id) {
          tbl.status = 'cleaning';
          tbl.currentOrderId = undefined;
          tbl.billAlert = false;
          tbl.waiterAlert = false;
        }
      }
      this.applyLoyaltyAndReferrals(order);
      this.dispatchWebhooks('order.paid', { orderId: order.id, orderNumber: order.orderNumber, grandTotal: order.grandTotal });
    }

    this.save();
    this.onBroadcast?.('order:updated', { order });
    return order;
  }

  public mergeBills(targetOrderId: string, sourceOrderId: string, actorName: string): Order | null {
    const target = this.db.orders.find((o) => o.id === targetOrderId);
    const source = this.db.orders.find((o) => o.id === sourceOrderId);
    if (!target || !source || target.id === source.id) return null;

    const branch = this.db.branches.find((b) => b.id === target.branchId) || this.db.branches[0];
    target.items = [...target.items, ...source.items];
    target.subtotal = +target.items
      .reduce((s, it) => s + (it.unitPrice + it.modifiers.reduce((m, x) => m + x.priceDelta, 0)) * it.quantity, 0)
      .toFixed(2);
    target.discountAmount = +(target.discountAmount + source.discountAmount).toFixed(2);
    const { taxTotal, taxBreakdown } = calculateMultiRegionTax(target.items, target.discountAmount, branch.taxRegime, {
      interstateIgst: this.db.securitySettings.interstateIgstEnabled,
      defaultRate: branch.defaultTaxRate,
    });
    target.taxTotal = taxTotal;
    target.taxBreakdown = taxBreakdown;
    target.grandTotal = +(target.subtotal - target.discountAmount + taxTotal + target.tipAmount).toFixed(2);
    target.tableLabel = [target.tableLabel, source.tableLabel].filter(Boolean).join(' + ');
    target.updatedAt = new Date().toISOString();

    // Free source order & table
    source.status = 'voided';
    if (source.tableId) {
      const srcTable = this.db.tables.find((t) => t.id === source.tableId);
      if (srcTable) {
        srcTable.status = 'free';
        srcTable.currentOrderId = undefined;
      }
    }
    this.logAudit(actorName, 'BILL_MERGE', target.orderNumber, `Merged ${source.orderNumber} into ${target.orderNumber}`);
    this.save();
    this.onBroadcast?.('order:updated', { order: target });
    return target;
  }

  public runProductionBatch(input: {
    branchId: string;
    menuItemId: string;
    unitsProduced: number;
    ingredientUsages: { ingredientId: string; qtyUsed: number }[];
    extraCosts: number;
    newMenuPrice?: number;
    actorName: string;
  }): ProductionRun | null {
    const menu = this.db.menuItems.find((m) => m.id === input.menuItemId);
    if (!menu || input.unitsProduced <= 0) return null;

    let materialCost = 0;
    const usages: ProductionRun['ingredientUsages'] = [];

    for (const u of input.ingredientUsages) {
      const ing = this.db.ingredients.find((i) => i.id === u.ingredientId);
      if (!ing || u.qtyUsed <= 0) continue;
      const cost = +(u.qtyUsed * ing.unitCost).toFixed(2);
      materialCost += cost;
      ing.quantityOnHand = Math.max(0, +(ing.quantityOnHand - u.qtyUsed).toFixed(3));
      this.db.stockJournal.unshift({
        id: `sj-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        branchId: input.branchId,
        ingredientId: ing.id,
        ingredientName: ing.name,
        type: 'production_consume',
        delta: -u.qtyUsed,
        unitCost: ing.unitCost,
        reference: `BATCH-${menu.name.slice(0, 10)}`,
        createdAt: new Date().toISOString(),
      });
      usages.push({ ingredientId: ing.id, ingredientName: ing.name, qtyUsed: u.qtyUsed, cost });
    }

    const totalCost = +(materialCost + input.extraCosts).toFixed(2);
    const costPerUnit = +(totalCost / input.unitsProduced).toFixed(2);
    menu.lastCostPerUnit = costPerUnit;

    if (typeof input.newMenuPrice === 'number' && input.newMenuPrice > 0 && input.newMenuPrice !== menu.price) {
      menu.priceHistory.unshift({
        date: new Date().toISOString().slice(0, 10),
        oldPrice: menu.price,
        newPrice: input.newMenuPrice,
        reason: `Production costing update (Unit cost ${costPerUnit})`,
      });
      menu.price = input.newMenuPrice;
      this.logAudit(input.actorName, 'MENU_PRICE_UPDATE', menu.name, `Updated price to ${input.newMenuPrice} after batch run`);
    }

    const run: ProductionRun = {
      id: `prod-${Date.now()}`,
      branchId: input.branchId,
      menuItemId: menu.id,
      menuItemName: menu.name,
      unitsProduced: input.unitsProduced,
      ingredientUsages: usages,
      materialCost: +materialCost.toFixed(2),
      extraCosts: +input.extraCosts.toFixed(2),
      totalCost,
      costPerUnit,
      updatedMenuPrice: input.newMenuPrice,
      createdAt: new Date().toISOString(),
    };

    this.db.productionRuns.unshift(run);
    this.save();
    return run;
  }

  public generatePayroll(branchId: string, periodLabel: string, tipPoolTotal?: number): Payslip[] {
    const branchStaff = this.db.staff.filter((s) => s.branchId === branchId && s.active);
    const totalTips =
      typeof tipPoolTotal === 'number'
        ? tipPoolTotal
        : this.db.orders
            .filter((o) => o.branchId === branchId && o.status === 'paid')
            .reduce((s, o) => s + o.tipAmount, 0);

    const hoursByStaff = new Map<string, { regular: number; overtime: number; lateIncidents: number }>();
    let totalAllStaffHours = 0;

    for (const s of branchStaff) {
      const logs = this.db.attendance.filter((a) => a.staffId === s.id);
      let regular = 0;
      let overtime = 0;
      let lateIncidents = 0;
      for (const l of logs) {
        const start = new Date(l.clockIn).getTime();
        const end = l.clockOut ? new Date(l.clockOut).getTime() : start + 8 * 3600 * 1000;
        const worked = Math.max(0, (end - start) / 3600000 - l.breakMinutes / 60);
        const reg = Math.min(8, worked);
        const ot = Math.max(0, worked - 8);
        regular += reg;
        overtime += ot;
        if (l.lateMinutes > 10) lateIncidents += 1;
      }
      if (logs.length === 0) regular = 40; // baseline scheduled hours if no punches yet
      hoursByStaff.set(s.id, { regular: +regular.toFixed(2), overtime: +overtime.toFixed(2), lateIncidents });
      totalAllStaffHours += regular + overtime;
    }

    const slips: Payslip[] = branchStaff.map((s) => {
      const h = hoursByStaff.get(s.id) || { regular: 0, overtime: 0, lateIncidents: 0 };
      const basePay = +(h.regular * s.hourlyRate).toFixed(2);
      const overtimePay = +(h.overtime * s.hourlyRate * s.overtimeMultiplier).toFixed(2);
      const tipShare =
        totalAllStaffHours > 0
          ? +((totalTips * (h.regular + h.overtime)) / totalAllStaffHours).toFixed(2)
          : 0;
      const lateDeductions = +(h.lateIncidents * s.latePenaltyPerIncident).toFixed(2);
      const netPay = Math.max(0, +(basePay + overtimePay + tipShare - lateDeductions).toFixed(2));
      return {
        id: `slip-${Date.now()}-${s.id}`,
        branchId,
        staffId: s.id,
        staffName: s.name,
        periodLabel,
        regularHours: h.regular,
        overtimeHours: h.overtime,
        basePay,
        overtimePay,
        tipPoolShare: tipShare,
        lateDeductions,
        netPay,
        generatedAt: new Date().toISOString(),
      };
    });

    this.db.payslips = [...slips, ...this.db.payslips.filter((p) => p.periodLabel !== periodLabel)];
    this.save();
    return slips;
  }

  public syncOfflineAttendance(punches: {
    branchId: string;
    staffId: string;
    staffName: string;
    action: 'clock_in' | 'clock_out';
    timestamp: string;
  }[]): AttendanceLog[] {
    for (const p of punches) {
      const dateStr = p.timestamp.slice(0, 10);
      if (p.action === 'clock_in') {
        this.db.attendance.unshift({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          branchId: p.branchId,
          staffId: p.staffId,
          staffName: p.staffName,
          date: dateStr,
          clockIn: p.timestamp,
          breakMinutes: 30,
          lateMinutes: 0,
          offlineSynced: true,
        });
      } else {
        const openLog = this.db.attendance.find((a) => a.staffId === p.staffId && !a.clockOut);
        if (openLog) {
          openLog.clockOut = p.timestamp;
          openLog.offlineSynced = true;
        }
      }
    }
    this.save();
    return this.db.attendance;
  }

  public executeMcpTool(name: string, args: Record<string, any>) {
    switch (name) {
      case 'get_live_sales_summary': {
        const branchId = args.branchId || this.db.branches[0].id;
        const orders = this.db.orders.filter((o) => o.branchId === branchId && o.status !== 'voided');
        const revenue = orders.reduce((s, o) => s + o.grandTotal, 0);
        return { branchId, orderCount: orders.length, grossRevenue: +revenue.toFixed(2) };
      }
      case 'get_low_stock_alerts': {
        return this.db.ingredients
          .filter((i) => i.quantityOnHand <= i.parLevel)
          .map((i) => ({ name: i.name, sku: i.sku, onHand: i.quantityOnHand, parLevel: i.parLevel, unit: i.unit }));
      }
      case 'list_active_kots': {
        return this.db.kots.filter((k) => k.status !== 'served');
      }
      case 'search_menu': {
        const q = String(args.query || '').toLowerCase();
        return this.db.menuItems
          .filter((m) => m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q))
          .map((m) => ({ id: m.id, name: m.name, price: m.price, station: m.station, available: m.available }));
      }
      default:
        return { error: `Unknown MCP tool: ${name}` };
    }
  }
}
