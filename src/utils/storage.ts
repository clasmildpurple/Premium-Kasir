import {
  CategoryItem,
  INITIAL_CATEGORIES,
  INITIAL_PRODUCTS,
  OrderRecord,
  PERMANENT_GOOGLE_CONFIG,
  PermanentGoogleConfig,
  ProductItem,
  normalizePriceToIdr,
} from '../data/posData';
import {
  DEFAULT_STORE_SETTINGS,
  StoreBrandingSettings,
} from '../data/i18nAndSettings';

export const STORE_BRANDING_KEY = 'pinkpos_store_branding';
export const GOOGLE_CONFIG_KEY = 'pinkpos_permanent_google_config';
export const CATEGORIES_STORAGE_KEY = 'pinkpos_categories_list';
export const PRODUCTS_STORAGE_KEY = 'pinkpos_products_catalog_idr';
export const ORDERS_STORAGE_KEY = 'pinkpos_orders_history_idr';
export const OFFLINE_QUEUE_STORAGE_KEY = 'pinkpos_offline_sync_queue';
export const SHEET_FINGERPRINT_KEY = 'pinkpos_last_sheet_fingerprint';

export const MAX_LOCAL_ORDERS = 500;
export const LOCAL_ORDERS_WARN_THRESHOLD = 450;
export const STORAGE_ERROR_MESSAGE = 'Penyimpanan penuh atau gagal';

export function capOrdersForLocalStorage(
  orders: OrderRecord[],
  limit = MAX_LOCAL_ORDERS
): OrderRecord[] {
  if (!Array.isArray(orders)) return [];
  if (orders.length <= limit) return orders;
  return orders.slice(0, limit);
}

export function isOrdersApproachingLocalLimit(
  ordersCount: number,
  threshold = LOCAL_ORDERS_WARN_THRESHOLD
): boolean {
  return ordersCount >= threshold;
}

export function formatStorageErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) {
    return `${STORAGE_ERROR_MESSAGE}: ${err.message}`;
  }
  return STORAGE_ERROR_MESSAGE;
}

export function safeSetLocalStorage(
  key: string,
  value: string,
  onError?: (message: string) => void
): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    onError?.(formatStorageErrorMessage(err));
    return false;
  }
}

export function safeSetLocalStorageJson<T>(
  key: string,
  data: T,
  onError?: (message: string) => void
): boolean {
  try {
    const serialized = JSON.stringify(data);
    localStorage.setItem(key, serialized);
    return true;
  } catch (err) {
    onError?.(formatStorageErrorMessage(err));
    return false;
  }
}

export function safeRemoveLocalStorage(
  key: string,
  onError?: (message: string) => void
): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (err) {
    onError?.(formatStorageErrorMessage(err));
    return false;
  }
}

export function sanitizeStoreSettings(raw: unknown): StoreBrandingSettings {
  const merged = {
    ...DEFAULT_STORE_SETTINGS,
    ...(raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}),
  } as Record<string, unknown>;
  delete merged.loginUsername;
  delete merged.loginPassword;
  return merged as unknown as StoreBrandingSettings;
}

export function sanitizeGoogleConfig(raw: unknown): PermanentGoogleConfig {
  const merged = {
    ...PERMANENT_GOOGLE_CONFIG,
    ...(raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}),
  } as Record<string, unknown>;
  delete merged.APPS_SCRIPT_URL;
  return merged as unknown as PermanentGoogleConfig;
}

export function loadInitialStoreSettings(): StoreBrandingSettings {
  try {
    const saved = localStorage.getItem(STORE_BRANDING_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, unknown>;
      return sanitizeStoreSettings(parsed);
    }
  } catch {
    // fallback to default store settings if corrupted
  }
  return DEFAULT_STORE_SETTINGS;
}

export function loadInitialGoogleConfig(): PermanentGoogleConfig {
  try {
    const saved = localStorage.getItem(GOOGLE_CONFIG_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, unknown>;
      return sanitizeGoogleConfig(parsed);
    }
  } catch {
    // fallback to default config if corrupted
  }
  return PERMANENT_GOOGLE_CONFIG;
}

export function loadInitialCategories(): CategoryItem[] {
  try {
    const saved = localStorage.getItem(CATEGORIES_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // fallback to default categories if corrupted
  }
  return INITIAL_CATEGORIES;
}

export function loadInitialProducts(): ProductItem[] {
  try {
    const saved = localStorage.getItem(PRODUCTS_STORAGE_KEY);
    if (saved !== null) {
      const parsed: ProductItem[] = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.map((p, idx) => {
          const fallback = INITIAL_PRODUCTS.find((ip) => ip.id === p.id);
          const hasLegacySvg =
            typeof p.imageUrl === 'string' &&
            p.imageUrl.startsWith('data:image/svg+xml');
          return {
            ...p,
            imageUrl:
              hasLegacySvg && fallback ? fallback.imageUrl : p.imageUrl,
            barcode:
              p.barcode || `89910021${String(idx + 1).padStart(4, '0')}`,
            price: normalizePriceToIdr(p.price),
            stock: typeof p.stock === 'number' ? p.stock : 20,
            lowStockThreshold:
              typeof p.lowStockThreshold === 'number'
                ? p.lowStockThreshold
                : 5,
          };
        });
      }
    }
  } catch {
    // fallback to initial products if corrupted
  }
  return INITIAL_PRODUCTS;
}

export function loadInitialOrders(): OrderRecord[] {
  try {
    const saved = localStorage.getItem(ORDERS_STORAGE_KEY);
    if (saved) {
      const parsed: OrderRecord[] = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return capOrdersForLocalStorage(
          parsed.filter((o) => o.orderId !== 'ORD-849201')
        );
      }
    }
  } catch {
    // fallback to empty history if corrupted
  }
  return [];
}
