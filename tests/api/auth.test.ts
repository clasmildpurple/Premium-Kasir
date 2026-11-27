import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import {
  buildSessionCookieHeader,
  checkLoginRateLimit,
  clearLoginFailures,
  getActiveAdminCredentials,
  hashPasswordScrypt,
  isValidSetupToken,
  recordLoginFailure,
  signSessionToken,
  verifyPasswordScrypt,
  verifySessionToken,
} from '../../api/_lib/auth.js';
import { hashPasswordScryptBrowser } from '../../src/utils/envGenerator.js';

function mockReq(
  ip = '127.0.0.1',
  headers: Record<string, string> = {}
): IncomingMessage {
  return {
    headers: { 'x-real-ip': ip, ...headers },
    socket: { remoteAddress: ip },
  } as unknown as IncomingMessage;
}

describe('scrypt password hashing & verification', () => {
  it('hashes with unique random salt and verifies valid vs invalid passwords', () => {
    const hash1 = hashPasswordScrypt('Rahasia123!');
    const hash2 = hashPasswordScrypt('Rahasia123!');

    expect(hash1).not.toBe(hash2);
    expect(hash1.split(':')).toHaveLength(2);
    expect(verifyPasswordScrypt('Rahasia123!', hash1)).toBe(true);
    expect(verifyPasswordScrypt('SalahPassword', hash1)).toBe(false);
    expect(verifyPasswordScrypt('Rahasia123!', 'malformed')).toBe(false);
  });

  it('verifies hashes generated in-browser by hashPasswordScryptBrowser without terminal', async () => {
    const browserHash = await hashPasswordScryptBrowser('TokoSukaPOS!2026');
    expect(browserHash.split(':')).toHaveLength(2);
    expect(verifyPasswordScrypt('TokoSukaPOS!2026', browserHash)).toBe(true);
    expect(verifyPasswordScrypt('PasswordLain!2026', browserHash)).toBe(false);
  });
});

describe('HMAC session tokens & cross-site iframe cookies', () => {
  it('signs and verifies valid session token and rejects tampered tokens', () => {
    const token = signSessionToken('kasir@pinkpos.id');
    const payload = verifySessionToken(token);

    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('kasir@pinkpos.id');
    expect(payload!.exp - payload!.iat).toBe(12 * 60 * 60);

    const [p, s] = token.split('.');
    const tampered = `${p}.${s.slice(0, -2)}AA`;
    expect(verifySessionToken(tampered)).toBeNull();
    expect(verifySessionToken('invalid-token')).toBeNull();
  });

  it('sets SameSite=None; Secure; Partitioned for HTTPS cross-site iframe requests', () => {
    const req = mockReq('127.0.0.1', {
      'x-forwarded-proto': 'https',
      'sec-fetch-site': 'cross-site',
      origin: 'https://aistudio.google.com',
    });
    const header = buildSessionCookieHeader(req, 'abc.def');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=None');
    expect(header).toContain('Secure');
    expect(header).toContain('Partitioned');
  });

  it('in production reads admin credentials strictly from env (never cookies or runtime files)', async () => {
    const prevVercel = process.env.VERCEL;
    const prevUser = process.env.ADMIN_USERNAME;
    const prevHash = process.env.ADMIN_PASSWORD_HASH;
    process.env.VERCEL = '1';
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD_HASH;

    try {
      const unsetCreds = await getActiveAdminCredentials();
      expect(unsetCreds.source).toBe('unset');

      const hash = hashPasswordScrypt('EnvPassword123');
      process.env.ADMIN_USERNAME = 'admin-env';
      process.env.ADMIN_PASSWORD_HASH = hash;

      const envCreds = await getActiveAdminCredentials();
      expect(envCreds.source).toBe('env');
      expect(envCreds.username).toBe('admin-env');
      expect(verifyPasswordScrypt('EnvPassword123', envCreds.passwordHash)).toBe(true);
    } finally {
      if (prevVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prevVercel;
      if (prevUser === undefined) delete process.env.ADMIN_USERNAME;
      else process.env.ADMIN_USERNAME = prevUser;
      if (prevHash === undefined) delete process.env.ADMIN_PASSWORD_HASH;
      else process.env.ADMIN_PASSWORD_HASH = prevHash;
    }
  });

  it('validates x-setup-token using constant-time comparison', () => {
    const prevSetup = process.env.SETUP_TOKEN;
    process.env.SETUP_TOKEN = 'super-secret-setup-token-123';
    try {
      expect(
        isValidSetupToken(mockReq('127.0.0.1', { 'x-setup-token': 'super-secret-setup-token-123' }))
      ).toBe(true);
      expect(
        isValidSetupToken(mockReq('127.0.0.1', { 'x-setup-token': 'wrong-token' }))
      ).toBe(false);
      expect(isValidSetupToken(mockReq('127.0.0.1'))).toBe(false);
    } finally {
      if (prevSetup === undefined) delete process.env.SETUP_TOKEN;
      else process.env.SETUP_TOKEN = prevSetup;
    }
  });
});

describe('login rate limiter (5 attempts -> 5 minute lock)', () => {
  it('locks after 5 consecutive failures and resets on clearLoginFailures', async () => {
    const req = mockReq('10.0.0.42');
    const user = 'kasir-rate-test';
    await clearLoginFailures(req, user);

    for (let i = 1; i <= 4; i++) {
      const res = await recordLoginFailure(req, user);
      expect(res.locked).toBe(false);
      expect(res.remainingAttempts).toBe(5 - i);
      expect((await checkLoginRateLimit(req, user)).allowed).toBe(true);
    }

    const fifth = await recordLoginFailure(req, user);
    expect(fifth.locked).toBe(true);
    expect(fifth.retryAfterSeconds).toBe(300);

    const checkLocked = await checkLoginRateLimit(req, user);
    expect(checkLocked.allowed).toBe(false);
    expect(checkLocked.retryAfterSeconds).toBeGreaterThan(0);

    await clearLoginFailures(req, user);
    expect((await checkLoginRateLimit(req, user)).allowed).toBe(true);
  });
});
