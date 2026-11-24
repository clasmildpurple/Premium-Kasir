import React, { useCallback, useMemo } from 'react';
import {
  CartItem,
  CategoryId,
  CategoryItem,
  ProductItem,
} from '../data/posData';
import {
  CATEGORIES_STORAGE_KEY,
  PRODUCTS_STORAGE_KEY,
  safeSetLocalStorageJson,
} from '../utils/storage';

export interface UseProductsParams {
  products: ProductItem[];
  setProducts: React.Dispatch<React.SetStateAction<ProductItem[]>>;
  categories: CategoryItem[];
  setCategories: React.Dispatch<React.SetStateAction<CategoryItem[]>>;
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  activeCategory: CategoryId;
  setActiveCategory: React.Dispatch<React.SetStateAction<CategoryId>>;
  isId: boolean;
  lastMutationAtRef: React.MutableRefObject<number>;
  latestStateRef: React.MutableRefObject<{
    products: ProductItem[];
    categories: CategoryItem[];
  }>;
  broadcastStateChange: (type: string, payload: unknown) => void;
  pushToCloudDatabase: (
    payload: Record<string, unknown>,
    options?: { skipQueue?: boolean }
  ) => Promise<Record<string, unknown> | null>;
  setActionLoadingText: React.Dispatch<React.SetStateAction<string | null>>;
  notifyStorageError: (message: string) => void;
}

export function useProducts({
  products,
  setProducts,
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
}: UseProductsParams) {
  const lowStockProducts = useMemo(
    () =>
      products.filter(
        (p) => (p.stock ?? 0) <= (p.lowStockThreshold ?? 5)
      ),
    [products]
  );

  const handleUpdateCategories = useCallback(
    async (newCategories: CategoryItem[]) => {
      setActionLoadingText(
        isId ? 'Menyimpan perubahan kategori...' : 'Saving categories...'
      );
      try {
        lastMutationAtRef.current = Date.now();
        setCategories(newCategories);
        latestStateRef.current.categories = newCategories;
        safeSetLocalStorageJson(
          CATEGORIES_STORAGE_KEY,
          newCategories,
          notifyStorageError
        );
        broadcastStateChange('CATEGORIES_UPDATED', newCategories);
        if (!newCategories.some((c) => c.id === activeCategory)) {
          setActiveCategory(newCategories[0]?.id || 'hot');
        }
        await Promise.all([
          pushToCloudDatabase({
            action: 'saveCategories',
            categories: newCategories,
          }),
          new Promise((r) => setTimeout(r, 450)),
        ]);
      } finally {
        setActionLoadingText(null);
      }
    },
    [
      activeCategory,
      broadcastStateChange,
      isId,
      lastMutationAtRef,
      latestStateRef,
      notifyStorageError,
      pushToCloudDatabase,
      setActionLoadingText,
      setActiveCategory,
      setCategories,
    ]
  );

  const handleUpsertProduct = useCallback(
    async (
      productPayload: ProductItem,
      base64Image?: { data: string; name: string; mime: string }
    ) => {
      const currentProducts = latestStateRef.current.products;
      const exists = currentProducts.some((p) => p.id === productPayload.id);
      setActionLoadingText(
        exists
          ? isId
            ? `Menyimpan perubahan "${productPayload.name}"...`
            : `Saving changes to "${productPayload.name}"...`
          : isId
          ? `Menambahkan produk "${productPayload.name}"...`
          : `Adding product "${productPayload.name}"...`
      );
      try {
        lastMutationAtRef.current = Date.now();
        const updatedProducts = exists
          ? currentProducts.map((p) =>
              p.id === productPayload.id ? productPayload : p
            )
          : [productPayload, ...currentProducts];

        setProducts(updatedProducts);
        latestStateRef.current.products = updatedProducts;
        safeSetLocalStorageJson(
          PRODUCTS_STORAGE_KEY,
          updatedProducts,
          notifyStorageError
        );
        broadcastStateChange('PRODUCTS_UPDATED', updatedProducts);

        setCart((prev) =>
          prev.map((c) =>
            c.product.id === productPayload.id
              ? { ...c, product: productPayload }
              : c
          )
        );

        const [resp] = await Promise.all([
          pushToCloudDatabase({
            action: 'upsertProduct',
            ...productPayload,
            base64Data: base64Image?.data,
            fileName: base64Image?.name,
            mimeType: base64Image?.mime,
          }),
          new Promise((r) => setTimeout(r, 450)),
        ]);

        if (resp && typeof resp.imageUrl === 'string' && resp.imageUrl) {
          const driveSyncedProduct: ProductItem = {
            ...productPayload,
            imageUrl: resp.imageUrl,
            driveFileId:
              typeof resp.driveFileId === 'string'
                ? resp.driveFileId
                : productPayload.driveFileId,
          };
          const finalProducts = updatedProducts.map((p) =>
            p.id === driveSyncedProduct.id ? driveSyncedProduct : p
          );
          setProducts(finalProducts);
          latestStateRef.current.products = finalProducts;
          safeSetLocalStorageJson(
            PRODUCTS_STORAGE_KEY,
            finalProducts,
            notifyStorageError
          );
          broadcastStateChange('PRODUCTS_UPDATED', finalProducts);
        }
      } finally {
        setActionLoadingText(null);
      }
    },
    [
      broadcastStateChange,
      isId,
      lastMutationAtRef,
      latestStateRef,
      notifyStorageError,
      pushToCloudDatabase,
      setActionLoadingText,
      setCart,
      setProducts,
    ]
  );

  const handleDeleteProduct = useCallback(
    async (productId: string) => {
      const deletedTarget = latestStateRef.current.products.find(
        (p) => p.id === productId
      );
      setActionLoadingText(
        isId
          ? `Menghapus produk "${deletedTarget?.name || ''}"...`
          : `Deleting product "${deletedTarget?.name || ''}"...`
      );
      try {
        lastMutationAtRef.current = Date.now();
        const nextProducts = latestStateRef.current.products.filter(
          (p) => p.id !== productId
        );
        setProducts(nextProducts);
        latestStateRef.current.products = nextProducts;
        safeSetLocalStorageJson(
          PRODUCTS_STORAGE_KEY,
          nextProducts,
          notifyStorageError
        );
        broadcastStateChange('PRODUCTS_UPDATED', nextProducts);
        setCart((prev) => prev.filter((c) => c.product.id !== productId));

        await Promise.all([
          pushToCloudDatabase({
            action: 'deleteProduct',
            id: productId,
            name: deletedTarget?.name,
          }),
          new Promise((r) => setTimeout(r, 450)),
        ]);
      } finally {
        setActionLoadingText(null);
      }
    },
    [
      broadcastStateChange,
      isId,
      lastMutationAtRef,
      latestStateRef,
      notifyStorageError,
      pushToCloudDatabase,
      setActionLoadingText,
      setCart,
      setProducts,
    ]
  );

  return {
    lowStockProducts,
    handleUpdateCategories,
    handleUpsertProduct,
    handleDeleteProduct,
  };
}
