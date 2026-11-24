import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { getClientIp, parseCookies } from './http.js';

export const SESSION_COOKIE_NAME = 'pinkpos_session';
export const ADMIN_RECORD_COOKIE_NAME = 'pinkpos_admin_cfg';
export const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 hours
export const ADMIN_RECORD_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

const PRIMARY_DATA_DIR = path.resolve(process.cwd(), '.data');
const PRIMARY_CRED_PATH = path.join(PRIMARY_DATA_DIR, 'auth.json');
const FALLBACK_CRED_PATH = path.join(os.tmpdir(), 'pinkpos-auth.json');
const PRIMARY_SECRET_PATH = path.join(PRIMARY_DATA_DIR, 'session-secret');
const FALLBACK_SECRET_PATH = path.join(os.tmpdir(), 'pinkpos-session-secret');

let cachedFallbackSecret: string | null = null;

function loadOrCreatePersistentSecret(): string {
  if (cachedFallbackSecret) return cachedFallbackSecret;

  const secretCandidates = process.env.VERCEL
    ? [FALLBACK_SECRET_PATH]
    : [PRIMARY_SECRET_PATH, FALLBACK_SECRET_PATH];

  for (const candidate of secretCandidates) {
    try {
      const existing = fsSync.readFileSync(candidate, 'utf-8').trim();
      if (existing.length >= 32) {
        cachedFallbackSecret = existing;
        return existing;
      }
    } catch {
      // ignore if not found
    }
  }

  const generated = crypto.randomBytes(32).toString('hex');
  cachedFallbackSecret = generated;

  for (const candidate of secretCandidates) {
    try {
      fsSync.mkdirSync(path.dirname(candidate), { recursive: true });
      fsSync.writeFileSync(candidate, generated, { encoding: 'utf-8', mode: 0o600 });
      break;
    } catch {
      // try next candidate
    }
  }

  return generated;
}

export function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) {
    return envSecret;
  }
  return loadOrCreatePersistentSecret();
}

// Runtime credential override store (for password changes / first-run setup when env is unset)
interface StoredCredentials {
  username: string;
  passwordHash: string; // format: "<hex-salt>:<hex-derived-key>"
  updatedAt: string;
}

let inMemoryCredentials: StoredCredentials | null = null;

function getCredentialReadPaths(): string[] {
  return process.env.VERCEL
    ? [FALLBACK_CRED_PATH]
    : [PRIMARY_CRED_PATH, FALLBACK_CRED_PATH];
}

async function readRuntimeCredentials(): Promise<StoredCredentials | null> {
  if (inMemoryCredentials) return inMemoryCredentials;
  for (const credPath of getCredentialReadPaths()) {
    try {
      const raw = await fs.readFile(credPath, 'utf-8');
      const parsed = JSON.parse(raw) as StoredCredentials;
      if (
        parsed &&
        typeof parsed.username === 'string' &&
        typeof parsed.passwordHash === 'string' &&
        parsed.username.trim() &&
        parsed.passwordHash.includes(':')
      ) {
        inMemoryCredentials = parsed;
        return parsed;
      }
    } catch {
      // try next path
    }
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

  for (const credPath of getCredentialReadPaths()) {
    try {
      await fs.mkdir(path.dirname(credPath), { recursive: true });
      await fs.writeFile(credPath, JSON.stringify(record, null, 2), 'utf-8');
      return;
    } catch {
      // try fallback path (e.g. os.tmpdir()) if .data is read-only
    }
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

interface AdminRecordPayload {
  u: string;
  h: string;
  iat: number;
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
  } catch {
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

function readAdminRecordFromCookie(
  req: IncomingMessage
): StoredCredentials | null {
  const cookies = parseCookies(req);
  const rawToken = cookies[ADMIN_RECORD_COOKIE_NAME];
  if (!rawToken) return null;
  const payload = verifySignedPayload<AdminRecordPayload>(rawToken);
  if (
    !payload ||
    typeof payload.u !== 'string' ||
    typeof payload.h !== 'string' ||
    !payload.u.trim() ||
    !payload.h.includes(':')
  ) {
    return null;
  }
  return {
    username: payload.u.trim(),
    passwordHash: payload.h,
    updatedAt: new Date((payload.iat || 0) * 1000).toISOString(),
  };
}

export async function getActiveAdminCredentials(req?: IncomingMessage): Promise<{
  username: string;
  passwordHash: string;
  source: 'env' | 'runtime' | 'unset';
}> {
  const runtimeCreds = await readRuntimeCredentials();
  const envHash = process.env.ADMIN_PASSWORD_HASH?.trim() || '';
  const envUser = process.env.ADMIN_USERNAME?.trim() || '';

  // If runtime setup/password change happened on this server, honor it first
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

  // Fallback for stateless serverless or ephemeral containers: signed HttpOnly admin record cookie
  if (req) {
    const cookieCreds = readAdminRecordFromCookie(req);
    if (cookieCreds) {
      inMemoryCredentials = cookieCreds;
      return {
        username: cookieCreds.username,
        passwordHash: cookieCreds.passwordHash,
        source: 'runtime',
      };
    }
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

export function buildAdminRecordCookieHeader(
  req: IncomingMessage,
  username: string,
  passwordHash: string
): string {
  const payload: AdminRecordPayload = {
    u: username.trim(),
    h: passwordHash,
    iat: Math.floor(Date.now() / 1000),
  };
  const signed = signSignedPayload(payload);
  return buildCookieHeader(
    req,
    ADMIN_RECORD_COOKIE_NAME,
    signed,
    ADMIN_RECORD_TTL_SECONDS
  );
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
