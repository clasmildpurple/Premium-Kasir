import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import {
  checkLoginRateLimit,
  clearLoginFailures,
  hashPasswordScrypt,
  recordLoginFailure,
  signSessionToken,
  verifyPasswordScrypt,
  verifySessionToken,
} from './auth';

function mockReq(ip = '127.0.0.1'): IncomingMessage {
  return {
    headers: { 'x-forwarded-for': ip },
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

describe('HMAC session tokens', () => {
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
