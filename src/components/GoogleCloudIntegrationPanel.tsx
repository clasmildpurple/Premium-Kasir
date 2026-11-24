import React, { useState } from 'react';
import {
  PermanentGoogleConfig,
  ProductItem,
  formatRupiah,
  generateAppsScriptCode,
  isDatabaseConfigured,
} from '../data/posData';
import {
  Language,
  StoreBrandingSettings,
  THEME_COLOR_PRESETS,
  TRANSLATIONS,
} from '../data/i18nAndSettings';
import { BrandLogo } from './PosIllustrations';
import {
  Check,
  Copy,
  Database,
  Eye,
  EyeOff,
  FolderKanban,
  Image as ImageIcon,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  Palette,
  Percent,
  RefreshCw,
  Save,
  Store,
  User,
} from 'lucide-react';

interface GoogleCloudIntegrationPanelProps {
  config: PermanentGoogleConfig;
  isCloudConfigured?: boolean;
  offlineQueueCount?: number;
  onFlushOfflineQueue?: () => Promise<void>;
  onUpdateConfig: (
    newConfig: PermanentGoogleConfig
  ) => Promise<{ ok: boolean; pulledFromSheet: boolean; error?: string } | void>;
  storeSettings: StoreBrandingSettings;
  onUpdateStoreSettings: (
    newSettings: StoreBrandingSettings,
    logoUpload?: { data: string; name: string; mime: string }
  ) => Promise<void>;
  products: ProductItem[];
  activeUsername?: string;
  onSyncAllToCloud?: () => Promise<void>;
  onPullFromCloud?: () => Promise<void>;
  lastSyncedAt?: string;
  syncStatus?: 'connected' | 'local_realtime' | 'syncing';
}

const TAX_RATE_PRESETS = [0, 5, 10, 11, 12];

export const GoogleCloudIntegrationPanel: React.FC<
  GoogleCloudIntegrationPanelProps
> = ({
  config,
  isCloudConfigured = false,
  offlineQueueCount = 0,
  onFlushOfflineQueue,
  onUpdateConfig,
  storeSettings,
  onUpdateStoreSettings,
  products,
  activeUsername,
  onSyncAllToCloud,
  onPullFromCloud,
  lastSyncedAt,
  syncStatus = 'local_realtime',
}) => {
  const t = TRANSLATIONS[storeSettings.language as Language];
  const isId = storeSettings.language === 'id';
  const primaryColor = storeSettings.primaryColor || '#FF2457';

  // Non-secret Cloud Shortcut Links State (Google Sheet & Drive Folder only — /exec URL & token stay strictly on server)
  const [googleSheetUrl, setGoogleSheetUrl] = useState(config.GOOGLE_SHEET_URL);
  const [googleDriveUrl, setGoogleDriveUrl] = useState(
    config.GOOGLE_DRIVE_FOLDER_URL
  );
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [configErrorBanner, setConfigErrorBanner] = useState<string | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncAllSuccess, setSyncAllSuccess] = useState(false);
  const [isPullingCloud, setIsPullingCloud] = useState(false);
  const [pullCloudSuccess, setPullCloudSuccess] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const dbConfigured = isCloudConfigured || isDatabaseConfigured(config);

  React.useEffect(() => {
    setGoogleSheetUrl(config.GOOGLE_SHEET_URL);
    setGoogleDriveUrl(config.GOOGLE_DRIVE_FOLDER_URL);
  }, [config.GOOGLE_SHEET_URL, config.GOOGLE_DRIVE_FOLDER_URL]);

  // Store Branding & Theme State
  const [storeName, setStoreName] = useState(storeSettings.storeName);
  const [storeTagline, setStoreTagline] = useState(storeSettings.storeTagline);
  const [logoType, setLogoType] = useState<'default_m' | 'custom_image'>(
    storeSettings.logoType
  );
  const [customLogoUrl, setCustomLogoUrl] = useState(
    storeSettings.customLogoUrl
  );
  const [selectedColor, setSelectedColor] = useState(
    storeSettings.primaryColor
  );
  const [uploadedLogoFile, setUploadedLogoFile] = useState<{
    data: string;
    name: string;
    mime: string;
  } | null>(null);
  const [brandingSaved, setBrandingSaved] = useState(false);

  // Tax Settings State
  const [taxEnabled, setTaxEnabled] = useState<boolean>(
    storeSettings.taxEnabled !== false
  );
  const [taxName, setTaxName] = useState<string>(
    storeSettings.taxName || 'PBF'
  );
  const [taxRate, setTaxRate] = useState<string>(
    String(storeSettings.taxRate ?? 5)
  );
  const [taxSaved, setTaxSaved] = useState(false);

  // Change Password State (never prefilled, verified via /api/change-password)
  const [oldPassword, setOldPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>('');
  const [showLoginPass, setShowLoginPass] = useState<boolean>(false);
  const [loginAccountSaved, setLoginAccountSaved] = useState<boolean>(false);
  const [loginAccountError, setLoginAccountError] = useState<string>('');
  const [isSavingBranding, setIsSavingBranding] = useState<boolean>(false);
  const [isSavingTax, setIsSavingTax] = useState<boolean>(false);
  const [isSavingLogin, setIsSavingLogin] = useState<boolean>(false);
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);

  // Keep form fields synced if storeSettings updates from 2-way database sync
  React.useEffect(() => {
    setStoreName(storeSettings.storeName);
    setStoreTagline(storeSettings.storeTagline);
    setLogoType(storeSettings.logoType);
    setCustomLogoUrl(storeSettings.customLogoUrl);
    setSelectedColor(storeSettings.primaryColor);
    setTaxEnabled(storeSettings.taxEnabled !== false);
    setTaxName(storeSettings.taxName || 'PBF');
    setTaxRate(String(storeSettings.taxRate ?? 5));
  }, [storeSettings]);

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingBranding) return;
    setIsSavingBranding(true);
    try {
      const updated: StoreBrandingSettings = {
        ...storeSettings,
        storeName: storeName.trim() || 'PinkPOS Resto',
        storeTagline: storeTagline.trim(),
        logoType,
        customLogoUrl: uploadedLogoFile
          ? uploadedLogoFile.data
          : customLogoUrl.trim(),
        primaryColor: selectedColor,
      };
      await Promise.all([
        onUpdateStoreSettings(updated, uploadedLogoFile || undefined),
        new Promise((r) => setTimeout(r, 450)),
      ]);
      setBrandingSaved(true);
      setTimeout(() => setBrandingSaved(false), 3000);
    } finally {
      setIsSavingBranding(false);
    }
  };

  const handleSelectColor = (hex: string) => {
    setSelectedColor(hex);
    onUpdateStoreSettings({
      ...storeSettings,
      storeName: storeName.trim() || storeSettings.storeName,
      logoType,
      customLogoUrl: uploadedLogoFile
        ? uploadedLogoFile.data
        : customLogoUrl.trim(),
      primaryColor: hex,
    });
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoType('custom_image');
        setCustomLogoUrl(reader.result);
        setUploadedLogoFile({
          data: reader.result,
          name: file.name,
          mime: file.type || 'image/png',
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveTaxSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingTax) return;
    setIsSavingTax(true);
    try {
      const parsedRate = Math.max(0, Math.min(100, Number(taxRate) || 0));
      const updated: StoreBrandingSettings = {
        ...storeSettings,
        taxEnabled,
        taxName: taxName.trim() || 'PBF',
        taxRate: parsedRate,
      };
      await Promise.all([
        onUpdateStoreSettings(updated),
        new Promise((r) => setTimeout(r, 450)),
      ]);
      setTaxSaved(true);
      setTimeout(() => setTaxSaved(false), 3000);
    } finally {
      setIsSavingTax(false);
    }
  };

  const handleSaveLoginAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingLogin) return;

    if (!oldPassword || !newPassword || !confirmNewPassword) {
      setLoginAccountError(
        isId
          ? 'Password lama, baru, dan konfirmasi wajib diisi.'
          : 'Current, new, and confirmation passwords are required.'
      );
      return;
    }

    if (newPassword.length < 8) {
      setLoginAccountError(t.passwordMinLengthError);
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setLoginAccountError(t.passwordMismatchError);
      return;
    }

    setLoginAccountError('');
    setIsSavingLogin(true);
    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          oldPassword,
          newPassword,
          confirmPassword: confirmNewPassword,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setLoginAccountError(
          data.error ||
            (isId
              ? 'Gagal memperbarui password.'
              : 'Failed to update password.')
        );
        return;
      }

      setOldPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setLoginAccountSaved(true);
      setTimeout(() => setLoginAccountSaved(false), 3500);
    } catch {
      setLoginAccountError(
        isId
          ? 'Terjadi kesalahan jaringan saat menghubungi server.'
          : 'Network error while contacting server.'
      );
    } finally {
      setIsSavingLogin(false);
    }
  };

  const handleSavePermanentConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingConfig) return;
    setIsSavingConfig(true);
    setSavedBanner(null);
    setConfigErrorBanner(null);
    try {
      const result = await onUpdateConfig({
        ...config,
        GOOGLE_SHEET_URL: googleSheetUrl.trim(),
        GOOGLE_DRIVE_FOLDER_URL: googleDriveUrl.trim(),
        LAST_SYNCED: new Date().toLocaleTimeString('id-ID'),
      });
      if (result && !result.ok) {
        setConfigErrorBanner(
          result.error ||
            (isId
              ? 'Tautan tersimpan, namun server proxy /api/cloud gagal menarik data Google Sheet.'
              : 'Links saved, but /api/cloud proxy failed to pull data from Google Sheet.')
        );
      } else if (result && result.pulledFromSheet) {
        setSavedBanner(
          isId
            ? 'Tautan tersimpan & data berhasil ditarik melalui /api/cloud!'
            : 'Links saved & data pulled securely via /api/cloud!'
        );
      } else {
        setSavedBanner(
          isId
            ? 'Tautan pintasan Google Sheet & Drive tersimpan!'
            : 'Google Sheet & Drive shortcut links saved!'
        );
      }
      setTimeout(() => setSavedBanner(null), 4000);
    } finally {
      setIsSavingConfig(false);
    }
  };

  const copyText = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const generatedScript = generateAppsScriptCode({
    ...config,
    GOOGLE_SHEET_URL: googleSheetUrl.trim(),
    GOOGLE_DRIVE_FOLDER_URL: googleDriveUrl.trim(),
  });

  const sampleSubTotal = 100000;
  const numericRate = Math.max(0, Math.min(100, Number(taxRate) || 0));
  const sampleTax = taxEnabled
    ? Math.round(sampleSubTotal * (numericRate / 100))
    : 0;

  return (
    <div className="space-y-4 sm:space-y-6 pb-20 md:pb-10 animate-menu-transition">
      {/* ====================================================================
          SECTION 1: STORE BRANDING, LOGO & APP COLOR CUSTOMIZER
         ==================================================================== */}
      <form
        onSubmit={handleSaveBranding}
        style={{ animationDelay: '0ms' }}
        className="animate-card-enter bg-white p-4 sm:p-6 rounded-[20px] sm:rounded-[24px] shadow-2xs border border-slate-100 space-y-4 sm:space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              style={{
                backgroundColor: `${primaryColor}15`,
                color: primaryColor,
              }}
              className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
            >
              <Store className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-extrabold text-[#2D3748] truncate">
                {t.storeCustomizationTitle}
              </h2>
              <p className="text-xs text-slate-400 line-clamp-1">
                {t.storeCustomizationDesc}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-[#F8F9FA] border border-slate-100">
              <BrandLogo
                size="sm"
                color={selectedColor}
                logoType={logoType}
                customLogoUrl={customLogoUrl}
              />
              <span className="font-extrabold text-xs text-[#2D3748]">
                {storeName || 'PinkPOS'}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-[#2D3748] mb-1">
                {t.storeNameInput}
              </label>
              <input
                type="text"
                required
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="PinkPOS Resto"
                className="w-full bg-[#F8F9FA] border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#2D3748] focus:outline-none focus:border-slate-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#2D3748] mb-1">
                {t.storeTaglineInput}
              </label>
              <input
                type="text"
                value={storeTagline}
                onChange={(e) => setStoreTagline(e.target.value)}
                placeholder="Fast Food & Specialty Coffee"
                className="w-full bg-[#F8F9FA] border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-600 focus:outline-none focus:border-slate-400"
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-[#2D3748] mb-2">
                <Palette className="w-4 h-4" style={{ color: selectedColor }} />
                <span>{t.appThemeColorLabel}</span>
              </label>
              <div className="flex flex-wrap items-center gap-2.5">
                {THEME_COLOR_PRESETS.map((preset) => {
                  const active =
                    selectedColor.toLowerCase() === preset.hex.toLowerCase();
                  return (
                    <button
                      key={preset.hex}
                      type="button"
                      onClick={() => handleSelectColor(preset.hex)}
                      title={preset.name}
                      style={{ backgroundColor: preset.hex }}
                      className={`w-8 h-8 rounded-xl transition-transform cursor-pointer flex items-center justify-center ${
                        active
                          ? 'scale-110 ring-2 ring-offset-2 ring-slate-800 shadow-md'
                          : 'hover:scale-105 opacity-85 hover:opacity-100'
                      }`}
                    >
                      {active && <Check className="w-4 h-4 text-white" />}
                    </button>
                  );
                })}

                <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F8F9FA] border border-slate-200 text-xs font-mono cursor-pointer">
                  <input
                    type="color"
                    value={selectedColor}
                    onChange={(e) => handleSelectColor(e.target.value)}
                    className="w-5 h-5 rounded border-0 cursor-pointer bg-transparent"
                  />
                  <span>{selectedColor.toUpperCase()}</span>
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-3.5">
            <label className="block text-xs font-bold text-[#2D3748]">
              {isId ? 'Pilih Jenis Logo Toko' : 'Select Store Logo Style'}
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setLogoType('default_m')}
                style={
                  logoType === 'default_m'
                    ? {
                        borderColor: selectedColor,
                        backgroundColor: `${selectedColor}0D`,
                      }
                    : undefined
                }
                className={`p-3 rounded-xl border text-xs font-bold text-left transition-all cursor-pointer ${
                  logoType === 'default_m'
                    ? 'text-[#2D3748]'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                {t.logoOptionDefault}
              </button>
              <button
                type="button"
                onClick={() => setLogoType('custom_image')}
                style={
                  logoType === 'custom_image'
                    ? {
                        borderColor: selectedColor,
                        backgroundColor: `${selectedColor}0D`,
                      }
                    : undefined
                }
                className={`p-3 rounded-xl border text-xs font-bold text-left transition-all cursor-pointer ${
                  logoType === 'custom_image'
                    ? 'text-[#2D3748]'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                {t.logoOptionCustom}
              </button>
            </div>

            {logoType === 'custom_image' && (
              <div className="space-y-2.5 pt-1">
                <input
                  type="text"
                  value={
                    customLogoUrl.startsWith('data:image') ? '' : customLogoUrl
                  }
                  onChange={(e) => {
                    setUploadedLogoFile(null);
                    setCustomLogoUrl(e.target.value);
                  }}
                  placeholder="Paste Google Drive Image Link (https://drive.google.com/file/d/...)"
                  className="w-full bg-[#F8F9FA] border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none"
                />

                <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 hover:border-slate-400 rounded-xl p-2.5 text-xs text-slate-600 cursor-pointer transition-colors">
                  <ImageIcon
                    className="w-4 h-4"
                    style={{ color: selectedColor }}
                  />
                  <span>
                    {uploadedLogoFile
                      ? `Logo: ${uploadedLogoFile.name}`
                      : t.uploadLogoBtn}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoFileChange}
                    className="hidden"
                  />
                </label>
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs text-emerald-600 font-semibold">
                {brandingSaved
                  ? isId
                    ? 'Pengaturan toko berhasil disimpan!'
                    : 'Store settings saved!'
                  : ''}
              </span>
              <button
                type="submit"
                disabled={isSavingBranding}
                style={{ backgroundColor: selectedColor }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-md hover:opacity-95 disabled:opacity-65 transition-all cursor-pointer"
              >
                {isSavingBranding ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{isId ? 'Menyimpan...' : 'Saving...'}</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>{t.saveBrandingBtn}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* ====================================================================
          SECTION 2: PENGATURAN PAJAK & BIAYA LAYANAN (TAX SETTINGS)
         ==================================================================== */}
      <form
        onSubmit={handleSaveTaxSettings}
        style={{ animationDelay: '45ms' }}
        className="animate-card-enter bg-white p-4 sm:p-6 rounded-[20px] sm:rounded-[24px] shadow-2xs border border-slate-100 space-y-4 sm:space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              style={{
                backgroundColor: `${primaryColor}15`,
                color: primaryColor,
              }}
              className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
            >
              <Percent className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-base sm:text-lg text-[#2D3748] truncate">
                {t.taxSettingsTitle}
              </h3>
              <p className="text-xs text-slate-400 line-clamp-1">{t.taxSettingsDesc}</p>
            </div>
          </div>

          <label className="inline-flex items-center gap-2.5 px-3.5 sm:px-4 py-2 rounded-2xl bg-[#F8F9FA] border border-slate-200/80 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={taxEnabled}
              onChange={(e) => setTaxEnabled(e.target.checked)}
              style={{ accentColor: primaryColor }}
              className="w-4 h-4 rounded cursor-pointer"
            />
            <span className="text-xs font-extrabold text-[#2D3748]">
              {t.taxEnabledLabel}
            </span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-5 items-end">
          <div className="md:col-span-4">
            <label className="block text-xs font-bold text-[#2D3748] mb-1.5">
              {t.taxNameLabel}
            </label>
            <input
              type="text"
              required
              disabled={!taxEnabled}
              value={taxName}
              onChange={(e) => setTaxName(e.target.value)}
              placeholder="PBF / PB1 / PPN"
              className="w-full bg-[#F8F9FA] border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-[#2D3748] disabled:opacity-50 focus:outline-none focus:border-slate-400"
            />
          </div>

          <div className="md:col-span-5">
            <label className="block text-xs font-bold text-[#2D3748] mb-1.5">
              {t.taxRateLabel}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                step="0.5"
                min="0"
                max="100"
                required
                disabled={!taxEnabled}
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                className="w-24 bg-[#F8F9FA] border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-extrabold tabular-nums text-[#2D3748] disabled:opacity-50 focus:outline-none focus:border-slate-400"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {TAX_RATE_PRESETS.map((rate) => {
                  const active = Number(taxRate) === rate && taxEnabled;
                  return (
                    <button
                      key={rate}
                      type="button"
                      disabled={!taxEnabled}
                      onClick={() => setTaxRate(String(rate))}
                      style={
                        active
                          ? { backgroundColor: primaryColor, color: '#FFFFFF' }
                          : undefined
                      }
                      className={`px-3 py-2 rounded-xl text-xs font-extrabold tabular-nums transition-all cursor-pointer disabled:opacity-40 ${
                        active
                          ? 'shadow-xs'
                          : 'bg-[#F8F9FA] text-slate-600 hover:bg-slate-200/70 border border-slate-200/70'
                      }`}
                    >
                      {rate}%
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="md:col-span-3 flex flex-col items-end justify-end gap-2">
            <button
              type="submit"
              disabled={isSavingTax}
              style={{ backgroundColor: primaryColor }}
              className="w-full py-2.5 px-4 rounded-xl text-white text-xs font-bold shadow-md hover:opacity-95 disabled:opacity-65 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              {isSavingTax ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{isId ? 'Menyimpan...' : 'Saving...'}</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{t.saveTaxBtn}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live Tax Preview Box */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-[#F8F9FA] border border-slate-100 text-xs">
          <div className="text-slate-500">
            <span className="font-bold text-[#2D3748]">
              {isId ? 'Simulasi Perhitungan Pajak:' : 'Tax Calculation Preview:'}
            </span>{' '}
            Sub Total {formatRupiah(sampleSubTotal)} +{' '}
            <strong className="text-[#2D3748]">
              {taxName || 'PBF'} ({taxEnabled ? numericRate : 0}%):{' '}
              {formatRupiah(sampleTax)}
            </strong>{' '}
            ={' '}
            <strong style={{ color: primaryColor }}>
              {formatRupiah(sampleSubTotal + sampleTax)}
            </strong>
          </div>
          {taxSaved && (
            <span className="text-emerald-600 font-bold">
              {isId
                ? 'Pengaturan pajak berhasil disimpan!'
                : 'Tax settings saved!'}
            </span>
          )}
        </div>
      </form>

      {/* ====================================================================
          SECTION 2B: PENGATURAN AKUN LOGIN (USER & PASSWORD)
         ==================================================================== */}
      <form
        onSubmit={handleSaveLoginAccount}
        style={{ animationDelay: '90ms' }}
        className="animate-card-enter bg-white p-4 sm:p-6 rounded-[20px] sm:rounded-[24px] shadow-2xs border border-slate-100 space-y-4 sm:space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              style={{
                backgroundColor: `${primaryColor}15`,
                color: primaryColor,
              }}
              className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
            >
              <KeyRound className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-base sm:text-lg text-[#2D3748] truncate">
                {t.loginAccountSettingsTitle}
              </h3>
              <p className="text-xs text-slate-400 line-clamp-1">
                {t.loginAccountSettingsDesc}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[#F8F9FA] border border-slate-200/80 text-xs max-w-full">
            <User className="w-3.5 h-3.5 shrink-0" style={{ color: primaryColor }} />
            <span className="text-slate-500 font-medium shrink-0">
              {isId ? 'User Aktif:' : 'Active User:'}
            </span>
            <span className="font-extrabold text-[#2D3748] truncate">
              {activeUsername || 'Admin'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-[#2D3748] mb-1.5">
              {t.oldPasswordLabel}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showLoginPass ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#F8F9FA] border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-sm font-bold text-[#2D3748] focus:outline-none focus:border-slate-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#2D3748] mb-1.5">
              {t.newPasswordLabel}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showLoginPass ? 'text' : 'password'}
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#F8F9FA] border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-sm font-bold text-[#2D3748] focus:outline-none focus:border-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowLoginPass((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                title={showLoginPass ? 'Sembunyikan' : 'Tampilkan'}
              >
                {showLoginPass ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#2D3748] mb-1.5">
              {t.confirmPasswordLabel}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showLoginPass ? 'text' : 'password'}
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#F8F9FA] border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-sm font-bold text-[#2D3748] focus:outline-none focus:border-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowLoginPass((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                title={showLoginPass ? 'Sembunyikan' : 'Tampilkan'}
              >
                {showLoginPass ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="text-xs">
            {loginAccountError ? (
              <span className="text-rose-600 font-bold">
                {loginAccountError}
              </span>
            ) : loginAccountSaved ? (
              <span className="text-emerald-600 font-bold">
                {t.loginAccountSavedMsg}
              </span>
            ) : (
              <span className="text-slate-400">
                {isId
                  ? 'Password di-hash menggunakan scrypt di server dan tidak pernah disimpan polos.'
                  : 'Passwords are hashed with scrypt on the server and never stored in plaintext.'}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={isSavingLogin}
            style={{ backgroundColor: primaryColor }}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-md hover:opacity-95 disabled:opacity-65 transition-all cursor-pointer"
          >
            {isSavingLogin ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{isId ? 'Menyimpan...' : 'Saving...'}</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{t.saveLoginAccountBtn}</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* ====================================================================
          SECTION 3: CLOUD CONFIGURATION & CODE.GS
         ==================================================================== */}
      <form
        onSubmit={handleSavePermanentConfig}
        style={{ animationDelay: '135ms' }}
        className="animate-card-enter bg-white p-4 sm:p-6 rounded-[20px] sm:rounded-[24px] shadow-2xs border border-slate-100 space-y-4 sm:space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link2 className="w-5 h-5 shrink-0" style={{ color: primaryColor }} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-extrabold text-sm sm:text-base text-[#2D3748] truncate">
                  {isId
                    ? 'Sinkronisasi Database 2 Arah (Aplikasi ↔ Google Sheets)'
                    : '2-Way Database Sync (App ↔ Google Sheets)'}
                </h3>
                {syncStatus === 'syncing' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                    {isId ? 'Menyinkronkan via Server...' : 'Syncing via Server...'}
                  </span>
                ) : !dbConfigured ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    {isId
                      ? 'Env Server Belum Diisi'
                      : 'Server Env Not Configured'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    {isId
                      ? 'Terhubung Aman (/api/cloud)'
                      : 'Securely Connected (/api/cloud)'}
                  </span>
                )}
                {offlineQueueCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void onFlushOfflineQueue?.()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>
                      {isId
                        ? `Antrean Offline: ${offlineQueueCount}`
                        : `Offline Queue: ${offlineQueueCount}`}
                    </span>
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                {!dbConfigured
                  ? isId
                    ? 'Atur APPS_SCRIPT_URL & APPS_SCRIPT_TOKEN di Environment Variables Vercel serta API_TOKEN di Apps Script.'
                    : 'Set APPS_SCRIPT_URL & APPS_SCRIPT_TOKEN in Vercel Environment Variables and API_TOKEN in Apps Script.'
                  : isId
                  ? `Semua permintaan diteruskan aman lewat proxy server /api/cloud (${products.length} produk aktif${lastSyncedAt ? ` · Update: ${lastSyncedAt}` : ''})`
                  : `All requests flow securely through /api/cloud proxy (${products.length} active products${lastSyncedAt ? ` · Last sync: ${lastSyncedAt}` : ''})`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {onPullFromCloud && (
              <button
                type="button"
                disabled={isPullingCloud}
                onClick={async () => {
                  setIsPullingCloud(true);
                  setPullCloudSuccess(false);
                  try {
                    await onPullFromCloud();
                    setPullCloudSuccess(true);
                    setTimeout(() => setPullCloudSuccess(false), 3000);
                  } finally {
                    setIsPullingCloud(false);
                  }
                }}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 shrink-0 ${isPullingCloud ? 'animate-spin' : ''}`}
                />
                <span className="truncate">
                  {isPullingCloud
                    ? isId
                      ? 'Menarik Data Sheet...'
                      : 'Pulling from Sheet...'
                    : pullCloudSuccess
                    ? isId
                      ? 'Data Sheet Ditarik!'
                      : 'Pulled from Sheet!'
                    : isId
                    ? 'Tarik Ulang (Sheet → Aplikasi)'
                    : 'Pull from Sheet (Sheet → App)'}
                </span>
              </button>
            )}

            {onSyncAllToCloud && (
              <button
                type="button"
                disabled={isSyncingAll}
                onClick={async () => {
                  setIsSyncingAll(true);
                  setSyncAllSuccess(false);
                  try {
                    await onSyncAllToCloud();
                    setSyncAllSuccess(true);
                    setTimeout(() => setSyncAllSuccess(false), 3500);
                  } finally {
                    setIsSyncingAll(false);
                  }
                }}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 shrink-0 ${isSyncingAll ? 'animate-spin' : ''}`}
                />
                <span className="truncate">
                  {isSyncingAll
                    ? isId
                      ? 'Mengirim ke Sheet...'
                      : 'Pushing to Sheet...'
                    : syncAllSuccess
                    ? isId
                      ? 'Tersinkron ke Sheet!'
                      : 'Synced to Sheet!'
                    : isId
                    ? 'Kirim Semua (Aplikasi → Sheet)'
                    : 'Push All (App → Sheet)'}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* 1. Panduan Keamanan Proxy Server (/api/cloud) & Script Properties */}
        <div className="rounded-2xl bg-[#F8F9FA] border border-slate-200/80 p-4 space-y-2.5 text-xs text-slate-600">
          <div className="font-extrabold text-[#2D3748] flex items-center gap-2">
            <Lock className="w-4 h-4 shrink-0" style={{ color: primaryColor }} />
            <span>
              {isId
                ? '1. Konfigurasi Keamanan Proxy Server & Apps Script (Wajib)'
                : '1. Server Proxy & Apps Script Security Setup (Required)'}
            </span>
          </div>
          <p className="leading-relaxed text-slate-500">
            {isId
              ? 'Demi keamanan, URL Web App Apps Script dan token rahasia tidak pernah disimpan atau dikirim ke browser. Semua sinkronisasi melewati endpoint /api/cloud dengan validasi cookie sesi.'
              : 'For security, the Apps Script Web App URL and secret token are never stored in or exposed to the browser. All sync requests pass through /api/cloud with session validation.'}
          </p>
          <ol className="list-decimal list-inside space-y-1.5 text-[11px] sm:text-xs text-slate-600 leading-relaxed">
            <li>
              {isId
                ? 'Salin Code.gs di bawah ke Google Apps Script, lalu buka Project Settings → Script Properties dan tambahkan property '
                : 'Copy Code.gs below into Google Apps Script, then open Project Settings → Script Properties and add property '}
              <code className="px-1.5 py-0.5 rounded bg-slate-200/70 font-mono text-[#2D3748] font-bold">
                API_TOKEN
              </code>
              {isId
                ? ' berisi string acak panjang (minimal 32 karakter).'
                : ' with a long random secret (at least 32 chars).'}
            </li>
            <li>
              {isId
                ? 'Deploy Apps Script sebagai Web App (Execute as: Me). File Google Spreadsheet tetap PRIVAT (tidak dibuka publik).'
                : 'Deploy Apps Script as Web App (Execute as: Me). Keep the Google Spreadsheet PRIVATE (not public).'}
            </li>
            <li>
              {isId
                ? 'Di Vercel → Project Settings → Environment Variables, isi '
                : 'In Vercel → Project Settings → Environment Variables, set '}
              <code className="px-1.5 py-0.5 rounded bg-slate-200/70 font-mono text-[#2D3748] font-bold">
                APPS_SCRIPT_URL
              </code>{' '}
              {isId ? 'dan ' : 'and '}
              <code className="px-1.5 py-0.5 rounded bg-slate-200/70 font-mono text-[#2D3748] font-bold">
                APPS_SCRIPT_TOKEN
              </code>{' '}
              {isId
                ? '(sama persis dengan API_TOKEN), lalu Redeploy.'
                : '(identical to API_TOKEN), then Redeploy.'}
            </li>
          </ol>
        </div>

        {/* 2. Link URL Google Sheet Database (Pintasan Opsional) */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-[#2D3748]">
            {isId
              ? '2. Pintasan Google Sheet Database (Opsional — Spreadsheet Tetap Privat)'
              : '2. Google Sheet Database Shortcut (Optional — Sheet Stays Private)'}
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              value={googleSheetUrl}
              onChange={(e) => setGoogleSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/.../edit"
              className="flex-1 bg-[#F8F9FA] border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-mono text-[#2D3748] focus:outline-none min-w-0"
            />
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={!googleSheetUrl}
                onClick={() => copyText('sheet', googleSheetUrl)}
                className="flex-1 sm:flex-initial px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedKey === 'sheet' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                Salin
              </button>
              {googleSheetUrl && (
                <a
                  href={googleSheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 sm:flex-initial px-3 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <Database className="w-3.5 h-3.5" />
                  Buka
                </a>
              )}
            </div>
          </div>
        </div>

        {/* 3. Link URL Google Drive Image Folder (Opsional) */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-[#2D3748]">
            {isId
              ? '3. Pintasan Folder Google Drive Foto Produk (Opsional, VIEW-only)'
              : '3. Google Drive Product Images Folder Shortcut (Optional, VIEW-only)'}
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              value={googleDriveUrl}
              onChange={(e) => setGoogleDriveUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              className="flex-1 bg-[#F8F9FA] border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-mono text-[#2D3748] focus:outline-none min-w-0"
            />
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={!googleDriveUrl}
                onClick={() => copyText('drive', googleDriveUrl)}
                className="flex-1 sm:flex-initial px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedKey === 'drive' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                Salin
              </button>
              {googleDriveUrl && (
                <a
                  href={googleDriveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 sm:flex-initial px-3 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <FolderKanban className="w-3.5 h-3.5" />
                  Buka Drive
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div className="text-xs text-slate-500">
            {configErrorBanner ? (
              <span className="text-rose-600 font-semibold">
                {configErrorBanner}
              </span>
            ) : savedBanner ? (
              <span className="text-emerald-600 font-semibold">
                {savedBanner}
              </span>
            ) : (
              <span>
                {isId
                  ? 'Sinkronisasi berjalan aman melalui endpoint server /api/cloud.'
                  : 'Sync runs securely through the /api/cloud server proxy.'}
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={isSavingConfig}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#2D3748] hover:bg-slate-800 disabled:opacity-65 text-white text-xs font-semibold transition-all cursor-pointer"
          >
            {isSavingConfig ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{isId ? 'Menyimpan...' : 'Saving...'}</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{isId ? 'Simpan Pintasan' : 'Save Shortcuts'}</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* ====================================================================
          SECTION 4: GOOGLE APPS SCRIPT (CODE.GS) TEMPLATE
         ==================================================================== */}
      <div className="bg-white p-4 sm:p-6 rounded-[20px] sm:rounded-[24px] shadow-2xs border border-slate-100 flex flex-col justify-between space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 pb-3">
          <div className="min-w-0">
            <h3 className="font-bold text-sm sm:text-base text-[#2D3748]">
              Kode Google Apps Script (Code.gs)
            </h3>
            <p className="text-xs text-slate-400">
              {isId
                ? 'Skrip backend untuk manajemen produk, stok, kategori, transaksi, dan penyimpanan gambar.'
                : 'Backend script for products, stock, categories, orders, and image storage.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => copyText('codegs', generatedScript)}
            className="px-3.5 py-2 rounded-xl bg-[#2D3748] hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            {copiedKey === 'codegs' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                Tersalin!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Salin Code.gs
              </>
            )}
          </button>
        </div>

        <pre className="bg-slate-900 text-slate-100 rounded-xl p-3.5 sm:p-4 text-[10px] sm:text-[11px] font-mono overflow-x-auto max-h-64 leading-relaxed">
          {generatedScript}
        </pre>
      </div>
    </div>
  );
};
