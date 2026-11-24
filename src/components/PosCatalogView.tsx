import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Barcode,
  Bell,
  Bluetooth,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  Globe,
  PanelLeftOpen,
  RefreshCw,
  ScanBarcode,
  Search,
  Usb,
  X,
} from 'lucide-react';
import {
  CartItem,
  CategoryId,
  CategoryItem,
  INITIAL_PRODUCTS,
  ProductItem,
  formatRupiah,
  resolveGoogleDriveImageUrl,
} from '../data/posData';
import { StoreBrandingSettings, TRANSLATIONS } from '../data/i18nAndSettings';

export type SortOption = 'popular' | 'price_asc' | 'price_desc' | 'newest';

export interface PosCatalogViewProps {
  products: ProductItem[];
  categories: CategoryItem[];
  cart: CartItem[];
  lowStockProducts: ProductItem[];
  activeCategory: CategoryId;
  onChangeActiveCategory: (categoryId: CategoryId) => void;
  searchQuery: string;
  onChangeSearchQuery: (query: string) => void;
  sortBy: SortOption;
  onChangeSortBy: (sort: SortOption) => void;
  isSidebarHidden: boolean;
  onShowSidebar: () => void;
  isDbConfigured: boolean;
  dismissedDbBanner: boolean;
  onDismissDbBanner: () => void;
  offlineQueueCount: number;
  isOnline: boolean;
  onFlushOfflineQueue: () => void;
  onToggleLanguage: () => void;
  onOpenSettings: () => void;
  onOpenProducts: () => void;
  onAddToCart: (product: ProductItem) => void;
  onBarcodeScanned: (rawCode: string) => boolean;
  justAddedId: string | null;
  showScannerModal: boolean;
  onSetShowScannerModal: React.Dispatch<React.SetStateAction<boolean>>;
  showNotificationPopover: boolean;
  onSetShowNotificationPopover: React.Dispatch<React.SetStateAction<boolean>>;
  storeSettings: StoreBrandingSettings;
  cashierName: string;
  primaryColor: string;
  isId: boolean;
  t: (typeof TRANSLATIONS)['id'];
}

export const PosCatalogView: React.FC<PosCatalogViewProps> = ({
  products,
  categories,
  cart,
  lowStockProducts,
  activeCategory,
  onChangeActiveCategory,
  searchQuery,
  onChangeSearchQuery,
  sortBy,
  onChangeSortBy,
  isSidebarHidden,
  onShowSidebar,
  isDbConfigured,
  dismissedDbBanner,
  onDismissDbBanner,
  offlineQueueCount,
  isOnline,
  onFlushOfflineQueue,
  onToggleLanguage,
  onOpenSettings,
  onOpenProducts,
  onAddToCart,
  onBarcodeScanned,
  justAddedId,
  showScannerModal,
  onSetShowScannerModal,
  showNotificationPopover,
  onSetShowNotificationPopover,
  storeSettings,
  cashierName,
  primaryColor,
  isId,
  t,
}) => {
  const [manualBarcodeInput, setManualBarcodeInput] = useState('');
  const [categoryTransitionKey, setCategoryTransitionKey] = useState(0);

  const categoryScrollRef = useRef<HTMLDivElement | null>(null);
  const isDraggingCatRef = useRef(false);
  const catDragStartXRef = useRef(0);
  const catScrollStartLeftRef = useRef(0);
  const catHasDraggedRef = useRef(false);
  const [canScrollCatLeft, setCanScrollCatLeft] = useState(false);
  const [canScrollCatRight, setCanScrollCatRight] = useState(false);

  const updateCatScrollButtons = useCallback(() => {
    const el = categoryScrollRef.current;
    if (!el) return;
    setCanScrollCatLeft(el.scrollLeft > 4);
    setCanScrollCatRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(updateCatScrollButtons, 60);
    window.addEventListener('resize', updateCatScrollButtons);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', updateCatScrollButtons);
    };
  }, [categories, isSidebarHidden, updateCatScrollButtons]);

  const handleSlideCategories = useCallback((direction: 'left' | 'right') => {
    const el = categoryScrollRef.current;
    if (!el) return;
    const scrollAmount = Math.max(el.clientWidth * 0.6, 220);
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  }, []);

  const visibleProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const activeCatObj = categories.find((c) => c.id === activeCategory);
    const activeCatLower = activeCategory.toLowerCase();
    const activeNameLower = activeCatObj?.name.toLowerCase() || '';
    const activeNameEnLower = activeCatObj?.nameEn?.toLowerCase() || '';

    const list = products.filter((item) => {
      const matchesCategory =
        q || activeCatLower === 'hot' || activeCatLower === 'all'
          ? true
          : item.categories.some((cat) => {
              const cl = cat.toLowerCase();
              return (
                cl === activeCatLower ||
                (activeNameLower && cl === activeNameLower) ||
                (activeNameEnLower && cl === activeNameEnLower)
              );
            });
      const matchesSearch = q
        ? item.name.toLowerCase().includes(q) ||
          (item.barcode && item.barcode.toLowerCase().includes(q)) ||
          item.categories.some((c) => c.toLowerCase().includes(q))
        : true;
      return matchesCategory && matchesSearch;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'price_asc') return a.price - b.price;
      if (sortBy === 'price_desc') return b.price - a.price;
      if (sortBy === 'newest') return (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0);
      if (activeCatLower === 'hot') {
        const aHot = a.categories.some((c) => c.toLowerCase() === 'hot') ? 1 : 0;
        const bHot = b.categories.some((c) => c.toLowerCase() === 'hot') ? 1 : 0;
        if (bHot !== aHot) return bHot - aHot;
      }
      return b.popularity - a.popularity;
    });
  }, [products, categories, activeCategory, searchQuery, sortBy]);

  return (
    <>
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 mb-3 sm:mb-4">
        <div className="flex items-center justify-between sm:justify-start gap-2.5 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {isSidebarHidden && (
              <button
                type="button"
                onClick={onShowSidebar}
                className="h-9 px-2.5 rounded-xl bg-white hover:bg-slate-50 text-[#2D3748] text-xs font-bold border border-slate-200/80 shadow-2xs flex items-center gap-1.5 cursor-pointer shrink-0"
                title={t.showSidebarBtn}
              >
                <PanelLeftOpen
                  className="w-4 h-4"
                  style={{ color: primaryColor }}
                />
                <span className="hidden sm:inline">Menu</span>
              </button>
            )}
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg lg:text-xl font-extrabold text-[#2D3748] tracking-tight truncate">
                {t.orderMenuTitle}
              </h1>
              <p className="hidden sm:block text-[11px] text-slate-400 font-medium truncate">
                {storeSettings.storeName} · {storeSettings.storeTagline}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-48 md:w-56 xl:w-64 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onChangeSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery.trim()) {
                  e.preventDefault();
                  const matched = onBarcodeScanned(searchQuery.trim());
                  if (matched) {
                    onChangeSearchQuery('');
                  }
                }
              }}
              placeholder={t.searchPlaceholder}
              className="w-full h-9 sm:h-10 bg-white rounded-xl sm:rounded-2xl pl-8.5 sm:pl-9 pr-7 sm:pr-8 text-xs sm:text-sm text-[#2D3748] placeholder:text-slate-300 shadow-2xs border border-slate-100 focus:border-slate-300 focus:outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onChangeSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => {
                onSetShowNotificationPopover(false);
                onSetShowScannerModal((prev) => !prev);
              }}
              className="h-9 sm:h-10 px-2.5 sm:px-3.5 rounded-xl sm:rounded-2xl bg-white hover:bg-slate-50 text-[#2D3748] text-xs font-extrabold flex items-center gap-1.5 sm:gap-2 shadow-2xs border border-slate-100 transition-all cursor-pointer shrink-0"
              title={t.barcodeScannerReady}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <ScanBarcode
                className="w-4 h-4 shrink-0"
                style={{ color: primaryColor }}
              />
              <span className="hidden xl:inline whitespace-nowrap">
                {t.barcodeScannerBtn}
              </span>
            </button>

            {showScannerModal && (
              <div className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-24 sm:top-full sm:mt-2 sm:w-88 bg-white rounded-[24px] shadow-2xl border border-slate-100 p-4 z-40 text-xs space-y-3.5 animate-fade-in">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div
                      style={{
                        backgroundColor: `${primaryColor}15`,
                        color: primaryColor,
                      }}
                      className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    >
                      <ScanBarcode className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-extrabold text-[#2D3748] text-xs">
                        {t.barcodeScannerReady}
                      </div>
                      <div className="text-[10px] text-emerald-600 font-semibold flex items-center gap-2">
                        <span className="inline-flex items-center gap-1">
                          <Usb className="w-3 h-3" /> USB HID
                        </span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Bluetooth className="w-3 h-3" /> Bluetooth
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSetShowScannerModal(false)}
                    className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!manualBarcodeInput.trim()) return;
                    const ok = onBarcodeScanned(manualBarcodeInput);
                    if (ok) setManualBarcodeInput('');
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    autoFocus
                    value={manualBarcodeInput}
                    onChange={(e) => setManualBarcodeInput(e.target.value)}
                    placeholder={t.barcodeInputPlaceholder}
                    className="flex-1 min-w-0 bg-[#F8F9FA] border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#2D3748] focus:outline-none focus:border-slate-400"
                  />
                  <button
                    type="submit"
                    style={{ backgroundColor: primaryColor }}
                    className="px-3.5 py-2 rounded-xl text-white font-bold text-xs shadow-xs hover:opacity-95 cursor-pointer shrink-0"
                  >
                    Scan
                  </button>
                </form>

                <div>
                  <div className="text-[11px] font-bold text-slate-400 mb-2">
                    {t.quickScanSimulatorTitle}
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {products.slice(0, 10).map((prod) => (
                      <button
                        key={prod.id}
                        type="button"
                        onClick={() => onBarcodeScanned(prod.barcode)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#F8F9FA] hover:bg-slate-100 text-left transition-colors cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-[#2D3748] truncate">
                            {prod.name}
                          </div>
                          <div className="font-mono text-[10px] text-slate-400 flex items-center gap-1">
                            <Barcode className="w-3 h-3" />
                            <span>{prod.barcode}</span>
                          </div>
                        </div>
                        <span
                          style={{ color: primaryColor }}
                          className="font-extrabold tabular-nums shrink-0"
                        >
                          + {formatRupiah(prod.price)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {(offlineQueueCount > 0 || !isOnline) && (
            <button
              type="button"
              onClick={onFlushOfflineQueue}
              className="h-9 sm:h-10 px-2.5 sm:px-3 rounded-xl sm:rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-extrabold flex items-center gap-1.5 border border-amber-200 transition-colors cursor-pointer shrink-0 tabular-nums"
              title={
                isId
                  ? 'Transaksi menunggu koneksi untuk dikirim ke Google Sheet. Klik untuk kirim ulang sekarang.'
                  : 'Queued offline sync items waiting for connection. Click to retry now.'
              }
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="whitespace-nowrap">
                {offlineQueueCount > 0
                  ? isId
                    ? `Antrean: ${offlineQueueCount}`
                    : `Queue: ${offlineQueueCount}`
                  : 'Offline'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleLanguage}
            className="h-9 sm:h-10 px-2.5 sm:px-3 rounded-xl sm:rounded-2xl bg-white hover:bg-slate-50 text-[#2D3748] text-xs font-extrabold flex items-center gap-1 shadow-2xs border border-slate-100 transition-colors cursor-pointer shrink-0"
            title="Ganti Bahasa (Indonesia / English)"
          >
            <Globe className="w-3.5 h-3.5" style={{ color: primaryColor }} />
            <span>{storeSettings.language.toUpperCase()}</span>
          </button>

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => {
                onSetShowScannerModal(false);
                onSetShowNotificationPopover((prev) => !prev);
              }}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-500 hover:text-[#2D3748] shadow-2xs transition-colors cursor-pointer relative"
              title={
                isId ? 'Notifikasi Stok Menipis' : 'Low Stock Notifications'
              }
            >
              <Bell className="w-4 h-4" />
              {lowStockProducts.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4.5 h-4.5 sm:w-5 sm:h-5 rounded-full bg-amber-500 text-white text-[9px] sm:text-[10px] font-extrabold flex items-center justify-center tabular-nums shadow-xs">
                  {lowStockProducts.length}
                </span>
              )}
            </button>
            {showNotificationPopover && (
              <div className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-24 sm:top-full sm:mt-2 sm:w-80 bg-white rounded-2xl shadow-xl border border-slate-100 p-4 z-30 text-xs space-y-3 animate-fade-in">
                <div className="font-extrabold text-[#2D3748] flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span>
                      {isId
                        ? `Peringatan Stok (${lowStockProducts.length})`
                        : `Low Stock Alerts (${lowStockProducts.length})`}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onSetShowNotificationPopover(false)}
                    className="text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {lowStockProducts.length === 0 ? (
                  <p className="text-slate-400 py-2">
                    {isId
                      ? 'Semua stok produk berada di atas batas minimum.'
                      : 'All products are well stocked above threshold.'}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {lowStockProducts.map((lp) => (
                      <div
                        key={lp.id}
                        className="flex items-center justify-between gap-2 p-2 rounded-xl bg-amber-50/70 border border-amber-200/70"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-[#2D3748] truncate">
                            {lp.name}
                          </div>
                          <div className="text-[11px] text-amber-700 font-medium">
                            {isId
                              ? `Batas minimum: ${lp.lowStockThreshold}`
                              : `Threshold: ${lp.lowStockThreshold}`}
                          </div>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold shrink-0 tabular-nums ${
                            lp.stock <= 0
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-amber-200/80 text-amber-900'
                          }`}
                        >
                          {lp.stock <= 0
                            ? t.outOfStockBadge
                            : `${t.stockLeftLabel}: ${lp.stock}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onSetShowNotificationPopover(false);
                    onOpenProducts();
                  }}
                  style={{ color: primaryColor }}
                  className="w-full pt-1 text-center font-bold hover:underline cursor-pointer"
                >
                  {isId
                    ? 'Atur Stok & Ambang Batas di Menu Produk →'
                    : 'Manage Stock & Thresholds in Products →'}
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenSettings}
            style={{
              backgroundColor: `${primaryColor}18`,
              color: primaryColor,
            }}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl font-extrabold text-xs flex items-center justify-center hover:opacity-85 transition-opacity cursor-pointer shrink-0 uppercase"
            title={cashierName}
          >
            {cashierName.slice(0, 2)}
          </button>
        </div>
      </header>

      {!isDbConfigured && !dismissedDbBanner && (
        <div className="mb-3 sm:mb-4 px-3.5 py-2.5 rounded-2xl bg-amber-50 border border-amber-200/90 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0 text-amber-900 font-semibold">
            <Database className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="truncate">
              {isId
                ? 'Database Google Sheets belum dihubungkan — sedang memakai data contoh awal.'
                : 'Google Sheets database not connected yet — showing starter demo data.'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onOpenSettings}
              style={{ backgroundColor: primaryColor }}
              className="px-3 py-1.5 rounded-xl text-white text-[11px] font-bold shadow-xs hover:opacity-95 cursor-pointer"
            >
              {isId ? 'Setting Database' : 'Configure DB'}
            </button>
            <button
              type="button"
              onClick={onDismissDbBanner}
              className="p-1 rounded-lg text-amber-700 hover:bg-amber-100 cursor-pointer"
              title={isId ? 'Tutup' : 'Dismiss'}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <section
        aria-label="Product Categories"
        className="relative flex items-center gap-1.5 mb-3 sm:mb-4"
      >
        {canScrollCatLeft && (
          <button
            type="button"
            onClick={() => handleSlideCategories('left')}
            className="w-8 h-9 sm:h-9.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/90 text-[#2D3748] shadow-xs flex items-center justify-center shrink-0 cursor-pointer transition-all active:scale-95 z-10"
            title={isId ? 'Geser Kategori ke Kiri' : 'Slide Categories Left'}
          >
            <ChevronLeft className="w-4 h-4" style={{ color: primaryColor }} />
          </button>
        )}

        <div
          ref={categoryScrollRef}
          onScroll={updateCatScrollButtons}
          onMouseDown={(e) => {
            const el = categoryScrollRef.current;
            if (!el) return;
            isDraggingCatRef.current = true;
            catHasDraggedRef.current = false;
            catDragStartXRef.current = e.pageX - el.offsetLeft;
            catScrollStartLeftRef.current = el.scrollLeft;
          }}
          onMouseMove={(e) => {
            if (!isDraggingCatRef.current) return;
            const el = categoryScrollRef.current;
            if (!el) return;
            const x = e.pageX - el.offsetLeft;
            const walk = (x - catDragStartXRef.current) * 1.35;
            if (Math.abs(walk) > 5) {
              catHasDraggedRef.current = true;
              e.preventDefault();
            }
            el.scrollLeft = catScrollStartLeftRef.current - walk;
            updateCatScrollButtons();
          }}
          onMouseUp={() => {
            isDraggingCatRef.current = false;
          }}
          onMouseLeave={() => {
            isDraggingCatRef.current = false;
          }}
          onWheel={(e) => {
            const el = categoryScrollRef.current;
            if (!el) return;
            if (
              Math.abs(e.deltaY) > Math.abs(e.deltaX) &&
              el.scrollWidth > el.clientWidth
            ) {
              el.scrollLeft += e.deltaY;
              updateCatScrollButtons();
            }
          }}
          className="flex-1 flex items-center gap-1.5 sm:gap-2 overflow-x-auto touch-pan-x py-1 px-0.5 no-scrollbar cursor-grab active:cursor-grabbing select-none"
        >
          {categories.map((cat) => {
            const isActive = activeCategory === cat.id;
            const label = isId ? cat.name : cat.nameEn || cat.name;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={(e) => {
                  if (catHasDraggedRef.current) {
                    e.preventDefault();
                    catHasDraggedRef.current = false;
                    return;
                  }
                  onChangeActiveCategory(cat.id);
                  onChangeSearchQuery('');
                  setCategoryTransitionKey((k) => k + 1);
                  e.currentTarget.scrollIntoView({
                    behavior: 'smooth',
                    inline: 'nearest',
                    block: 'nearest',
                  });
                }}
                style={
                  isActive
                    ? {
                        backgroundColor: primaryColor,
                        borderColor: primaryColor,
                        boxShadow: `0 5px 12px -4px ${primaryColor}45`,
                      }
                    : undefined
                }
                className={`min-w-[104px] sm:min-w-[122px] flex-1 shrink-0 h-9 sm:h-9.5 px-3.5 sm:px-4 rounded-xl border flex items-center justify-center text-center transition-all duration-200 cursor-pointer select-none ${
                  isActive
                    ? 'text-white font-extrabold'
                    : 'bg-white text-slate-500 hover:text-[#2D3748] font-bold border-slate-200/80 hover:border-slate-300'
                }`}
              >
                <span className="text-[11px] sm:text-xs tracking-tight whitespace-nowrap">
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        {canScrollCatRight && (
          <button
            type="button"
            onClick={() => handleSlideCategories('right')}
            className="w-8 h-9 sm:h-9.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/90 text-[#2D3748] shadow-xs flex items-center justify-center shrink-0 cursor-pointer transition-all active:scale-95 z-10"
            title={isId ? 'Geser Kategori ke Kanan' : 'Slide Categories Right'}
          >
            <ChevronRight className="w-4 h-4" style={{ color: primaryColor }} />
          </button>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-xs sm:text-base lg:text-lg font-extrabold text-[#2D3748]">
          {t.orderMenuTitle}
        </h2>

        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-400 font-medium">{t.sortByLabel}</span>
          <div className="relative inline-flex items-center">
            <select
              value={sortBy}
              onChange={(e) => onChangeSortBy(e.target.value as SortOption)}
              aria-label="Sort products"
              className="appearance-none bg-transparent pr-5 font-bold text-[#2D3748] focus:outline-none cursor-pointer"
            >
              <option value="popular">{t.sortPopular}</option>
              <option value="price_asc">{t.sortPriceAsc}</option>
              <option value="price_desc">{t.sortPriceDesc}</option>
              <option value="newest">{t.sortNewest}</option>
            </select>
            <ChevronDown
              className="w-3.5 h-3.5 absolute right-0 pointer-events-none"
              style={{ color: primaryColor }}
            />
          </div>
        </div>
      </div>

      <div
        key={categoryTransitionKey}
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 sm:gap-3.5 pb-32 md:pb-24 lg:pb-6"
      >
        {visibleProducts.map((product, index) => {
          const inCartItem = cart.find((c) => c.product.id === product.id);
          const isJustAdded = justAddedId === product.id;
          const stockQty = product.stock ?? 20;
          const threshold = product.lowStockThreshold ?? 5;
          const isOutOfStock = stockQty <= 0;
          const isLowStock = !isOutOfStock && stockQty <= threshold;

          return (
            <div
              key={product.id}
              onClick={() => onAddToCart(product)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onAddToCart(product);
                }
              }}
              style={{
                animationDelay: `${Math.min(index, 12) * 24}ms`,
                borderColor: isJustAdded
                  ? primaryColor
                  : isLowStock
                  ? '#FCD34D'
                  : 'transparent',
              }}
              className={`animate-card-enter group bg-white rounded-[16px] sm:rounded-[18px] p-2.5 sm:p-3.5 flex flex-col items-center text-center relative select-none border-2 transition-all duration-200 ${
                isOutOfStock
                  ? 'opacity-60 cursor-not-allowed'
                  : isJustAdded
                  ? 'scale-[0.95] shadow-sm cursor-pointer'
                  : 'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/75 cursor-pointer'
              }`}
            >
              <div className="w-full flex items-center justify-between gap-1 mb-0.5 z-10 min-h-[20px]">
                <div>
                  {inCartItem && (
                    <span
                      style={{ backgroundColor: primaryColor }}
                      className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center tabular-nums shadow-xs shrink-0"
                    >
                      {inCartItem.quantity}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-end min-w-0">
                  {isOutOfStock ? (
                    <span className="inline-flex items-center gap-0.5 bg-rose-50 text-rose-600 border border-rose-200 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full truncate">
                      <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{t.outOfStockBadge}</span>
                    </span>
                  ) : isLowStock ? (
                    <span className="inline-flex items-center gap-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full truncate">
                      <AlertTriangle className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                      <span className="truncate">
                        {t.lowStockBadge} ({stockQty})
                      </span>
                    </span>
                  ) : product.isNew ? (
                    <span
                      style={{ backgroundColor: primaryColor }}
                      className="text-white text-[9px] font-bold px-2 py-0.5 rounded-t-full rounded-br-full shadow-2xs"
                    >
                      {t.newBadge}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="w-full h-24 sm:h-28 lg:h-32 flex items-center justify-center my-1.5 rounded-xl bg-slate-50 overflow-hidden">
                <img
                  src={resolveGoogleDriveImageUrl(product.imageUrl)}
                  alt={product.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src =
                      INITIAL_PRODUCTS[0].imageUrl;
                  }}
                />
              </div>

              <h3 className="font-bold text-[#2D3748] text-xs sm:text-[13px] tracking-tight line-clamp-1 w-full">
                {product.name}
              </h3>

              <p
                style={{ color: primaryColor }}
                className="font-extrabold text-[11px] sm:text-xs tabular-nums mt-0.5"
              >
                {formatRupiah(product.price)}
              </p>

              <div className="inline-flex items-center gap-1 text-[9px] font-mono text-slate-300 mt-0.5 max-w-full truncate">
                <Barcode className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">{product.barcode}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};
