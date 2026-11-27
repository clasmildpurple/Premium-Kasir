import React from 'react';
import { CloudOff, RefreshCw, Wifi, WifiOff } from 'lucide-react';

export interface ConnectivityStatusBadgeProps {
  isOnline: boolean;
  isDbConfigured: boolean;
  twoWaySyncStatus: 'connected' | 'local_realtime' | 'syncing';
  lastCloudSyncError: string | null;
  offlineQueueCount: number;
  lastSyncedAt?: string;
  isId: boolean;
  onSyncNow: () => void;
  onOpenSettings: () => void;
}

export const ConnectivityStatusBadge: React.FC<ConnectivityStatusBadgeProps> = ({
  isOnline,
  isDbConfigured,
  twoWaySyncStatus,
  lastCloudSyncError,
  offlineQueueCount,
  lastSyncedAt,
  isId,
  onSyncNow,
  onOpenSettings,
}) => {
  const isSyncing = twoWaySyncStatus === 'syncing';
  const hasQueued = offlineQueueCount > 0;

  let badgeBg = 'bg-emerald-50 border-emerald-200/80 text-emerald-700 hover:bg-emerald-100/80';
  let dotColor = 'bg-emerald-500';
  let label = isId ? 'Online · Google Sheet Aktif' : 'Online · Sheet Connected';
  let title = isId
    ? `Terhubung ke Google Sheet${lastSyncedAt ? ` (sinkron terakhir ${lastSyncedAt})` : ''}. Klik untuk sinkronkan ulang.`
    : `Connected to Google Sheet${lastSyncedAt ? ` (last sync ${lastSyncedAt})` : ''}. Click to refresh.`;
  let Icon = Wifi;

  if (!isOnline) {
    badgeBg = 'bg-rose-50 border-rose-200/90 text-rose-700 hover:bg-rose-100/80';
    dotColor = 'bg-rose-500';
    Icon = WifiOff;
    label = hasQueued
      ? isId
        ? `Offline · ${offlineQueueCount} Antrean Lokal`
        : `Offline · ${offlineQueueCount} Queued Locally`
      : isId
        ? 'Offline · Antrean Lokal Aktif'
        : 'Offline · Queuing Locally';
    title = isId
      ? 'Koneksi internet terputus. Transaksi disimpan di antrean lokal dan otomatis terkirim saat online.'
      : 'Internet disconnected. Transactions are queued locally and auto-sync when online.';
  } else if (isSyncing) {
    badgeBg = 'bg-sky-50 border-sky-200/90 text-sky-700';
    dotColor = 'bg-sky-500 animate-pulse';
    Icon = RefreshCw;
    label = hasQueued
      ? isId
        ? `Menyinkronkan (${offlineQueueCount} antrean)...`
        : `Syncing (${offlineQueueCount} queued)...`
      : isId
        ? 'Menyinkronkan ke Sheet...'
        : 'Syncing to Sheet...';
  } else if (!isDbConfigured) {
    badgeBg = 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200/70';
    dotColor = 'bg-slate-400';
    Icon = CloudOff;
    label = isId ? 'Mode Lokal · Sheet Belum Terhubung' : 'Local Only · Sheet Not Linked';
    title = isId
      ? 'Google Sheet belum dihubungkan. Klik untuk membuka Pengaturan Database.'
      : 'Google Sheet not linked yet. Click to open Database Settings.';
  } else if (lastCloudSyncError || hasQueued) {
    badgeBg = 'bg-amber-50 border-amber-200/90 text-amber-800 hover:bg-amber-100/80';
    dotColor = 'bg-amber-500 animate-pulse';
    Icon = CloudOff;
    label = hasQueued
      ? isId
        ? `Sheet Terputus · ${offlineQueueCount} Antrean Lokal`
        : `Sheet Unreachable · ${offlineQueueCount} Queued`
      : isId
        ? 'Sheet Tidak Terjangkau · Mode Antrean'
        : 'Sheet Unreachable · Local Queue';
    title =
      lastCloudSyncError ||
      (isId
        ? 'Google Sheet belum merespons. Klik untuk coba sinkronkan ulang.'
        : 'Google Sheet did not respond. Click to retry sync.');
  }

  const handleClick = () => {
    if (!isDbConfigured) {
      onOpenSettings();
      return;
    }
    onSyncNow();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      data-testid="connectivity-status-badge"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold transition-colors cursor-pointer shrink-0 shadow-2xs ${badgeBg}`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
      <Icon className={`w-3.5 h-3.5 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
      <span className="whitespace-nowrap tabular-nums">{label}</span>
    </button>
  );
};
