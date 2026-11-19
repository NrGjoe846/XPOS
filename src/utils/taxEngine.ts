import { Branch, OrderItem, TaxLine, TaxRegime } from '../types/pos';

export function formatMoney(amount: number, currencySymbol = '₹'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${currencySymbol}${safe.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function calculateMultiRegionTax(
  items: OrderItem[],
  discountAmount: number,
  regime: TaxRegime,
  options?: { interstateIgst?: boolean; defaultRate?: number }
): { taxTotal: number; taxBreakdown: TaxLine[] } {
  const rawSubtotal = items.reduce((sum, item) => {
    const modSum = item.modifiers.reduce((m, mod) => m + mod.priceDelta, 0);
    return sum + (item.unitPrice + modSum) * item.quantity;
  }, 0);

  if (rawSubtotal <= 0) {
    return { taxTotal: 0, taxBreakdown: [] };
  }

  const discountRatio = Math.max(0, (rawSubtotal - discountAmount) / rawSubtotal);
  const buckets = new Map<number, number>();

  for (const item of items) {
    const modSum = item.modifiers.reduce((m, mod) => m + mod.priceDelta, 0);
    const lineTotal = (item.unitPrice + modSum) * item.quantity * discountRatio;
    const rate = item.taxRate ?? options?.defaultRate ?? 5;
    buckets.set(rate, (buckets.get(rate) || 0) + lineTotal);
  }

  const breakdown: TaxLine[] = [];
  let taxTotal = 0;

  for (const [rate, taxableAmount] of buckets.entries()) {
    const taxAmt = +(taxableAmount * (rate / 100)).toFixed(2);
    taxTotal += taxAmt;

    if (regime === 'IN_GST') {
      if (options?.interstateIgst) {
        breakdown.push({ label: `IGST @ ${rate}%`, rate, amount: taxAmt });
      } else {
        const halfRate = +(rate / 2).toFixed(2);
        const cgst = +(taxAmt / 2).toFixed(2);
        const sgst = +(taxAmt - cgst).toFixed(2);
        breakdown.push({ label: `CGST @ ${halfRate}%`, rate: halfRate, amount: cgst });
        breakdown.push({ label: `SGST @ ${halfRate}%`, rate: halfRate, amount: sgst });
      }
    } else if (regime === 'US_TAX') {
      breakdown.push({ label: `Sales Tax (${rate}%)`, rate, amount: taxAmt });
    } else if (regime === 'EU_VAT') {
      breakdown.push({ label: `EU VAT (${rate}%)`, rate, amount: taxAmt });
    } else if (regime === 'ES_IVA') {
      breakdown.push({ label: `Spain IVA (${rate}%)`, rate, amount: taxAmt });
    }
  }

  return {
    taxTotal: +taxTotal.toFixed(2),
    taxBreakdown: breakdown,
  };
}

export function buildUpiUri(branch: Branch, amount: number, orderRef: string): string {
  const params = new URLSearchParams({
    pa: branch.upiVpa || 'orderrestro@hdfcbank',
    pn: branch.upiMerchantName || branch.name,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: `Order ${orderRef}`,
  });
  return `upi://pay?${params.toString()}`;
}

export function getRegimeDisplayLabel(regime: TaxRegime): string {
  switch (regime) {
    case 'IN_GST':
      return 'India GST (CGST + SGST / IGST)';
    case 'US_TAX':
      return 'US State & Local Sales Tax';
    case 'EU_VAT':
      return 'EU Standard / Reduced VAT';
    case 'ES_IVA':
      return 'Spain IVA (10% / 21%)';
  }
}
