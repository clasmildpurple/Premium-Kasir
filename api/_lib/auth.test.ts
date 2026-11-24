import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_RECORD_COOKIE_NAME,
  buildAdminRecordCookieHeader,
  buildSessionCookieHeader,
  checkLoginRateLimit,
  clearLoginFailures,
  getActiveAdminCredentials,
  hashPasswordScrypt,
  recordLoginFailure,
  signSessionToken,
  verifyPasswordScrypt,
  verifySessionToken,
} from './auth';

function mockReq(
  ip = '127.0.0.1',
  headers: Record<string, string> = {}
): IncomingMessage {
  return {
    headers: { 'x-forwarded-for': ip, ...headers },
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

  it('recovers admin credentials from signed admin record cookie when env/disk are unset', async () => {
    const prevUser = process.env.ADMIN_USERNAME;
    const prevHash = process.env.ADMIN_PASSWORD_HASH;
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD_HASH;

    try {
      const hash = hashPasswordScrypt('PasswordBaru123');
      const setupReq = mockReq('127.0.0.1', { 'x-forwarded-proto': 'https' });
      const cookieHeader = buildAdminRecordCookieHeader(
        setupReq,
        'admin-toko',
        hash
      );
      const cookiePair = cookieHeader.split(';')[0];
      expect(cookiePair.startsWith(`${ADMIN_RECORD_COOKIE_NAME}=`)).toBe(true);

      const refreshReq = mockReq('127.0.0.1', { cookie: cookiePair });
      const creds = await getActiveAdminCredentials(refreshReq);
      expect(creds.source).toBe('runtime');
      expect(creds.username).toBe('admin-toko');
      expect(verifyPasswordScrypt('PasswordBaru123', creds.passwordHash)).toBe(
        true
      );
    } finally {
      if (prevUser !== undefined) process.env.ADMIN_USERNAME = prevUser;
      if (prevHash !== undefined) process.env.ADMIN_PASSWORD_HASH = prevHash;
    }
  });
});

describe('login rate limiter (5 attempts -> 5 minute lock)', () => {
  it('locks after 5 consecutive failures and resets on clearLoginFailures', () => {
    const req = mockReq('10.0.0.42');
    const user = 'kasir-rate-test';
    clearLoginFailures(req, user);

    for (let i = 1; i <= 4; i++) {
      const res = recordLoginFailure(req, user);
      expect(res.locked).toBe(false);
      expect(res.remainingAttempts).toBe(5 - i);
      expect(checkLoginRateLimit(req, user).allowed).toBe(true);
    }

    const fifth = recordLoginFailure(req, user);
    expect(fifth.locked).toBe(true);
    expect(fifth.retryAfterSeconds).toBe(300);

    const checkLocked = checkLoginRateLimit(req, user);
    expect(checkLocked.allowed).toBe(false);
    expect(checkLocked.retryAfterSeconds).toBeGreaterThan(0);

    clearLoginFailures(req, user);
    expect(checkLoginRateLimit(req, user).allowed).toBe(true);
  });
});
