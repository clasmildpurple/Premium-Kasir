import { OrderRecord, ProductItem } from '../data/posData';

export interface OrderLineInput {
  price: number;
  quantity: number;
}

export interface OrderTotals {
  subTotal: number;
  taxPbf: number;
  total: number;
  totalItemsCount: number;
}

/**
 * Generates collision-resistant order IDs: ORD-<yyyyMMddHHmmss>-<4 random chars>
 */
export function generateOrderId(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = now.getFullYear();
  const MM = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const HH = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());

  const uuidRaw =
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(16).slice(2, 10);

  const suffix = uuidRaw.slice(0, 4).toUpperCase();
  return `ORD-${yyyy}${MM}${dd}${HH}${mm}${ss}-${suffix}`;
}

/**
 * Calculates subtotal, tax amount, grand total, and item count in IDR.
 */
export function calculateOrderTotals(
  items: OrderLineInput[],
  taxEnabled: boolean,
  taxRate: number
): OrderTotals {
  const subTotal = Math.round(
    items.reduce(
      (sum, item) => sum + Math.max(0, item.price) * Math.max(0, item.quantity),
      0
    )
  );
  const effectiveRate = taxEnabled ? Math.max(0, Number(taxRate) || 0) : 0;
  const taxPbf = Math.round(subTotal * (effectiveRate / 100));
  const total = subTotal + taxPbf;
  const totalItemsCount = items.reduce(
    (sum, item) => sum + Math.max(0, item.quantity),
    0
  );
  return { subTotal, taxPbf, total, totalItemsCount };
}

/**
 * Deducts purchased item quantities from product inventory (clamped at 0).
 */
export function deductStockForOrder(
  products: ProductItem[],
  items: Pick<OrderRecord['items'][number], 'id' | 'quantity'>[]
): ProductItem[] {
  const qtyById = new Map<string, number>();
  for (const item of items) {
    const prev = qtyById.get(item.id) ?? 0;
    qtyById.set(item.id, prev + Math.max(0, Number(item.quantity) || 0));
  }

  return products.map((prod) => {
    const qty = qtyById.get(prod.id);
    if (!qty) return prod;
    return {
      ...prod,
      stock: Math.max(0, (prod.stock ?? 20) - qty),
    };
  });
}

/**
 * Restores product inventory when an order is voided/deleted.
 */
export function restoreStockForOrder(
  products: ProductItem[],
  items: Pick<OrderRecord['items'][number], 'id' | 'quantity'>[]
): ProductItem[] {
  const qtyById = new Map<string, number>();
  for (const item of items) {
    const prev = qtyById.get(item.id) ?? 0;
    qtyById.set(item.id, prev + Math.max(0, Number(item.quantity) || 0));
  }

  return products.map((prod) => {
    const qty = qtyById.get(prod.id);
    if (!qty) return prod;
    return {
      ...prod,
      stock: Math.max(0, (prod.stock ?? 0) + qty),
    };
  });
}
