import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE_NAME,
  buildSessionCookieHeader,
  hashPasswordScrypt,
  signSessionToken,
} from '../../api/_lib/auth.js';
import type { ApiRequest, ApiResponse } from '../../api/_lib/http.js';
import changePasswordHandler from '../../api/change-password.js';
import setupAdminHandler from '../../api/setup-admin.js';

interface MockResponseResult {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: Record<string, unknown>;
}

function createMockRequest(options: {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}): ApiRequest {
  return {
    method: options.method || 'POST',
    headers: {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      'x-requested-with': 'XMLHttpRequest',
      ...(options.headers || {}),
    },
    body: options.body,
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as ApiRequest;
}

function createMockResponse(): {
  res: ApiResponse;
  result: () => MockResponseResult;
} {
  const headers: Record<string, string | string[]> = {};
  let statusCode = 200;
  let rawEnd = '';

  const res = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(code: number) {
      statusCode = code;
    },
    setHeader(name: string, val: string | string[]) {
      headers[name.toLowerCase()] = val;
    },
    end(chunk?: string) {
      if (chunk) rawEnd += chunk;
    },
  } as unknown as ApiResponse;

  return {
    res,
    result: () => ({
      statusCode,
      headers,
      body: rawEnd ? (JSON.parse(rawEnd) as Record<string, unknown>) : {},
    }),
  };
}

describe('TAHAP 1: /api/setup-admin & /api/change-password hardening', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const trackedKeys = [
    'VERCEL',
    'NODE_ENV',
    'ADMIN_USERNAME',
    'ADMIN_PASSWORD_HASH',
    'SESSION_SECRET',
    'SETUP_TOKEN',
  ];

  beforeEach(() => {
    for (const k of trackedKeys) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of trackedKeys) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it('rejects /api/setup-admin with 403 in production when admin env is unset and no SETUP_TOKEN is provided', async () => {
    process.env.VERCEL = '1';
    process.env.SESSION_SECRET = 'a'.repeat(40);

    const req = createMockRequest({
      body: {
        username: 'attacker',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      },
    });
    const { res, result } = createMockResponse();

    await setupAdminHandler(req, res);
    const out = result();
    expect(out.statusCode).toBe(403);
    expect(String(out.body.error || '')).toMatch(/dinonaktifkan|setup-token/i);
  });

  it('rejects /api/setup-admin with 403 in production when x-setup-token does not match SETUP_TOKEN', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = 'a'.repeat(40);
    process.env.SETUP_TOKEN = 'valid-token-secret';

    const req = createMockRequest({
      headers: { 'x-setup-token': 'wrong-token-secret' },
      body: {
        username: 'attacker',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      },
    });
    const { res, result } = createMockResponse();

    await setupAdminHandler(req, res);
    expect(result().statusCode).toBe(403);
  });

  it('rejects /api/setup-admin with 403 when admin credentials already exist in env (even with valid SETUP_TOKEN)', async () => {
    process.env.VERCEL = '1';
    process.env.SESSION_SECRET = 'a'.repeat(40);
    process.env.SETUP_TOKEN = 'valid-token-secret';
    process.env.ADMIN_USERNAME = 'real-admin';
    process.env.ADMIN_PASSWORD_HASH = hashPasswordScrypt('RealPassword123!');

    const req = createMockRequest({
      headers: { 'x-setup-token': 'valid-token-secret' },
      body: {
        username: 'attacker',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      },
    });
    const { res, result } = createMockResponse();

    await setupAdminHandler(req, res);
    const out = result();
    expect(out.statusCode).toBe(403);
    expect(String(out.body.error || '')).toMatch(/sudah dikonfigurasi/i);
  });

  it('allows /api/setup-admin in production ONLY with valid x-setup-token when admin env is unset, without emitting admin record cookie', async () => {
    process.env.VERCEL = '1';
    process.env.SESSION_SECRET = 'b'.repeat(40);
    process.env.SETUP_TOKEN = 'correct-setup-token-xyz';

    const req = createMockRequest({
      headers: { 'x-setup-token': 'correct-setup-token-xyz' },
      body: {
        username: 'owner@sukapos.id',
        password: 'StrongPassword123!',
        confirmPassword: 'StrongPassword123!',
      },
    });
    const { res, result } = createMockResponse();

    await setupAdminHandler(req, res);
    const out = result();
    expect(out.statusCode).toBe(201);
    expect(out.body.authenticated).toBe(true);
    expect(out.body.username).toBe('owner@sukapos.id');

    const setCookie = out.headers['set-cookie'];
    const cookieList = Array.isArray(setCookie) ? setCookie : [String(setCookie || '')];
    expect(cookieList.some((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))).toBe(true);
    expect(cookieList.some((c) => c.includes('pinkpos_admin_cfg'))).toBe(false);
  });

  it('informs user via /api/change-password in production that permanent change requires updating ADMIN_PASSWORD_HASH in Vercel', async () => {
    process.env.VERCEL = '1';
    process.env.SESSION_SECRET = 'c'.repeat(40);
    process.env.ADMIN_USERNAME = 'admin-prod';
    process.env.ADMIN_PASSWORD_HASH = hashPasswordScrypt('OldPassword123!');

    const sessionToken = signSessionToken('admin-prod');
    const sessionCookie = buildSessionCookieHeader(
      createMockRequest({}),
      sessionToken
    ).split(';')[0];

    const req = createMockRequest({
      headers: { cookie: sessionCookie },
      body: {
        oldPassword: 'OldPassword123!',
        newPassword: 'NewPassword123!',
        confirmPassword: 'NewPassword123!',
      },
    });
    const { res, result } = createMockResponse();

    await changePasswordHandler(req, res);
    const out = result();
    expect(out.statusCode).toBe(400);
    expect(out.body.requiresEnvUpdate).toBe(true);
    expect(String(out.body.error || '')).toContain('ADMIN_PASSWORD_HASH');
    expect(String(out.body.error || '')).toContain('Vercel');
  });
});
