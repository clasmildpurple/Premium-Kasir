import React, { useCallback, useMemo, useState } from 'react';
import {
  CartItem,
  OrderRecord,
  ProductItem,
} from '../data/posData';
import { StoreBrandingSettings, TRANSLATIONS } from '../data/i18nAndSettings';
import { printThermalReceiptNow } from '../components/PrintModals';
import {
  calculateOrderTotals,
  deductStockForOrder,
  generateOrderId,
  restoreStockForOrder,
} from '../utils/posCalculations';
import {
  ORDERS_STORAGE_KEY,
  PRODUCTS_STORAGE_KEY,
  capOrdersForLocalStorage,
  safeSetLocalStorageJson,
} from '../utils/storage';

export type PaymentMethodId = 'cash' | 'qris' | 'debit' | 'transfer';

export interface UseOrdersParams {
  setProducts: React.Dispatch<React.SetStateAction<ProductItem[]>>;
  setOrders: React.Dispatch<React.SetStateAction<OrderRecord[]>>;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  storeSettings: StoreBrandingSettings;
  cashierName: string;
  isId: boolean;
  t: (typeof TRANSLATIONS)['id'];
  lastMutationAtRef: React.MutableRefObject<number>;
  latestStateRef: React.MutableRefObject<{
    products: ProductItem[];
    orders: OrderRecord[];
  }>;
  broadcastStateChange: (type: string, payload: unknown) => void;
  pushToCloudDatabase: (
    payload: Record<string, unknown>,
    options?: { skipQueue?: boolean }
  ) => Promise<Record<string, unknown> | null>;
  setActionLoadingText: React.Dispatch<React.SetStateAction<string | null>>;
  notifyStorageError: (message: string) => void;
  setMobileFullscreenCartOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useOrders({
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
}: UseOrdersParams) {
  const [customerName, setCustomerName] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>('cash');
  const [orderSuccess, setOrderSuccess] = useState<boolean>(false);
  const [lastCompletedOrder, setLastCompletedOrder] =
    useState<OrderRecord | null>(null);
  const [isChargingOrder, setIsChargingOrder] = useState<boolean>(false);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const activeTaxRate =
    storeSettings.taxEnabled !== false ? (storeSettings.taxRate ?? 5) : 0;
  const activeTaxLabel = `${storeSettings.taxName || 'PBF'} (${activeTaxRate}%)`;

  const {
    subTotal,
    taxPbf,
    total: totalAmount,
    totalItemsCount,
  } = useMemo(
    () =>
      calculateOrderTotals(
        cart.map((item) => ({
          price: item.product.price,
          quantity: item.quantity,
        })),
        storeSettings.taxEnabled !== false,
        storeSettings.taxRate ?? 5
      ),
    [cart, storeSettings.taxEnabled, storeSettings.taxRate]
  );

  const handleAddToCart = useCallback((product: ProductItem) => {
    if (product.stock <= 0) return;
    setJustAddedId(product.id);
    setTimeout(() => setJustAddedId(null), 260);

    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.product.id === product.id
      );
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + 1,
        };
        return updated;
      }
      return [...prev, { product, quantity: 1 }];
    });
  }, [setCart]);

  const handleRemoveFromCart = useCallback(
    (productId: string) => {
      setRemovingItemId(productId);
      setTimeout(() => {
        setCart((prev) => prev.filter((item) => item.product.id !== productId));
        setRemovingItemId(null);
      }, 240);
    },
    [setCart]
  );

  const handleUpdateQuantity = useCallback(
    (productId: string, delta: number) => {
      const target = cart.find((c) => c.product.id === productId);
      if (!target) return;

      if (target.quantity + delta <= 0) {
        handleRemoveFromCart(productId);
        return;
      }

      setCart((prev) =>
        prev.map((item) =>
          item.product.id === productId
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
      );
    },
    [cart, handleRemoveFromCart, setCart]
  );

  const handleClearCart = useCallback(() => {
    setCart([]);
    setCustomerName('');
  }, [setCart]);

  const handleChargeOrder = useCallback(async () => {
    if (cart.length === 0 || isChargingOrder) return;
    setIsChargingOrder(true);
    setActionLoadingText(
      isId
        ? 'Memproses pembayaran & menyimpan transaksi...'
        : 'Processing payment & saving transaction...'
    );

    try {
      const trimmedCustomer = customerName.trim();
      const paymentMethodMap: Record<PaymentMethodId, string> = {
        cash: t.payCash,
        qris: t.payQris,
        debit: t.payCard,
        transfer: t.payTransfer,
      };
      const selectedPaymentLabel = paymentMethodMap[paymentMethod] || t.payCash;

      const orderItems = cart.map((item) => ({
        id: item.product.id,
        name: item.product.name,
        price: item.product.price,
        quantity: item.quantity,
        subtotal: Math.round(item.product.price * item.quantity),
      }));

      const newOrder: OrderRecord = {
        orderId: generateOrderId(),
        createdAt: new Date().toLocaleString('id-ID'),
        cashierName,
        ...(trimmedCustomer ? { customerName: trimmedCustomer } : {}),
        paymentMethod: selectedPaymentLabel,
        items: orderItems,
        subTotal: Math.round(subTotal),
        taxPbf: Math.round(taxPbf),
        total: Math.round(totalAmount),
        syncedToSheet: true,
      };

      lastMutationAtRef.current = Date.now();
      const updatedProducts = deductStockForOrder(
        latestStateRef.current.products,
        orderItems
      );
      const updatedOrders = [newOrder, ...latestStateRef.current.orders];

      setProducts(updatedProducts);
      setOrders(updatedOrders);
      latestStateRef.current.products = updatedProducts;
      latestStateRef.current.orders = updatedOrders;
      safeSetLocalStorageJson(
        PRODUCTS_STORAGE_KEY,
        updatedProducts,
        notifyStorageError
      );
      safeSetLocalStorageJson(
        ORDERS_STORAGE_KEY,
        capOrdersForLocalStorage(updatedOrders),
        notifyStorageError
      );
      broadcastStateChange('PRODUCTS_UPDATED', updatedProducts);
      broadcastStateChange('ORDERS_UPDATED', updatedOrders);

      await new Promise((r) => setTimeout(r, 420));

      setLastCompletedOrder(newOrder);
      setOrderSuccess(true);
      setMobileFullscreenCartOpen(false);
      setCart([]);
      setCustomerName('');

      printThermalReceiptNow(newOrder, storeSettings, cashierName, '80mm');

      const resp = await pushToCloudDatabase({
        action: 'addOrder',
        ...newOrder,
      });

      if (!resp) {
        setOrders((prev) => {
          const next = prev.map((o) =>
            o.orderId === newOrder.orderId ? { ...o, syncedToSheet: false } : o
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
      setIsChargingOrder(false);
      setActionLoadingText(null);
    }
  }, [
    broadcastStateChange,
    cart,
    cashierName,
    customerName,
    isChargingOrder,
    isId,
    lastMutationAtRef,
    latestStateRef,
    notifyStorageError,
    paymentMethod,
    pushToCloudDatabase,
    setActionLoadingText,
    setCart,
    setMobileFullscreenCartOpen,
    setOrders,
    setProducts,
    storeSettings,
    subTotal,
    t,
    taxPbf,
    totalAmount,
  ]);

  const handleDeleteOrder = useCallback(
    async (orderId: string) => {
      if (deletingOrderId) return;
      setDeletingOrderId(orderId);
      setActionLoadingText(
        isId
          ? `Menghapus transaksi ${orderId} & mengembalikan stok...`
          : `Deleting transaction ${orderId} & restoring stock...`
      );
      try {
        lastMutationAtRef.current = Date.now();
        const deletedOrder = latestStateRef.current.orders.find(
          (o) => o.orderId === orderId
        );
        const restoredProducts = deletedOrder
          ? restoreStockForOrder(
              latestStateRef.current.products,
              deletedOrder.items
            )
          : latestStateRef.current.products;
        const nextOrders = latestStateRef.current.orders.filter(
          (o) => o.orderId !== orderId
        );

        setProducts(restoredProducts);
        setOrders(nextOrders);
        latestStateRef.current.products = restoredProducts;
        latestStateRef.current.orders = nextOrders;
        safeSetLocalStorageJson(
          PRODUCTS_STORAGE_KEY,
          restoredProducts,
          notifyStorageError
        );
        safeSetLocalStorageJson(
          ORDERS_STORAGE_KEY,
          capOrdersForLocalStorage(nextOrders),
          notifyStorageError
        );
        broadcastStateChange('PRODUCTS_UPDATED', restoredProducts);
        broadcastStateChange('ORDERS_UPDATED', nextOrders);

        await Promise.all([
          pushToCloudDatabase({
            action: 'deleteOrder',
            orderId,
            items: deletedOrder?.items ?? [],
          }),
          new Promise((r) => setTimeout(r, 450)),
        ]);
      } finally {
        setDeletingOrderId(null);
        setActionLoadingText(null);
      }
    },
    [
      broadcastStateChange,
      deletingOrderId,
      isId,
      lastMutationAtRef,
      latestStateRef,
      notifyStorageError,
      pushToCloudDatabase,
      setActionLoadingText,
      setOrders,
      setProducts,
    ]
  );

  return {
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
  };
}
