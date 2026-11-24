import React from 'react';
import {
  Banknote,
  CreditCard,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Printer,
  QrCode,
  ShoppingBag,
  SquarePen,
  Trash2,
  User,
  Wallet,
  X,
} from 'lucide-react';
import {
  CartItem,
  OrderRecord,
  formatRupiah,
  resolveGoogleDriveImageUrl,
} from '../data/posData';
import { TRANSLATIONS } from '../data/i18nAndSettings';
import { PaymentMethodId } from '../hooks/useOrders';

export interface CartPanelProps {
  cart: CartItem[];
  customerName: string;
  onChangeCustomerName: (name: string) => void;
  paymentMethod: PaymentMethodId;
  onChangePaymentMethod: (method: PaymentMethodId) => void;
  subTotal: number;
  taxPbf: number;
  totalAmount: number;
  totalItemsCount: number;
  activeTaxLabel: string;
  removingItemId: string | null;
  isChargingOrder: boolean;
  mobileFullscreenCartOpen: boolean;
  onSetMobileFullscreenCartOpen: (open: boolean) => void;
  isSidebarHidden: boolean;
  primaryColor: string;
  cashierName: string;
  isId: boolean;
  t: (typeof TRANSLATIONS)['id'];
  onUpdateQuantity: (productId: string, delta: number) => void;
  onRemoveFromCart: (productId: string) => void;
  onClearCart: () => void;
  onChargeOrder: () => void;
  onPreviewReceipt: (order: OrderRecord) => void;
}

export const CartPanel: React.FC<CartPanelProps> = ({
  cart,
  customerName,
  onChangeCustomerName,
  paymentMethod,
  onChangePaymentMethod,
  subTotal,
  taxPbf,
  totalAmount,
  totalItemsCount,
  activeTaxLabel,
  removingItemId,
  isChargingOrder,
  mobileFullscreenCartOpen,
  onSetMobileFullscreenCartOpen,
  isSidebarHidden,
  primaryColor,
  cashierName,
  isId,
  t,
  onUpdateQuantity,
  onRemoveFromCart,
  onClearCart,
  onChargeOrder,
  onPreviewReceipt,
}) => {
  return (
    <>
      {mobileFullscreenCartOpen && (
        <div
          onClick={() => onSetMobileFullscreenCartOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/45 backdrop-blur-xs lg:hidden animate-modal-backdrop"
        />
      )}

      <aside
        className={`${
          mobileFullscreenCartOpen
            ? 'fixed inset-x-0 bottom-0 top-10 sm:top-0 sm:left-auto sm:w-[390px] md:w-[410px] z-50 flex rounded-t-[26px] sm:rounded-none shadow-2xl animate-fullscreen-cart'
            : 'hidden lg:flex lg:w-[310px] xl:w-[350px] 2xl:w-[380px] animate-order-panel-slide'
        } bg-white border-l border-slate-100/80 flex-col justify-between p-4 sm:p-5 xl:p-6 shrink-0 transition-all duration-300`}
      >
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3.5 sm:mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-base xl:text-lg font-extrabold text-[#2D3748] tracking-tight">
                {t.orderMenuTitle}
              </h2>
              {totalItemsCount > 0 && (
                <span
                  style={{
                    backgroundColor: `${primaryColor}15`,
                    color: primaryColor,
                  }}
                  className="px-2 py-0.5 rounded-full text-[11px] font-extrabold tabular-nums"
                >
                  {totalItemsCount} item
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => {
                  if (cart.length === 0) return;
                  const paymentMethodMap: Record<PaymentMethodId, string> = {
                    cash: t.payCash,
                    qris: t.payQris,
                    debit: t.payCard,
                    transfer: t.payTransfer,
                  };
                  onPreviewReceipt({
                    orderId: 'PREVIEW-DRAFT',
                    createdAt: new Date().toLocaleString('id-ID'),
                    cashierName,
                    ...(customerName.trim()
                      ? { customerName: customerName.trim() }
                      : {}),
                    paymentMethod: paymentMethodMap[paymentMethod] || t.payCash,
                    items: cart.map((item) => ({
                      id: item.product.id,
                      name: item.product.name,
                      price: item.product.price,
                      quantity: item.quantity,
                      subtotal: Math.round(item.product.price * item.quantity),
                    })),
                    subTotal: Math.round(subTotal),
                    taxPbf: Math.round(taxPbf),
                    total: Math.round(totalAmount),
                  });
                }}
                title={
                  isId
                    ? 'Pratinjau Struk / Faktur Sebelum Bayar'
                    : 'Preview Receipt / Invoice Before Charge'
                }
                className="h-8 px-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 disabled:opacity-40 flex items-center gap-1 text-[11px] font-bold transition-colors cursor-pointer"
              >
                <Printer
                  className="w-3.5 h-3.5"
                  style={{ color: primaryColor }}
                />
                <span>{isId ? 'Pratinjau' : 'Preview'}</span>
              </button>
              <button
                type="button"
                onClick={onClearCart}
                disabled={cart.length === 0}
                title={t.clearOrder}
                className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 disabled:opacity-40 flex items-center justify-center transition-colors cursor-pointer"
              >
                <SquarePen className="w-3.5 h-3.5" />
              </button>
              {mobileFullscreenCartOpen && (
                <button
                  type="button"
                  onClick={() => onSetMobileFullscreenCartOpen(false)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 lg:hidden cursor-pointer"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>{t.closeFullscreenCartBtn}</span>
                </button>
              )}
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-[11px] font-bold text-slate-400 mb-1">
              {t.customerNameLabel}
            </label>
            <div className="relative">
              <User className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={customerName}
                onChange={(e) => onChangeCustomerName(e.target.value)}
                placeholder={t.customerNamePlaceholder}
                className="w-full bg-[#F8F9FA] border border-slate-200/80 rounded-xl pl-8.5 pr-7 py-2 text-xs font-semibold text-[#2D3748] placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:border-slate-300 transition-colors"
              />
              {customerName && (
                <button
                  type="button"
                  onClick={() => onChangeCustomerName('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title="Clear"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-3">
            {cart.length === 0 ? (
              <div className="h-44 sm:h-52 flex flex-col items-center justify-center text-center text-slate-400 px-4">
                <p className="text-sm font-semibold text-slate-500 mb-1">
                  {t.emptyCartTitle}
                </p>
                <p className="text-xs text-slate-400">{t.emptyCartDesc}</p>
              </div>
            ) : (
              cart.map((item) => {
                const isRemoving = removingItemId === item.product.id;
                const lineTotal = item.product.price * item.quantity;

                return (
                  <div
                    key={item.product.id}
                    className={`animate-cart-item-enter group flex items-center justify-between gap-2 py-1.5 rounded-2xl transition-all duration-240 ${
                      isRemoving
                        ? '-translate-x-28 opacity-0 scale-95'
                        : 'translate-x-0 opacity-100 scale-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                      <div className="w-11 h-11 xl:w-12 xl:h-12 rounded-2xl bg-[#F8F9FA] flex items-center justify-center shrink-0 overflow-hidden">
                        <img
                          src={resolveGoogleDriveImageUrl(item.product.imageUrl)}
                          alt={item.product.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-xs sm:text-[13px] text-[#2D3748] truncate">
                          {item.product.name}
                        </h4>
                        <p className="text-[11px] font-semibold text-slate-400 tabular-nums mt-0.5">
                          {formatRupiah(item.product.price)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(item.product.id, -1)}
                        className="w-7 h-7 sm:w-6 sm:h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-bold text-slate-500 w-6 text-center tabular-nums">
                        x{item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(item.product.id, 1)}
                        className="w-7 h-7 sm:w-6 sm:h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span className="font-extrabold text-xs text-[#2D3748] tabular-nums w-18 sm:w-20 text-right">
                        {formatRupiah(lineTotal)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveFromCart(item.product.id)}
                        title="Hapus item"
                        className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-1 text-slate-300 hover:text-rose-600 transition-opacity cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-dashed border-slate-200 mt-3.5 pt-3 mb-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="font-semibold text-slate-500">{t.subTotal}</span>
              <span className="font-extrabold text-[#2D3748] tabular-nums">
                {formatRupiah(subTotal)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-400">
                {activeTaxLabel}
              </span>
              <span className="font-semibold text-slate-400 tabular-nums">
                {formatRupiah(taxPbf)}
              </span>
            </div>
          </div>

          <div className="mb-3.5">
            <label className="block text-[11px] font-bold text-slate-400 mb-1.5">
              {t.paymentMethodLabel}
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'cash', label: t.payCash, icon: Banknote },
                  { id: 'qris', label: t.payQris, icon: QrCode },
                  { id: 'debit', label: t.payCard, icon: CreditCard },
                  { id: 'transfer', label: t.payTransfer, icon: Wallet },
                ] as const
              ).map((pm) => {
                const IconComp = pm.icon;
                const isSelected = paymentMethod === pm.id;
                return (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => onChangePaymentMethod(pm.id)}
                    style={
                      isSelected
                        ? {
                            backgroundColor: `${primaryColor}14`,
                            borderColor: primaryColor,
                            color: primaryColor,
                          }
                        : undefined
                    }
                    className={`px-2.5 py-2 rounded-xl border text-[11px] font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'shadow-2xs'
                        : 'bg-[#F8F9FA] border-slate-200/80 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <IconComp className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{pm.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onChargeOrder}
          disabled={cart.length === 0 || isChargingOrder}
          style={{
            backgroundColor: primaryColor,
            boxShadow: `0 12px 24px -6px ${primaryColor}55`,
          }}
          className="w-full py-3.5 sm:py-4 px-6 rounded-2xl hover:opacity-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm sm:text-base transition-all cursor-pointer tabular-nums flex items-center justify-center gap-2"
        >
          {isChargingOrder ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{isId ? 'Memproses...' : 'Processing...'}</span>
            </>
          ) : (
            <span>
              {t.chargeBtn} {formatRupiah(totalAmount)}
            </span>
          )}
        </button>
      </aside>

      {!mobileFullscreenCartOpen && (
        <div
          className={`lg:hidden absolute ${
            !isSidebarHidden ? 'bottom-[68px] md:bottom-4' : 'bottom-3 md:bottom-4'
          } left-3 right-3 sm:left-5 sm:right-5 z-30`}
        >
          <button
            type="button"
            onClick={() => onSetMobileFullscreenCartOpen(true)}
            style={{
              backgroundColor: primaryColor,
              boxShadow: `0 14px 28px -6px ${primaryColor}65`,
            }}
            className="w-full text-white font-extrabold py-3 sm:py-3.5 px-4 sm:px-5 rounded-2xl flex items-center justify-between text-xs sm:text-sm tabular-nums cursor-pointer active:scale-[0.99] transition-all"
          >
            <span className="inline-flex items-center gap-2 min-w-0">
              <Maximize2 className="w-4 h-4 shrink-0" />
              <span className="truncate">{t.showFullscreenCartBtn}</span>
              <span className="px-2 py-0.5 rounded-full bg-white/20 text-[11px] font-extrabold shrink-0">
                {totalItemsCount}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 shrink-0 ml-2">
              <ShoppingBag className="w-4 h-4" />
              <span>{formatRupiah(totalAmount)}</span>
            </span>
          </button>
        </div>
      )}
    </>
  );
};
