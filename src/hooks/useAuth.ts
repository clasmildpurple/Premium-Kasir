import { useCallback, useEffect, useState } from 'react';
import {
  GOOGLE_CONFIG_KEY,
  STORE_BRANDING_KEY,
  safeRemoveLocalStorage,
  safeSetLocalStorageJson,
  sanitizeGoogleConfig,
  sanitizeStoreSettings,
} from '../utils/storage';

export function useAuth(onStorageError?: (message: string) => void) {
  const [showOpeningAnim, setShowOpeningAnim] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isCheckingSession, setIsCheckingSession] = useState<boolean>(true);
  const [needsAdminSetup, setNeedsAdminSetup] = useState<boolean>(false);
  const [cashierName, setCashierName] = useState<string>('Admin Kasir');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE_BRANDING_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, unknown>;
        if ('loginUsername' in parsed || 'loginPassword' in parsed) {
          safeSetLocalStorageJson(
            STORE_BRANDING_KEY,
            sanitizeStoreSettings(parsed),
            onStorageError
          );
        }
      }
    } catch {
      // ignore malformed legacy JSON during migration
    }

    try {
      const savedCfg = localStorage.getItem(GOOGLE_CONFIG_KEY);
      if (savedCfg) {
        const parsedCfg = JSON.parse(savedCfg) as Record<string, unknown>;
        if ('APPS_SCRIPT_URL' in parsedCfg) {
          safeSetLocalStorageJson(
            GOOGLE_CONFIG_KEY,
            sanitizeGoogleConfig(parsedCfg),
            onStorageError
          );
        }
      }
    } catch {
      // ignore malformed legacy JSON during migration
    }

    safeRemoveLocalStorage('pinkpos_auth_session', onStorageError);

    let cancelled = false;
    const checkSession = async () => {
      try {
        const res = await fetch('/api/session', {
          method: 'GET',
          credentials: 'include',
        });
        if (res.ok && !cancelled) {
          const data = (await res.json()) as {
            authenticated?: boolean;
            username?: string;
            needsSetup?: boolean;
          };
          setNeedsAdminSetup(Boolean(data.needsSetup));
          if (data.authenticated) {
            const rawUser = data.username || 'Admin Kasir';
            const displayUser = rawUser.includes('@')
              ? rawUser.split('@')[0]
              : rawUser;
            setCashierName(displayUser);
            setIsAuthenticated(true);
          } else {
            setIsAuthenticated(false);
          }
        }
      } catch {
        if (!cancelled) setIsAuthenticated(false);
      } finally {
        if (!cancelled) setIsCheckingSession(false);
      }
    };

    void checkSession();
    return () => {
      cancelled = true;
    };
  }, [onStorageError]);

  const handleLoginSuccess = useCallback((user: string) => {
    setNeedsAdminSetup(false);
    setCashierName(user);
    setIsAuthenticated(true);
    setShowOpeningAnim(true);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
    } catch {
      // continue local sign out even if network offline
    }
    setIsAuthenticated(false);
  }, []);

  return {
    isAuthenticated,
    isCheckingSession,
    needsAdminSetup,
    cashierName,
    showOpeningAnim,
    setShowOpeningAnim,
    handleLoginSuccess,
    handleLogout,
  };
}
