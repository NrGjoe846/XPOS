import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Cloud,
  KeyRound,
  Mail,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuthProtection } from '../context/AuthContext';
import { extractLogoColors, getContrastTextColor, hexToRgba } from '../utils/colorExtract';

interface OnboardingPageProps {
  onCompleteToDashboard: () => void;
  onSwitchToPinLogin: () => void;
}

const DEFAULT_SWATCHES = ['#B45309', '#0F766E', '#1D4ED8', '#7C2D12', '#18181B'];

export const OnboardingPage: React.FC<OnboardingPageProps> = ({
  onCompleteToDashboard,
  onSwitchToPinLogin,
}) => {
  const { db, darkMode, toggleDarkMode, refreshState, setActiveModule, notify } = useApp();
  const {
    user,
    supabaseAuthenticated,
    authLoading,
    authError,
    isSupabaseConfigured,
    signInWithGoogle,
    signInWithOtp,
    signInWithPassword,
    signUp,
    signOut,
    unlockWithPin,
  } = useAuthProtection();

  const [step, setStep] = useState<1 | 2>(1);

  // Step 1: Minimalist Brand & Owner Identity
  const [ownerName, setOwnerName] = useState(db?.onboarding?.ownerName || '');
  const [ownerContact, setOwnerContact] = useState(db?.onboarding?.ownerContact || '');
  const [brandName, setBrandName] = useState(
    db?.onboarding?.completed ? db.onboarding.restaurantName : ''
  );
  const [brandLogo, setBrandLogo] = useState<string>(db?.onboarding?.brandLogo || '');
  const [extractedSwatches, setExtractedSwatches] = useState<string[]>(DEFAULT_SWATCHES);
  const [brandColor, setBrandColor] = useState<string>(db?.onboarding?.brandColor || '#B45309');
  const [isGstRegistered, setIsGstRegistered] = useState<boolean>(
    Boolean(db?.onboarding?.isGstRegistered)
  );
  const [gstin, setGstin] = useState<string>(db?.onboarding?.gstin || '');
  const [formError, setFormError] = useState<string | null>(null);

  // Step 2: Gmail Backup Auth
  const [fallbackAuthMode, setFallbackAuthMode] = useState<'none' | 'magic' | 'password'>('none');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingGoogleLaunchRef = useRef<boolean>(false);

  const accentFg = getContrastTextColor(brandColor);

  const handleLogoUpload = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('Please upload an image file (PNG, JPG, SVG, or WebP)', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) return;
      setBrandLogo(dataUrl);
      const colors = await extractLogoColors(dataUrl);
      setExtractedSwatches(colors);
      if (colors[0]) {
        setBrandColor(colors[0]);
      }
      notify('Logo uploaded & color theme matched to your logo', 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!ownerName.trim()) {
      setFormError('Please enter your name.');
      return;
    }
    if (!ownerContact.trim()) {
      setFormError('Please enter your contact number.');
      return;
    }
    if (!brandName.trim()) {
      setFormError('Please enter your brand name.');
      return;
    }
    if (isGstRegistered && gstin.trim().length < 5) {
      setFormError('Please enter your valid GSTIN.');
      return;
    }
    setStep(2);
  };

  const finalizeBrandOnboarding = async (gmailAddress?: string) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const resolvedEmail = gmailAddress || user?.email || authEmail.trim() || undefined;
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantName: brandName.trim(),
          brandLogo: brandLogo || undefined,
          brandColor,
          ownerName: ownerName.trim(),
          ownerContact: ownerContact.trim(),
          phone: ownerContact.trim(),
          ownerEmail: resolvedEmail,
          isGstRegistered,
          gstin: isGstRegistered ? gstin.trim().toUpperCase() : '',
          taxRegime: 'IN_GST',
          currency: 'INR',
          currencySymbol: '₹',
          defaultTaxRate: 5,
          upiMerchantName: brandName.trim(),
          ownerPin: '1111',
          tableCount: 8,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify(data.error || 'Unable to save brand onboarding', 'error');
        return;
      }

      // Trigger Supabase cloud backup sync
      await fetch('/api/supabase/sync', { method: 'POST' }).catch(() => undefined);
      await refreshState();
      await unlockWithPin('1111');
      setActiveModule('dashboard');
      notify(`Welcome to ${brandName.trim()} — Brand Dashboard ready`, 'success');
      onCompleteToDashboard();
    } catch {
      notify('Network error finalizing setup', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Auto-complete into Brand Dashboard as soon as Gmail OAuth popup finishes in Step 2
  useEffect(() => {
    if (step === 2 && pendingGoogleLaunchRef.current && supabaseAuthenticated && user) {
      pendingGoogleLaunchRef.current = false;
      void finalizeBrandOnboarding(user.email || undefined);
    }
  }, [step, supabaseAuthenticated, user]);

  const handleContinueWithGmail = async () => {
    if (supabaseAuthenticated && user) {
      await finalizeBrandOnboarding(user.email || undefined);
      return;
    }
    pendingGoogleLaunchRef.current = true;
    const res = await signInWithGoogle();
    if (res.error) {
      pendingGoogleLaunchRef.current = false;
      notify(res.error.message, 'error');
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail.trim()) return;
    const res = await signInWithOtp(authEmail.trim());
    if (!res.error) {
      setMagicLinkSent(true);
      notify(`Backup verification link sent to ${authEmail.trim()}`, 'success');
    }
  };

  const handlePasswordBackupAuth = async (isSignUp: boolean) => {
    if (!authEmail.trim() || !authPassword) return;
    const res = isSignUp
      ? await signUp(authEmail.trim(), authPassword)
      : await signInWithPassword(authEmail.trim(), authPassword);
    if (!res.error) {
      await finalizeBrandOnboarding(authEmail.trim());
    }
  };

  const callbackUrl = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '/auth/callback';

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#1C1917] dark:bg-[#0C0A09] dark:text-[#F5F5F4] flex flex-col transition-colors duration-200">
      {/* Ultra-Clean Minimalist Top Bar */}
      <header className="h-16 px-6 lg:px-10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {brandLogo ? (
            <img
              src={brandLogo}
              alt={brandName || 'Brand logo'}
              className="w-8 h-8 rounded-lg object-contain border border-stone-200 dark:border-stone-800 bg-white p-0.5"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center font-display font-bold text-sm transition-colors"
              style={{ backgroundColor: brandColor, color: accentFg }}
            >
              {(brandName || 'U').slice(0, 1).toUpperCase()}
            </div>
          )}
          <span className="font-display font-semibold text-sm tracking-tight">
            {brandName.trim() || 'UNAI POS'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSwitchToPinLogin}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#171412] text-xs font-medium text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white whitespace-nowrap shrink-0"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Staff PIN</span>
          </button>
          <button
            type="button"
            onClick={toggleDarkMode}
            className="p-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#171412] text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white"
            aria-label="Toggle theme"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Centered Premium Minimalist Card */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div
          className="w-full max-w-[460px] bg-white dark:bg-[#141210] border border-stone-200/90 dark:border-stone-800 rounded-2xl p-7 sm:p-9 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.12)] space-y-6"
          style={{ borderTopWidth: '3px', borderTopColor: brandColor }}
        >
          {/* Minimal Step Indicator */}
          <div className="flex items-center justify-between text-[11px] font-medium text-stone-400 dark:text-stone-500">
            <span>Step {step} of 2</span>
            <div className="flex items-center gap-1.5">
              <span
                className="h-1.5 w-6 rounded-full transition-colors"
                style={{ backgroundColor: brandColor }}
              />
              <span
                className="h-1.5 w-6 rounded-full transition-colors"
                style={{
                  backgroundColor: step === 2 ? brandColor : hexToRgba(brandColor, 0.2),
                }}
              />
            </div>
          </div>

          {step === 1 ? (
            <form onSubmit={handleNextStep} className="space-y-5">
              <div className="space-y-1">
                <h1 className="font-display font-bold text-2xl tracking-tight text-stone-900 dark:text-stone-50">
                  Welcome to UNAI POS
                </h1>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Set up your brand identity and preferences to launch your dashboard.
                </p>
              </div>

              <div className="space-y-3.5 text-xs">
                {/* Name & Contact */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                      Your Name
                    </label>
                    <input
                      type="text"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      placeholder="Enter your name"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': brandColor } as React.CSSProperties}
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                      Contact
                    </label>
                    <input
                      type="tel"
                      value={ownerContact}
                      onChange={(e) => setOwnerContact(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': brandColor } as React.CSSProperties}
                    />
                  </div>
                </div>

                {/* Brand Name */}
                <div>
                  <label className="block font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                    Brand Name
                  </label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="e.g., Saffron Table Co."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': brandColor } as React.CSSProperties}
                  />
                </div>

                {/* Upload Brand Logo */}
                <div>
                  <label className="block font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                    Upload Brand Logo
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleLogoUpload(e.target.files?.[0])}
                  />
                  {brandLogo ? (
                    <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={brandLogo}
                          alt="Uploaded brand logo"
                          className="w-12 h-12 rounded-lg object-contain bg-white border border-stone-200 p-1 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                            Logo Ready
                          </div>
                          <div className="text-[11px] text-stone-500">
                            Palette matched from your logo
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#141210] text-[11px] font-medium hover:bg-stone-50"
                        >
                          Change
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBrandLogo('');
                            setExtractedSwatches(DEFAULT_SWATCHES);
                          }}
                          className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                          aria-label="Remove logo"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleLogoUpload(e.dataTransfer.files?.[0]);
                      }}
                      className="w-full py-4 px-4 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 bg-[#FAF9F6] dark:bg-[#1C1917] hover:border-stone-400 dark:hover:border-stone-600 transition-colors flex items-center justify-center gap-2.5 text-stone-600 dark:text-stone-300"
                    >
                      <Upload className="w-4 h-4 text-stone-400" />
                      <span className="font-medium">Click or drop logo to upload (PNG, JPG, SVG)</span>
                    </button>
                  )}
                </div>

                {/* Color Theme According to Logo */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="inline-flex items-center gap-1.5 font-medium text-stone-700 dark:text-stone-300">
                      <Palette className="w-3.5 h-3.5 text-stone-400" />
                      <span>Color Theme {brandLogo ? '(Matched from Logo)' : ''}</span>
                    </label>
                    <span className="font-mono text-[11px] text-stone-500">{brandColor}</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    {extractedSwatches.map((hex) => {
                      const active = brandColor.toUpperCase() === hex.toUpperCase();
                      return (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => setBrandColor(hex)}
                          title={hex}
                          className="w-8 h-8 rounded-full border border-black/10 dark:border-white/15 flex items-center justify-center transition-transform hover:scale-105 shrink-0"
                          style={{
                            backgroundColor: hex,
                            boxShadow: active ? `0 0 0 2px #fff, 0 0 0 4px ${hex}` : undefined,
                          }}
                        >
                          {active && <Check className="w-3.5 h-3.5" style={{ color: getContrastTextColor(hex) }} />}
                        </button>
                      );
                    })}
                    <label
                      className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] cursor-pointer text-[11px] font-medium text-stone-600 dark:text-stone-300"
                      title="Pick custom color"
                    >
                      <input
                        type="color"
                        value={brandColor}
                        onChange={(e) => setBrandColor(e.target.value.toUpperCase())}
                        className="w-4 h-4 rounded border-0 p-0 bg-transparent cursor-pointer"
                      />
                      <span>Custom</span>
                    </label>
                  </div>
                </div>

                {/* Registered Business Toggle + Conditional GSTIN */}
                <div className="p-3.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917] space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-stone-900 dark:text-stone-100">
                        Is your business registered?
                      </div>
                      <div className="text-[11px] text-stone-500">
                        Toggle on to add GSTIN on receipts &amp; invoices
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isGstRegistered}
                      onClick={() => setIsGstRegistered((prev) => !prev)}
                      className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none"
                      style={{
                        backgroundColor: isGstRegistered ? brandColor : '#D6D3D1',
                      }}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                          isGstRegistered ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {isGstRegistered && (
                    <div>
                      <label className="block font-medium text-stone-700 dark:text-stone-300 mb-1">
                        GSTIN
                      </label>
                      <input
                        type="text"
                        maxLength={15}
                        value={gstin}
                        onChange={(e) => setGstin(e.target.value.toUpperCase())}
                        placeholder="29AABCN4821K1Z5"
                        className="w-full px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#141210] font-mono uppercase tracking-wide focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              </div>

              {formError && (
                <div className="text-xs text-red-600 dark:text-red-400 font-medium">{formError}</div>
              )}

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl font-semibold text-xs inline-flex items-center justify-center gap-2 transition-opacity hover:opacity-95"
                style={{ backgroundColor: brandColor, color: accentFg }}
              >
                <span>Next</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <div className="space-y-5">
              {/* Brand Preview Pill-Free Header */}
              <div
                className="p-3.5 rounded-xl border flex items-center gap-3"
                style={{
                  borderColor: hexToRgba(brandColor, 0.35),
                  backgroundColor: hexToRgba(brandColor, 0.06),
                }}
              >
                {brandLogo ? (
                  <img
                    src={brandLogo}
                    alt={brandName}
                    className="w-11 h-11 rounded-lg object-contain bg-white border border-stone-200 p-1 shrink-0"
                  />
                ) : (
                  <div
                    className="w-11 h-11 rounded-lg flex items-center justify-center font-display font-bold text-base shrink-0"
                    style={{ backgroundColor: brandColor, color: accentFg }}
                  >
                    {brandName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-display font-bold text-sm text-stone-900 dark:text-stone-100 truncate">
                    {brandName}
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                    {ownerName} · {ownerContact}
                    {isGstRegistered && gstin ? ` · GSTIN ${gstin}` : ''}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                  <Cloud className="w-3.5 h-3.5" style={{ color: brandColor }} />
                  <span>Cloud Backup</span>
                </div>
                <h2 className="font-display font-bold text-xl tracking-tight text-stone-900 dark:text-stone-50">
                  Continue with Gmail for data backup
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Connect your Gmail via Supabase Auth so your brand profile, POS bills, GST ledger, and menu stay safely backed up.
                </p>
              </div>

              {supabaseAuthenticated && user ? (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-semibold text-emerald-900 dark:text-emerald-200">
                          Gmail Backup Connected
                        </div>
                        <div className="text-stone-600 dark:text-stone-300 truncate">{user.email}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => signOut()}
                      className="px-2.5 py-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#141210] text-[11px] font-medium shrink-0"
                    >
                      Change
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => finalizeBrandOnboarding(user.email || undefined)}
                    className="w-full py-3 px-4 rounded-xl font-semibold text-xs inline-flex items-center justify-center gap-2 transition-opacity hover:opacity-95 disabled:opacity-50"
                    style={{ backgroundColor: brandColor, color: accentFg }}
                  >
                    <span>{submitting ? 'Opening Brand Dashboard...' : `Open ${brandName} Dashboard`}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    type="button"
                    disabled={authLoading || submitting || !isSupabaseConfigured}
                    onClick={handleContinueWithGmail}
                    className="w-full py-3 px-4 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#1C1917] hover:bg-stone-50 dark:hover:bg-stone-900 flex items-center justify-center gap-2.5 text-xs font-semibold text-stone-900 dark:text-stone-100 transition-colors disabled:opacity-50"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                      />
                    </svg>
                    <span>
                      {authLoading || submitting ? 'Connecting Gmail Backup...' : 'Continue with Gmail'}
                    </span>
                  </button>

                  {authError && (
                    <div className="p-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-[11px] text-red-800 dark:text-red-300 space-y-1">
                      <div className="font-semibold">{authError}</div>
                      <div>
                        Enable Google Provider in Supabase Auth and add redirect URL:{' '}
                        <span className="font-mono break-all select-all">{callbackUrl}</span>
                      </div>
                    </div>
                  )}

                  {/* Clean Optional Email / Password Backup Fallback */}
                  <div className="flex items-center justify-center gap-4 text-[11px] text-stone-500 pt-1">
                    <button
                      type="button"
                      onClick={() => setFallbackAuthMode(fallbackAuthMode === 'magic' ? 'none' : 'magic')}
                      className="hover:text-stone-900 dark:hover:text-stone-200 underline underline-offset-2"
                    >
                      Gmail Magic Link
                    </button>
                    <button
                      type="button"
                      onClick={() => setFallbackAuthMode(fallbackAuthMode === 'password' ? 'none' : 'password')}
                      className="hover:text-stone-900 dark:hover:text-stone-200 underline underline-offset-2"
                    >
                      Email &amp; Password
                    </button>
                  </div>

                  {fallbackAuthMode === 'magic' && (
                    <form onSubmit={handleMagicLink} className="space-y-2 text-xs">
                      <div className="flex gap-2">
                        <input
                          type="email"
                          required
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
                          placeholder="yourname@gmail.com"
                          className="flex-1 px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
                        />
                        <button
                          type="submit"
                          disabled={authLoading}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg font-semibold shrink-0"
                          style={{ backgroundColor: brandColor, color: accentFg }}
                        >
                          <Mail className="w-3.5 h-3.5" />
                          <span>Send</span>
                        </button>
                      </div>
                      {magicLinkSent && (
                        <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                          Magic link sent — open it from your Gmail inbox.
                        </div>
                      )}
                    </form>
                  )}

                  {fallbackAuthMode === 'password' && (
                    <div className="space-y-2 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="email"
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
                          placeholder="yourname@gmail.com"
                          className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
                        />
                        <input
                          type="password"
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                          placeholder="Password"
                          className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-[#1C1917]"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handlePasswordBackupAuth(false)}
                          disabled={authLoading}
                          className="py-2 rounded-lg font-semibold"
                          style={{ backgroundColor: brandColor, color: accentFg }}
                        >
                          Sign In &amp; Open
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePasswordBackupAuth(true)}
                          disabled={authLoading}
                          className="py-2 rounded-lg border border-stone-200 dark:border-stone-800 font-semibold"
                        >
                          Create Account
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-3 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-1 text-stone-500 hover:text-stone-900 dark:hover:text-stone-200 font-medium"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Edit Brand</span>
                </button>
                {!supabaseAuthenticated && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => finalizeBrandOnboarding(authEmail.trim() || undefined)}
                    className="text-stone-500 hover:text-stone-900 dark:hover:text-stone-200 font-medium"
                  >
                    {submitting ? 'Opening...' : 'Continue without Gmail →'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
