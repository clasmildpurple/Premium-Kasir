import { describe, expect, it } from 'vitest';
import {
  calculateOrderTotals,
  deductStockForOrder,
  generateOrderId,
  restoreStockForOrder,
} from './posCalculations';
import {
  MAX_LOCAL_ORDERS,
  capOrdersForLocalStorage,
  isOrdersApproachingLocalLimit,
} from './storage';
import { OrderRecord, ProductItem } from '../data/posData';

function makeProduct(overrides: Partial<ProductItem>): ProductItem {
  return {
    id: 'prod-1',
    name: 'Kopi Susu',
    barcode: '899100210001',
    price: 20000,
    categories: ['coffee'],
    popularity: 95,
    imageUrl: 'https://example.com/coffee.png',
    stock: 10,
    lowStockThreshold: 3,
    ...overrides,
  };
}

describe('calculateOrderTotals', () => {
  it('computes subtotal, tax, total, and item count accurately when tax is enabled', () => {
    const result = calculateOrderTotals(
      [
        { price: 25000, quantity: 2 },
        { price: 15000, quantity: 1 },
      ],
      true,
      10
    );

    expect(result.subTotal).toBe(65000);
    expect(result.taxPbf).toBe(6500);
    expect(result.total).toBe(71500);
    expect(result.totalItemsCount).toBe(3);
  });

  it('returns zero tax when taxEnabled is false', () => {
    const result = calculateOrderTotals(
      [{ price: 18500, quantity: 3 }],
      false,
      11
    );

    expect(result.subTotal).toBe(55500);
    expect(result.taxPbf).toBe(0);
    expect(result.total).toBe(55500);
    expect(result.totalItemsCount).toBe(3);
  });

  it('rounds fractional tax cleanly to nearest IDR integer', () => {
    const result = calculateOrderTotals(
      [{ price: 12345, quantity: 1 }],
      true,
      5
    );

    expect(result.subTotal).toBe(12345);
    expect(result.taxPbf).toBe(617);
    expect(result.total).toBe(12962);
  });
});

describe('stock deduction and restoration', () => {
  it('deducts stock per item and clamps at zero', () => {
    const products = [
      makeProduct({ id: 'p1', stock: 8 }),
      makeProduct({ id: 'p2', stock: 2 }),
      makeProduct({ id: 'p3', stock: 5 }),
    ];

    const deducted = deductStockForOrder(products, [
      { id: 'p1', quantity: 3 },
      { id: 'p2', quantity: 5 },
    ]);

    expect(deducted.find((p) => p.id === 'p1')?.stock).toBe(5);
    expect(deducted.find((p) => p.id === 'p2')?.stock).toBe(0);
    expect(deducted.find((p) => p.id === 'p3')?.stock).toBe(5);
  });

  it('restores stock accurately when an order is deleted', () => {
    const products = [
      makeProduct({ id: 'p1', stock: 5 }),
      makeProduct({ id: 'p2', stock: 0 }),
    ];

    const restored = restoreStockForOrder(products, [
      { id: 'p1', quantity: 3 },
      { id: 'p2', quantity: 2 },
    ]);

    expect(restored.find((p) => p.id === 'p1')?.stock).toBe(8);
    expect(restored.find((p) => p.id === 'p2')?.stock).toBe(2);
  });
});

describe('generateOrderId', () => {
  it('follows ORD-<yyyyMMddHHmmss>-<4 UUID chars> format', () => {
    const fixedDate = new Date(2026, 10, 24, 9, 5, 3); // 2026-11-24 09:05:03
    const id = generateOrderId(fixedDate);

    expect(id).toMatch(/^ORD-20261124090503-[A-Z0-9]{4}$/);
  });

  it('produces unique order IDs across repeated calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateOrderId()));
    expect(ids.size).toBe(50);
  });
});

describe('local order history capping', () => {
  it('caps cached orders to MAX_LOCAL_ORDERS (500) newest records', () => {
    const manyOrders: OrderRecord[] = Array.from({ length: 540 }, (_, idx) => ({
      orderId: `ORD-${idx}`,
      createdAt: '2026-11-24',
      items: [],
      subTotal: 1000,
      taxPbf: 50,
      total: 1050,
    }));

    const capped = capOrdersForLocalStorage(manyOrders);
    expect(capped).toHaveLength(MAX_LOCAL_ORDERS);
    expect(capped[0].orderId).toBe('ORD-0');
    expect(capped[499].orderId).toBe('ORD-499');
    expect(isOrdersApproachingLocalLimit(450)).toBe(true);
    expect(isOrdersApproachingLocalLimit(449)).toBe(false);
  });
});
