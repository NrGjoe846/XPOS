import React, { useState } from 'react';
import { Megaphone, Wrench, FileText, Upload } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const MarketingMaintenanceDocsModule: React.FC<{ initialTab?: 'marketing' | 'maintenance' | 'documents' }> = ({
  initialTab = 'marketing',
}) => {
  const { db, activeBranchId, currentStaff, mutate, notify } = useApp();
  const [tab, setTab] = useState<'marketing' | 'maintenance' | 'documents'>(initialTab);

  // Marketing forms
  const [cpnCode, setCpnCode] = useState('');
  const [cpnVal, setCpnVal] = useState(15);
  const [cmpTitle, setCmpTitle] = useState('');
  const [cmpChannel, setCmpChannel] = useState<'email' | 'sms' | 'whatsapp'>('whatsapp');
  const [cmpMsg, setCmpMsg] = useState('');

  // Maintenance forms
  const [eqName, setEqName] = useState('');
  const [eqSerial, setEqSerial] = useState('');
  const [eqLoc, setEqLoc] = useState('Main Kitchen');
  const [eqNextDue, setEqNextDue] = useState('2026-12-15');

  // Documents forms
  const [docTitle, setDocTitle] = useState('');
  const [docCat, setDocCat] = useState<'SOP' | 'Contract' | 'Recipe' | 'Purchase Paperwork'>('SOP');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    mutate('add_document', {
      branchId: activeBranchId,
      title: docTitle || file.name,
      category: docCat,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      contentPreview: `Uploaded attachment: ${file.name} (${Math.round(file.size / 1024)} KB)`,
      uploadedBy: currentStaff?.name || 'Admin',
    });
    setDocTitle('');
    notify(`Uploaded ${file.name} to document vault`, 'success');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1 p-1 bg-stone-100 dark:bg-stone-900 rounded-lg w-fit text-xs">
        <button
          onClick={() => setTab('marketing')}
          className={`px-3 py-1.5 rounded-md font-semibold ${tab === 'marketing' ? 'bg-white dark:bg-[#171412] shadow-sm' : 'text-stone-500'}`}
        >
          Marketing & Campaigns
        </button>
        <button
          onClick={() => setTab('maintenance')}
          className={`px-3 py-1.5 rounded-md font-semibold ${tab === 'maintenance' ? 'bg-white dark:bg-[#171412] shadow-sm' : 'text-stone-500'}`}
        >
          Equipment Maintenance
        </button>
        <button
          onClick={() => setTab('documents')}
          className={`px-3 py-1.5 rounded-md font-semibold ${tab === 'documents' ? 'bg-white dark:bg-[#171412] shadow-sm' : 'text-stone-500'}`}
        >
          Documents & SOP Vault
        </button>
      </div>

      {tab === 'marketing' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4">
            <h3 className="font-display font-semibold text-sm inline-flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-amber-700" /> Coupons & Happy Hour Discounts
            </h3>
            <div className="flex gap-2 text-xs">
              <input
                value={cpnCode}
                onChange={(e) => setCpnCode(e.target.value.toUpperCase())}
                placeholder="Coupon code (WEEKEND20)"
                className="flex-1 px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
              />
              <input
                type="number"
                value={cpnVal}
                onChange={(e) => setCpnVal(Number(e.target.value))}
                className="w-20 px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
              />
              <button
                onClick={() => {
                  if (!cpnCode.trim()) return;
                  mutate('add_coupon', { code: cpnCode, type: 'percent', value: cpnVal, minSpend: 400, maxUses: 200 });
                  setCpnCode('');
                }}
                className="px-4 py-2 rounded-lg bg-amber-700 text-white font-semibold"
              >
                Create
              </button>
            </div>
            <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
              {(db?.happyHours || []).map((hh) => (
                <div key={hh.id} className="py-2.5 flex justify-between items-center">
                  <div>
                    <div className="font-semibold">{hh.name}</div>
                    <div className="text-stone-500">
                      {hh.days} · {hh.startTime}–{hh.endTime} · {hh.discountPercent}% OFF
                    </div>
                  </div>
                  <button
                    onClick={() => mutate('toggle_happy_hour', { id: hh.id })}
                    className={`px-2.5 py-1 rounded border font-semibold ${hh.active ? 'border-emerald-600 text-emerald-700' : 'border-stone-300 text-stone-500'}`}
                  >
                    {hh.active ? 'Active' : 'Paused'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4">
            <h3 className="font-display font-semibold text-sm">Email (SMTP) / SMS / WhatsApp Campaign</h3>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <input
                value={cmpTitle}
                onChange={(e) => setCmpTitle(e.target.value)}
                placeholder="Campaign title"
                className="col-span-2 px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
              />
              <select
                value={cmpChannel}
                onChange={(e) => setCmpChannel(e.target.value as any)}
                className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email (SMTP)</option>
                <option value="sms">SMS</option>
              </select>
            </div>
            <textarea
              value={cmpMsg}
              onChange={(e) => setCmpMsg(e.target.value)}
              rows={2}
              placeholder="Write campaign message (customers marked opt-out are automatically excluded)..."
              className="w-full px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] text-xs"
            />
            <button
              onClick={async () => {
                if (!cmpTitle.trim()) return;
                await mutate('send_campaign', { title: cmpTitle, channel: cmpChannel, message: cmpMsg });
                setCmpTitle('');
                setCmpMsg('');
                notify('Campaign dispatched (opted-out guests skipped)', 'success');
              }}
              className="px-4 py-2 rounded-lg bg-amber-700 text-white text-xs font-semibold"
            >
              Send Campaign
            </button>

            <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
              {(db?.campaigns || []).map((c) => (
                <div key={c.id} className="py-2 flex justify-between">
                  <div>
                    <div className="font-semibold">
                      {c.title} ({c.channel.toUpperCase()})
                    </div>
                    <div className="text-stone-500">
                      Sent to {c.audienceCount} · Skipped {c.optedOutSkipped} opted-out
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'maintenance' && (
        <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4">
          <h3 className="font-display font-semibold text-sm inline-flex items-center gap-2">
            <Wrench className="w-4 h-4 text-amber-700" /> Kitchen Equipment Register & Overdue Service Alerts
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs">
            <input
              value={eqName}
              onChange={(e) => setEqName(e.target.value)}
              placeholder="Equipment name"
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            />
            <input
              value={eqSerial}
              onChange={(e) => setEqSerial(e.target.value)}
              placeholder="Serial #"
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] font-mono"
            />
            <input
              value={eqLoc}
              onChange={(e) => setEqLoc(e.target.value)}
              placeholder="Location"
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            />
            <input
              type="date"
              value={eqNextDue}
              onChange={(e) => setEqNextDue(e.target.value)}
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            />
            <button
              onClick={() => {
                if (!eqName.trim()) return;
                mutate('add_equipment', {
                  branchId: activeBranchId,
                  name: eqName,
                  serialNumber: eqSerial || 'SN-NEW',
                  location: eqLoc,
                  warrantyUntil: '2028-01-01',
                  lastServiceDate: new Date().toISOString().slice(0, 10),
                  nextServiceDue: eqNextDue,
                  vendorPhone: '+91 80 4000 1234',
                });
                setEqName('');
              }}
              className="px-4 py-2 rounded-lg bg-amber-700 text-white font-semibold"
            >
              Register Asset
            </button>
          </div>
          <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
            {(db?.equipment || []).map((eq) => {
              const overdue = new Date(eq.nextServiceDue).getTime() < Date.now();
              return (
                <div key={eq.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">
                      {eq.name} <span className="font-mono text-stone-400">({eq.serialNumber})</span>
                    </div>
                    <div className="text-stone-500">
                      {eq.location} · Last service {eq.lastServiceDate} · Next due{' '}
                      <span className={overdue ? 'text-red-600 font-bold' : ''}>
                        {eq.nextServiceDue} {overdue ? '(OVERDUE)' : ''}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const today = new Date().toISOString().slice(0, 10);
                      const next = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
                      mutate('service_equipment', { id: eq.id, serviceDate: today, nextServiceDue: next });
                      notify(`Logged service for ${eq.name}`, 'success');
                    }}
                    className="px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 font-medium"
                  >
                    Mark Serviced
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'documents' && (
        <div className="bg-white dark:bg-[#171412] border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4">
          <h3 className="font-display font-semibold text-sm inline-flex items-center gap-2">
            <FileText className="w-4 h-4 text-amber-700" /> SOPs, Contracts, Recipes & Purchase Paperwork
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              placeholder="Document title"
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            />
            <select
              value={docCat}
              onChange={(e) => setDocCat(e.target.value as any)}
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
            >
              <option value="SOP">SOP</option>
              <option value="Contract">Contract</option>
              <option value="Recipe">Recipe</option>
              <option value="Purchase Paperwork">Purchase Paperwork</option>
            </select>
            <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-700 text-white font-semibold cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Attach PDF / Image / Office Doc</span>
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
            {(db?.documents || []).map((doc) => (
              <div key={doc.id} className="py-3 space-y-1">
                <div className="flex justify-between font-semibold">
                  <span>
                    {doc.title} · {doc.category}
                  </span>
                  <span className="font-mono text-stone-500">
                    {doc.fileName} ({Math.round(doc.sizeBytes / 1024)} KB)
                  </span>
                </div>
                <div className="text-stone-500">{doc.contentPreview}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
