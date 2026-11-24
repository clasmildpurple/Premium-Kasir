import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CreditCard,
  FileText,
  Loader2,
  Printer,
  Search,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { OrderRecord, formatRupiah } from '../data/posData';
import { TRANSLATIONS } from '../data/i18nAndSettings';
import {
  MAX_LOCAL_ORDERS,
  isOrdersApproachingLocalLimit,
} from '../utils/storage';

export interface BillsViewProps {
  orders: OrderRecord[];
  deletingOrderId: string | null;
  primaryColor: string;
  isId: boolean;
  t: (typeof TRANSLATIONS)['id'];
  onOpenPdfReport: () => void;
  onPrintReceipt: (order: OrderRecord) => void;
  onDeleteOrder: (orderId: string) => void;
}

export const BillsView: React.FC<BillsViewProps> = ({
  orders,
  deletingOrderId,
  primaryColor,
  isId,
  t,
  onOpenPdfReport,
  onPrintReceipt,
  onDeleteOrder,
}) => {
  const [transactionSearchQuery, setTransactionSearchQuery] = useState('');
  const [visibleOrdersLimit, setVisibleOrdersLimit] = useState(30);

  const filteredOrders = useMemo(() => {
    const q = transactionSearchQuery.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.orderId.toLowerCase().includes(q) ||
        (o.customerName && o.customerName.toLowerCase().includes(q)) ||
        (o.paymentMethod && o.paymentMethod.toLowerCase().includes(q)) ||
        o.createdAt.toLowerCase().includes(q) ||
        o.items.some((it) => it.name.toLowerCase().includes(q))
    );
  }, [orders, transactionSearchQuery]);

  const displayedOrders = useMemo(
    () => filteredOrders.slice(0, visibleOrdersLimit),
    [filteredOrders, visibleOrdersLimit]
  );

  return (
    <div className="space-y-4 sm:space-y-6 pb-20 md:pb-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 bg-white p-4 sm:p-6 rounded-[20px] sm:rounded-[24px] border border-slate-100">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg sm:text-2xl font-extrabold text-[#2D3748]">
              {t.billsTitle}
            </h1>
            <span
              style={{
                backgroundColor: `${primaryColor}15`,
                color: primaryColor,
              }}
              className="px-2.5 py-0.5 rounded-full text-xs font-extrabold tabular-nums"
            >
              {filteredOrders.length}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{t.billsSubtitle}</p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
          <div className="relative flex-1 sm:w-64 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={transactionSearchQuery}
              onChange={(e) => {
                setTransactionSearchQuery(e.target.value);
                setVisibleOrdersLimit(30);
              }}
              placeholder={
                isId
                  ? 'Cari ID Order, pelanggan, metode, menu...'
                  : 'Search Order ID, customer, payment, item...'
              }
              className="w-full h-10 bg-[#F8F9FA] rounded-xl pl-9 pr-8 text-xs text-[#2D3748] placeholder:text-slate-400 border border-slate-200/80 focus:border-slate-300 focus:outline-none transition-all"
            />
            {transactionSearchQuery && (
              <button
                type="button"
                onClick={() => {
                  setTransactionSearchQuery('');
                  setVisibleOrdersLimit(30);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenPdfReport}
            style={{ backgroundColor: primaryColor }}
            className="h-10 px-4 rounded-xl text-white text-xs font-bold shadow-md hover:opacity-95 transition-opacity flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{t.printPdfReportBtn}</span>
          </button>
        </div>
      </div>

      {isOrdersApproachingLocalLimit(orders.length) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-2.5 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-extrabold">
              {isId
                ? `Peringatan Batas Cache Lokal (${orders.length}/${MAX_LOCAL_ORDERS})`
                : `Local Storage Limit Warning (${orders.length}/${MAX_LOCAL_ORDERS})`}
              :
            </span>{' '}
            {isId
              ? `Hanya ${MAX_LOCAL_ORDERS} transaksi terbaru yang disimpan di perangkat (localStorage). Riwayat transaksi yang lebih lama tetap tersimpan aman di Google Sheets.`
              : `Only the newest ${MAX_LOCAL_ORDERS} transactions are cached locally in this browser. Older transactions remain safely stored in Google Sheets.`}
          </div>
        </div>
      )}

      {displayedOrders.length === 0 ? (
        <div className="bg-white p-8 sm:p-10 rounded-[20px] sm:rounded-[24px] border border-slate-100 text-center text-slate-400 text-xs sm:text-sm font-semibold">
          {isId
            ? 'Tidak ada transaksi yang cocok dengan pencarian.'
            : 'No matching transactions found.'}
        </div>
      ) : (
        <div className="space-y-3.5 sm:space-y-4">
          {displayedOrders.map((ord, idx) => (
            <div
              key={ord.orderId}
              style={{
                animationDelay: `${Math.min(idx, 12) * 22}ms`,
              }}
              className="animate-card-enter bg-white p-3.5 sm:p-5 rounded-[20px] sm:rounded-[22px] border border-slate-100 space-y-3 hover:-translate-y-0.5 hover:shadow-xs transition-all duration-200"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-3">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className="font-extrabold text-sm sm:text-base text-[#2D3748]">
                    {ord.orderId}
                  </span>
                  {ord.customerName && (
                    <span
                      style={{
                        backgroundColor: `${primaryColor}14`,
                        color: primaryColor,
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold"
                    >
                      <User className="w-3 h-3" />
                      <span>{ord.customerName}</span>
                    </span>
                  )}
                  {ord.paymentMethod && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold">
                      <CreditCard className="w-3 h-3" />
                      <span>{ord.paymentMethod}</span>
                    </span>
                  )}
                  <span className="text-[11px] sm:text-xs text-slate-400">
                    {ord.createdAt}
                  </span>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-2.5 sm:gap-3 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-50">
                  <div className="text-left sm:text-right">
                    <span
                      style={{ color: primaryColor }}
                      className="text-sm sm:text-lg font-extrabold tabular-nums"
                    >
                      {formatRupiah(ord.total)}
                    </span>
                    <span className="block text-[10px] sm:text-[11px] text-emerald-600 font-medium">
                      {t.completedStatus}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onPrintReceipt(ord)}
                      className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#2D3748] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Printer
                        className="w-3.5 h-3.5"
                        style={{ color: primaryColor }}
                      />
                      <span>{t.printReceiptBtn}</span>
                    </button>

                    <button
                      type="button"
                      disabled={deletingOrderId === ord.orderId}
                      onClick={() => onDeleteOrder(ord.orderId)}
                      title={t.deleteBill}
                      className="p-2 rounded-xl bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 disabled:opacity-60 transition-colors cursor-pointer"
                    >
                      {deletingOrderId === ord.orderId ? (
                        <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2 text-xs text-slate-600">
                {ord.items.map((item, itemIdx) => (
                  <div
                    key={itemIdx}
                    className="flex justify-between bg-slate-50 px-3 py-2 rounded-xl gap-2"
                  >
                    <span className="truncate">
                      {item.quantity}x {item.name}
                    </span>
                    <span className="font-semibold tabular-nums shrink-0">
                      {formatRupiah(item.subtotal)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {filteredOrders.length > visibleOrdersLimit && (
            <div className="pt-2 flex flex-col items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">
                {isId
                  ? `Menampilkan ${displayedOrders.length} dari ${filteredOrders.length} transaksi`
                  : `Showing ${displayedOrders.length} of ${filteredOrders.length} transactions`}
              </span>
              <button
                type="button"
                onClick={() => setVisibleOrdersLimit((prev) => prev + 50)}
                style={{
                  borderColor: primaryColor,
                  color: primaryColor,
                }}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-white hover:bg-slate-50 border-2 text-xs font-extrabold transition-all cursor-pointer shadow-2xs"
              >
                {isId
                  ? `Tampilkan Lebih Banyak (+50 Transaksi)`
                  : `Load More (+50 Transactions)`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
