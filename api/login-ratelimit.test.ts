import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hashPasswordScrypt,
  resetMemoryRateLimiterForTests,
} from './_lib/auth.js';
import { type ApiRequest, type ApiResponse, getClientIp } from './_lib/http.js';
import loginHandler from './login.js';

function createMockRequest(options: {
  headers?: Record<string, string>;
  body?: unknown;
  remoteAddress?: string;
}): ApiRequest {
  return {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      'x-requested-with': 'XMLHttpRequest',
      ...(options.headers || {}),
    },
    body: options.body,
    socket: { remoteAddress: options.remoteAddress || '198.51.100.10' },
  } as unknown as ApiRequest;
}

function createMockResponse() {
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

describe('TAHAP 3: Login rate limiting, trusted Vercel IP, dual lock, & constant delay', () => {
  const prevEnv: Record<string, string | undefined> = {};
  const trackedKeys = [
    'VERCEL',
    'NODE_ENV',
    'SESSION_SECRET',
    'ADMIN_USERNAME',
    'ADMIN_PASSWORD_HASH',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
  ];

  beforeEach(() => {
    for (const k of trackedKeys) {
      prevEnv[k] = process.env[k];
      delete process.env[k];
    }
    resetMemoryRateLimiterForTests();
    process.env.VERCEL = '1';
    process.env.SESSION_SECRET = 's'.repeat(40);
    process.env.ADMIN_USERNAME = 'admin@sukapos.id';
    process.env.ADMIN_PASSWORD_HASH = hashPasswordScrypt('CorrectPass123!');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const k of trackedKeys) {
      if (prevEnv[k] === undefined) delete process.env[k];
      else process.env[k] = prevEnv[k];
    }
    resetMemoryRateLimiterForTests();
  });

  it('ignores spoofable x-forwarded-for and prefers x-vercel-forwarded-for / x-real-ip', () => {
    const req1 = createMockRequest({
      headers: {
        'x-forwarded-for': '203.0.113.99, 10.0.0.1',
        'x-vercel-forwarded-for': '198.51.100.25',
      },
    });
    expect(getClientIp(req1)).toBe('198.51.100.25');

    const req2 = createMockRequest({
      headers: {
        'x-forwarded-for': '203.0.113.88',
        'x-real-ip': '192.0.2.44',
      },
    });
    expect(getClientIp(req2)).toBe('192.0.2.44');

    const req3 = createMockRequest({
      headers: {
        'x-forwarded-for': '203.0.113.77',
      },
      remoteAddress: '198.51.100.55',
    });
    expect(getClientIp(req3)).toBe('198.51.100.55');
  });

  it('blocks 6th login attempt and cannot be bypassed by spoofing x-forwarded-for or rotating IP for same username', async () => {
    // 4 failed attempts with different spoofed x-forwarded-for headers
    for (let i = 1; i <= 4; i++) {
      const req = createMockRequest({
        headers: {
          'x-forwarded-for': `10.10.0.${i}`,
          'x-vercel-forwarded-for': `203.0.113.${i}`, // rotating real IP too, same username!
        },
        body: {
          username: 'admin@sukapos.id',
          password: 'WrongPassword!',
        },
      });
      const { res, result } = createMockResponse();
      await loginHandler(req, res);
      expect(result().statusCode).toBe(401);
      expect(result().body.error).toBe('Username atau password salah.');
    }

    // 5th attempt triggers lock
    const fifthReq = createMockRequest({
      headers: {
        'x-forwarded-for': '9.9.9.9',
        'x-vercel-forwarded-for': '203.0.113.99',
      },
      body: {
        username: 'admin@sukapos.id',
        password: 'WrongPassword!',
      },
    });
    const fifthRes = createMockResponse();
    await loginHandler(fifthReq, fifthRes.res);
    expect(fifthRes.result().statusCode).toBe(429);

    // 6th attempt even with completely different spoofed header AND different IP MUST be blocked for that username
    const sixthReq = createMockRequest({
      headers: {
        'x-forwarded-for': '8.8.8.8',
        'x-vercel-forwarded-for': '192.0.2.200',
      },
      body: {
        username: 'admin@sukapos.id',
        password: 'CorrectPass123!',
      },
    });
    const sixthRes = createMockResponse();
    await loginHandler(sixthReq, sixthRes.res);
    expect(sixthRes.result().statusCode).toBe(429);
    expect(sixthRes.result().headers['retry-after']).toBeDefined();
  });

  it('returns identical error message for invalid username vs invalid password and includes ~300ms delay', async () => {
    const startBadUser = Date.now();
    const badUserRes = createMockResponse();
    await loginHandler(
      createMockRequest({
        headers: { 'x-real-ip': '198.51.100.70' },
        body: { username: 'bukan-admin', password: 'CorrectPass123!' },
      }),
      badUserRes.res
    );
    const badUserElapsed = Date.now() - startBadUser;

    const startBadPass = Date.now();
    const badPassRes = createMockResponse();
    await loginHandler(
      createMockRequest({
        headers: { 'x-real-ip': '198.51.100.71' },
        body: { username: 'admin@sukapos.id', password: 'WrongPassword!' },
      }),
      badPassRes.res
    );
    const badPassElapsed = Date.now() - startBadPass;

    expect(badUserRes.result().statusCode).toBe(401);
    expect(badPassRes.result().statusCode).toBe(401);
    expect(badUserRes.result().body.error).toBe(badPassRes.result().body.error);
    expect(badUserElapsed).toBeGreaterThanOrEqual(250);
    expect(badPassElapsed).toBeGreaterThanOrEqual(250);
  });

  it('uses shared Upstash Redis REST storage via fetch when UPSTASH_REDIS_REST_* env vars are set', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'upstash-token-secret';

    const store = new Map<string, number>();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (_url, init) => {
        const commands = JSON.parse(String(init?.body || '[]')) as Array<
          [string, string, ...unknown[]]
        >;
        const out = commands.map(([cmd, key]) => {
          if (cmd === 'GET') {
            return { result: store.has(key) ? String(store.get(key)) : null };
          }
          if (cmd === 'TTL') {
            return { result: store.has(key) ? 300 : -2 };
          }
          if (cmd === 'INCR') {
            const next = (store.get(key) || 0) + 1;
            store.set(key, next);
            return { result: next };
          }
          if (cmd === 'EXPIRE') {
            return { result: 1 };
          }
          if (cmd === 'DEL') {
            store.delete(key);
            return { result: 1 };
          }
          return { result: null };
        });
        return new Response(JSON.stringify(out), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

    for (let i = 1; i <= 5; i++) {
      const req = createMockRequest({
        headers: { 'x-vercel-forwarded-for': '203.0.113.15' },
        body: { username: 'admin@sukapos.id', password: 'WrongPassword!' },
      });
      const { res } = createMockResponse();
      await loginHandler(req, res);
    }

    // 6th attempt from another IP must be blocked by Upstash shared counter
    const sixth = createMockResponse();
    await loginHandler(
      createMockRequest({
        headers: {
          'x-forwarded-for': '1.1.1.1',
          'x-vercel-forwarded-for': '203.0.113.88',
        },
        body: { username: 'admin@sukapos.id', password: 'CorrectPass123!' },
      }),
      sixth.res
    );

    expect(fetchSpy).toHaveBeenCalled();
    expect(sixth.result().statusCode).toBe(429);
  });
});
