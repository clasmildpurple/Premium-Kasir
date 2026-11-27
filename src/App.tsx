import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  EyeOff,
  Home,
  Loader2,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  Printer,
  Receipt,
  SlidersHorizontal,
  User,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import {
  CartItem,
  CategoryId,
  CategoryItem,
  OrderRecord,
  ProductItem,
  formatRupiah,
} from './data/posData';
import {
  Language,
  StoreBrandingSettings,
  TRANSLATIONS,
  resolveFontCssFamily,
} from './data/i18nAndSettings';
import {
  BrandLogo,
  OrderSuccessIllustration,
  VideoOpeningAnimation,
} from './components/PosIllustrations';
import { GoogleCloudIntegrationPanel } from './components/GoogleCloudIntegrationPanel';
import { SalesDashboardView } from './components/SalesDashboardView';
import { ProductsManagementView } from './components/ProductsManagementView';
import { PdfReportModal, PrintPreviewModal } from './components/PrintModals';
import { LoginView } from './components/LoginView';
import { CartPanel } from './components/CartPanel';
import { BillsView } from './components/BillsView';
import { PosCatalogView, SortOption } from './components/PosCatalogView';
import { LogoutConfirmModal } from './components/LogoutConfirmModal';
import { ConnectivityStatusBadge } from './components/ConnectivityStatusBadge';
import { useAuth } from './hooks/useAuth';
import { useCloudSync } from './hooks/useCloudSync';
import { useProducts } from './hooks/useProducts';
import { useOrders } from './hooks/useOrders';
import {
  GOOGLE_CONFIG_KEY,
  LOCAL_ORDERS_WARN_THRESHOLD,
  MAX_LOCAL_ORDERS,
  STORE_BRANDING_KEY,
  isOrdersApproachingLocalLimit,
  loadInitialCategories,
  loadInitialOrders,
  loadInitialProducts,
  loadInitialStoreSettings,
  safeSetLocalStorageJson,
  sanitizeGoogleConfig,
  sanitizeStoreSettings,
} from './utils/storage';

type NavTab = 'home' | 'products' | 'dashboard' | 'bills' | 'setting';

function playScannerBeep(success = true) {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = success ? 'sine' : 'sawtooth';
    osc.frequency.setValueAtTime(success ? 1850 : 340, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + (success ? 0.11 : 0.22)
    );
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (success ? 0.12 : 0.24));
  } catch {
    // ignore if browser blocks autoplay audio
  }
}

export default function App() {
  const [activeNav, setActiveNav] = useState<NavTab>('home');
  const [activeCategory, setActiveCategory] = useState<CategoryId>('hot');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('popular');

  const [receiptOrderToPrint, setReceiptOrderToPrint] =
    useState<OrderRecord | null>(null);
  const [isPdfReportOpen, setIsPdfReportOpen] = useState<boolean>(false);
  const [actionLoadingText, setActionLoadingText] = useState<string | null>(
    null
  );

  const [storageErrorToast, setStorageErrorToast] = useState<string | null>(
    null
  );
  const storageToastTimerRef = useRef<number | null>(null);
  const hasShownOrderLimitToastRef = useRef<boolean>(false);

  const notifyStorageError = useCallback((message: string) => {
    setStorageErrorToast(message || 'Penyimpanan penuh atau gagal');
    if (storageToastTimerRef.current) {
      window.clearTimeout(storageToastTimerRef.current);
    }
    storageToastTimerRef.current = window.setTimeout(() => {
      setStorageErrorToast(null);
    }, 6000);
  }, []);

  const {
    isAuthenticated,
    isCheckingSession,
    needsAdminSetup,
    cloudConfiguredOnServer,
    setCloudConfiguredOnServer,
    missingSessionSecret,
    cashierName,
    showOpeningAnim,
    setShowOpeningAnim,
    handleLoginSuccess,
    handleLogout,
  } = useAuth(notifyStorageError);

  const [storeSettings, setStoreSettings] = useState<StoreBrandingSettings>(
    loadInitialStoreSettings
  );
  const t = TRANSLATIONS[storeSettings.language as Language];
  const isId = storeSettings.language === 'id';
  const primaryColor = storeSettings.primaryColor || '#FF2457';
  const activeFontCss = resolveFontCssFamily(storeSettings.fontFamily);

  const [categories, setCategories] = useState<CategoryItem[]>(
    loadInitialCategories
  );
  const [products, setProducts] = useState<ProductItem[]>(loadInitialProducts);
  const [orders, setOrders] = useState<OrderRecord[]>(loadInitialOrders);
  const [cart, setCart] = useState<CartItem[]>([]);

  const [dismissedDbBanner, setDismissedDbBanner] = useState(false);
  const [showNotificationPopover, setShowNotificationPopover] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [mobileFullscreenCartOpen, setMobileFullscreenCartOpen] =
    useState(false);
  const [isSidebarHidden, setIsSidebarHidden] = useState(false);
  const [showLogoutConfirmModal, setShowLogoutConfirmModal] = useState(false);

  const [scanToast, setScanToast] = useState<{
    type: 'success' | 'error';
    code: string;
    message: string;
  } | null>(null);
  const barcodeBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const scanToastTimeoutRef = useRef<number | null>(null);

  const {
    googleConfig,
    cloudConfigMeta,
    isCloudConfigured,
    isDbConfigured,
    twoWaySyncStatus,
    lastTwoWaySyncAt,
    lastCloudSyncError,
    offlineQueueCount,
    isOnline,
    latestStateRef,
    lastMutationAtRef,
    broadcastStateChange,
    refreshCloudConfigMeta,
    pushToCloudDatabase,
    flushOfflineQueue,
    handleSyncTwoWay,
    handleSyncAllToCloud,
    handleConnectOrUpdateDatabaseConfig,
  } = useCloudSync({
    isAuthenticated,
    products,
    orders,
    categories,
    storeSettings,
    setProducts,
    setCategories,
    setOrders,
    setStoreSettings,
    setCart,
    notifyStorageError,
  });

  const {
    lowStockProducts,
    handleUpdateCategories,
    handleUpsertProduct,
    handleDeleteProduct,
  } = useProducts({
    products,
    setProducts,
    categories,
    setCategories,
    setCart,
    activeCategory,
    setActiveCategory,
    isId,
    lastMutationAtRef,
    latestStateRef,
    broadcastStateChange,
    pushToCloudDatabase,
    setActionLoadingText,
    notifyStorageError,
  });

  const {
    customerName,
    setCustomerName,
    paymentMethod,
    setPaymentMethod,
    orderSuccess,
    setOrderSuccess,
    lastCompletedOrder,
    isChargingOrder,
    deletingOrderId,
    removingItemId,
    justAddedId,
    activeTaxLabel,
    subTotal,
    taxPbf,
    totalAmount,
    totalItemsCount,
    handleAddToCart,
    handleUpdateQuantity,
    handleRemoveFromCart,
    handleClearCart,
    handleChargeOrder,
    handleDeleteOrder,
  } = useOrders({
    setProducts,
    setOrders,
    cart,
    setCart,
    storeSettings,
    cashierName,
    isId,
    t,
    lastMutationAtRef,
    latestStateRef,
    broadcastStateChange,
    pushToCloudDatabase,
    setActionLoadingText,
    notifyStorageError,
    setMobileFullscreenCartOpen,
  });

  useEffect(() => {
    document.title = `${storeSettings.storeName} — Point of Sale`;
  }, [storeSettings.storeName]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--theme-primary', primaryColor);
    root.style.setProperty('--theme-selection-bg', `${primaryColor}26`);
    root.style.setProperty('--theme-font', activeFontCss);
  }, [primaryColor, activeFontCss]);

  useEffect(() => {
    if (
      orders.length >= LOCAL_ORDERS_WARN_THRESHOLD &&
      isOrdersApproachingLocalLimit(orders.length) &&
      !hasShownOrderLimitToastRef.current
    ) {
      hasShownOrderLimitToastRef.current = true;
      setStorageErrorToast(
        isId
          ? `Riwayat transaksi mendekati batas penyimpanan lokal (${orders.length}/${MAX_LOCAL_ORDERS}). Maksimal ${MAX_LOCAL_ORDERS} transaksi terbaru disimpan lokal; data lama tetap aman di Google Sheets.`
          : `Order history approaching local storage limit (${orders.length}/${MAX_LOCAL_ORDERS}). Only the newest ${MAX_LOCAL_ORDERS} orders are cached locally; older orders stay in Google Sheets.`
      );
      if (storageToastTimerRef.current) {
        window.clearTimeout(storageToastTimerRef.current);
      }
      storageToastTimerRef.current = window.setTimeout(() => {
        setStorageErrorToast(null);
      }, 7000);
    }
  }, [orders.length, isId]);

  useEffect(() => {
    if (isAuthenticated) {
      void handleSyncTwoWay(false);
    }
  }, [activeNav, isAuthenticated, handleSyncTwoWay]);

  const triggerScanToast = useCallback(
    (type: 'success' | 'error', code: string, message: string) => {
      if (scanToastTimeoutRef.current) {
        window.clearTimeout(scanToastTimeoutRef.current);
      }
      setScanToast({ type, code, message });
      scanToastTimeoutRef.current = window.setTimeout(() => {
        setScanToast(null);
      }, 3200);
    },
    []
  );

  const handleBarcodeScanned = useCallback(
    (rawCode: string): boolean => {
      const cleaned = rawCode.trim();
      if (!cleaned) return false;

      const matchedProduct = products.find(
        (p) =>
          (p.barcode && p.barcode.toLowerCase() === cleaned.toLowerCase()) ||
          p.id.toLowerCase() === cleaned.toLowerCase()
      );

      if (!matchedProduct) {
        playScannerBeep(false);
        triggerScanToast(
          'error',
          cleaned,
          `${t.barcodeNotFoundToast}: ${cleaned}`
        );
        return false;
      }

      if ((matchedProduct.stock ?? 20) <= 0) {
        playScannerBeep(false);
        triggerScanToast(
          'error',
          cleaned,
          `${matchedProduct.name} — ${t.outOfStockBadge}`
        );
        return false;
      }

      playScannerBeep(true);
      handleAddToCart(matchedProduct);
      triggerScanToast(
        'success',
        matchedProduct.barcode,
        `${matchedProduct.name} (+1) · ${formatRupiah(matchedProduct.price)}`
      );
      return true;
    },
    [products, handleAddToCart, triggerScanToast, t]
  );

  useEffect(() => {
    if (
      showOpeningAnim ||
      !isAuthenticated ||
      activeNav !== 'home' ||
      orderSuccess
    ) {
      return;
    }

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (isInputFocused) return;

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;

      if (e.key === 'Enter' || e.key === 'Tab') {
        if (barcodeBufferRef.current.length >= 4) {
          e.preventDefault();
          const scannedCode = barcodeBufferRef.current;
          barcodeBufferRef.current = '';
          handleBarcodeScanned(scannedCode);
        } else {
          barcodeBufferRef.current = '';
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (timeDiff > 120) {
          barcodeBufferRef.current = e.key;
        } else {
          barcodeBufferRef.current += e.key;
        }
        lastKeyTimeRef.current = now;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    showOpeningAnim,
    isAuthenticated,
    activeNav,
    orderSuccess,
    handleBarcodeScanned,
  ]);

  const handleToggleLanguage = () => {
    const nextLang: Language = storeSettings.language === 'id' ? 'en' : 'id';
    const updated = sanitizeStoreSettings({
      ...storeSettings,
      language: nextLang,
    });
    setStoreSettings(updated);
    broadcastStateChange('SETTINGS_UPDATED', updated);
    if (isAuthenticated) {
      void pushToCloudDatabase({
        action: 'saveStoreSettings',
        settings: updated,
      });
    }
  };

  const handleUpdateStoreSettings = async (
    newSettings: StoreBrandingSettings,
    logoUpload?: { data: string; name: string; mime: string }
  ) => {
    setActionLoadingText(
      isId ? 'Menyimpan perubahan pengaturan...' : 'Saving settings...'
    );
    try {
      const cleanSettings = sanitizeStoreSettings(newSettings);
      lastMutationAtRef.current = Date.now();
      setStoreSettings(cleanSettings);
      latestStateRef.current.storeSettings = cleanSettings;
      safeSetLocalStorageJson(
        STORE_BRANDING_KEY,
        cleanSettings,
        notifyStorageError
      );
      broadcastStateChange('SETTINGS_UPDATED', cleanSettings);
      const [resp] = await Promise.all([
        pushToCloudDatabase({
          action: 'saveStoreSettings',
          settings: cleanSettings,
          logoBase64: logoUpload?.data,
          logoFileName: logoUpload?.name,
          logoMimeType: logoUpload?.mime,
        }),
        new Promise((r) => setTimeout(r, 450)),
      ]);
      if (
        resp &&
        typeof resp.customLogoUrl === 'string' &&
        resp.customLogoUrl
      ) {
        const withDriveLogo: StoreBrandingSettings = sanitizeStoreSettings({
          ...cleanSettings,
          customLogoUrl: resp.customLogoUrl,
        });
        setStoreSettings(withDriveLogo);
        latestStateRef.current.storeSettings = withDriveLogo;
        broadcastStateChange('SETTINGS_UPDATED', withDriveLogo);
      }
    } finally {
      setActionLoadingText(null);
    }
  };

  const navItems: { id: NavTab; label: string; icon: typeof Home }[] = [
    { id: 'home', label: t.navHome, icon: Home },
    { id: 'products', label: t.navProducts, icon: UtensilsCrossed },
    { id: 'dashboard', label: t.navDashboard, icon: PieChart },
    { id: 'bills', label: t.navBills, icon: Receipt },
    { id: 'setting', label: t.navSetting, icon: SlidersHorizontal },
  ];

  const isOrderMenuVisible = activeNav === 'home' && !orderSuccess;

  return (
    <div
      style={
        {
          '--theme-primary': primaryColor,
          '--theme-selection-bg': `${primaryColor}26`,
          '--theme-font': activeFontCss,
          fontFamily: activeFontCss,
        } as React.CSSProperties
      }
      className="w-screen h-dvh overflow-hidden bg-[#E3E8EF] p-0 sm:p-2 lg:p-3.5 flex items-center justify-center"
    >
      {isCheckingSession ? (
        <div className="flex flex-col items-center justify-center gap-3 text-slate-600">
          <Loader2
            className="w-8 h-8 animate-spin"
            style={{ color: primaryColor }}
          />
          <span className="text-xs font-bold">
            {isId ? 'Memeriksa sesi kasir...' : 'Checking cashier session...'}
          </span>
        </div>
      ) : showOpeningAnim ? (
        <VideoOpeningAnimation
          primaryColor={primaryColor}
          logoType={storeSettings.logoType}
          customLogoUrl={storeSettings.customLogoUrl}
          storeName={storeSettings.storeName}
          onComplete={() => setShowOpeningAnim(false)}
        />
      ) : !isAuthenticated ? (
        <LoginView
          storeSettings={storeSettings}
          googleConfig={googleConfig}
          needsSetup={needsAdminSetup}
          cloudConfigured={isCloudConfigured || cloudConfiguredOnServer}
          missingSessionSecret={missingSessionSecret}
          onCloudConfigured={(sheetUrl) => {
            setCloudConfiguredOnServer(true);
            if (sheetUrl) {
              safeSetLocalStorageJson(
                GOOGLE_CONFIG_KEY,
                sanitizeGoogleConfig({
                  ...googleConfig,
                  GOOGLE_SHEET_URL: sheetUrl,
                }),
                notifyStorageError
              );
            }
          }}
          onToggleLanguage={handleToggleLanguage}
          onLoginSuccess={handleLoginSuccess}
        />
      ) : (
        <div className="w-full h-full bg-[#F8F9FA] rounded-none sm:rounded-[26px] lg:rounded-[32px] shadow-2xl border-0 sm:border-[5px] lg:border-[6px] border-white flex flex-col md:flex-row overflow-hidden relative animate-stage-transition">
          {actionLoadingText && (
            <div className="fixed top-4 sm:top-5 left-1/2 -translate-x-1/2 z-[70] px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl bg-slate-900/95 backdrop-blur-xs text-white shadow-2xl border border-slate-700/80 flex items-center gap-2.5 text-xs sm:text-sm font-bold animate-modal-pop max-w-[92vw]">
              <Loader2
                className="w-4 h-4 sm:w-4.5 sm:h-4.5 animate-spin shrink-0"
                style={{ color: primaryColor }}
              />
              <span className="truncate">{actionLoadingText}</span>
            </div>
          )}

          {storageErrorToast && (
            <div
              role="alert"
              className="fixed bottom-5 right-5 z-[75] px-4 py-3 rounded-2xl bg-amber-600 text-white shadow-2xl border border-amber-500 flex items-center gap-2.5 text-xs sm:text-sm font-bold animate-modal-pop max-w-[92vw] sm:max-w-md"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 text-white" />
              <span className="flex-1 leading-snug">{storageErrorToast}</span>
              <button
                type="button"
                onClick={() => setStorageErrorToast(null)}
                className="p-1 rounded-lg hover:bg-white/15 text-white/90 hover:text-white cursor-pointer shrink-0"
                title={isId ? 'Tutup' : 'Dismiss'}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {scanToast && (
            <div
              className={`fixed top-4 sm:top-5 left-1/2 -translate-x-1/2 z-50 px-3.5 sm:px-5 py-2.5 sm:py-3 rounded-2xl shadow-xl border flex items-center gap-2 sm:gap-3 text-xs sm:text-sm font-bold animate-modal-pop max-w-[92vw] ${
                scanToast.type === 'success'
                  ? 'bg-slate-900 text-white border-slate-700'
                  : 'bg-rose-600 text-white border-rose-500'
              }`}
            >
              {scanToast.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-white shrink-0" />
              )}
              <span className="font-mono text-[10px] sm:text-[11px] px-2 py-0.5 rounded bg-white/15 shrink-0">
                {scanToast.code}
              </span>
              <span className="truncate">{scanToast.message}</span>
            </div>
          )}

          {!isSidebarHidden && (
            <div className="md:hidden w-full bg-white border-b border-slate-100 px-3 py-2 flex items-center justify-between shrink-0 z-20">
              <button
                type="button"
                onClick={() => {
                  setOrderSuccess(false);
                  setActiveNav('home');
                }}
                className="p-1 rounded-xl hover:bg-slate-50 transition-transform active:scale-95 cursor-pointer focus:outline-none flex items-center gap-2 min-w-0"
                title={storeSettings.storeName}
              >
                <BrandLogo
                  color={primaryColor}
                  logoType={storeSettings.logoType}
                  customLogoUrl={storeSettings.customLogoUrl}
                />
                <div className="text-left min-w-0">
                  <span className="block font-extrabold text-xs sm:text-sm text-[#2D3748] tracking-tight truncate max-w-[150px] sm:max-w-[220px]">
                    {storeSettings.storeName}
                  </span>
                  <span className="block text-[10px] text-slate-400 font-medium truncate max-w-[150px] sm:max-w-[220px]">
                    {storeSettings.storeTagline}
                  </span>
                </div>
              </button>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsSidebarHidden(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 text-[11px] font-bold transition-colors cursor-pointer"
                  title={t.hideSidebarBtn}
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Hide</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirmModal(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 text-[11px] font-bold transition-colors cursor-pointer"
                  title={t.navLogout}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{t.navLogout}</span>
                </button>
              </div>
            </div>
          )}

          {!isSidebarHidden && (
            <aside className="hidden md:flex md:w-[78px] lg:w-[88px] bg-white border-r border-slate-100 flex-col items-center justify-between px-2 py-4 lg:py-5 shrink-0 z-20 animate-sidebar-slide">
              <button
                type="button"
                onClick={() => {
                  setOrderSuccess(false);
                  setActiveNav('home');
                }}
                className="p-1.5 rounded-2xl hover:bg-slate-50 transition-transform active:scale-95 cursor-pointer focus:outline-none flex items-center justify-center"
                title={storeSettings.storeName}
              >
                <BrandLogo
                  color={primaryColor}
                  logoType={storeSettings.logoType}
                  customLogoUrl={storeSettings.customLogoUrl}
                />
              </button>

              <nav className="flex flex-col items-center gap-1.5 w-full">
                {navItems.map((item) => {
                  const IconComponent = item.icon;
                  const isActive = activeNav === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setOrderSuccess(false);
                        setMobileFullscreenCartOpen(false);
                        setActiveNav(item.id);
                      }}
                      style={
                        isActive
                          ? {
                              backgroundColor: primaryColor,
                              boxShadow: `0 8px 18px -4px ${primaryColor}55`,
                            }
                          : undefined
                      }
                      className={`w-[58px] lg:w-[64px] h-[52px] lg:h-[56px] rounded-[16px] flex flex-col items-center justify-center gap-0.5 transition-all duration-200 cursor-pointer shrink-0 ${
                        isActive
                          ? 'text-white scale-[1.03]'
                          : 'text-slate-400 hover:text-[#2D3748] hover:bg-slate-50'
                      }`}
                    >
                      <IconComponent className="w-[18px] h-[18px] stroke-[2]" />
                      <span className="text-[10px] font-semibold tracking-tight truncate max-w-full px-0.5">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </nav>

              <div className="flex flex-col items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsSidebarHidden(true)}
                  className="flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-[#2D3748] transition-colors cursor-pointer px-2 py-1 rounded-xl hover:bg-slate-50"
                  title={t.hideSidebarBtn}
                >
                  <PanelLeftClose className="w-4 h-4" />
                  <span className="text-[10px] font-semibold">Hide</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowLogoutConfirmModal(true)}
                  className="flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                  title={t.navLogout}
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-[10px] font-medium whitespace-nowrap">
                    {t.navLogout}
                  </span>
                </button>
              </div>
            </aside>
          )}

          {isSidebarHidden && activeNav !== 'home' && (
            <button
              type="button"
              onClick={() => setIsSidebarHidden(false)}
              className="fixed top-3.5 left-3.5 z-40 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/95 backdrop-blur border border-slate-200 text-[#2D3748] hover:bg-slate-50 text-xs font-bold shadow-md cursor-pointer transition-all"
              title={t.showSidebarBtn}
            >
              <PanelLeftOpen className="w-4 h-4" />
              <span>{t.showSidebarBtn}</span>
            </button>
          )}

          {orderSuccess ? (
            <main className="flex-1 bg-white flex flex-col items-center justify-center p-5 sm:p-10 lg:p-12 text-center animate-menu-transition overflow-y-auto">
              <h1 className="text-xl sm:text-2xl lg:text-[26px] font-extrabold text-[#2D3748] mb-4 sm:mb-8">
                {t.orderSuccessTitle}
              </h1>

              <div className="my-1 sm:my-4 w-full flex items-center justify-center overflow-hidden">
                <OrderSuccessIllustration primaryColor={primaryColor} />
              </div>

              {lastCompletedOrder && (
                <div className="mt-4 sm:mt-5 mb-6 sm:mb-7 text-xs text-slate-400 flex flex-wrap items-center justify-center gap-2 px-2">
                  <span className="font-semibold text-[#2D3748]">
                    {lastCompletedOrder.orderId}
                  </span>
                  {lastCompletedOrder.customerName && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 font-bold text-[#2D3748]">
                        <User
                          className="w-3.5 h-3.5"
                          style={{ color: primaryColor }}
                        />
                        <span>{lastCompletedOrder.customerName}</span>
                      </span>
                    </>
                  )}
                  {lastCompletedOrder.paymentMethod && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full">
                        <span>{lastCompletedOrder.paymentMethod}</span>
                      </span>
                    </>
                  )}
                  <span>·</span>
                  <span
                    style={{ color: primaryColor }}
                    className="tabular-nums font-bold"
                  >
                    {t.totalPaid}: {formatRupiah(lastCompletedOrder.total)}
                  </span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-3 w-full max-w-md sm:max-w-none mt-1">
                {lastCompletedOrder && (
                  <button
                    type="button"
                    onClick={() => setReceiptOrderToPrint(lastCompletedOrder)}
                    className="w-full sm:w-auto bg-slate-100 hover:bg-slate-200 text-[#2D3748] font-bold text-xs sm:text-sm lg:text-base px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Printer
                      className="w-4 h-4 sm:w-5 sm:h-5"
                      style={{ color: primaryColor }}
                    />
                    <span>{t.printReceiptBtn}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setOrderSuccess(false);
                    setActiveNav('home');
                  }}
                  style={{
                    backgroundColor: primaryColor,
                    boxShadow: `0 12px 24px -6px ${primaryColor}55`,
                  }}
                  className="w-full sm:w-auto hover:opacity-95 active:scale-[0.98] text-white font-bold text-xs sm:text-sm lg:text-base px-10 sm:px-14 py-3.5 sm:py-4 rounded-2xl transition-all cursor-pointer"
                >
                  {t.backToHome}
                </button>
              </div>
            </main>
          ) : (
            <>
              <main className="flex-1 min-w-0 flex flex-col h-full overflow-y-auto px-3 sm:px-5 lg:px-7 py-3 sm:py-5 lg:py-6">
                <div className="flex items-center justify-end mb-2 shrink-0">
                  <ConnectivityStatusBadge
                    isOnline={isOnline}
                    isDbConfigured={isDbConfigured}
                    twoWaySyncStatus={twoWaySyncStatus}
                    lastCloudSyncError={lastCloudSyncError}
                    offlineQueueCount={offlineQueueCount}
                    lastSyncedAt={lastTwoWaySyncAt || googleConfig.LAST_SYNCED}
                    isId={isId}
                    onSyncNow={() => {
                      if (offlineQueueCount > 0) {
                        void flushOfflineQueue();
                      } else {
                        void handleSyncTwoWay(true);
                      }
                    }}
                    onOpenSettings={() => setActiveNav('setting')}
                  />
                </div>
                <div
                  key={activeNav}
                  className="animate-menu-transition flex-1 flex flex-col min-w-0"
                >
                  {activeNav === 'home' && (
                    <PosCatalogView
                      products={products}
                      categories={categories}
                      cart={cart}
                      lowStockProducts={lowStockProducts}
                      activeCategory={activeCategory}
                      onChangeActiveCategory={setActiveCategory}
                      searchQuery={searchQuery}
                      onChangeSearchQuery={setSearchQuery}
                      sortBy={sortBy}
                      onChangeSortBy={setSortBy}
                      isSidebarHidden={isSidebarHidden}
                      onShowSidebar={() => setIsSidebarHidden(false)}
                      isDbConfigured={isDbConfigured}
                      dismissedDbBanner={dismissedDbBanner}
                      onDismissDbBanner={() => setDismissedDbBanner(true)}
                      offlineQueueCount={offlineQueueCount}
                      isOnline={isOnline}
                      onFlushOfflineQueue={() => void flushOfflineQueue()}
                      onToggleLanguage={handleToggleLanguage}
                      onOpenSettings={() => setActiveNav('setting')}
                      onOpenProducts={() => setActiveNav('products')}
                      onAddToCart={handleAddToCart}
                      onBarcodeScanned={handleBarcodeScanned}
                      justAddedId={justAddedId}
                      showScannerModal={showScannerModal}
                      onSetShowScannerModal={setShowScannerModal}
                      showNotificationPopover={showNotificationPopover}
                      onSetShowNotificationPopover={setShowNotificationPopover}
                      storeSettings={storeSettings}
                      cashierName={cashierName}
                      primaryColor={primaryColor}
                      isId={isId}
                      t={t}
                    />
                  )}

                  {activeNav === 'products' && (
                    <div className="pb-20 md:pb-6">
                      <ProductsManagementView
                        products={products}
                        categories={categories}
                        storeSettings={storeSettings}
                        onUpsertProduct={handleUpsertProduct}
                        onDeleteProduct={handleDeleteProduct}
                        onUpdateCategories={handleUpdateCategories}
                      />
                    </div>
                  )}

                  {activeNav === 'dashboard' && (
                    <div className="pb-20 md:pb-6">
                      <SalesDashboardView
                        orders={orders}
                        products={products}
                        categories={categories}
                        storeSettings={storeSettings}
                        onOpenPdfReport={() => setIsPdfReportOpen(true)}
                      />
                    </div>
                  )}

                  {activeNav === 'bills' && (
                    <BillsView
                      orders={orders}
                      deletingOrderId={deletingOrderId}
                      primaryColor={primaryColor}
                      isId={isId}
                      t={t}
                      onOpenPdfReport={() => setIsPdfReportOpen(true)}
                      onPrintReceipt={setReceiptOrderToPrint}
                      onDeleteOrder={handleDeleteOrder}
                    />
                  )}

                  {activeNav === 'setting' && (
                    <div className="pb-20 md:pb-6">
                      <GoogleCloudIntegrationPanel
                        config={googleConfig}
                        cloudConfigMeta={cloudConfigMeta}
                        onRefreshCloudConfig={refreshCloudConfigMeta}
                        isCloudConfigured={isCloudConfigured}
                        offlineQueueCount={offlineQueueCount}
                        onFlushOfflineQueue={flushOfflineQueue}
                        onUpdateConfig={handleConnectOrUpdateDatabaseConfig}
                        storeSettings={storeSettings}
                        onUpdateStoreSettings={handleUpdateStoreSettings}
                        products={products}
                        activeUsername={cashierName}
                        onSyncAllToCloud={handleSyncAllToCloud}
                        onPullFromCloud={async () => {
                          return await handleSyncTwoWay(true);
                        }}
                        lastSyncedAt={
                          lastTwoWaySyncAt || googleConfig.LAST_SYNCED
                        }
                        syncStatus={twoWaySyncStatus}
                        lastCloudSyncError={lastCloudSyncError}
                      />
                    </div>
                  )}
                </div>
              </main>

              {isOrderMenuVisible && (
                <CartPanel
                  cart={cart}
                  customerName={customerName}
                  onChangeCustomerName={setCustomerName}
                  paymentMethod={paymentMethod}
                  onChangePaymentMethod={setPaymentMethod}
                  subTotal={subTotal}
                  taxPbf={taxPbf}
                  totalAmount={totalAmount}
                  totalItemsCount={totalItemsCount}
                  activeTaxLabel={activeTaxLabel}
                  removingItemId={removingItemId}
                  isChargingOrder={isChargingOrder}
                  mobileFullscreenCartOpen={mobileFullscreenCartOpen}
                  onSetMobileFullscreenCartOpen={setMobileFullscreenCartOpen}
                  isSidebarHidden={isSidebarHidden}
                  primaryColor={primaryColor}
                  cashierName={cashierName}
                  isId={isId}
                  t={t}
                  onUpdateQuantity={handleUpdateQuantity}
                  onRemoveFromCart={handleRemoveFromCart}
                  onClearCart={handleClearCart}
                  onChargeOrder={handleChargeOrder}
                  onPreviewReceipt={setReceiptOrderToPrint}
                />
              )}
            </>
          )}

          {!isSidebarHidden && !orderSuccess && (
            <nav
              aria-label="Mobile Bottom Navigation"
              className="md:hidden w-full bg-white border-t border-slate-100 px-2 py-1.5 grid grid-cols-5 gap-1 shrink-0 z-30"
            >
              {navItems.map((item) => {
                const IconComponent = item.icon;
                const isActive = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setOrderSuccess(false);
                      setMobileFullscreenCartOpen(false);
                      setActiveNav(item.id);
                    }}
                    style={
                      isActive
                        ? {
                            backgroundColor: primaryColor,
                            boxShadow: `0 6px 14px -4px ${primaryColor}55`,
                          }
                        : undefined
                    }
                    className={`h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all duration-200 cursor-pointer ${
                      isActive
                        ? 'text-white'
                        : 'text-slate-400 hover:text-[#2D3748] hover:bg-slate-50'
                    }`}
                  >
                    <IconComponent className="w-4 h-4 stroke-[2]" />
                    <span className="text-[10px] font-semibold tracking-tight truncate max-w-full px-0.5">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      )}

      <PrintPreviewModal
        order={receiptOrderToPrint}
        storeSettings={storeSettings}
        cashierName={cashierName}
        onClose={() => setReceiptOrderToPrint(null)}
      />

      <PdfReportModal
        isOpen={isPdfReportOpen}
        orders={orders}
        products={products}
        categories={categories}
        storeSettings={storeSettings}
        onClose={() => setIsPdfReportOpen(false)}
      />

      <LogoutConfirmModal
        isOpen={showLogoutConfirmModal}
        isId={isId}
        totalItemsCount={totalItemsCount}
        onClose={() => setShowLogoutConfirmModal(false)}
        onConfirmLogout={async () => {
          await handleLogout();
          setShowLogoutConfirmModal(false);
          setOrderSuccess(false);
          setMobileFullscreenCartOpen(false);
        }}
      />
    </div>
  );
}
