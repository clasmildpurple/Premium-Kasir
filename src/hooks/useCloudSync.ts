import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CartItem,
  CategoryItem,
  OrderRecord,
  PermanentGoogleConfig,
  ProductItem,
  isDatabaseConfigured,
  normalizePriceToIdr,
} from '../data/posData';
import { StoreBrandingSettings } from '../data/i18nAndSettings';
import {
  CATEGORIES_STORAGE_KEY,
  GOOGLE_CONFIG_KEY,
  OFFLINE_QUEUE_STORAGE_KEY,
  ORDERS_STORAGE_KEY,
  PRODUCTS_STORAGE_KEY,
  SHEET_FINGERPRINT_KEY,
  STORE_BRANDING_KEY,
  capOrdersForLocalStorage,
  loadInitialGoogleConfig,
  safeRemoveLocalStorage,
  safeSetLocalStorage,
  safeSetLocalStorageJson,
  sanitizeGoogleConfig,
  sanitizeStoreSettings,
} from '../utils/storage';

export interface OfflineSyncQueueItem {
  id: string;
  queuedAt: string;
  payload: Record<string, unknown>;
}

export interface UseCloudSyncParams {
  isAuthenticated: boolean;
  products: ProductItem[];
  orders: OrderRecord[];
  categories: CategoryItem[];
  storeSettings: StoreBrandingSettings;
  setProducts: React.Dispatch<React.SetStateAction<ProductItem[]>>;
  setCategories: React.Dispatch<React.SetStateAction<CategoryItem[]>>;
  setOrders: React.Dispatch<React.SetStateAction<OrderRecord[]>>;
  setStoreSettings: React.Dispatch<React.SetStateAction<StoreBrandingSettings>>;
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  notifyStorageError: (message: string) => void;
}

export function useCloudSync({
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
}: UseCloudSyncParams) {
  const [googleConfig, setGoogleConfig] = useState<PermanentGoogleConfig>(
    loadInitialGoogleConfig
  );
  const googleConfigRef = useRef<PermanentGoogleConfig>(googleConfig);
  useEffect(() => {
    googleConfigRef.current = googleConfig;
  }, [googleConfig]);

  const [isCloudConfigured, setIsCloudConfigured] = useState<boolean>(false);
  const isDbConfigured = useMemo(
    () => isCloudConfigured || isDatabaseConfigured(googleConfig),
    [isCloudConfigured, googleConfig]
  );

  const [lastTwoWaySyncAt, setLastTwoWaySyncAt] = useState<string>(() =>
    new Date().toLocaleTimeString('id-ID')
  );
  const [twoWaySyncStatus, setTwoWaySyncStatus] = useState<
    'connected' | 'local_realtime' | 'syncing'
  >('local_realtime');

  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.length;
      }
    } catch {
      // fallback to empty queue
    }
    return 0;
  });

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const offlineQueueRef = useRef<OfflineSyncQueueItem[]>(
    (() => {
      try {
        const saved = localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed as OfflineSyncQueueItem[];
        }
      } catch {
        // fallback to empty queue
      }
      return [];
    })()
  );

  const isFlushingQueueRef = useRef<boolean>(false);
  const hasHydratedServerRef = useRef<boolean>(false);
  const inFlightMutationsRef = useRef<number>(0);
  const lastMutationAtRef = useRef<number>(0);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const isApplyingRemoteUpdateRef = useRef<boolean>(false);
  const lastRemoteSheetFingerprintRef = useRef<string>(
    (() => {
      try {
        return localStorage.getItem(SHEET_FINGERPRINT_KEY) || '';
      } catch {
        return '';
      }
    })()
  );

  const latestStateRef = useRef({
    products,
    orders,
    categories,
    storeSettings,
  });
  useEffect(() => {
    latestStateRef.current = { products, orders, categories, storeSettings };
  }, [products, orders, categories, storeSettings]);

  const persistStateToServer = useCallback(
    async (patch: {
      googleConfig?: PermanentGoogleConfig;
      storeSettings?: StoreBrandingSettings;
      categories?: CategoryItem[];
      products?: ProductItem[];
      orders?: OrderRecord[];
    }) => {
      try {
        await fetch('/api/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
      } catch {
        // ignore offline/network errors
      }
    },
    []
  );

  // Debounced localStorage & server persistence
  useEffect(() => {
    const id = window.setTimeout(() => {
      const cleanSettings = sanitizeStoreSettings(storeSettings);
      safeSetLocalStorageJson(
        STORE_BRANDING_KEY,
        cleanSettings,
        notifyStorageError
      );
      if (isAuthenticated && hasHydratedServerRef.current) {
        persistStateToServer({ storeSettings: cleanSettings });
      }
    }, 80);
    return () => window.clearTimeout(id);
  }, [storeSettings, isAuthenticated, persistStateToServer, notifyStorageError]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      safeSetLocalStorageJson(
        GOOGLE_CONFIG_KEY,
        googleConfig,
        notifyStorageError
      );
      if (hasHydratedServerRef.current) {
        persistStateToServer({ googleConfig });
      }
    }, 80);
    return () => window.clearTimeout(id);
  }, [googleConfig, persistStateToServer, notifyStorageError]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      safeSetLocalStorageJson(
        CATEGORIES_STORAGE_KEY,
        categories,
        notifyStorageError
      );
      if (hasHydratedServerRef.current) {
        persistStateToServer({ categories });
      }
    }, 80);
    return () => window.clearTimeout(id);
  }, [categories, persistStateToServer, notifyStorageError]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      safeSetLocalStorageJson(
        PRODUCTS_STORAGE_KEY,
        products,
        notifyStorageError
      );
      if (hasHydratedServerRef.current) {
        persistStateToServer({ products });
      }
    }, 100);
    return () => window.clearTimeout(id);
  }, [products, persistStateToServer, notifyStorageError]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const cappedOrders = capOrdersForLocalStorage(orders);
      safeSetLocalStorageJson(
        ORDERS_STORAGE_KEY,
        cappedOrders,
        notifyStorageError
      );
      if (hasHydratedServerRef.current) {
        persistStateToServer({ orders: cappedOrders });
      }
    }, 150);
    return () => window.clearTimeout(id);
  }, [orders, persistStateToServer, notifyStorageError]);

  const persistOfflineQueue = useCallback(
    (items: OfflineSyncQueueItem[]) => {
      offlineQueueRef.current = items;
      setOfflineQueueCount(items.length);
      safeSetLocalStorageJson(
        OFFLINE_QUEUE_STORAGE_KEY,
        items,
        notifyStorageError
      );
    },
    [notifyStorageError]
  );

  const enqueueOfflineSync = useCallback(
    (payload: Record<string, unknown>) => {
      const entryId =
        typeof globalThis.crypto !== 'undefined' &&
        typeof globalThis.crypto.randomUUID === 'function'
          ? globalThis.crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const next = [
        ...offlineQueueRef.current,
        {
          id: entryId,
          queuedAt: new Date().toISOString(),
          payload,
        },
      ];
      persistOfflineQueue(next);
    },
    [persistOfflineQueue]
  );

  const broadcastStateChange = useCallback(
    (type: string, payload: unknown) => {
      try {
        broadcastChannelRef.current?.postMessage({
          type,
          payload,
          timestamp: Date.now(),
        });
      } catch {
        // ignore if BroadcastChannel is unsupported
      }
    },
    []
  );

  // Real-time 2-Way Cross-Tab & Multi-Window Database Synchronization
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel('pinkpos_2way_db_channel');
        broadcastChannelRef.current = channel;
        channel.onmessage = (event) => {
          const msg = event.data;
          if (!msg || typeof msg.type !== 'string') return;
          isApplyingRemoteUpdateRef.current = true;
          const nowStr = new Date().toLocaleTimeString('id-ID');
          setLastTwoWaySyncAt(nowStr);

          if (msg.type === 'PRODUCTS_UPDATED' && Array.isArray(msg.payload)) {
            const nextProducts = msg.payload as ProductItem[];
            setProducts(nextProducts);
            setCart((prev) =>
              prev
                .map((c) => {
                  const updatedProd = nextProducts.find(
                    (p) => p.id === c.product.id
                  );
                  return updatedProd ? { ...c, product: updatedProd } : c;
                })
                .filter((c) =>
                  nextProducts.some((p) => p.id === c.product.id)
                )
            );
          } else if (
            msg.type === 'CATEGORIES_UPDATED' &&
            Array.isArray(msg.payload)
          ) {
            setCategories(msg.payload as CategoryItem[]);
          } else if (
            msg.type === 'ORDERS_UPDATED' &&
            Array.isArray(msg.payload)
          ) {
            setOrders(msg.payload as OrderRecord[]);
          } else if (msg.type === 'SETTINGS_UPDATED' && msg.payload) {
            setStoreSettings((prev) => ({
              ...prev,
              ...(msg.payload as StoreBrandingSettings),
            }));
          } else if (msg.type === 'CONFIG_UPDATED' && msg.payload) {
            setGoogleConfig((prev) => ({
              ...prev,
              ...(msg.payload as PermanentGoogleConfig),
            }));
          }

          window.setTimeout(() => {
            isApplyingRemoteUpdateRef.current = false;
          }, 60);
        };
      }
    } catch {
      // ignore if BroadcastChannel fails
    }

    const handleStorageEvent = (e: StorageEvent) => {
      if (!e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue);
        setLastTwoWaySyncAt(new Date().toLocaleTimeString('id-ID'));
        if (e.key === PRODUCTS_STORAGE_KEY && Array.isArray(parsed)) {
          setProducts(parsed);
        } else if (e.key === CATEGORIES_STORAGE_KEY && Array.isArray(parsed)) {
          setCategories(parsed);
        } else if (e.key === ORDERS_STORAGE_KEY && Array.isArray(parsed)) {
          setOrders(parsed);
        } else if (e.key === STORE_BRANDING_KEY && parsed) {
          setStoreSettings((prev) => ({ ...prev, ...parsed }));
        } else if (e.key === GOOGLE_CONFIG_KEY && parsed) {
          setGoogleConfig((prev) => ({ ...prev, ...parsed }));
        }
      } catch {
        // ignore malformed external storage payload
      }
    };

    window.addEventListener('storage', handleStorageEvent);
    return () => {
      window.removeEventListener('storage', handleStorageEvent);
      try {
        channel?.close();
      } catch {
        // ignore
      }
    };
  }, [setCart, setCategories, setOrders, setProducts, setStoreSettings]);

  const pushToCloudDatabase = useCallback(
    async (
      payload: Record<string, unknown>,
      options?: { skipQueue?: boolean }
    ): Promise<Record<string, unknown> | null> => {
      const nowStr = new Date().toLocaleTimeString('id-ID');
      setLastTwoWaySyncAt(nowStr);

      inFlightMutationsRef.current += 1;
      lastMutationAtRef.current = Date.now();
      setTwoWaySyncStatus('syncing');

      const shouldQueueOnFail =
        !options?.skipQueue && payload.action !== 'syncAll';

      try {
        const res = await fetch('/api/cloud', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify(payload),
        });

        if (res.status === 503) {
          setIsCloudConfigured(false);
          setTwoWaySyncStatus('local_realtime');
          if (shouldQueueOnFail) enqueueOfflineSync(payload);
          return null;
        }

        if (!res.ok) {
          setTwoWaySyncStatus('local_realtime');
          if (shouldQueueOnFail && res.status !== 401 && res.status !== 403) {
            enqueueOfflineSync(payload);
          }
          return null;
        }

        const data = (await res.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;

        setIsCloudConfigured(true);
        const syncedTime = new Date().toLocaleTimeString('id-ID');
        setLastTwoWaySyncAt(syncedTime);
        setTwoWaySyncStatus('connected');

        if (data && typeof data.sheetUrl === 'string' && data.sheetUrl) {
          setGoogleConfig((prev) => {
            const updatedCfg = sanitizeGoogleConfig({
              ...prev,
              GOOGLE_SHEET_URL: data.sheetUrl as string,
              LAST_SYNCED: syncedTime,
            });
            googleConfigRef.current = updatedCfg;
            broadcastStateChange('CONFIG_UPDATED', updatedCfg);
            return updatedCfg;
          });
        } else {
          setGoogleConfig((prev) => {
            const updatedCfg = sanitizeGoogleConfig({
              ...prev,
              LAST_SYNCED: syncedTime,
            });
            googleConfigRef.current = updatedCfg;
            return updatedCfg;
          });
        }
        return data;
      } catch {
        setTwoWaySyncStatus('local_realtime');
        if (shouldQueueOnFail) enqueueOfflineSync(payload);
        return null;
      } finally {
        inFlightMutationsRef.current = Math.max(
          0,
          inFlightMutationsRef.current - 1
        );
        lastMutationAtRef.current = Date.now();
      }
    },
    [broadcastStateChange, enqueueOfflineSync]
  );

  const flushOfflineQueue = useCallback(async () => {
    if (isFlushingQueueRef.current || !isAuthenticated) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (offlineQueueRef.current.length === 0) return;

    isFlushingQueueRef.current = true;
    try {
      const remaining = [...offlineQueueRef.current];
      const syncedOrderIds: string[] = [];

      while (remaining.length > 0) {
        const nextItem = remaining[0];
        const res = await pushToCloudDatabase(nextItem.payload, {
          skipQueue: true,
        });
        if (!res) {
          break;
        }
        if (
          (nextItem.payload.action === 'addOrder' ||
            nextItem.payload.action === 'saveOrder') &&
          typeof nextItem.payload.orderId === 'string'
        ) {
          syncedOrderIds.push(nextItem.payload.orderId);
        }
        remaining.shift();
        persistOfflineQueue(remaining);
      }

      if (syncedOrderIds.length > 0) {
        setOrders((prev) => {
          const next = prev.map((o) =>
            syncedOrderIds.includes(o.orderId)
              ? { ...o, syncedToSheet: true }
              : o
          );
          latestStateRef.current.orders = next;
          safeSetLocalStorageJson(
            ORDERS_STORAGE_KEY,
            capOrdersForLocalStorage(next),
            notifyStorageError
          );
          return next;
        });
      }
    } finally {
      isFlushingQueueRef.current = false;
    }
  }, [
    isAuthenticated,
    notifyStorageError,
    persistOfflineQueue,
    pushToCloudDatabase,
    setOrders,
  ]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void flushOfflineQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [flushOfflineQueue]);

  const handleSyncAllToCloud = useCallback(async () => {
    const current = latestStateRef.current;
    const cleanSettings = sanitizeStoreSettings(current.storeSettings);
    broadcastStateChange('PRODUCTS_UPDATED', current.products);
    broadcastStateChange('CATEGORIES_UPDATED', current.categories);
    broadcastStateChange('ORDERS_UPDATED', current.orders);
    broadcastStateChange('SETTINGS_UPDATED', cleanSettings);

    await pushToCloudDatabase({
      action: 'syncAll',
      products: current.products,
      orders: current.orders,
      categories: current.categories,
      storeSettings: cleanSettings,
    });
  }, [pushToCloudDatabase, broadcastStateChange]);

  const applyRemoteDatabaseData = useCallback(
    (
      data: {
        initialized?: boolean;
        sheetUrl?: string;
        products?: ProductItem[];
        orders?: OrderRecord[];
        categories?: CategoryItem[];
        storeSettings?: Record<string, unknown>;
      },
      force = false
    ): boolean => {
      const syncedTime = new Date().toLocaleTimeString('id-ID');
      setLastTwoWaySyncAt(syncedTime);
      setTwoWaySyncStatus('connected');

      if (typeof data.sheetUrl === 'string' && data.sheetUrl) {
        setGoogleConfig((prev) => ({
          ...prev,
          GOOGLE_SHEET_URL: data.sheetUrl!,
          LAST_SYNCED: syncedTime,
        }));
      } else {
        setGoogleConfig((prev) => ({
          ...prev,
          LAST_SYNCED: syncedTime,
        }));
      }

      const remoteFingerprint = JSON.stringify({
        p: Array.isArray(data.products)
          ? data.products.map((p) => ({
              id: String(p.id || ''),
              name: String(p.name || ''),
              barcode: String(p.barcode || ''),
              price: normalizePriceToIdr(p.price),
              stock: Number(p.stock ?? 20),
              cat: p.categories,
              img: String(p.imageUrl || ''),
            }))
          : null,
        c: Array.isArray(data.categories) ? data.categories : null,
        o: Array.isArray(data.orders)
          ? data.orders.map((o) => ({ id: o.orderId, tot: o.total }))
          : null,
        s: data.storeSettings || null,
      });

      if (
        !force &&
        lastRemoteSheetFingerprintRef.current &&
        remoteFingerprint === lastRemoteSheetFingerprintRef.current
      ) {
        return true;
      }

      lastRemoteSheetFingerprintRef.current = remoteFingerprint;
      safeSetLocalStorage(
        SHEET_FINGERPRINT_KEY,
        remoteFingerprint,
        notifyStorageError
      );

      let baseCategories: CategoryItem[] =
        Array.isArray(data.categories) && data.categories.length > 0
          ? [...data.categories]
          : [{ id: 'hot', name: 'Populer', nameEn: 'Hot' }];

      if (!baseCategories.some((c) => c.id.toLowerCase() === 'hot')) {
        baseCategories = [
          { id: 'hot', name: 'Populer', nameEn: 'Hot' },
          ...baseCategories,
        ];
      }

      if (Array.isArray(data.products)) {
        const normalizedProducts = data.products.map(
          (p: ProductItem, idx: number) => {
            const rawCats =
              Array.isArray(p.categories) && p.categories.length > 0
                ? p.categories
                : ['hot'];

            const mappedCatIds: string[] = [];
            rawCats.forEach((rawCat) => {
              const trimmed = String(rawCat || '').trim();
              if (!trimmed) return;
              const lower = trimmed.toLowerCase();
              const existing = baseCategories.find(
                (c) =>
                  c.id.toLowerCase() === lower ||
                  c.name.toLowerCase() === lower ||
                  (c.nameEn && c.nameEn.toLowerCase() === lower)
              );
              if (existing) {
                if (!mappedCatIds.includes(existing.id)) {
                  mappedCatIds.push(existing.id);
                }
              } else {
                const newId =
                  trimmed
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '_')
                    .replace(/^_|_$/g, '') || `cat_${idx}`;
                const newCat: CategoryItem = {
                  id: newId,
                  name: trimmed,
                  nameEn: trimmed,
                };
                baseCategories.push(newCat);
                if (!mappedCatIds.includes(newId)) {
                  mappedCatIds.push(newId);
                }
              }
            });

            return {
              ...p,
              id: String(p.id || `prod-${idx + 1}`),
              name: String(p.name || `Produk ${idx + 1}`),
              barcode:
                p.barcode || `89910021${String(idx + 1).padStart(4, '0')}`,
              price: normalizePriceToIdr(p.price),
              categories: mappedCatIds.length > 0 ? mappedCatIds : ['hot'],
              stock:
                typeof p.stock === 'number' && !Number.isNaN(p.stock)
                  ? p.stock
                  : 20,
              lowStockThreshold:
                typeof p.lowStockThreshold === 'number' &&
                !Number.isNaN(p.lowStockThreshold)
                  ? p.lowStockThreshold
                  : 5,
            };
          }
        );

        setProducts(normalizedProducts);
        safeSetLocalStorageJson(
          PRODUCTS_STORAGE_KEY,
          normalizedProducts,
          notifyStorageError
        );
        setCart((prev) =>
          prev
            .map((c) => {
              const updatedProd = normalizedProducts.find(
                (p) => p.id === c.product.id
              );
              return updatedProd ? { ...c, product: updatedProd } : c;
            })
            .filter((c) =>
              normalizedProducts.some((p) => p.id === c.product.id)
            )
        );
      }

      if (
        (Array.isArray(data.categories) && data.categories.length > 0) ||
        Array.isArray(data.products)
      ) {
        setCategories(baseCategories);
        safeSetLocalStorageJson(
          CATEGORIES_STORAGE_KEY,
          baseCategories,
          notifyStorageError
        );
      }

      if (Array.isArray(data.orders)) {
        setOrders(data.orders);
        safeSetLocalStorageJson(
          ORDERS_STORAGE_KEY,
          capOrdersForLocalStorage(data.orders),
          notifyStorageError
        );
      }

      if (
        data.storeSettings &&
        typeof data.storeSettings.storeName === 'string' &&
        data.storeSettings.storeName
      ) {
        setStoreSettings((prev) => {
          const next = sanitizeStoreSettings({
            ...prev,
            ...(data.storeSettings as Partial<StoreBrandingSettings>),
          });
          safeSetLocalStorageJson(
            STORE_BRANDING_KEY,
            next,
            notifyStorageError
          );
          return next;
        });
      }

      return (
        Array.isArray(data.products) ||
        Array.isArray(data.categories) ||
        Array.isArray(data.orders)
      );
    },
    [
      notifyStorageError,
      setCart,
      setCategories,
      setOrders,
      setProducts,
      setStoreSettings,
    ]
  );

  const handleSyncTwoWay = useCallback(
    async (
      force = false
    ): Promise<{ ok: boolean; pulledFromSheet: boolean; error?: string }> => {
      if (
        !force &&
        (inFlightMutationsRef.current > 0 ||
          Date.now() - lastMutationAtRef.current < 12000)
      ) {
        return { ok: true, pulledFromSheet: false };
      }

      setTwoWaySyncStatus('syncing');
      try {
        const res = await fetch('/api/cloud', {
          method: 'GET',
          credentials: 'include',
        });

        if (res.status === 503) {
          setIsCloudConfigured(false);
          setTwoWaySyncStatus('local_realtime');
          return {
            ok: false,
            pulledFromSheet: false,
            error:
              'APPS_SCRIPT_URL atau APPS_SCRIPT_TOKEN belum dikonfigurasi di server environment.',
          };
        }

        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setTwoWaySyncStatus('local_realtime');
          return {
            ok: false,
            pulledFromSheet: false,
            error:
              errBody.error ||
              'Gagal membaca data dari /api/cloud. Periksa koneksi & token Apps Script.',
          };
        }

        const remoteData = (await res.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;

        setIsCloudConfigured(true);
        if (remoteData && typeof remoteData === 'object') {
          const applied = applyRemoteDatabaseData(
            remoteData as Parameters<typeof applyRemoteDatabaseData>[0],
            force
          );
          return { ok: true, pulledFromSheet: applied };
        }

        setTwoWaySyncStatus('connected');
        return { ok: true, pulledFromSheet: false };
      } catch {
        setTwoWaySyncStatus('local_realtime');
        return {
          ok: false,
          pulledFromSheet: false,
          error: 'Gagal menghubungi server proxy /api/cloud.',
        };
      }
    },
    [applyRemoteDatabaseData]
  );

  const handleConnectOrUpdateDatabaseConfig = useCallback(
    async (
      newCfg: PermanentGoogleConfig
    ): Promise<{ ok: boolean; pulledFromSheet: boolean; error?: string }> => {
      const cleanCfg = sanitizeGoogleConfig(newCfg);
      googleConfigRef.current = cleanCfg;
      setGoogleConfig(cleanCfg);
      lastRemoteSheetFingerprintRef.current = '';
      safeRemoveLocalStorage(SHEET_FINGERPRINT_KEY, notifyStorageError);
      safeSetLocalStorageJson(GOOGLE_CONFIG_KEY, cleanCfg, notifyStorageError);
      broadcastStateChange('CONFIG_UPDATED', cleanCfg);
      await persistStateToServer({ googleConfig: cleanCfg });

      const result = await handleSyncTwoWay(true);
      await persistStateToServer({
        googleConfig: googleConfigRef.current,
        storeSettings: sanitizeStoreSettings(
          latestStateRef.current.storeSettings
        ),
        categories: latestStateRef.current.categories,
        products: latestStateRef.current.products,
        orders: capOrdersForLocalStorage(latestStateRef.current.orders),
      });
      return result;
    },
    [
      broadcastStateChange,
      persistStateToServer,
      handleSyncTwoWay,
      notifyStorageError,
    ]
  );

  // Hydrate persisted state from Server (/api/state) once authenticated, then start 2-Way Sync
  useEffect(() => {
    if (!isAuthenticated) {
      hasHydratedServerRef.current = false;
      return;
    }

    let cancelled = false;

    const bootstrapFromServerAndSheet = async () => {
      const activeCfg = googleConfigRef.current;

      try {
        const statusRes = await fetch('/api/cloud?mode=status', {
          method: 'GET',
          credentials: 'include',
        });
        if (statusRes.ok && !cancelled) {
          const statusData = (await statusRes.json().catch(() => ({}))) as {
            configured?: boolean;
          };
          setIsCloudConfigured(Boolean(statusData.configured));
        }
      } catch {
        // ignore status probe failure
      }

      try {
        const res = await fetch('/api/state', { credentials: 'include' });
        if (res.ok && !cancelled) {
          const payload = (await res.json()) as {
            hasSavedState?: boolean;
            state?: {
              googleConfig?: PermanentGoogleConfig;
              storeSettings?: Partial<StoreBrandingSettings>;
              categories?: CategoryItem[];
              products?: ProductItem[];
              orders?: OrderRecord[];
            } | null;
          };

          if (payload.hasSavedState && payload.state) {
            const s = payload.state;
            if (s.googleConfig) {
              const mergedCfg = sanitizeGoogleConfig(s.googleConfig);
              googleConfigRef.current = mergedCfg;
              setGoogleConfig(mergedCfg);
              safeSetLocalStorageJson(
                GOOGLE_CONFIG_KEY,
                mergedCfg,
                notifyStorageError
              );
            }
            if (s.storeSettings) {
              setStoreSettings((prev) => {
                const next = sanitizeStoreSettings({
                  ...prev,
                  ...s.storeSettings,
                });
                latestStateRef.current.storeSettings = next;
                return next;
              });
            }
            if (Array.isArray(s.categories) && s.categories.length > 0) {
              setCategories(s.categories);
              latestStateRef.current.categories = s.categories;
            }
            if (Array.isArray(s.products)) {
              setProducts(s.products);
              latestStateRef.current.products = s.products;
            }
            if (Array.isArray(s.orders)) {
              setOrders(s.orders);
              latestStateRef.current.orders = s.orders;
            }
          } else if (isDatabaseConfigured(activeCfg)) {
            await persistStateToServer({
              googleConfig: sanitizeGoogleConfig(activeCfg),
              storeSettings: sanitizeStoreSettings(
                latestStateRef.current.storeSettings
              ),
              categories: latestStateRef.current.categories,
              products: latestStateRef.current.products,
              orders: capOrdersForLocalStorage(latestStateRef.current.orders),
            });
          }
        }
      } catch {
        // ignore if server endpoint is unavailable
      } finally {
        hasHydratedServerRef.current = true;
      }

      if (!cancelled) {
        await flushOfflineQueue();
        await handleSyncTwoWay(true);
      }
    };

    void bootstrapFromServerAndSheet();

    const intervalId = window.setInterval(() => {
      void flushOfflineQueue().then(() => handleSyncTwoWay(false));
    }, 8000);

    const handleWindowFocus = () => {
      void flushOfflineQueue().then(() => handleSyncTwoWay(false));
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void flushOfflineQueue().then(() => handleSyncTwoWay(false));
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    isAuthenticated,
    flushOfflineQueue,
    handleSyncTwoWay,
    persistStateToServer,
    notifyStorageError,
    setCategories,
    setOrders,
    setProducts,
    setStoreSettings,
  ]);

  return {
    googleConfig,
    isCloudConfigured,
    isDbConfigured,
    twoWaySyncStatus,
    lastTwoWaySyncAt,
    offlineQueueCount,
    isOnline,
    latestStateRef,
    lastMutationAtRef,
    broadcastStateChange,
    pushToCloudDatabase,
    flushOfflineQueue,
    handleSyncTwoWay,
    handleSyncAllToCloud,
    handleConnectOrUpdateDatabaseConfig,
  };
}
