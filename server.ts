import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { PosStore } from './server/store.ts';
import { createSeedDatabase } from './server/seed.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const app = express();
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const store = new PosStore();

function broadcast(event: string, payload: unknown) {
  const msg = JSON.stringify({ event, payload, ts: Date.now() });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

store.setBroadcaster(broadcast);

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ event: 'sync:connected', payload: { ts: Date.now() } }));
});

// --- Health & Bootstrap ---
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'Nodedr OrderRestro', uptime: process.uptime() });
});

app.get('/api/state', (_req, res) => {
  res.json(store.getState());
});

// --- QR Code DataURL generator (UPI & Table QR) ---
app.get('/api/qrcode', async (req, res) => {
  const text = String(req.query.text || '');
  if (!text) return res.status(400).json({ error: 'Missing text query parameter' });
  try {
    const dataUrl = await QRCode.toDataURL(text, { margin: 1, width: 280 });
    res.json({ dataUrl });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'QR generation failed' });
  }
});

// --- Auth: PIN Switch & 2FA Verification ---
app.post('/api/auth/pin', (req, res) => {
  const { pin } = req.body as { pin: string };
  const staff = store.getState().staff.find((s) => s.pin === pin && s.active);
  if (!staff) return res.status(401).json({ error: 'Invalid staff PIN' });
  const role = store.getState().roles.find((r) => r.id === staff.roleId);
  store.mutate((db) => {
    store.logAudit(staff.name, 'PIN_LOGIN', 'POS Terminal', `Signed in as ${staff.roleName}`);
  });
  res.json({ staff, role });
});

app.post('/api/auth/verify-2fa', (req, res) => {
  const { staffId, code } = req.body as { staffId: string; code: string };
  const staff = store.getState().staff.find((s) => s.id === staffId);
  if (!staff) return res.status(404).json({ error: 'Staff not found' });
  const normalized = String(code || '').trim().toUpperCase();
  const isRecovery = staff.recoveryCodes.includes(normalized);
  // Accept 6-digit TOTP simulation or valid recovery code
  if (/^\d{6}$/.test(normalized) || isRecovery) {
    if (isRecovery) {
      store.mutate((db) => {
        const target = db.staff.find((s) => s.id === staffId);
        if (target) target.recoveryCodes = target.recoveryCodes.filter((c) => c !== normalized);
        store.logAudit(staff.name, '2FA_RECOVERY_USED', staff.email, 'Single-use recovery code consumed');
      });
    }
    return res.json({ verified: true, method: isRecovery ? 'recovery_code' : 'totp' });
  }
  return res.status(400).json({ error: 'Invalid 6-digit authenticator code or recovery code.' });
});

// --- Orders, Billing, Split, Merge, Refunds ---
app.post('/api/orders', (req, res) => {
  const result = store.createOrder(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ order: result.order, duplicate: Boolean(result.duplicate), state: store.getState() });
});

app.post('/api/orders/:id/pay', (req, res) => {
  const { payments, tipAmount } = req.body;
  const order = store.addPaymentsToOrder(req.params.id, payments || [], tipAmount);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({ order, state: store.getState() });
});

app.post('/api/orders/:id/split', (req, res) => {
  const { splitCount } = req.body as { splitCount: number };
  const db = store.mutate((d) => {
    const o = d.orders.find((x) => x.id === req.params.id);
    if (o) o.splitCount = Math.max(1, Number(splitCount || 1));
  }, 'order:updated', { orderId: req.params.id });
  res.json({ state: db });
});

app.post('/api/orders/merge', (req, res) => {
  const { targetOrderId, sourceOrderId, actorName } = req.body;
  const merged = store.mergeBills(targetOrderId, sourceOrderId, actorName || 'Cashier');
  if (!merged) return res.status(400).json({ error: 'Cannot merge selected bills.' });
  res.json({ order: merged, state: store.getState() });
});

app.post('/api/orders/:id/refund', (req, res) => {
  const { amount, reason, method, processedBy } = req.body;
  const db = store.mutate((d) => {
    const order = d.orders.find((o) => o.id === req.params.id);
    if (!order) return;
    order.refunds.push({
      id: `ref-${Date.now()}`,
      amount: Number(amount),
      reason: reason || 'Customer refund',
      method: method || 'cash',
      processedBy: processedBy || 'Manager',
      refundedAt: new Date().toISOString(),
    });
    const totalRefunded = order.refunds.reduce((s, r) => s + r.amount, 0);
    if (totalRefunded >= order.paidTotal) order.status = 'refunded';
    store.logAudit(processedBy || 'Manager', 'ORDER_REFUND', order.orderNumber, `Refunded ${amount}: ${reason}`);
  }, 'order:updated', { orderId: req.params.id });
  res.json({ state: db });
});

app.post('/api/orders/:id/rate', (req, res) => {
  const { score, comment } = req.body;
  const db = store.mutate((d) => {
    const order = d.orders.find((o) => o.id === req.params.id);
    if (order) {
      order.rating = { score: Number(score), comment: String(comment || ''), createdAt: new Date().toISOString() };
    }
  });
  res.json({ state: db });
});

// --- KDS KOTs ---
app.patch('/api/kots/:id', (req, res) => {
  const { status } = req.body;
  const db = store.mutate((d) => {
    const kot = d.kots.find((k) => k.id === req.params.id);
    if (!kot) return;
    kot.status = status;
    const now = new Date().toISOString();
    if (status === 'preparing' && !kot.startedAt) kot.startedAt = now;
    if (status === 'ready') kot.readyAt = now;
    if (status === 'served') kot.servedAt = now;

    // Sync parent order & table status when all KOTs are ready/served
    const siblingKots = d.kots.filter((k) => k.orderId === kot.orderId);
    const parentOrder = d.orders.find((o) => o.id === kot.orderId);
    if (parentOrder && parentOrder.status !== 'paid') {
      if (siblingKots.every((k) => k.status === 'served')) {
        parentOrder.status = 'served';
      } else if (siblingKots.every((k) => k.status === 'ready' || k.status === 'served')) {
        parentOrder.status = 'ready';
      } else {
        parentOrder.status = 'in_kitchen';
      }
      if (parentOrder.tableId) {
        const tbl = d.tables.find((t) => t.id === parentOrder.tableId);
        if (tbl && tbl.status !== 'billing') {
          tbl.status = parentOrder.status === 'served' ? 'served' : 'preparing';
        }
      }
    }
  }, 'kot:updated', { kotId: req.params.id, status });
  res.json({ state: db });
});

// --- Tables, Floor Plan, Live QR Code, Reservations, Waitlist ---
app.post('/api/tables/:id/open-session', (req, res) => {
  const newCode = String(Math.floor(1000 + Math.random() * 9000));
  const db = store.mutate((d) => {
    const tbl = d.tables.find((t) => t.id === req.params.id);
    if (tbl) {
      tbl.sessionCode = newCode;
      tbl.sessionCodeActive = true;
      if (tbl.status === 'free' || tbl.status === 'cleaning') tbl.status = 'ordering';
    }
  }, 'table:updated', { tableId: req.params.id });
  res.json({ code: newCode, state: db });
});

app.post('/api/qr/verify', (req, res) => {
  const { tableId, code } = req.body as { tableId: string; code: string };
  const tbl = store.getState().tables.find((t) => t.id === tableId);
  if (!tbl) return res.status(404).json({ error: 'Table not found' });
  if (!tbl.sessionCodeActive || tbl.sessionCode !== String(code).trim()) {
    return res.status(403).json({ error: 'Table session code is invalid or expired. Please ask your server.' });
  }
  res.json({ verified: true, table: tbl });
});

app.post('/api/tables/:id/alert', (req, res) => {
  const { type } = req.body as { type: 'waiter' | 'bill' | 'clear' };
  const db = store.mutate((d) => {
    const tbl = d.tables.find((t) => t.id === req.params.id);
    if (!tbl) return;
    if (type === 'waiter') tbl.waiterAlert = true;
    if (type === 'bill') {
      tbl.billAlert = true;
      tbl.status = 'billing';
    }
    if (type === 'clear') {
      tbl.waiterAlert = false;
      tbl.billAlert = false;
    }
  }, 'table:alert', { tableId: req.params.id, type });
  res.json({ state: db });
});

app.post('/api/tables/transfer', (req, res) => {
  const { fromTableId, toTableId } = req.body;
  const db = store.mutate((d) => {
    const fromTbl = d.tables.find((t) => t.id === fromTableId);
    const toTbl = d.tables.find((t) => t.id === toTableId);
    if (!fromTbl || !toTbl) return;
    const order = d.orders.find((o) => o.id === fromTbl.currentOrderId);
    if (order) {
      order.tableId = toTbl.id;
      order.tableLabel = toTbl.label;
      d.kots.filter((k) => k.orderId === order.id).forEach((k) => (k.tableLabel = toTbl.label));
    }
    toTbl.currentOrderId = fromTbl.currentOrderId;
    toTbl.status = fromTbl.status;
    toTbl.sessionCodeActive = fromTbl.sessionCodeActive;
    fromTbl.currentOrderId = undefined;
    fromTbl.status = 'free';
    fromTbl.sessionCodeActive = false;
  }, 'table:updated', { fromTableId, toTableId });
  res.json({ state: db });
});

// --- Production Runs ---
app.post('/api/production-runs', (req, res) => {
  const run = store.runProductionBatch(req.body);
  if (!run) return res.status(400).json({ error: 'Invalid production batch input' });
  res.json({ run, state: store.getState() });
});

// --- Payroll & Offline Attendance ---
app.post('/api/payroll/generate', (req, res) => {
  const { branchId, periodLabel, tipPoolTotal } = req.body;
  const payslips = store.generatePayroll(branchId, periodLabel || 'Current Cycle', tipPoolTotal);
  res.json({ payslips, state: store.getState() });
});

app.post('/api/attendance/sync', (req, res) => {
  const { punches } = req.body;
  const attendance = store.syncOfflineAttendance(punches || []);
  res.json({ attendance, state: store.getState() });
});

// --- Generic Module State Mutation Endpoint (Menu, Tables, Inventory, Procurement, CRM, Delivery, Accounting, Marketing, Maintenance, Docs, Security, Admin) ---
app.post('/api/mutate', (req, res) => {
  const { type, payload, actorName } = req.body as { type: string; payload: any; actorName?: string };
  const actor = actorName || 'Admin';

  const db = store.mutate((d) => {
    switch (type) {
      case 'save_table_layout': {
        for (const update of payload.tables as { id: string; x: number; y: number; status?: any }[]) {
          const tbl = d.tables.find((t) => t.id === update.id);
          if (tbl) {
            tbl.x = update.x;
            tbl.y = update.y;
            if (update.status) tbl.status = update.status;
          }
        }
        break;
      }
      case 'bulk_table_status': {
        for (const id of payload.tableIds as string[]) {
          const tbl = d.tables.find((t) => t.id === id);
          if (tbl) {
            tbl.status = payload.status;
            if (payload.status === 'free') {
              tbl.currentOrderId = undefined;
              tbl.sessionCodeActive = false;
              tbl.waiterAlert = false;
              tbl.billAlert = false;
            }
          }
        }
        break;
      }
      case 'toggle_buzzer': {
        const tbl = d.tables.find((t) => t.id === payload.tableId);
        if (tbl) tbl.buzzerActive = !tbl.buzzerActive;
        break;
      }
      case 'add_reservation': {
        d.reservations.unshift({ id: `res-${Date.now()}`, ...payload });
        break;
      }
      case 'update_reservation_status': {
        const r = d.reservations.find((x) => x.id === payload.id);
        if (r) r.status = payload.status;
        break;
      }
      case 'add_waitlist': {
        d.waitlist.unshift({ id: `wl-${Date.now()}`, createdAt: new Date().toISOString(), status: 'waiting', ...payload });
        break;
      }
      case 'update_waitlist': {
        const w = d.waitlist.find((x) => x.id === payload.id);
        if (w) w.status = payload.status;
        break;
      }
      case 'upsert_menu_item': {
        const existing = d.menuItems.find((m) => m.id === payload.id);
        if (existing) {
          Object.assign(existing, payload);
        } else {
          d.menuItems.push({ ...payload, id: `item-${Date.now()}`, priceHistory: [], recipe: payload.recipe || [], lastCostPerUnit: payload.lastCostPerUnit || 0 });
        }
        break;
      }
      case 'add_category': {
        d.categories.push({ id: `cat-${Date.now()}`, ...payload });
        break;
      }
      case 'add_combo': {
        d.combos.push({ id: `cmb-${Date.now()}`, ...payload });
        break;
      }
      case 'add_seasonal_menu': {
        d.seasonalMenus.push({ id: `seas-${Date.now()}`, ...payload });
        break;
      }
      case 'stock_adjustment': {
        const ing = d.ingredients.find((i) => i.id === payload.ingredientId);
        if (ing) {
          const delta = Number(payload.newQuantity) - ing.quantityOnHand;
          ing.quantityOnHand = Number(payload.newQuantity);
          d.stockJournal.unshift({
            id: `sj-${Date.now()}`,
            branchId: ing.branchId,
            ingredientId: ing.id,
            ingredientName: ing.name,
            type: 'stock_take_adj',
            delta: +delta.toFixed(3),
            unitCost: ing.unitCost,
            reference: payload.reason || 'Physical Stock Take',
            createdAt: new Date().toISOString(),
          });
        }
        break;
      }
      case 'transfer_stock_area': {
        const ing = d.ingredients.find((i) => i.id === payload.ingredientId);
        if (ing) {
          ing.areaId = payload.toAreaId;
          d.stockJournal.unshift({
            id: `sj-${Date.now()}`,
            branchId: ing.branchId,
            ingredientId: ing.id,
            ingredientName: ing.name,
            type: 'transfer',
            delta: 0,
            unitCost: ing.unitCost,
            reference: `Moved to ${payload.toAreaName}`,
            createdAt: new Date().toISOString(),
          });
        }
        break;
      }
      case 'branch_stock_transfer': {
        const ing = d.ingredients.find((i) => i.id === payload.ingredientId);
        if (ing && payload.qty > 0) {
          ing.quantityOnHand = Math.max(0, +(ing.quantityOnHand - payload.qty).toFixed(3));
          d.stockJournal.unshift({
            id: `sj-${Date.now()}`,
            branchId: ing.branchId,
            ingredientId: ing.id,
            ingredientName: ing.name,
            type: 'transfer',
            delta: -payload.qty,
            unitCost: ing.unitCost,
            reference: `Branch Transfer -> ${payload.toBranchName}`,
            createdAt: new Date().toISOString(),
          });
        }
        break;
      }
      case 'log_waste': {
        const ing = d.ingredients.find((i) => i.id === payload.ingredientId);
        if (ing) {
          const qty = Number(payload.quantity);
          ing.quantityOnHand = Math.max(0, +(ing.quantityOnHand - qty).toFixed(3));
          const costValue = +(qty * ing.unitCost).toFixed(2);
          d.wasteLogs.unshift({
            id: `wst-${Date.now()}`,
            branchId: ing.branchId,
            ingredientId: ing.id,
            ingredientName: ing.name,
            quantity: qty,
            costValue,
            reason: payload.reason,
            loggedBy: actor,
            createdAt: new Date().toISOString(),
          });
          d.stockJournal.unshift({
            id: `sj-${Date.now()}`,
            branchId: ing.branchId,
            ingredientId: ing.id,
            ingredientName: ing.name,
            type: 'waste',
            delta: -qty,
            unitCost: ing.unitCost,
            reference: payload.reason,
            createdAt: new Date().toISOString(),
          });
        }
        break;
      }
      case 'add_supplier': {
        d.suppliers.push({ id: `sup-${Date.now()}`, onTimeRate: 95, qualityScore: 4.7, balanceDue: 0, ...payload });
        break;
      }
      case 'add_rfq': {
        d.quotations.unshift({ id: `rfq-${Date.now()}`, status: 'pending', ...payload });
        break;
      }
      case 'select_rfq': {
        const q = d.quotations.find((x) => x.id === payload.id);
        if (q) q.status = 'selected';
        break;
      }
      case 'create_po': {
        d.purchaseOrders.unshift({
          id: `po-${Date.now()}`,
          poNumber: `PO-2026-0${42 + d.purchaseOrders.length}`,
          status: 'approved',
          createdAt: new Date().toISOString(),
          ...payload,
        });
        break;
      }
      case 'receive_grn': {
        const po = d.purchaseOrders.find((p) => p.id === payload.poId);
        if (po) po.status = 'received';
        const grn = {
          id: `grn-${Date.now()}`,
          grnNumber: `GRN-${502 + d.grns.length}`,
          createdAt: new Date().toISOString(),
          ...payload,
        };
        d.grns.unshift(grn);
        for (const item of payload.receivedItems) {
          const ing = d.ingredients.find((i) => i.id === item.ingredientId);
          if (ing) {
            ing.quantityOnHand = +(ing.quantityOnHand + Number(item.qtyReceived)).toFixed(3);
            ing.unitCost = Number(item.unitCost);
            ing.batchNumber = item.batchNumber;
            ing.expiryDate = item.expiryDate;
            d.stockJournal.unshift({
              id: `sj-${Date.now()}-${ing.id}`,
              branchId: payload.branchId,
              ingredientId: ing.id,
              ingredientName: ing.name,
              type: 'grn_receipt',
              delta: Number(item.qtyReceived),
              unitCost: Number(item.unitCost),
              reference: grn.grnNumber,
              createdAt: new Date().toISOString(),
            });
          }
        }
        const sup = d.suppliers.find((s) => s.name === payload.supplierName);
        if (sup) sup.balanceDue = +(sup.balanceDue + Number(payload.invoiceAmount)).toFixed(2);
        break;
      }
      case 'pay_supplier': {
        const grn = d.grns.find((g) => g.id === payload.grnId);
        if (grn && !grn.paid) {
          grn.paid = true;
          const sup = d.suppliers.find((s) => s.name === grn.supplierName);
          if (sup) sup.balanceDue = Math.max(0, +(sup.balanceDue - grn.invoiceAmount).toFixed(2));
        }
        break;
      }
      case 'return_po': {
        const po = d.purchaseOrders.find((p) => p.id === payload.poId);
        if (po) po.status = 'returned';
        break;
      }
      case 'add_customer': {
        d.customers.unshift({
          id: `cust-${Date.now()}`,
          loyaltyPoints: 50,
          referralCode: `${String(payload.name).split(' ')[0].toUpperCase().slice(0, 6)}50`,
          totalVisits: 0,
          totalSpent: 0,
          marketingOptOut: false,
          lastVisitAt: new Date().toISOString(),
          ...payload,
        });
        break;
      }
      case 'issue_voucher': {
        d.giftVouchers.unshift({
          id: `gv-${Date.now()}`,
          balance: Number(payload.initialAmount),
          active: true,
          ...payload,
        });
        break;
      }
      case 'add_shift': {
        d.shifts.push({ id: `shf-${Date.now()}`, ...payload });
        break;
      }
      case 'add_leave': {
        d.leaves.unshift({ id: `lv-${Date.now()}`, status: 'pending', ...payload });
        break;
      }
      case 'update_leave': {
        const lv = d.leaves.find((l) => l.id === payload.id);
        if (lv) lv.status = payload.status;
        break;
      }
      case 'add_staff': {
        d.staff.push({ id: `st-${Date.now()}`, twoFactorEnabled: false, recoveryCodes: [], active: true, ...payload });
        break;
      }
      case 'add_expense': {
        d.expenses.unshift({ id: `exp-${Date.now()}`, status: 'submitted', ...payload });
        break;
      }
      case 'update_expense_status': {
        const ex = d.expenses.find((e) => e.id === payload.id);
        if (ex) ex.status = payload.status;
        break;
      }
      case 'close_cash_drawer': {
        d.cashClosings.unshift({ id: `cc-${Date.now()}`, ...payload });
        store.logAudit(actor, 'NIGHTLY_CASH_CLOSE', payload.date, `Counted ${payload.countedCash}, Variance ${payload.variance}`);
        break;
      }
      case 'upsert_budget': {
        const existing = d.budgets.find((b) => b.branchId === payload.branchId && b.category === payload.category);
        if (existing) existing.budgetAmount = Number(payload.budgetAmount);
        else d.budgets.push({ id: `bdg-${Date.now()}`, ...payload });
        break;
      }
      case 'reconcile_bank': {
        const be = d.bankEntries.find((b) => b.id === payload.id);
        if (be) be.reconciled = !be.reconciled;
        break;
      }
      case 'add_delivery_zone': {
        d.deliveryZones.push({ id: `dz-${Date.now()}`, active: true, ...payload });
        break;
      }
      case 'assign_driver': {
        const ord = d.orders.find((o) => o.id === payload.orderId);
        if (ord) {
          ord.driverId = payload.driverId;
          ord.deliveryStatus = payload.deliveryStatus;
        }
        break;
      }
      case 'add_equipment': {
        d.equipment.unshift({ id: `eq-${Date.now()}`, ...payload });
        break;
      }
      case 'service_equipment': {
        const eq = d.equipment.find((e) => e.id === payload.id);
        if (eq) {
          eq.lastServiceDate = payload.serviceDate;
          eq.nextServiceDue = payload.nextServiceDue;
        }
        break;
      }
      case 'add_document': {
        d.documents.unshift({ id: `doc-${Date.now()}`, createdAt: new Date().toISOString(), ...payload });
        break;
      }
      case 'add_coupon': {
        d.coupons.unshift({ id: `cpn-${Date.now()}`, usesCount: 0, active: true, ...payload });
        break;
      }
      case 'toggle_happy_hour': {
        const hh = d.happyHours.find((h) => h.id === payload.id);
        if (hh) hh.active = !hh.active;
        break;
      }
      case 'send_campaign': {
        const optedIn = d.customers.filter((c) => !c.marketingOptOut).length;
        const optedOut = d.customers.filter((c) => c.marketingOptOut).length;
        d.campaigns.unshift({
          id: `cmp-${Date.now()}`,
          audienceCount: optedIn,
          optedOutSkipped: optedOut,
          sentAt: new Date().toISOString(),
          ...payload,
        });
        break;
      }
      case 'toggle_customer_optout': {
        const c = d.customers.find((x) => x.id === payload.id);
        if (c) c.marketingOptOut = !c.marketingOptOut;
        break;
      }
      case 'add_webhook': {
        d.webhooks.push({ id: `wh-${Date.now()}`, active: true, ...payload });
        break;
      }
      case 'test_webhook': {
        const hook = d.webhooks.find((w) => w.id === payload.id);
        if (hook) {
          const sig = crypto.createHmac('sha256', hook.secret).update(JSON.stringify({ test: true, ts: Date.now() })).digest('hex');
          d.webhookDeliveries.unshift({
            id: `whd-${Date.now()}`,
            webhookId: hook.id,
            event: 'webhook.test',
            statusCode: 200,
            signature: `sha256=${sig.slice(0, 24)}...`,
            deliveredAt: new Date().toISOString(),
          });
        }
        break;
      }
      case 'add_scheduled_report': {
        d.scheduledReports.push({ id: `sr-${Date.now()}`, active: true, ...payload });
        break;
      }
      case 'update_branch': {
        const br = d.branches.find((b) => b.id === payload.id);
        if (br) {
          Object.assign(br, payload);
          store.logAudit(actor, 'BRANCH_SETTINGS_UPDATED', br.name, `Tax regime: ${br.taxRegime}, UPI: ${br.upiVpa}`);
        }
        break;
      }
      case 'update_role_permissions': {
        const role = d.roles.find((r) => r.id === payload.id);
        if (role) {
          role.permissions = payload.permissions;
          store.logAudit(actor, 'RBAC_UPDATED', role.name, `${payload.permissions.length} permissions assigned`);
        }
        break;
      }
      case 'toggle_2fa': {
        const st = d.staff.find((s) => s.id === payload.staffId);
        if (st) {
          st.twoFactorEnabled = !st.twoFactorEnabled;
          if (st.twoFactorEnabled && st.recoveryCodes.length === 0) {
            st.recoveryCodes = ['ORD-5102-AX', 'ORD-9918-BZ', 'ORD-4320-CY', 'ORD-7821-DW'];
          }
          store.logAudit(actor, '2FA_TOGGLED', st.email, `2FA ${st.twoFactorEnabled ? 'enabled' : 'disabled'}`);
        }
        break;
      }
      case 'update_security_settings': {
        Object.assign(d.securitySettings, payload);
        store.logAudit(actor, 'SECURITY_SETTINGS', 'System', JSON.stringify(payload));
        break;
      }
      case 'update_smtp': {
        Object.assign(d.smtpConfig, payload, { configured: true });
        break;
      }
      case 'restore_backup': {
        if (payload && Array.isArray(payload.branches)) {
          Object.assign(d, payload);
          store.logAudit(actor, 'BACKUP_RESTORED', 'Database', 'Full JSON backup restored');
        }
        break;
      }
      case 'reset_seed': {
        const fresh = createSeedDatabase();
        Object.assign(d, fresh);
        break;
      }
    }
  }, 'state:mutated', { type });

  res.json({ state: db });
});

// --- OpenAPI / Swagger JSON Spec ---
app.get('/api/openapi.json', (_req, res) => {
  res.json({
    openapi: '3.0.3',
    info: { title: 'Nodedr OrderRestro POS API', version: '2.0.0' },
    paths: {
      '/api/health': { get: { summary: 'Health & uptime status' } },
      '/api/state': { get: { summary: 'Fetch complete multi-branch operational state' } },
      '/api/orders': { post: { summary: 'Create dine-in, takeaway, delivery, or QR order' } },
      '/api/orders/{id}/pay': { post: { summary: 'Record single or multi-tender split payment' } },
      '/api/orders/merge': { post: { summary: 'Merge two open table bills' } },
      '/api/production-runs': { post: { summary: 'Log production batch & update unit cost/menu price' } },
      '/api/payroll/generate': { post: { summary: 'Compute worked-hours payroll & hour-weighted tip pool' } },
      '/api/mcp': { post: { summary: 'Model Context Protocol (MCP) JSON-RPC 2.0 endpoint' } },
    },
  });
});

// --- Model Context Protocol (MCP) JSON-RPC Endpoint ---
app.post('/api/mcp', (req, res) => {
  const { id, method, params } = req.body || {};
  if (method === 'initialize') {
    return res.json({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'nodedr-orderrestro-mcp', version: '1.0.0' },
        capabilities: { tools: {} },
      },
    });
  }
  if (method === 'tools/list') {
    return res.json({
      jsonrpc: '2.0',
      id,
      result: {
        tools: [
          { name: 'get_live_sales_summary', description: 'Return live order count and gross revenue for a branch' },
          { name: 'get_low_stock_alerts', description: 'List inventory ingredients at or below par level' },
          { name: 'list_active_kots', description: 'List queued, preparing, and ready kitchen order tickets' },
          { name: 'search_menu', description: 'Search menu items by dish name or description' },
        ],
      },
    });
  }
  if (method === 'tools/call') {
    const result = store.executeMcpTool(params?.name, params?.arguments || {});
    return res.json({
      jsonrpc: '2.0',
      id,
      result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
    });
  }
  return res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Nodedr OrderRestro server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
