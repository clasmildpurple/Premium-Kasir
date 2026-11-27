import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import { type ApiResponse, getClientIp, parseCookies, sendJson } from './http.js';

export const SESSION_COOKIE_NAME = 'pinkpos_session';
export const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 hours

const PRIMARY_DATA_DIR = path.resolve(process.cwd(), '.data');
const PRIMARY_CRED_PATH = path.join(PRIMARY_DATA_DIR, 'auth.json');
const PRIMARY_SECRET_PATH = path.join(PRIMARY_DATA_DIR, 'session-secret');

export const SESSION_SECRET_MISSING_MESSAGE = 'SESSION_SECRET belum dikonfigurasi';

export class SessionSecretError extends Error {
  constructor(message = SESSION_SECRET_MISSING_MESSAGE) {
    super(message);
    this.name = 'SessionSecretError';
  }
}

export function isProduction(): boolean {
  return Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';
}

export function isValidSetupToken(req: IncomingMessage): boolean {
  const expected = process.env.SETUP_TOKEN?.trim() || '';
  if (!expected) return false;
  const rawHeader = req.headers['x-setup-token'];
  const provided = (
    Array.isArray(rawHeader) ? rawHeader[0] : rawHeader || ''
  ).trim();
  if (!provided) return false;

  const expectedBuf = Buffer.from(expected, 'utf-8');
  const providedBuf = Buffer.from(provided, 'utf-8');
  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

let cachedDevFallbackSecret: string | null = null;

function loadOrCreateDevSecret(): string {
  if (isProduction()) {
    throw new SessionSecretError();
  }
  if (cachedDevFallbackSecret) return cachedDevFallbackSecret;

  try {
    const existing = fsSync.readFileSync(PRIMARY_SECRET_PATH, 'utf-8').trim();
    if (existing.length >= 32) {
      cachedDevFallbackSecret = existing;
      return existing;
    }
  } catch {
    // ignore if not found yet
  }

  const generated = crypto.randomBytes(32).toString('hex');
  cachedDevFallbackSecret = generated;

  try {
    fsSync.mkdirSync(path.dirname(PRIMARY_SECRET_PATH), { recursive: true });
    fsSync.writeFileSync(PRIMARY_SECRET_PATH, generated, {
      encoding: 'utf-8',
      mode: 0o600,
    });
  } catch {
    // keep in-memory dev secret if workspace .data directory is read-only
  }

  return generated;
}

export function isSessionSecretConfigured(): boolean {
  const envSecret = process.env.SESSION_SECRET?.trim() || '';
  return envSecret.length >= 32;
}

export function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim() || '';
  if (envSecret.length >= 32) {
    return envSecret;
  }
  if (isProduction()) {
    throw new SessionSecretError();
  }
  return loadOrCreateDevSecret();
}

export function ensureSessionSecretReady(res: ApiResponse): boolean {
  try {
    getSessionSecret();
    return true;
  } catch (err) {
    if (err instanceof SessionSecretError) {
      sendJson(res, 500, {
        error: SESSION_SECRET_MISSING_MESSAGE,
        missingSessionSecret: true,
      });
      return false;
    }
    throw err;
  }
}

export function resetDevSecretCacheForTests(): void {
  cachedDevFallbackSecret = null;
}

// Runtime credential override store (local development ONLY when env is unset)
interface StoredCredentials {
  username: string;
  passwordHash: string; // format: "<hex-salt>:<hex-derived-key>"
  updatedAt: string;
}

async function readRuntimeCredentials(): Promise<StoredCredentials | null> {
  if (isProduction()) {
    return null;
  }
  try {
    const raw = await fs.readFile(PRIMARY_CRED_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as StoredCredentials;
    if (
      parsed &&
      typeof parsed.username === 'string' &&
      typeof parsed.passwordHash === 'string' &&
      parsed.username.trim() &&
      parsed.passwordHash.includes(':')
    ) {
      return parsed;
    }
  } catch {
    // ignore if not present
  }
  return null;
}

export async function saveRuntimeCredentials(
  username: string,
  passwordHash: string
): Promise<boolean> {
  if (isProduction()) {
    return false;
  }
  const record: StoredCredentials = {
    username: username.trim(),
    passwordHash,
    updatedAt: new Date().toISOString(),
  };

  try {
    await fs.mkdir(path.dirname(PRIMARY_CRED_PATH), { recursive: true });
    await fs.writeFile(
      PRIMARY_CRED_PATH,
      JSON.stringify(record, null, 2),
      { encoding: 'utf-8', mode: 0o600 }
    );
    return true;
  } catch {
    return false;
  }
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
// SIGNED HMAC TOKENS & COOKIES
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

function signSignedPayload(payloadObj: unknown): string {
  const payloadB64 = toBase64Url(JSON.stringify(payloadObj));
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payloadB64)
    .digest();
  return `${payloadB64}.${toBase64Url(sig)}`;
}

function verifySignedPayload<T>(token: string): T | null {
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

    return JSON.parse(fromBase64Url(payloadB64).toString('utf-8')) as T;
  } catch (err) {
    if (err instanceof SessionSecretError) {
      throw err;
    }
    return null;
  }
}

export function signSessionToken(username: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: username,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  return signSignedPayload(payload);
}

export function verifySessionToken(token: string): SessionPayload | null {
  const payload = verifySignedPayload<SessionPayload>(token);
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
}

export function getAuthenticatedSession(
  req: IncomingMessage
): SessionPayload | null {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;
  return verifySessionToken(token);
}

export async function getActiveAdminCredentials(): Promise<{
  username: string;
  passwordHash: string;
  source: 'env' | 'runtime' | 'unset';
}> {
  const envHash = process.env.ADMIN_PASSWORD_HASH?.trim() || '';
  const envUser = process.env.ADMIN_USERNAME?.trim() || '';

  if (isProduction()) {
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

  // Local development: allow runtime credential file override (.data/auth.json), or fallback to env
  const runtimeCreds = await readRuntimeCredentials();
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

function isHttpsRequest(req: IncomingMessage): boolean {
  const fwdProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  const origin = String(req.headers.origin || '').toLowerCase();
  const referer = String(req.headers.referer || '').toLowerCase();
  return (
    fwdProto.includes('https') ||
    origin.startsWith('https://') ||
    referer.startsWith('https://') ||
    process.env.VERCEL === '1' ||
    process.env.NODE_ENV === 'production'
  );
}

export function buildCookieHeader(
  req: IncomingMessage,
  name: string,
  value: string,
  maxAgeSeconds: number
): string {
  const isHttps = isHttpsRequest(req);
  const secFetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  const secFetchDest = String(req.headers['sec-fetch-dest'] || '').toLowerCase();
  const isCrossSite =
    secFetchSite === 'cross-site' ||
    secFetchDest === 'iframe' ||
    (isHttps && secFetchSite !== 'same-origin');
  const sameSite = isCrossSite && isHttps ? 'SameSite=None' : 'SameSite=Lax';

  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSeconds}`,
    sameSite,
  ];
  if (isHttps) {
    parts.push('Secure');
  }
  if (isCrossSite && isHttps) {
    parts.push('Partitioned');
  }
  return parts.join('; ');
}

export function buildSessionCookieHeader(
  req: IncomingMessage,
  token: string,
  maxAgeSeconds = SESSION_TTL_SECONDS
): string {
  return buildCookieHeader(req, SESSION_COOKIE_NAME, token, maxAgeSeconds);
}

// ============================================================================
// LOGIN RATE LIMITER (Dual lock: per IP AND per username, 5 failed / 5 min)
// ============================================================================
interface RateLimitEntry {
  failures: number;
  lockedUntil: number;
  lastAttemptAt: number;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 5 * 60;
const LOCKOUT_MS = LOCKOUT_SECONDS * 1000;
const loginAttemptsMap = new Map<string, RateLimitEntry>();

function getRateLimitKeys(req: IncomingMessage, username: string): string[] {
  const ip = getClientIp(req) || 'unknown';
  const normalizedUser = username.trim().toLowerCase();
  const keys = [`pinkpos:rl:ip:${ip}`];
  if (normalizedUser) {
    keys.push(`pinkpos:rl:user:${normalizedUser}`);
  }
  return keys;
}

function getUpstashConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim().replace(/\/+$/, '') || '';
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || '';
  if (url && token) {
    return { url, token };
  }
  return null;
}

async function runUpstashPipeline(
  cfg: { url: string; token: string },
  commands: Array<Array<string | number>>
): Promise<Array<{ result?: unknown; error?: string }> | null> {
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ result?: unknown; error?: string }>;
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function checkMemoryRateLimitKeys(keys: string[]): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  let maxRetry = 0;
  for (const key of keys) {
    const entry = loginAttemptsMap.get(key);
    if (!entry) continue;
    if (entry.lockedUntil > now) {
      maxRetry = Math.max(maxRetry, Math.ceil((entry.lockedUntil - now) / 1000));
    } else if (entry.lockedUntil > 0 && entry.lockedUntil <= now) {
      loginAttemptsMap.delete(key);
    }
  }
  if (maxRetry > 0) {
    return { allowed: false, retryAfterSeconds: maxRetry };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

function recordMemoryRateLimitKeys(keys: string[]): {
  locked: boolean;
  remainingAttempts: number;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  let maxFailures = 0;

  for (const key of keys) {
    const prev = loginAttemptsMap.get(key);
    const failures =
      prev && now - prev.lastAttemptAt < LOCKOUT_MS ? prev.failures + 1 : 1;
    maxFailures = Math.max(maxFailures, failures);

    if (failures >= MAX_FAILED_ATTEMPTS) {
      loginAttemptsMap.set(key, {
        failures,
        lockedUntil: now + LOCKOUT_MS,
        lastAttemptAt: now,
      });
    } else {
      loginAttemptsMap.set(key, {
        failures,
        lockedUntil: 0,
        lastAttemptAt: now,
      });
    }
  }

  if (maxFailures >= MAX_FAILED_ATTEMPTS) {
    return {
      locked: true,
      remainingAttempts: 0,
      retryAfterSeconds: LOCKOUT_SECONDS,
    };
  }

  return {
    locked: false,
    remainingAttempts: MAX_FAILED_ATTEMPTS - maxFailures,
    retryAfterSeconds: 0,
  };
}

export async function checkLoginRateLimit(
  req: IncomingMessage,
  username: string
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const keys = getRateLimitKeys(req, username);
  const upstash = getUpstashConfig();

  if (upstash) {
    const commands: Array<Array<string | number>> = [];
    for (const key of keys) {
      commands.push(['GET', key], ['TTL', key]);
    }
    const results = await runUpstashPipeline(upstash, commands);
    if (results && results.length === keys.length * 2) {
      let maxRetry = 0;
      for (let i = 0; i < keys.length; i++) {
        const count = Number(results[i * 2]?.result || 0);
        const ttl = Number(results[i * 2 + 1]?.result || 0);
        if (count >= MAX_FAILED_ATTEMPTS) {
          maxRetry = Math.max(maxRetry, ttl > 0 ? ttl : LOCKOUT_SECONDS);
        }
      }
      if (maxRetry > 0) {
        return { allowed: false, retryAfterSeconds: maxRetry };
      }
      return { allowed: true, retryAfterSeconds: 0 };
    }
  }

  if (isProduction()) {
    console.warn(
      '[auth] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN belum diset; rate limit memakai fallback in-memory per instance.'
    );
  }
  return checkMemoryRateLimitKeys(keys);
}

export async function recordLoginFailure(
  req: IncomingMessage,
  username: string
): Promise<{ locked: boolean; remainingAttempts: number; retryAfterSeconds: number }> {
  const keys = getRateLimitKeys(req, username);
  const upstash = getUpstashConfig();

  if (upstash) {
    const commands: Array<Array<string | number>> = [];
    for (const key of keys) {
      commands.push(['INCR', key], ['TTL', key]);
    }
    const results = await runUpstashPipeline(upstash, commands);
    if (results && results.length === keys.length * 2) {
      const expireCommands: Array<Array<string | number>> = [];
      let maxFailures = 0;
      let maxTtl = LOCKOUT_SECONDS;

      for (let i = 0; i < keys.length; i++) {
        const count = Number(results[i * 2]?.result || 1);
        const ttl = Number(results[i * 2 + 1]?.result ?? -1);
        maxFailures = Math.max(maxFailures, count);
        if (ttl < 0 || count === 1) {
          expireCommands.push(['EXPIRE', keys[i], LOCKOUT_SECONDS]);
        } else if (ttl > 0) {
          maxTtl = Math.max(maxTtl, ttl);
        }
      }

      if (expireCommands.length > 0) {
        await runUpstashPipeline(upstash, expireCommands);
      }

      if (maxFailures >= MAX_FAILED_ATTEMPTS) {
        return {
          locked: true,
          remainingAttempts: 0,
          retryAfterSeconds: maxTtl > 0 ? maxTtl : LOCKOUT_SECONDS,
        };
      }

      return {
        locked: false,
        remainingAttempts: Math.max(0, MAX_FAILED_ATTEMPTS - maxFailures),
        retryAfterSeconds: 0,
      };
    }
  }

  return recordMemoryRateLimitKeys(keys);
}

export async function clearLoginFailures(
  req: IncomingMessage,
  username: string
): Promise<void> {
  const keys = getRateLimitKeys(req, username);
  for (const key of keys) {
    loginAttemptsMap.delete(key);
  }

  const upstash = getUpstashConfig();
  if (upstash && keys.length > 0) {
    await runUpstashPipeline(upstash, [['DEL', ...keys]]);
  }
}

export async function delayFailedLogin(ms = 300): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function resetMemoryRateLimiterForTests(): void {
  loginAttemptsMap.clear();
}
