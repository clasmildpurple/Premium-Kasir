import React, { useState } from 'react';
import {
  PermanentGoogleConfig,
  ProductItem,
  formatRupiah,
  generateAppsScriptCode,
  isDatabaseConfigured,
} from '../data/posData';
import {
  FONT_FAMILY_PRESETS,
  Language,
  StoreBrandingSettings,
  THEME_COLOR_PRESETS,
  TRANSLATIONS,
  resolveFontCssFamily,
} from '../data/i18nAndSettings';
import { BrandLogo } from './PosIllustrations';
import type { CloudConfigMeta } from '../hooks/useCloudSync';
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
  Type,
  User,
} from 'lucide-react';

interface GoogleCloudIntegrationPanelProps {
  config: PermanentGoogleConfig;
  cloudConfigMeta?: CloudConfigMeta | null;
  onRefreshCloudConfig?: () => Promise<CloudConfigMeta | null>;
  isCloudConfigured?: boolean;
  offlineQueueCount?: number;
  onFlushOfflineQueue?: () => Promise<void>;
  onUpdateConfig: (
    newConfig: PermanentGoogleConfig
  ) => Promise<{
    ok: boolean;
    pulledFromSheet: boolean;
    autoInitialized?: boolean;
    error?: string;
  } | void>;
  storeSettings: StoreBrandingSettings;
  onUpdateStoreSettings: (
    newSettings: StoreBrandingSettings,
    logoUpload?: { data: string; name: string; mime: string }
  ) => Promise<void>;
  products: ProductItem[];
  activeUsername?: string;
  onSyncAllToCloud?: () => Promise<boolean | void>;
  onPullFromCloud?: () => Promise<{ ok: boolean; error?: string } | void>;
  lastSyncedAt?: string;
  syncStatus?: 'connected' | 'local_realtime' | 'syncing';
  lastCloudSyncError?: string | null;
}

const TAX_RATE_PRESETS = [0, 5, 10, 11, 12];

export const GoogleCloudIntegrationPanel: React.FC<
  GoogleCloudIntegrationPanelProps
> = ({
  config,
  cloudConfigMeta,
  onRefreshCloudConfig,
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
  lastCloudSyncError = null,
}) => {
  const t = TRANSLATIONS[storeSettings.language as Language];
  const isId = storeSettings.language === 'id';
  const primaryColor = storeSettings.primaryColor || '#FF2457';

  // Cloud & External Database Config State (Apps Script URL + Token stored in external file outside src/dist, never in browser localStorage)
  const [appsScriptUrl, setAppsScriptUrl] = useState(
    cloudConfigMeta?.appsScriptUrl || ''
  );
  const [appsScriptToken, setAppsScriptToken] = useState('');
  const [showAppsScriptToken, setShowAppsScriptToken] = useState(false);
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
  const dbConfigured =
    Boolean(cloudConfigMeta?.configured) ||
    isCloudConfigured ||
    isDatabaseConfigured(config);

  React.useEffect(() => {
    setGoogleSheetUrl(config.GOOGLE_SHEET_URL);
    setGoogleDriveUrl(config.GOOGLE_DRIVE_FOLDER_URL);
  }, [config.GOOGLE_SHEET_URL, config.GOOGLE_DRIVE_FOLDER_URL]);

  React.useEffect(() => {
    if (cloudConfigMeta?.appsScriptUrl !== undefined) {
      setAppsScriptUrl(cloudConfigMeta.appsScriptUrl);
    }
  }, [cloudConfigMeta?.appsScriptUrl]);

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
  const [hexCodeInput, setHexCodeInput] = useState(
    storeSettings.primaryColor.toUpperCase()
  );
  const [selectedFont, setSelectedFont] = useState(
    storeSettings.fontFamily || 'Plus Jakarta Sans'
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
    setHexCodeInput(storeSettings.primaryColor.toUpperCase());
    setSelectedFont(storeSettings.fontFamily || 'Plus Jakarta Sans');
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
        storeName: storeName.trim() || 'SukaPOS',
        storeTagline: storeTagline.trim(),
        logoType,
        customLogoUrl: uploadedLogoFile
          ? uploadedLogoFile.data
          : customLogoUrl.trim(),
        primaryColor: selectedColor,
        fontFamily: selectedFont,
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

  const handleSelectColor = (hex: string, persistNow = true) => {
    setSelectedColor(hex);
    setHexCodeInput(hex.toUpperCase());
    if (persistNow) {
      void onUpdateStoreSettings({
        ...storeSettings,
        storeName: storeName.trim() || storeSettings.storeName,
        storeTagline: storeTagline.trim(),
        logoType,
        customLogoUrl: uploadedLogoFile
          ? uploadedLogoFile.data
          : customLogoUrl.trim(),
        primaryColor: hex,
        fontFamily: selectedFont,
      });
    }
  };

  const handleHexTextChange = (rawValue: string) => {
    const cleaned = rawValue.toUpperCase().replace(/[^#0-9A-F]/g, '');
    const normalized = cleaned.startsWith('#') ? cleaned : `#${cleaned}`;
    setHexCodeInput(normalized.slice(0, 7));
    if (/^#[0-9A-F]{6}$/.test(normalized)) {
      setSelectedColor(normalized);
    }
  };

  const handleSelectFont = (fontId: string) => {
    setSelectedFont(fontId);
    void onUpdateStoreSettings({
      ...storeSettings,
      storeName: storeName.trim() || storeSettings.storeName,
      storeTagline: storeTagline.trim(),
      logoType,
      customLogoUrl: uploadedLogoFile
        ? uploadedLogoFile.data
        : customLogoUrl.trim(),
      primaryColor: selectedColor,
      fontFamily: fontId,
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

  const handleGenerateRandomToken = () => {
    const bytes = new Uint8Array(24);
    if (
      typeof window !== 'undefined' &&
      window.crypto &&
      typeof window.crypto.getRandomValues === 'function'
    ) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
      ''
    );
    setAppsScriptToken(token);
    setShowAppsScriptToken(true);
  };

  const handleSavePermanentConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingConfig) return;
    setIsSavingConfig(true);
    setSavedBanner(null);
    setConfigErrorBanner(null);
    try {
      const trimmedScriptUrl = appsScriptUrl.trim();
      const trimmedScriptToken = appsScriptToken.trim();
      const isSwitchingUrl =
        Boolean(trimmedScriptUrl) &&
        Boolean(cloudConfigMeta?.appsScriptUrl) &&
        trimmedScriptUrl !== cloudConfigMeta?.appsScriptUrl;
      const effectiveSheetUrl =
        isSwitchingUrl && googleSheetUrl.trim() === config.GOOGLE_SHEET_URL
          ? ''
          : googleSheetUrl.trim();
      let savedExternalPath: string | undefined;

      if (!trimmedScriptUrl && !cloudConfigMeta?.configured) {
        setConfigErrorBanner(
          isId
            ? 'URL Web App Google Apps Script (/exec) dan API Token wajib diisi.'
            : 'Google Apps Script Web App URL (/exec) and API Token are required.'
        );
        return;
      }

      if (trimmedScriptUrl || trimmedScriptToken) {
        const cfgRes = await fetch('/api/cloud-config', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify({
            appsScriptUrl: trimmedScriptUrl,
            appsScriptToken: trimmedScriptToken,
            googleSheetUrl: effectiveSheetUrl,
            googleDriveFolderUrl: googleDriveUrl.trim(),
          }),
        });

        const cfgData = (await cfgRes.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          configFilePath?: string;
        };

        if (cfgRes.status === 401) {
          setConfigErrorBanner(
            isId
              ? 'Sesi login Anda tidak aktif atau cookie terblokir. Silakan logout lalu login ulang (atau buka aplikasi di tab baru).'
              : 'Your login session is inactive or blocked by cookies. Please log in again or open the app in a new tab.'
          );
          return;
        }

        if (!cfgRes.ok || !cfgData.ok) {
          setConfigErrorBanner(
            cfgData.error ||
              (isId
                ? 'Gagal menyimpan konfigurasi database Apps Script.'
                : 'Failed to save Apps Script database configuration.')
          );
          return;
        }

        savedExternalPath = cfgData.configFilePath;
        setAppsScriptToken('');
        setShowAppsScriptToken(false);
        await onRefreshCloudConfig?.();
      }

      const result = await onUpdateConfig({
        ...config,
        GOOGLE_SHEET_URL: effectiveSheetUrl,
        GOOGLE_DRIVE_FOLDER_URL: googleDriveUrl.trim(),
        LAST_SYNCED: new Date().toLocaleTimeString('id-ID'),
      });
      if (result && !result.ok) {
        setConfigErrorBanner(
          result.error ||
            (isId
              ? 'Konfigurasi tersimpan, namun server proxy /api/cloud gagal menarik data Google Sheet.'
              : 'Configuration saved, but /api/cloud proxy failed to pull data from Google Sheet.')
        );
      } else if (result && result.autoInitialized) {
        setSavedBanner(
          isId
            ? `Database baru berhasil terhubung & otomatis diinisialisasi ke Google Sheets!`
            : `New database connected & automatically initialized to Google Sheets!`
        );
      } else if (result && result.pulledFromSheet) {
        setSavedBanner(
          isId
            ? `Database terhubung & data Google Sheet berhasil dimuat!`
            : `Database connected & Google Sheet data loaded!`
        );
      } else {
        setSavedBanner(
          isId
            ? `Pengaturan database berhasil disimpan${savedExternalPath ? ` ke ${savedExternalPath}` : ''}!`
            : `Database configuration saved${savedExternalPath ? ` to ${savedExternalPath}` : ''}!`
        );
      }
      setTimeout(() => setSavedBanner(null), 5000);
    } catch {
      setConfigErrorBanner(
        isId
          ? 'Terjadi kesalahan jaringan saat menyimpan pengaturan database.'
          : 'Network error while saving database configuration.'
      );
    } finally {
      setIsSavingConfig(false);
    }
  };

  const copyText = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const generatedScript = generateAppsScriptCode(
    {
      ...config,
      GOOGLE_SHEET_URL: googleSheetUrl.trim(),
      GOOGLE_DRIVE_FOLDER_URL: googleDriveUrl.trim(),
    },
    { initialApiToken: appsScriptToken.trim() }
  );

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
            <div
              style={{ fontFamily: resolveFontCssFamily(selectedFont) }}
              className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-[#F8F9FA] border border-slate-100"
            >
              <BrandLogo
                size="sm"
                color={selectedColor}
                logoType={logoType}
                customLogoUrl={customLogoUrl}
              />
              <span className="font-extrabold text-xs text-[#2D3748]">
                {storeName || 'SukaPOS'}
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
                placeholder="SukaPOS"
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
                      onClick={() => handleSelectColor(preset.hex, true)}
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

                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#F8F9FA] border border-slate-200">
                  <input
                    type="color"
                    aria-label={t.appThemeColorLabel}
                    value={selectedColor}
                    onChange={(e) => handleSelectColor(e.target.value, false)}
                    onBlur={(e) => handleSelectColor(e.target.value, true)}
                    className="w-6 h-6 rounded border-0 cursor-pointer bg-transparent p-0"
                  />
                  <input
                    type="text"
                    aria-label="Hex color code"
                    value={hexCodeInput}
                    onChange={(e) => handleHexTextChange(e.target.value)}
                    onBlur={() => {
                      if (/^#[0-9A-F]{6}$/.test(hexCodeInput)) {
                        handleSelectColor(hexCodeInput, true);
                      } else {
                        setHexCodeInput(selectedColor.toUpperCase());
                      }
                    }}
                    maxLength={7}
                    className="w-18 bg-transparent text-xs font-mono font-bold text-[#2D3748] focus:outline-none uppercase"
                  />
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="store-font-selector"
                className="flex items-center gap-1.5 text-xs font-bold text-[#2D3748] mb-1.5"
              >
                <Type className="w-4 h-4" style={{ color: selectedColor }} />
                <span>{t.appFontLabel}</span>
              </label>
              <select
                id="store-font-selector"
                value={selectedFont}
                onChange={(e) => handleSelectFont(e.target.value)}
                className="w-full bg-[#F8F9FA] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-[#2D3748] focus:outline-none focus:border-slate-400 cursor-pointer"
              >
                {FONT_FAMILY_PRESETS.map((font) => (
                  <option key={font.id} value={font.id}>
                    {font.label} — {isId ? font.categoryId : font.categoryEn}
                  </option>
                ))}
              </select>
              <div
                style={{ fontFamily: resolveFontCssFamily(selectedFont) }}
                className="mt-2 px-3.5 py-2 rounded-xl bg-[#F8F9FA] border border-slate-200/80 flex items-center justify-between gap-2 text-xs"
              >
                <span className="font-bold text-[#2D3748] truncate">
                  {storeName || 'SukaPOS'} · {storeTagline || 'Point of Sale'}
                </span>
                <span
                  style={{ color: selectedColor }}
                  className="font-extrabold shrink-0"
                >
                  Rp 25.000
                </span>
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
                      ? 'Database Belum Terhubung'
                      : 'Database Not Configured'}
                  </span>
                ) : syncStatus === 'connected' && !lastCloudSyncError ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    {isId
                      ? 'Terhubung Aman (/api/cloud)'
                      : 'Securely Connected (/api/cloud)'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    {isId
                      ? 'Tersimpan — Belum Terhubung'
                      : 'Saved — Not Connected'}
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
                    ? 'Isi URL Apps Script & API Token di form bawah (tersimpan di file eksternal) atau via Environment Variables.'
                    : 'Enter your Apps Script URL & API Token below (saved to external config file) or via Environment Variables.'
                  : syncStatus === 'connected' && !lastCloudSyncError
                  ? isId
                    ? `Semua permintaan diteruskan aman lewat proxy server /api/cloud (${products.length} produk aktif${lastSyncedAt ? ` · Update: ${lastSyncedAt}` : ''})`
                    : `All requests flow securely through /api/cloud proxy (${products.length} active products${lastSyncedAt ? ` · Last sync: ${lastSyncedAt}` : ''})`
                  : isId
                  ? 'Konfigurasi tersimpan, namun koneksi ke Apps Script gagal. Periksa pesan error di bawah.'
                  : 'Configuration saved, but connecting to Apps Script failed. See error details below.'}
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
                  setConfigErrorBanner(null);
                  try {
                    const res = await onPullFromCloud();
                    if (res && !res.ok) {
                      if (res.error) setConfigErrorBanner(res.error);
                    } else {
                      setPullCloudSuccess(true);
                      setTimeout(() => setPullCloudSuccess(false), 3000);
                    }
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
                  setConfigErrorBanner(null);
                  try {
                    const ok = await onSyncAllToCloud();
                    if (ok === false) {
                      setConfigErrorBanner(
                        isId
                          ? 'Gagal mengirim data ke Google Sheet. Periksa URL Web App dan API Token.'
                          : 'Failed to push data to Google Sheet. Check Web App URL and API Token.'
                      );
                    } else {
                      setSyncAllSuccess(true);
                      setTimeout(() => setSyncAllSuccess(false), 3500);
                    }
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

        {(configErrorBanner || lastCloudSyncError || savedBanner) && (
          <div
            className={`rounded-2xl px-4 py-3 text-xs font-semibold border ${
              configErrorBanner || lastCloudSyncError
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
          >
            {configErrorBanner || lastCloudSyncError || savedBanner}
          </div>
        )}

        {/* Panduan Keamanan Proxy Server (/api/cloud) & File Pengaturan Eksternal */}
        <div className="rounded-2xl bg-[#F8F9FA] border border-slate-200/80 p-4 space-y-2.5 text-xs text-slate-600">
          <div className="font-extrabold text-[#2D3748] flex items-center gap-2">
            <Lock className="w-4 h-4 shrink-0" style={{ color: primaryColor }} />
            <span>
              {isId
                ? 'Panduan Database Multi-Pengguna & Keamanan Proxy (/api/cloud)'
                : 'Multi-Buyer Database Setup & Proxy Security Guide (/api/cloud)'}
            </span>
          </div>
          <p className="leading-relaxed text-slate-500">
            {isId
              ? 'Setiap pengguna/pembeli aplikasi dapat menghubungkan database Google Sheets miliknya sendiri tanpa mengubah source code (src/). Token rahasia disimpan di file konfigurasi eksternal server atau Environment Variables dan tidak pernah dikirim balik ke browser.'
              : 'Each buyer/tenant can connect their own Google Sheets database without editing source code (src/). Secret tokens stay in the server external config file or Environment Variables and are never sent back to the browser.'}
          </p>
          <ol className="list-decimal list-inside space-y-1.5 text-[11px] sm:text-xs text-slate-600 leading-relaxed">
            <li>
              {isId
                ? 'Klik "+ Buat Token Acak Otomatis" di bawah agar token otomatis disisipkan ke Code.gs (atau atur manual di Project Settings → Script Properties → '
                : 'Click "+ Generate Random Token" below to auto-embed the token into Code.gs (or set manually in Project Settings → Script Properties → '}
              <code className="px-1.5 py-0.5 rounded bg-slate-200/70 font-mono text-[#2D3748] font-bold">
                API_TOKEN
              </code>
              {isId ? ').' : ').'}
            </li>
            <li>
              {isId
                ? 'Deploy Apps Script sebagai Web App (Execute as: Me, Who has access: Anyone). Setiap kali memperbarui Code.gs, lakukan deploy ulang via Manage deployments → New version. File Google Spreadsheet tetap PRIVAT (tidak dibuka publik).'
                : 'Deploy Apps Script as Web App (Execute as: Me, Who has access: Anyone). Whenever updating Code.gs, redeploy via Manage deployments → New version. Keep the Google Spreadsheet PRIVATE (not public).'}
            </li>
            <li>
              {isId
                ? 'Masukkan URL Web App (/exec) dan API Token pada form di bawah untuk menyimpannya otomatis ke file eksternal (atau edit manual file '
                : 'Enter the Web App URL (/exec) and API Token below to save automatically to the external config file (or edit '}
              <code className="px-1.5 py-0.5 rounded bg-slate-200/70 font-mono text-[#2D3748] font-bold">
                database.config.json
              </code>
              {isId ? ' / env ' : ' / env '}
              <code className="px-1.5 py-0.5 rounded bg-slate-200/70 font-mono text-[#2D3748] font-bold">
                DATABASE_CONFIG_PATH
              </code>
              {isId ? ' di luar folder aplikasi).' : ' outside the app folder).'}
            </li>
          </ol>

          <div className="mt-2 pt-2.5 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="text-slate-500 truncate max-w-full">
              <span className="font-bold text-[#2D3748]">
                {isId ? 'Lokasi File Konfigurasi:' : 'Config File Path:'}
              </span>{' '}
              <code className="font-mono text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                {cloudConfigMeta?.configFilePath || 'database.config.json'}
              </code>
            </div>
            <span className="px-2 py-0.5 rounded-full font-bold bg-white border border-slate-200 text-slate-600">
              {cloudConfigMeta?.source === 'external-file'
                ? isId
                  ? 'Sumber: File Eksternal'
                  : 'Source: External File'
                : cloudConfigMeta?.source === 'env'
                ? isId
                  ? 'Sumber: Environment Variable'
                  : 'Source: Environment Variable'
                : isId
                ? 'Sumber: Belum Diatur'
                : 'Source: Not Set'}
            </span>
          </div>
        </div>

        {/* 1. URL Web App Google Apps Script (/exec) */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-[#2D3748]">
            {isId
              ? '1. URL Web App Google Apps Script (/exec)'
              : '1. Google Apps Script Web App URL (/exec)'}
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              value={appsScriptUrl}
              onChange={(e) => setAppsScriptUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/AKfycb.../exec"
              className="flex-1 bg-[#F8F9FA] border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-mono text-[#2D3748] focus:outline-none focus:border-slate-400 min-w-0"
            />
            <button
              type="button"
              disabled={!appsScriptUrl}
              onClick={() => copyText('appsScriptUrl', appsScriptUrl)}
              className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              {copiedKey === 'appsScriptUrl' ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {isId ? 'Salin' : 'Copy'}
            </button>
          </div>
        </div>

        {/* 2. API Token Apps Script (API_TOKEN) */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="block text-xs font-bold text-[#2D3748]">
              {isId
                ? '2. API Token Apps Script (API_TOKEN di Script Properties)'
                : '2. Apps Script API Token (API_TOKEN in Script Properties)'}
            </label>
            <button
              type="button"
              onClick={handleGenerateRandomToken}
              className="text-[11px] font-bold hover:underline cursor-pointer"
              style={{ color: primaryColor }}
            >
              {isId ? '+ Buat Token Acak Otomatis' : '+ Generate Random Token'}
            </button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 min-w-0">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showAppsScriptToken ? 'text' : 'password'}
                autoComplete="off"
                value={appsScriptToken}
                onChange={(e) => setAppsScriptToken(e.target.value)}
                placeholder={
                  cloudConfigMeta?.hasToken
                    ? isId
                      ? '•••••••••••••••• (Token sudah tersimpan — kosongkan jika tidak ingin mengubah)'
                      : '•••••••••••••••• (Token already set — leave blank to keep current)'
                    : isId
                    ? 'Masukkan / klik Buat Token Acak, lalu samakan dengan API_TOKEN di Apps Script'
                    : 'Enter / generate token and match it with API_TOKEN in Apps Script'
                }
                className="w-full bg-[#F8F9FA] border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-xs font-mono text-[#2D3748] focus:outline-none focus:border-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowAppsScriptToken((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                title={showAppsScriptToken ? 'Sembunyikan' : 'Tampilkan'}
              >
                {showAppsScriptToken ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <button
              type="button"
              disabled={!appsScriptToken}
              onClick={() => copyText('appsScriptToken', appsScriptToken)}
              className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              {copiedKey === 'appsScriptToken' ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {isId ? 'Salin' : 'Copy'}
            </button>
          </div>
          {appsScriptToken.trim() && (
            <p className="text-[11px] font-semibold text-emerald-700">
              {isId
                ? '✓ Token otomatis terpasang di dalam Code.gs di bawah — cukup salin Code.gs lalu Deploy (tidak perlu isi Script Properties manual).'
                : '✓ Token automatically embedded into Code.gs below — just copy Code.gs & Deploy (no manual Script Properties needed).'}
            </p>
          )}
        </div>

        {/* 3. Link URL Google Sheet Database (Pintasan Opsional) */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-[#2D3748]">
            {isId
              ? '3. Pintasan Google Sheet Database (Opsional — Spreadsheet Tetap Privat)'
              : '3. Google Sheet Database Shortcut (Optional — Sheet Stays Private)'}
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

        {/* 4. Link URL Google Drive Image Folder (Opsional) */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-[#2D3748]">
            {isId
              ? '4. Pintasan Folder Google Drive Foto Produk (Opsional, VIEW-only)'
              : '4. Google Drive Product Images Folder Shortcut (Optional, VIEW-only)'}
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
            {configErrorBanner || lastCloudSyncError ? (
              <span className="text-rose-600 font-semibold">
                {configErrorBanner || lastCloudSyncError}
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
                <span>
                  {isId
                    ? 'Simpan & Hubungkan Database'
                    : 'Save & Connect Database'}
                </span>
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
