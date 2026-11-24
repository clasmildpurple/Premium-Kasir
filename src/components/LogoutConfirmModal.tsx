import React from 'react';
import { AlertTriangle, LogOut } from 'lucide-react';

export interface LogoutConfirmModalProps {
  isOpen: boolean;
  isId: boolean;
  totalItemsCount: number;
  onClose: () => void;
  onConfirmLogout: () => void;
}

export const LogoutConfirmModal: React.FC<LogoutConfirmModalProps> = ({
  isOpen,
  isId,
  totalItemsCount,
  onClose,
  onConfirmLogout,
}) => {
  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4 animate-modal-backdrop"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-[26px] shadow-2xl border border-slate-100 max-w-sm w-full p-6 text-center space-y-4 animate-modal-pop"
      >
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>

        <div className="space-y-1.5">
          <h3 className="text-base sm:text-lg font-extrabold text-[#2D3748]">
            {isId ? 'Konfirmasi Keluar Akun' : 'Confirm Logout'}
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            {isId
              ? 'Apakah Anda yakin ingin keluar dari sesi kasir saat ini?'
              : 'Are you sure you want to log out from the current cashier session?'}
          </p>
          {totalItemsCount > 0 && (
            <div className="mt-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200/80 text-[11px] font-bold text-amber-800">
              {isId
                ? `Perhatian: Masih ada ${totalItemsCount} item di keranjang pesanan yang belum diselesaikan.`
                : `Warning: You still have ${totalItemsCount} unpaid item(s) in the order cart.`}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#2D3748] text-xs font-extrabold transition-colors cursor-pointer"
          >
            {isId ? 'Batal' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={onConfirmLogout}
            className="py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-md transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{isId ? 'Ya, Keluar' : 'Yes, Logout'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
