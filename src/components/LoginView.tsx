import React, { useState } from 'react';
import {
  Language,
  StoreBrandingSettings,
  TRANSLATIONS,
} from '../data/i18nAndSettings';
import {
  PermanentGoogleConfig,
  generateAppsScriptCode,
} from '../data/posData';
import { BrandLogo } from './PosIllustrations';
import {
  Check,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  LogIn,
  Save,
  Settings,
  ShieldCheck,
  User,
} from 'lucide-react';

interface LoginViewProps {
  storeSettings: StoreBrandingSettings;
  googleConfig?: PermanentGoogleConfig;
  needsSetup?: boolean;
  cloudConfigured?: boolean;
  missingSessionSecret?: boolean;
  onCloudConfigured?: (sheetUrl?: string) => void;
  onToggleLanguage: () => void;
  onLoginSuccess: (cashierName: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  storeSettings,
  googleConfig,
  needsSetup = false,
  cloudConfigured = false,
  missingSessionSecret = false,
  onCloudConfigured,
  onToggleLanguage,
  onLoginSuccess,
}) => {
  const t = TRANSLATIONS[storeSettings.language as Language];
  const isId = storeSettings.language === 'id';
  const primaryColor = storeSettings.primaryColor || '#FF2457';

  const [activeTab, setActiveTab] = useState<'account' | 'database'>('account');

  // Always start completely empty — never autofill credentials
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [forceLoginMode, setForceLoginMode] = useState(false);

  // Upfront Database Settings state (never prefilled with secret token)
  const [appsScriptUrl, setAppsScriptUrl] = useState('');
  const [appsScriptToken, setAppsScriptToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
  const [googleDriveFolderUrl, setGoogleDriveFolderUrl] = useState('');
  const [showCodeGsPreview, setShowCodeGsPreview] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isSavingDb, setIsSavingDb] = useState(false);
  const [dbErrorMsg, setDbErrorMsg] = useState('');
  const [dbSuccessMsg, setDbSuccessMsg] = useState('');
  const [connectedSheetUrl, setConnectedSheetUrl] = useState('');
  const [localCloudConfigured, setLocalCloudConfigured] =
    useState(cloudConfigured);

  React.useEffect(() => {
    if (cloudConfigured) {
      setLocalCloudConfigured(true);
    }
  }, [cloudConfigured]);

  const isSetupMode = needsSetup && !forceLoginMode;

  const handleToggleSetupOrLogin = (goToLogin: boolean) => {
    setForceLoginMode(goToLogin);
    setErrorMsg('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleCopyText = (key: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
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
    setShowToken(true);
  };

  const handleSaveDatabaseConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingDb) return;

    const trimmedUrl = appsScriptUrl.trim();
    const trimmedToken = appsScriptToken.trim();
    if (!trimmedUrl || (!trimmedToken && !localCloudConfigured)) {
      setDbErrorMsg(
        isId
          ? 'URL Web App Apps Script (/exec) dan API Token wajib diisi.'
          : 'Apps Script Web App URL (/exec) and API Token are required.'
      );
      setDbSuccessMsg('');
      return;
    }

    if (!isSetupMode && (!username.trim() || !password)) {
      setDbErrorMsg(
        isId
          ? 'Masukkan Username & Password admin pada kolom verifikasi di bawah untuk menyimpan pengaturan database.'
          : 'Enter your admin Username & Password below to verify and save database settings.'
      );
      setDbSuccessMsg('');
      return;
    }

    setDbErrorMsg('');
    setDbSuccessMsg('');
    setIsSavingDb(true);

    try {
      const res = await fetch('/api/cloud-config', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          appsScriptUrl: trimmedUrl,
          appsScriptToken: trimmedToken,
          googleSheetUrl: googleSheetUrl.trim(),
          googleDriveFolderUrl: googleDriveFolderUrl.trim(),
          ...(isSetupMode
            ? {}
            : {
                adminUsername: username.trim(),
                adminPassword: password,
              }),
          verifyConnection: true,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        connectionOk?: boolean;
        connectionError?: string;
        sheetUrl?: string;
      };

      if (!res.ok || !data.ok) {
        setDbErrorMsg(
          data.error ||
            (isId
              ? 'Gagal menyimpan pengaturan database.'
              : 'Failed to save database configuration.')
        );
        return;
      }

      setLocalCloudConfigured(true);
      if (data.sheetUrl) {
        setConnectedSheetUrl(data.sheetUrl);
        if (!googleSheetUrl.trim()) {
          setGoogleSheetUrl(data.sheetUrl);
        }
      }
      onCloudConfigured?.(data.sheetUrl);

      if (data.connectionOk) {
        setDbSuccessMsg(
          isId
            ? 'Pengaturan database tersimpan & Google Sheet berhasil terhubung / dibuat otomatis!'
            : 'Database settings saved & Google Sheet connected / auto-created!'
        );
      } else {
        setDbErrorMsg(
          data.connectionError ||
            (isId
              ? 'Pengaturan tersimpan, namun koneksi ke Apps Script gagal. Periksa deployment Web App ("Anyone") dan API_TOKEN.'
              : 'Settings saved, but connecting to Apps Script failed. Verify Web App deployment ("Anyone") and API_TOKEN.')
        );
      }
    } catch {
      setDbErrorMsg(
        isId
          ? 'Gagal menghubungi server untuk menyimpan pengaturan database.'
          : 'Failed to reach server to save database settings.'
      );
    } finally {
      setIsSavingDb(false);
    }
  };

  const generatedScript = generateAppsScriptCode({
    GOOGLE_SHEET_URL: googleSheetUrl.trim() || googleConfig?.GOOGLE_SHEET_URL || '',
    GOOGLE_DRIVE_FOLDER_URL:
      googleDriveFolderUrl.trim() || googleConfig?.GOOGLE_DRIVE_FOLDER_URL || '',
    SHEET_NAME_PRODUCTS: googleConfig?.SHEET_NAME_PRODUCTS || 'Products',
    SHEET_NAME_ORDERS: googleConfig?.SHEET_NAME_ORDERS || 'Orders',
    LAST_SYNCED: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoggingIn) return;

    const trimmedUser = username.trim();
    if (!trimmedUser || !password) {
      setErrorMsg(
        isId
          ? 'Mohon isi username dan password.'
          : 'Please enter username and password.'
      );
      return;
    }

    if (isSetupMode) {
      if (password.length < 8) {
        setErrorMsg(t.passwordMinLengthError);
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg(t.passwordMismatchError);
        return;
      }
    }

    setErrorMsg('');
    setIsLoggingIn(true);

    try {
      const endpoint = isSetupMode ? '/api/setup-admin' : '/api/login';
      const setupCloudPayload =
        isSetupMode && appsScriptUrl.trim() && appsScriptToken.trim()
          ? {
              appsScriptUrl: appsScriptUrl.trim(),
              appsScriptToken: appsScriptToken.trim(),
              googleSheetUrl: googleSheetUrl.trim(),
              googleDriveFolderUrl: googleDriveFolderUrl.trim(),
            }
          : undefined;

      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify(
          isSetupMode
            ? {
                username: trimmedUser,
                password,
                confirmPassword,
                ...(setupCloudPayload ? { cloudConfig: setupCloudPayload } : {}),
              }
            : { username: trimmedUser, password }
        ),
      });

      const data = (await res.json().catch(() => ({}))) as {
        authenticated?: boolean;
        username?: string;
        error?: string;
      };

      if (!res.ok || !data.authenticated) {
        setErrorMsg(data.error || t.invalidCredentialsError);
        return;
      }

      // Verify that browser accepted and sends back the HttpOnly session cookie across refreshes
      const sessionRes = await fetch('/api/session', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      if (sessionRes.ok) {
        const sessionData = (await sessionRes.json().catch(() => ({}))) as {
          authenticated?: boolean;
        };
        if (!sessionData.authenticated) {
          setErrorMsg(
            isId
              ? 'Browser memblokir cookie sesi di tampilan preview/iframe. Silakan buka aplikasi di tab baru atau izinkan cookie pihak ketiga agar sesi tidak hilang saat refresh.'
              : 'Your browser blocked the session cookie inside the preview iframe. Please open the app in a new tab or allow cookies so your session persists on refresh.'
          );
          return;
        }
      }

      const authedUser = data.username || trimmedUser;
      const displayUser = authedUser.includes('@')
        ? authedUser.split('@')[0]
        : authedUser;
      setPassword('');
      setConfirmPassword('');
      onLoginSuccess(displayUser);
    } catch {
      setErrorMsg(
        isId
          ? 'Gagal terhubung ke server autentikasi. Coba lagi.'
          : 'Failed to reach authentication server. Please try again.'
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="w-[94%] sm:w-[88%] md:w-[84%] lg:w-[82%] max-w-[900px] xl:max-w-[940px] h-[88dvh] sm:h-[86dvh] lg:h-[86dvh] min-h-[580px] max-h-[840px] mx-auto my-auto bg-white rounded-[24px] sm:rounded-[28px] lg:rounded-[32px] shadow-2xl border-[4px] sm:border-[5px] lg:border-[6px] border-white grid grid-cols-1 lg:grid-cols-12 overflow-y-auto lg:overflow-hidden relative animate-stage-transition">
      {/* Top-Right Language Switcher & Database Settings Gear */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleLanguage}
          className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-2xl bg-[#F8F9FA] hover:bg-slate-200/70 text-[#2D3748] text-[11px] sm:text-xs font-extrabold border border-slate-200/70 transition-all cursor-pointer whitespace-nowrap shrink-0"
        >
          <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4" style={{ color: primaryColor }} />
          <span>
            {storeSettings.language === 'id' ? 'Bahasa: ID' : 'Language: EN'}
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setActiveTab((prev) => (prev === 'database' ? 'account' : 'database'))
          }
          aria-pressed={activeTab === 'database'}
          aria-label={isId ? 'Pengaturan Database' : 'Database Settings'}
          title={
            activeTab === 'database'
              ? isId
                ? 'Kembali ke Login'
                : 'Back to Login'
              : isId
              ? 'Pengaturan Database'
              : 'Database Settings'
          }
          style={
            activeTab === 'database'
              ? {
                  borderColor: primaryColor,
                  backgroundColor: `${primaryColor}12`,
                  color: primaryColor,
                }
              : undefined
          }
          className="relative inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-2xl bg-[#F8F9FA] hover:bg-slate-200/70 text-[#2D3748] border border-slate-200/70 transition-all cursor-pointer shrink-0"
        >
          <Settings
            className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform duration-200 ${
              activeTab === 'database' ? 'rotate-45' : ''
            }`}
            style={{
              color: activeTab === 'database' ? primaryColor : '#4A5568',
            }}
          />
          <span
            className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
              localCloudConfigured ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          />
        </button>
      </div>

      {/* Left Brand Showcase Column (5 cols) */}
      <div
        style={{ backgroundColor: `${primaryColor}0D` }}
        className="lg:col-span-5 p-6 sm:p-8 lg:p-11 xl:p-13 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-100 relative overflow-hidden isolate"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none select-none absolute inset-0 -z-10 overflow-hidden"
        >
          <div
            style={{
              background: `radial-gradient(circle at center, ${primaryColor}22 0%, transparent 70%)`,
            }}
            className="absolute -top-24 -right-24 w-80 h-80 rounded-full blur-2xl"
          />
          <div
            style={{
              background: `radial-gradient(circle at center, ${primaryColor}1A 0%, transparent 72%)`,
            }}
            className="absolute -bottom-28 -left-20 w-96 h-96 rounded-full blur-2xl"
          />

          <svg
            viewBox="0 0 520 760"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMidYMid slice"
            className="w-full h-full"
          >
            <defs>
              <pattern
                id="posLoginDotGrid"
                width="26"
                height="26"
                patternUnits="userSpaceOnUse"
              >
                <circle
                  cx="2"
                  cy="2"
                  r="1.35"
                  fill={primaryColor}
                  fillOpacity="0.11"
                />
              </pattern>
              <linearGradient
                id="posChartGrad"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={primaryColor} stopOpacity="0.15" />
                <stop offset="100%" stopColor={primaryColor} stopOpacity="0.0" />
              </linearGradient>
              <linearGradient
                id="posCardGrad"
                x1="0"
                y1="0"
                x2="1"
                y2="1"
              >
                <stop offset="0%" stopColor={primaryColor} stopOpacity="0.11" />
                <stop offset="100%" stopColor={primaryColor} stopOpacity="0.03" />
              </linearGradient>
            </defs>

            <rect width="520" height="760" fill="url(#posLoginDotGrid)" />

            <circle
              cx="450"
              cy="120"
              r="145"
              stroke={primaryColor}
              strokeOpacity="0.08"
              strokeWidth="1.5"
              strokeDasharray="6 6"
            />
            <circle
              cx="450"
              cy="120"
              r="102"
              stroke={primaryColor}
              strokeOpacity="0.11"
              strokeWidth="1.5"
            />
            <circle
              cx="450"
              cy="120"
              r="58"
              fill={primaryColor}
              fillOpacity="0.05"
            />

            <g transform="translate(215, 130) rotate(-4)">
              <rect
                x="0"
                y="0"
                width="270"
                height="165"
                rx="22"
                fill="url(#posCardGrad)"
                stroke={primaryColor}
                strokeOpacity="0.16"
                strokeWidth="1.5"
              />
              <rect
                x="22"
                y="22"
                width="76"
                height="9"
                rx="4.5"
                fill={primaryColor}
                fillOpacity="0.18"
              />
              <rect
                x="22"
                y="37"
                width="46"
                height="6"
                rx="3"
                fill={primaryColor}
                fillOpacity="0.11"
              />
              <circle
                cx="236"
                cy="30"
                r="14"
                fill={primaryColor}
                fillOpacity="0.10"
              />
              <path
                d="M22 132 C 62 126, 78 96, 114 102 C 148 106, 168 68, 202 72 C 224 75, 236 48, 248 44 L 248 144 L 22 144 Z"
                fill="url(#posChartGrad)"
              />
              <path
                d="M22 132 C 62 126, 78 96, 114 102 C 148 106, 168 68, 202 72 C 224 75, 236 48, 248 44"
                stroke={primaryColor}
                strokeOpacity="0.28"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle
                cx="114"
                cy="102"
                r="4.5"
                fill="#FFFFFF"
                fillOpacity="0.8"
                stroke={primaryColor}
                strokeOpacity="0.35"
                strokeWidth="2.5"
              />
              <circle
                cx="202"
                cy="72"
                r="4.5"
                fill="#FFFFFF"
                fillOpacity="0.8"
                stroke={primaryColor}
                strokeOpacity="0.35"
                strokeWidth="2.5"
              />
              <circle
                cx="248"
                cy="44"
                r="5.5"
                fill={primaryColor}
                fillOpacity="0.35"
              />
            </g>

            <g transform="translate(230, 445) rotate(3)">
              <rect
                x="20"
                y="30"
                width="250"
                height="175"
                rx="20"
                fill="url(#posCardGrad)"
                stroke={primaryColor}
                strokeOpacity="0.16"
                strokeWidth="1.75"
              />
              <rect
                x="38"
                y="50"
                width="62"
                height="48"
                rx="10"
                fill={primaryColor}
                fillOpacity="0.09"
              />
              <rect
                x="110"
                y="50"
                width="62"
                height="48"
                rx="10"
                fill={primaryColor}
                fillOpacity="0.09"
              />
              <rect
                x="38"
                y="108"
                width="62"
                height="48"
                rx="10"
                fill={primaryColor}
                fillOpacity="0.09"
              />
              <rect
                x="110"
                y="108"
                width="62"
                height="48"
                rx="10"
                fill={primaryColor}
                fillOpacity="0.14"
              />
              <rect
                x="184"
                y="50"
                width="68"
                height="136"
                rx="12"
                fill={primaryColor}
                fillOpacity="0.08"
                stroke={primaryColor}
                strokeOpacity="0.14"
                strokeWidth="1.2"
              />
              <rect
                x="194"
                y="160"
                width="48"
                height="16"
                rx="6"
                fill={primaryColor}
                fillOpacity="0.22"
              />
              <path
                d="M115 205 L175 205 L192 238 L98 238 Z"
                fill={primaryColor}
                fillOpacity="0.10"
              />
              <rect
                x="78"
                y="238"
                width="134"
                height="12"
                rx="6"
                fill={primaryColor}
                fillOpacity="0.15"
              />
            </g>

            <g transform="translate(36, 520) rotate(-6)">
              <path
                d="M0 14 C0 6.268 6.268 0 14 0 H126 C133.732 0 140 6.268 140 14 V168 L128 160 L116 168 L104 160 L92 168 L80 160 L68 168 L56 160 L44 168 L32 160 L20 168 L10 160 L0 168 Z"
                fill="url(#posCardGrad)"
                stroke={primaryColor}
                strokeOpacity="0.15"
                strokeWidth="1.5"
              />
              <line
                x1="20"
                y1="28"
                x2="86"
                y2="28"
                stroke={primaryColor}
                strokeOpacity="0.20"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <line
                x1="20"
                y1="48"
                x2="118"
                y2="48"
                stroke={primaryColor}
                strokeOpacity="0.14"
                strokeWidth="3"
                strokeDasharray="4 4"
              />
              <line
                x1="20"
                y1="68"
                x2="92"
                y2="68"
                stroke={primaryColor}
                strokeOpacity="0.14"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <line
                x1="20"
                y1="86"
                x2="108"
                y2="86"
                stroke={primaryColor}
                strokeOpacity="0.14"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <g opacity="0.20" fill={primaryColor}>
                <rect x="24" y="114" width="3" height="24" rx="1" />
                <rect x="31" y="114" width="6" height="24" rx="1" />
                <rect x="41" y="114" width="2" height="24" rx="1" />
                <rect x="47" y="114" width="5" height="24" rx="1" />
                <rect x="56" y="114" width="3" height="24" rx="1" />
                <rect x="63" y="114" width="7" height="24" rx="1" />
                <rect x="74" y="114" width="2" height="24" rx="1" />
                <rect x="80" y="114" width="5" height="24" rx="1" />
                <rect x="89" y="114" width="4" height="24" rx="1" />
                <rect x="97" y="114" width="6" height="24" rx="1" />
                <rect x="107" y="114" width="3" height="24" rx="1" />
                <rect x="114" y="114" width="2" height="24" rx="1" />
              </g>
            </g>

            <g
              transform="translate(42, 185) rotate(-8)"
              stroke={primaryColor}
              strokeOpacity="0.12"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 36 H66 V62 C66 75.255 55.255 86 42 86 C28.745 86 18 75.255 18 62 V36 Z" />
              <path d="M66 44 H74 C79.523 44 84 48.477 84 54 C84 59.523 79.523 64 74 64 H66" />
              <line x1="12" y1="94" x2="72" y2="94" />
              <path d="M32 24 C32 18, 38 18, 38 12" />
              <path d="M48 24 C48 18, 54 18, 54 12" />
            </g>

            <path
              d="M -40 690 C 90 640, 220 730, 360 675 C 440 645, 500 660, 560 630"
              stroke={primaryColor}
              strokeOpacity="0.12"
              strokeWidth="2"
              fill="none"
            />
            <path
              d="M -40 720 C 110 670, 240 755, 380 700 C 455 670, 510 685, 560 655"
              stroke={primaryColor}
              strokeOpacity="0.08"
              strokeWidth="1.5"
              strokeDasharray="5 5"
              fill="none"
            />
          </svg>
        </div>

        <div className="relative z-10 flex items-center gap-3 pr-36 sm:pr-0">
          <BrandLogo
            size="md"
            color={primaryColor}
            logoType={storeSettings.logoType}
            customLogoUrl={storeSettings.customLogoUrl}
          />
          <div className="min-w-0">
            <h2 className="font-extrabold text-sm sm:text-lg text-[#2D3748] leading-tight truncate">
              {storeSettings.storeName}
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400 truncate">
              {storeSettings.storeTagline}
            </p>
          </div>
        </div>

        <div className="relative z-10 my-5 sm:my-8 lg:my-10 space-y-2.5 sm:space-y-3.5">
          <span
            style={{ color: primaryColor }}
            className="text-[11px] sm:text-xs font-extrabold uppercase tracking-wider block"
          >
            Point of Sale System
          </span>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#2D3748] leading-tight">
            {storeSettings.storeName}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed max-w-md">
            {isId
              ? 'Sistem manajemen kasir restoran, pemantauan stok real-time, dan analitik penjualan terpadu.'
              : 'Integrated restaurant point of sale, real-time inventory monitoring, and sales analytics.'}
          </p>
        </div>

        <div className="relative z-10 text-[11px] sm:text-xs text-slate-400 hidden sm:flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{storeSettings.storeName} · Enterprise POS</span>
        </div>
      </div>

      {/* Right Login / Database Setup Column (7 cols) */}
      <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 xl:p-12 pt-14 sm:pt-14 flex flex-col justify-start lg:justify-center max-w-xl mx-auto w-full lg:overflow-y-auto">

        {missingSessionSecret && (
          <div className="mb-4 rounded-2xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-[11px] font-medium text-amber-800">
            {isId
              ? 'Catatan Vercel: Env SESSION_SECRET belum diisi di Vercel Project Settings. Tambahkan SESSION_SECRET (min. 32 karakter) agar sesi login & database konsisten di semua serverless function.'
              : 'Vercel note: SESSION_SECRET env var is not set. Add SESSION_SECRET (min 32 chars) in Vercel Project Settings so login sessions persist across serverless functions.'}
          </div>
        )}

        {activeTab === 'account' ? (
          <>
            <div className="mb-4 sm:mb-5">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-[#2D3748]">
                {isSetupMode
                  ? isId
                    ? 'Setup Akun Admin'
                    : 'Initial Admin Setup'
                  : t.loginWelcome}
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                {isSetupMode
                  ? isId
                    ? 'Buat username dan password admin pertama kali (minimal 8 karakter).'
                    : 'Create your first-run admin username and password (min 8 chars).'
                  : t.loginSubtitle}
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-3.5 sm:space-y-4"
              autoComplete="off"
            >
              <div>
                <label className="block text-xs font-bold text-[#2D3748] mb-1.5">
                  {t.usernameLabel}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={
                      isId ? 'Masukkan username...' : 'Enter username...'
                    }
                    className="w-full bg-[#F8F9FA] border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-sm font-medium text-[#2D3748] focus:outline-none focus:border-slate-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#2D3748] mb-1.5">
                  {t.passwordLabel}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={
                      isSetupMode ? 'new-password' : 'current-password'
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      isSetupMode
                        ? isId
                          ? 'Minimal 8 karakter...'
                          : 'Minimum 8 characters...'
                        : isId
                        ? 'Masukkan password...'
                        : 'Enter password...'
                    }
                    className="w-full bg-[#F8F9FA] border border-slate-200 rounded-2xl pl-11 pr-11 py-3 text-sm font-medium text-[#2D3748] focus:outline-none focus:border-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                    title={showPassword ? 'Sembunyikan' : 'Tampilkan'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {isSetupMode && (
                <div>
                  <label className="block text-xs font-bold text-[#2D3748] mb-1.5">
                    {t.confirmPasswordLabel}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={
                        isId ? 'Ulangi password...' : 'Confirm password...'
                      }
                      className="w-full bg-[#F8F9FA] border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-sm font-medium text-[#2D3748] focus:outline-none focus:border-slate-400"
                    />
                  </div>
                </div>
              )}

              {errorMsg && (
                <p className="text-xs font-semibold text-rose-600">
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={isLoggingIn}
                style={{ backgroundColor: primaryColor }}
                className="w-full py-3.5 rounded-2xl text-white font-bold text-sm sm:text-base shadow-lg hover:opacity-95 disabled:opacity-70 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>
                      {isId ? 'Memverifikasi...' : 'Signing in...'}
                    </span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>
                      {isSetupMode
                        ? isId
                          ? 'Simpan & Masuk ke POS'
                          : 'Create Admin & Sign In'
                        : t.loginButton}
                    </span>
                  </>
                )}
              </button>

              {needsSetup && (
                <button
                  type="button"
                  onClick={() => handleToggleSetupOrLogin(!forceLoginMode)}
                  className="w-full py-2.5 rounded-2xl border border-slate-200 bg-[#F8F9FA] hover:bg-slate-100 text-[#2D3748] font-bold text-xs sm:text-sm transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" style={{ color: primaryColor }} />
                  <span>
                    {isSetupMode
                      ? isId
                        ? 'Sudah Punya Akun Admin? Login'
                        : 'Already Have an Admin Account? Login'
                      : isId
                      ? 'Belum Punya Akun Admin? Setup Akun'
                      : 'Need First-Time Setup? Create Admin'}
                  </span>
                </button>
              )}

            </form>
          </>
        ) : (
          <form
            onSubmit={handleSaveDatabaseConfig}
            className="space-y-3"
            autoComplete="off"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg sm:text-xl font-extrabold text-[#2D3748]">
                  {isId
                    ? 'Pengaturan Database Awal'
                    : 'Initial Database Setup'}
                </h2>
                <p className="text-[11px] sm:text-xs text-slate-400">
                  {isId
                    ? 'Hubungkan Google Apps Script sebelum mulai menggunakan kasir.'
                    : 'Connect Google Apps Script before using the POS.'}
                </p>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                  localCloudConfigured
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                {localCloudConfigured
                  ? isId
                    ? 'Tersimpan'
                    : 'Configured'
                  : isId
                  ? 'Belum Diatur'
                  : 'Not Set'}
              </span>
            </div>

            {dbErrorMsg && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-[11px] font-semibold text-rose-700">
                {dbErrorMsg}
              </div>
            )}

            {dbSuccessMsg && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-[11px] font-semibold text-emerald-700 space-y-1">
                <div>{dbSuccessMsg}</div>
                {connectedSheetUrl && (
                  <a
                    href={connectedSheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline font-bold"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>
                      {isId
                        ? 'Buka Google Sheet yang Terhubung'
                        : 'Open Connected Google Sheet'}
                    </span>
                  </a>
                )}
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-[#2D3748] mb-1">
                {isId
                  ? '1. URL Web App Google Apps Script (/exec)'
                  : '1. Google Apps Script Web App URL (/exec)'}
              </label>
              <input
                type="url"
                required
                value={appsScriptUrl}
                onChange={(e) => setAppsScriptUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                className="w-full bg-[#F8F9FA] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono text-[#2D3748] focus:outline-none focus:border-slate-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-[11px] font-bold text-[#2D3748]">
                  {isId
                    ? '2. API Token Apps Script (API_TOKEN)'
                    : '2. Apps Script API Token (API_TOKEN)'}
                </label>
                <button
                  type="button"
                  onClick={handleGenerateRandomToken}
                  style={{ color: primaryColor }}
                  className="text-[11px] font-bold hover:underline cursor-pointer"
                >
                  {isId ? '+ Buat Token Acak' : '+ Generate Token'}
                </button>
              </div>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <input
                    type={showToken ? 'text' : 'password'}
                    required={!localCloudConfigured}
                    value={appsScriptToken}
                    onChange={(e) => setAppsScriptToken(e.target.value)}
                    placeholder={
                      localCloudConfigured
                        ? isId
                          ? '•••••••• (Sudah tersimpan di server — kosongkan jika tidak diubah)'
                          : '•••••••• (Already saved — leave blank to keep)'
                        : isId
                        ? 'Tempel token yang sama dengan API_TOKEN di Apps Script'
                        : 'Paste the exact same token as API_TOKEN in Apps Script'
                    }
                    className="w-full bg-[#F8F9FA] border border-slate-200 rounded-xl pl-3.5 pr-9 py-2.5 text-xs font-mono text-[#2D3748] focus:outline-none focus:border-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                  >
                    {showToken ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                <button
                  type="button"
                  disabled={!appsScriptToken}
                  onClick={() => handleCopyText('dbToken', appsScriptToken)}
                  className="px-3 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                >
                  {copiedKey === 'dbToken' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-[#2D3748] mb-1">
                  {isId
                    ? '3. Link Google Sheet (Opsional)'
                    : '3. Google Sheet URL (Optional)'}
                </label>
                <input
                  type="url"
                  value={googleSheetUrl}
                  onChange={(e) => setGoogleSheetUrl(e.target.value)}
                  placeholder={
                    isId ? 'Kosongkan = buat otomatis' : 'Blank = auto-create'
                  }
                  className="w-full bg-[#F8F9FA] border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-mono text-[#2D3748] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#2D3748] mb-1">
                  {isId
                    ? '4. Folder Drive Foto (Opsional)'
                    : '4. Drive Images Folder (Optional)'}
                </label>
                <input
                  type="url"
                  value={googleDriveFolderUrl}
                  onChange={(e) => setGoogleDriveFolderUrl(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="w-full bg-[#F8F9FA] border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-mono text-[#2D3748] focus:outline-none"
                />
              </div>
            </div>

            {!isSetupMode && (
              <div className="rounded-xl bg-[#F8F9FA] border border-slate-200/80 p-3 space-y-2">
                <div className="text-[11px] font-bold text-[#2D3748]">
                  {isId
                    ? 'Verifikasi Akun Admin (untuk izin ubah database)'
                    : 'Admin Verification (required to update server database)'}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={isId ? 'Username admin...' : 'Admin username...'}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-[#2D3748] focus:outline-none"
                  />
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isId ? 'Password admin...' : 'Admin password...'}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-[#2D3748] focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => setShowCodeGsPreview((prev) => !prev)}
                className="text-[11px] font-bold text-slate-600 hover:text-[#2D3748] flex items-center gap-1 cursor-pointer"
              >
                <Code2 className="w-3.5 h-3.5" style={{ color: primaryColor }} />
                <span>
                  {showCodeGsPreview
                    ? isId
                      ? 'Tutup Code.gs'
                      : 'Hide Code.gs'
                    : isId
                    ? 'Lihat / Salin Code.gs'
                    : 'View / Copy Code.gs'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleCopyText('loginCodeGs', generatedScript)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                {copiedKey === 'loginCodeGs' ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>{isId ? 'Code.gs Tersalin!' : 'Copied!'}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>{isId ? 'Salin Code.gs' : 'Copy Code.gs'}</span>
                  </>
                )}
              </button>
            </div>

            {showCodeGsPreview && (
              <pre className="bg-slate-900 text-slate-100 rounded-xl p-3 text-[10px] font-mono overflow-x-auto max-h-32 leading-relaxed">
                {generatedScript}
              </pre>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="submit"
                disabled={isSavingDb}
                style={{ backgroundColor: primaryColor }}
                className="flex-1 py-3 px-4 rounded-2xl text-white font-bold text-xs sm:text-sm shadow-md hover:opacity-95 disabled:opacity-65 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSavingDb ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>
                      {isId
                        ? 'Menyimpan & Menghubungkan...'
                        : 'Saving & Connecting...'}
                    </span>
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

              <button
                type="button"
                onClick={() => setActiveTab('account')}
                className="py-3 px-4 rounded-2xl border border-slate-200 bg-[#F8F9FA] hover:bg-slate-100 text-[#2D3748] font-bold text-xs sm:text-sm cursor-pointer"
              >
                {isSetupMode
                  ? isId
                    ? 'Lanjut Setup Akun →'
                    : 'Next: Admin Setup →'
                  : isId
                  ? '← Kembali Login'
                  : '← Back to Login'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
