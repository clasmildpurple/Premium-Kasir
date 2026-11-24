import { describe, expect, it } from 'vitest';
import { resolveFontCssFamily } from '../data/i18nAndSettings';
import { sanitizeStoreSettings } from './storage';

describe('store branding sanitization & font resolution', () => {
  it('migrates legacy PinkPOS Resto storeName to SukaPOS and preserves custom names', () => {
    const migrated = sanitizeStoreSettings({
      storeName: 'PinkPOS Resto',
      primaryColor: '#2563EB',
      fontFamily: 'Poppins',
    });
    expect(migrated.storeName).toBe('SukaPOS');
    expect(migrated.primaryColor).toBe('#2563EB');
    expect(migrated.fontFamily).toBe('Poppins');

    const custom = sanitizeStoreSettings({
      storeName: 'Kopi Kenangan Kita',
      primaryColor: '#10B981',
      fontFamily: 'Outfit',
    });
    expect(custom.storeName).toBe('Kopi Kenangan Kita');
    expect(custom.fontFamily).toBe('Outfit');
  });

  it('falls back to Plus Jakarta Sans for unknown fontFamily values and strips legacy login fields', () => {
    const sanitized = sanitizeStoreSettings({
      storeName: 'SukaPOS',
      fontFamily: 'UnknownFont',
      loginUsername: 'admin',
      loginPassword: 'secret',
    }) as unknown as Record<string, unknown>;

    expect(sanitized.fontFamily).toBe('Plus Jakarta Sans');
    expect(sanitized.loginUsername).toBeUndefined();
    expect(sanitized.loginPassword).toBeUndefined();
    expect(resolveFontCssFamily('Playfair Display')).toContain('Playfair Display');
    expect(resolveFontCssFamily('Invalid')).toContain('Plus Jakarta Sans');
  });
});
