import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { getClientIp, parseCookies } from './http.js';

export const SESSION_COOKIE_NAME = 'pinkpos_session';
export const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 hours

const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  return envSecret && envSecret.length >= 16
    ? envSecret
    : EPHEMERAL_FALLBACK_SECRET;
}

// Runtime credential override store (for password changes / first-run setup when env is unset)
interface StoredCredentials {
  username: string;
  passwordHash: string; // format: "<hex-salt>:<hex-derived-key>"
  updatedAt: string;
}

const RUNTIME_CRED_PATH = process.env.VERCEL
  ? path.join(os.tmpdir(), 'pinkpos-auth.json')
  : path.resolve(process.cwd(), '.data', 'auth.json');

let inMemoryCredentials: StoredCredentials | null = null;

async function readRuntimeCredentials(): Promise<StoredCredentials | null> {
  if (inMemoryCredentials) return inMemoryCredentials;
  try {
    const raw = await fs.readFile(RUNTIME_CRED_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as StoredCredentials;
    if (
      parsed &&
      typeof parsed.username === 'string' &&
      typeof parsed.passwordHash === 'string'
    ) {
      inMemoryCredentials = parsed;
      return parsed;
    }
  } catch {
    // ignore if file does not exist
  }
  return null;
}

export async function saveRuntimeCredentials(
  username: string,
  passwordHash: string
): Promise<void> {
  const record: StoredCredentials = {
    username: username.trim(),
    passwordHash,
    updatedAt: new Date().toISOString(),
  };
  inMemoryCredentials = record;
  try {
    await fs.mkdir(path.dirname(RUNTIME_CRED_PATH), { recursive: true });
    await fs.writeFile(
      RUNTIME_CRED_PATH,
      JSON.stringify(record, null, 2),
      'utf-8'
    );
  } catch {
    // Keep in-memory copy even if disk is read-only
  }
}

export async function getActiveAdminCredentials(): Promise<{
  username: string;
  passwordHash: string;
  source: 'env' | 'runtime' | 'unset';
}> {
  const runtimeCreds = await readRuntimeCredentials();
  const envHash = process.env.ADMIN_PASSWORD_HASH?.trim() || '';
  const envUser = process.env.ADMIN_USERNAME?.trim() || '';

  // If runtime password change happened after boot, honor runtime credentials
  if (runtimeCreds) {
    return {
      username: runtimeCreds.username,
      passwordHash: runtimeCreds.passwordHash,
      source: 'runtime',
    };
  }

  if (envUser && envHash) {
    return {
      username: envUser,
      passwordHash: envHash,
      source: 'env',
    };
  }

  return {
    username: envUser,
    passwordHash: '',
    source: 'unset',
  };
}

// ============================================================================
// SCRYPT PASSWORD HASHING (Node built-in crypto, random 16-byte salt per user)
// ============================================================================
export function hashPasswordScrypt(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPasswordScrypt(
  password: string,
  storedHash: string
): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;

  try {
    const keyBuf = Buffer.from(keyHex, 'hex');
    const derivedBuf = crypto.scryptSync(password, salt, keyBuf.length);
    if (keyBuf.length !== derivedBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, derivedBuf);
  } catch {
    return false;
  }
}

// ============================================================================
// SIGNED HMAC SESSION TOKEN (12-hour TTL)
// ============================================================================
export interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
}

function toBase64Url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

export function signSessionToken(username: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: username,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payloadB64)
    .digest();
  return `${payloadB64}.${toBase64Url(sig)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;

  const payloadB64 = token.slice(0, dotIdx);
  const sigB64 = token.slice(dotIdx + 1);
  if (!payloadB64 || !sigB64) return null;

  try {
    const expectedSig = crypto
      .createHmac('sha256', getSessionSecret())
      .update(payloadB64)
      .digest();
    const actualSig = fromBase64Url(sigB64);
    if (expectedSig.length !== actualSig.length) return null;
    if (!crypto.timingSafeEqual(expectedSig, actualSig)) return null;

    const payload = JSON.parse(
      fromBase64Url(payloadB64).toString('utf-8')
    ) as SessionPayload;

    const now = Math.floor(Date.now() / 1000);
    if (
      !payload ||
      typeof payload.sub !== 'string' ||
      typeof payload.exp !== 'number' ||
      payload.exp <= now
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function getAuthenticatedSession(
  req: IncomingMessage
): SessionPayload | null {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;
  return verifySessionToken(token);
}

export function buildSessionCookieHeader(
  req: IncomingMessage,
  token: string,
  maxAgeSeconds = SESSION_TTL_SECONDS
): string {
  const isHttps =
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.VERCEL === '1' ||
    process.env.NODE_ENV === 'production';

  const isCrossSiteIframe = req.headers['sec-fetch-site'] === 'cross-site';
  const sameSite = isCrossSiteIframe && isHttps ? 'SameSite=None' : 'SameSite=Lax';

  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSeconds}`,
    sameSite,
  ];
  if (isHttps) {
    parts.push('Secure');
  }
  if (isCrossSiteIframe && isHttps) {
    parts.push('Partitioned');
  }
  return parts.join('; ');
}

// ============================================================================
// LOGIN RATE LIMITER (Max 5 failed attempts -> lock for 5 minutes)
// ============================================================================
interface RateLimitEntry {
  failures: number;
  lockedUntil: number;
  lastAttemptAt: number;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes
const loginAttemptsMap = new Map<string, RateLimitEntry>();

function getRateLimitKey(req: IncomingMessage, username: string): string {
  const ip = getClientIp(req);
  return `${ip}::${username.trim().toLowerCase()}`;
}

export function checkLoginRateLimit(
  req: IncomingMessage,
  username: string
): { allowed: boolean; retryAfterSeconds: number } {
  const key = getRateLimitKey(req, username);
  const now = Date.now();
  const entry = loginAttemptsMap.get(key);
  if (!entry) return { allowed: true, retryAfterSeconds: 0 };

  if (entry.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000),
    };
  }

  // Expired lockout resets counter
  if (entry.lockedUntil > 0 && entry.lockedUntil <= now) {
    loginAttemptsMap.delete(key);
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordLoginFailure(
  req: IncomingMessage,
  username: string
): { locked: boolean; remainingAttempts: number; retryAfterSeconds: number } {
  const key = getRateLimitKey(req, username);
  const now = Date.now();
  const prev = loginAttemptsMap.get(key);
  const failures =
    prev && now - prev.lastAttemptAt < LOCKOUT_MS ? prev.failures + 1 : 1;

  if (failures >= MAX_FAILED_ATTEMPTS) {
    loginAttemptsMap.set(key, {
      failures,
      lockedUntil: now + LOCKOUT_MS,
      lastAttemptAt: now,
    });
    return {
      locked: true,
      remainingAttempts: 0,
      retryAfterSeconds: Math.ceil(LOCKOUT_MS / 1000),
    };
  }

  loginAttemptsMap.set(key, {
    failures,
    lockedUntil: 0,
    lastAttemptAt: now,
  });
  return {
    locked: false,
    remainingAttempts: MAX_FAILED_ATTEMPTS - failures,
    retryAfterSeconds: 0,
  };
}

export function clearLoginFailures(
  req: IncomingMessage,
  username: string
): void {
  const key = getRateLimitKey(req, username);
  loginAttemptsMap.delete(key);
}
