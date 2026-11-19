import { Branch, Order } from '../types/pos';
import { formatMoney } from './taxEngine';

// Synthesizes a pleasant two-tone payment-received chime via Web Audio API
export function playUpiSuccessChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes = [587.33, 880.0, 1174.66]; // D5 -> A5 -> D6 hospitality chime
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);
      gain.gain.setValueAtTime(0.001, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.18, now + idx * 0.11 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.11 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.38);
    });
  } catch {
    // Ignore autoplay blocks gracefully
  }
}

export function playKitchenAlertChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(740, now);
    osc.frequency.setValueAtTime(987.77, now + 0.12);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  } catch {
    // Ignore audio context blocks
  }
}

export function formatThermalReceiptText(order: Order, branch: Branch): string {
  const sym = branch.currencySymbol;
  const line = '----------------------------------------';
  const lines: string[] = [
    branch.name.toUpperCase(),
    branch.address,
    `Tel: ${branch.phone}`,
    branch.gstin ? `GSTIN: ${branch.gstin}` : '',
    branch.fssai ? `FSSAI: ${branch.fssai}` : '',
    line,
    `Bill: ${order.orderNumber}   ${order.channel.toUpperCase()}`,
    order.tableLabel ? `Table: ${order.tableLabel}` : '',
    `Date: ${new Date(order.createdAt).toLocaleString()}`,
    order.staffName ? `Cashier: ${order.staffName}` : '',
    line,
  ].filter(Boolean);

  for (const item of order.items) {
    const modTotal = item.modifiers.reduce((s, m) => s + m.priceDelta, 0);
    const total = (item.unitPrice + modTotal) * item.quantity;
    lines.push(`${item.quantity}x ${item.name.slice(0, 24).padEnd(24, ' ')} ${formatMoney(total, sym).padStart(9, ' ')}`);
    for (const mod of item.modifiers) {
      lines.push(`   + ${mod.name}`);
    }
  }

  lines.push(line);
  lines.push(`Subtotal:${formatMoney(order.subtotal, sym).padStart(31, ' ')}`);
  if (order.discountAmount > 0) {
    lines.push(`Discount:${('-' + formatMoney(order.discountAmount, sym)).padStart(31, ' ')}`);
  }
  for (const t of order.taxBreakdown) {
    lines.push(`${t.label}:${formatMoney(t.amount, sym).padStart(40 - t.label.length - 1, ' ')}`);
  }
  if (order.tipAmount > 0) {
    lines.push(`Tip:${formatMoney(order.tipAmount, sym).padStart(36, ' ')}`);
  }
  lines.push(line);
  lines.push(`GRAND TOTAL:${formatMoney(order.grandTotal, sym).padStart(28, ' ')}`);
  lines.push(line);
  if (order.payments.length > 0) {
    for (const p of order.payments) {
      lines.push(`Paid (${p.method.toUpperCase()}):${formatMoney(p.amount, sym).padStart(29 - p.method.length, ' ')}`);
    }
  }
  lines.push('');
  lines.push('   Thank you for dining with us!   ');
  return lines.join('\n');
}

// Builds real ESC/POS binary buffer (Initialize + Text + Cut + optional Cash Drawer Pulse)
export function buildEscPosBytes(receiptText: string, kickDrawer = false): Uint8Array {
  const encoder = new TextEncoder();
  const init = [0x1b, 0x40]; // ESC @
  const body = Array.from(encoder.encode(receiptText + '\n\n\n\n'));
  const cut = [0x1d, 0x56, 0x00]; // GS V 0 full cut
  const drawer = kickDrawer ? [0x1b, 0x70, 0x00, 0x19, 0xfa] : []; // ESC p 0 25 250
  return new Uint8Array([...init, ...body, ...cut, ...drawer]);
}

export async function printViaWebUSB(receiptText: string, kickDrawer = false): Promise<{ ok: boolean; message: string }> {
  const nav = navigator as Navigator & { usb?: { requestDevice: (opts: { filters: unknown[] }) => Promise<any> } };
  if (!nav.usb) {
    return {
      ok: false,
      message: 'WebUSB is unavailable in this browser context. Showing formatted ESC/POS preview & print dialog instead.',
    };
  }
  try {
    const device = await nav.usb.requestDevice({ filters: [] });
    await device.open();
    if (device.configuration === null) {
      await device.selectConfiguration(1);
    }
    const iface = device.configuration.interfaces[0];
    await device.claimInterface(iface.interfaceNumber);
    const outEndpoint = iface.alternate.endpoints.find((e: any) => e.direction === 'out');
    if (!outEndpoint) {
      return { ok: false, message: 'No USB bulk-out endpoint found on selected printer.' };
    }
    const bytes = buildEscPosBytes(receiptText, kickDrawer);
    await device.transferOut(outEndpoint.endpointNumber, bytes);
    await device.close();
    return { ok: true, message: 'Printed via WebUSB ESC/POS printer.' };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.name === 'NotFoundError' ? 'No USB thermal printer selected.' : err?.message || 'USB print cancelled.',
    };
  }
}

export async function kickCashDrawerWebUSB(): Promise<{ ok: boolean; message: string }> {
  const nav = navigator as Navigator & { usb?: { requestDevice: (opts: { filters: unknown[] }) => Promise<any> } };
  if (!nav.usb) {
    return { ok: false, message: 'Cash drawer pulse simulated (ESC p 0x00 0x19 0xFA). Attach WebUSB printer for physical kick.' };
  }
  try {
    const device = await nav.usb.requestDevice({ filters: [] });
    await device.open();
    if (device.configuration === null) await device.selectConfiguration(1);
    const iface = device.configuration.interfaces[0];
    await device.claimInterface(iface.interfaceNumber);
    const outEndpoint = iface.alternate.endpoints.find((e: any) => e.direction === 'out');
    if (outEndpoint) {
      await device.transferOut(outEndpoint.endpointNumber, new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]));
    }
    await device.close();
    return { ok: true, message: 'Cash drawer kick pulse sent over WebUSB.' };
  } catch {
    return { ok: false, message: 'Cash drawer pulse simulated locally (ESC p 0 25 250).' };
  }
}
