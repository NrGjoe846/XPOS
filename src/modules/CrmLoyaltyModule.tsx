import React, { useState } from 'react';
import { Gift, Share2, Star } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatMoney } from '../utils/taxEngine';

export const CrmLoyaltyModule: React.FC = () => {
  const { db, activeBranch, mutate, notify } = useApp();
  const sym = activeBranch?.currencySymbol || '₹';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [tier, setTier] = useState<'Standard' | 'Silver' | 'Gold'>('Standard');
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherAmt, setVoucherAmt] = useState(500);
  const [voucherTo, setVoucherTo] = useState('');

  const ratedOrders = (db?.orders || []).filter((o) => o.rating);

  return (
    <div className="space-y-6">
      {/* Add Customer & Issue Gift Voucher */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-3">
          <h3 className="font-display font-semibold text-sm">Register CRM Guest & Membership</h3>
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone (+91 ...)"
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            />
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as any)}
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            >
              <option value="Standard">Standard Tier</option>
              <option value="Silver">Silver Member</option>
              <option value="Gold">Gold Member</option>
            </select>
          </div>
          <button
            onClick={async () => {
              if (!name.trim()) return;
              await mutate('add_customer', { name, phone, email, membershipTier: tier });
              setName('');
              setPhone('');
              setEmail('');
              notify('Customer profile created with 50 welcome points', 'success');
            }}
            className="px-4 py-2 rounded-lg bg-amber-700 text-white text-xs font-semibold"
          >
            Save Guest Profile
          </button>
        </div>

        <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-3">
          <h3 className="font-display font-semibold text-sm inline-flex items-center gap-2">
            <Gift className="w-4 h-4 text-amber-700" /> Issue Gift Voucher
          </h3>
          <div className="grid grid-cols-3 gap-2.5 text-xs">
            <input
              value={voucherCode}
              onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
              placeholder="Code (DIWALI500)"
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
            />
            <input
              type="number"
              value={voucherAmt}
              onChange={(e) => setVoucherAmt(Number(e.target.value))}
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
            />
            <input
              value={voucherTo}
              onChange={(e) => setVoucherTo(e.target.value)}
              placeholder="Recipient name"
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            />
          </div>
          <button
            onClick={async () => {
              if (!voucherCode.trim()) return;
              await mutate('issue_voucher', {
                code: voucherCode,
                initialAmount: voucherAmt,
                issuedTo: voucherTo || 'Guest',
                expiresAt: '2027-12-31',
              });
              setVoucherCode('');
              setVoucherTo('');
              notify('Gift voucher issued', 'success');
            }}
            className="px-4 py-2 rounded-lg bg-amber-700 text-white text-xs font-semibold"
          >
            Issue Voucher
          </button>

          <div className="pt-2 divide-y divide-stone-100 dark:divide-stone-800 text-xs">
            {(db?.giftVouchers || []).map((g) => (
              <div key={g.id} className="py-1.5 flex justify-between">
                <span className="font-mono font-semibold">
                  {g.code} · {g.issuedTo}
                </span>
                <span className="font-mono tabular-nums">
                  Bal: {formatMoney(g.balance, sym)} / {formatMoney(g.initialAmount, sym)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Customer Directory & Two-Sided Referral Links */}
      <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 overflow-x-auto">
        <h3 className="font-display font-semibold text-sm mb-3">Loyalty Profiles, Referral Rewards & Visit History</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-stone-200 dark:border-stone-800 text-stone-500 text-left">
              <th className="py-2">Guest</th>
              <th className="py-2">Tier</th>
              <th className="py-2 text-right">Loyalty Points</th>
              <th className="py-2 text-right">Visits</th>
              <th className="py-2 text-right">Lifetime Spend</th>
              <th className="py-2 text-right">Referral Link (100/50 pts)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
            {(db?.customers || []).map((c) => (
              <tr key={c.id}>
                <td className="py-2.5 font-medium">
                  {c.name}
                  <div className="text-[11px] text-stone-500">
                    {c.phone} · {c.email}
                  </div>
                </td>
                <td className="py-2.5">{c.membershipTier}</td>
                <td className="py-2.5 text-right font-mono tabular-nums font-semibold text-amber-700 dark:text-amber-400">
                  {c.loyaltyPoints} pts
                </td>
                <td className="py-2.5 text-right font-mono tabular-nums">{c.totalVisits}</td>
                <td className="py-2.5 text-right font-mono tabular-nums">{formatMoney(c.totalSpent, sym)}</td>
                <td className="py-2.5 text-right">
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/?mode=qr&ref=${c.referralCode}`;
                      navigator.clipboard?.writeText(url);
                      notify(`Copied referral link (${c.referralCode})`, 'success');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-stone-200 dark:border-stone-800 font-mono hover:bg-stone-50 dark:hover:bg-stone-900"
                  >
                    <Share2 className="w-3 h-3" />
                    <span>{c.referralCode}</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Customer Ratings & Feedback */}
      <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-3">
        <h3 className="font-display font-semibold text-sm inline-flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-600" /> Post-Payment Customer Ratings & Feedback
        </h3>
        <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
          {ratedOrders.map((o) => (
            <div key={o.id} className="py-2.5 flex justify-between items-start gap-4">
              <div>
                <div className="font-semibold">
                  {o.customerName || 'Guest'} · {o.orderNumber}
                </div>
                <div className="text-stone-500 mt-0.5">{o.rating?.comment}</div>
              </div>
              <span className="font-mono font-bold text-amber-700 dark:text-amber-400 shrink-0">
                {o.rating?.score} / 5 ★
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
