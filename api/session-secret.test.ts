import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SESSION_SECRET_MISSING_MESSAGE,
  SessionSecretError,
  getSessionSecret,
  resetDevSecretCacheForTests,
} from './_lib/auth.js';
import type { ApiRequest, ApiResponse } from './_lib/http.js';
import changePasswordHandler from './change-password.js';
import loginHandler from './login.js';
import logoutHandler from './logout.js';
import sessionHandler from './session.js';
import setupAdminHandler from './setup-admin.js';

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

describe('TAHAP 2: Mandatory stable SESSION_SECRET in production vs .data dev fallback', () => {
  const prevEnv: Record<string, string | undefined> = {};
  const keys = ['VERCEL', 'NODE_ENV', 'SESSION_SECRET'];

  beforeEach(() => {
    for (const k of keys) {
      prevEnv[k] = process.env[k];
      delete process.env[k];
    }
    resetDevSecretCacheForTests();
  });

  afterEach(() => {
    for (const k of keys) {
      if (prevEnv[k] === undefined) delete process.env[k];
      else process.env[k] = prevEnv[k];
    }
    resetDevSecretCacheForTests();
  });

  it('throws SessionSecretError in production when SESSION_SECRET is empty or < 32 chars and never writes /tmp secret', () => {
    const tmpSecretPath = path.join(os.tmpdir(), 'pinkpos-session-secret');
    try {
      fsSync.rmSync(tmpSecretPath, { force: true });
    } catch {
      // ignore
    }

    process.env.NODE_ENV = 'production';
    expect(() => getSessionSecret()).toThrowError(SessionSecretError);

    process.env.SESSION_SECRET = 'too-short-secret-under-32';
    expect(() => getSessionSecret()).toThrowError(SessionSecretError);
    expect(fsSync.existsSync(tmpSecretPath)).toBe(false);

    process.env.SESSION_SECRET = 'x'.repeat(32);
    expect(getSessionSecret()).toBe('x'.repeat(32));
  });

  it('fails with 500 SESSION_SECRET belum dikonfigurasi across all auth endpoints in production', async () => {
    process.env.VERCEL = '1';
    process.env.SESSION_SECRET = 'short';

    const endpoints: Array<{
      name: string;
      method: string;
      fn: (req: ApiRequest, res: ApiResponse) => Promise<void>;
    }> = [
      { name: 'session', method: 'GET', fn: sessionHandler },
      { name: 'login', method: 'POST', fn: loginHandler },
      { name: 'logout', method: 'POST', fn: logoutHandler },
      { name: 'setup-admin', method: 'POST', fn: setupAdminHandler },
      { name: 'change-password', method: 'POST', fn: changePasswordHandler },
    ];

    for (const ep of endpoints) {
      const req = createMockRequest({
        method: ep.method,
        body: { username: 'a', password: 'Password123!' },
      });
      const { res, result } = createMockResponse();
      await ep.fn(req, res);
      const out = result();
      expect(out.statusCode, `Expected 500 for ${ep.name}`).toBe(500);
      expect(out.body.error).toBe(SESSION_SECRET_MISSING_MESSAGE);
    }
  });

  it('creates/reuses stable fallback secret in .data/session-secret only when NODE_ENV !== production', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.VERCEL;
    delete process.env.SESSION_SECRET;

    const dataDir = path.resolve(process.cwd(), '.data');
    const devSecretFile = path.join(dataDir, 'session-secret');
    const existedBefore = fsSync.existsSync(devSecretFile);

    try {
      const secret1 = getSessionSecret();
      expect(secret1.length).toBeGreaterThanOrEqual(32);

      expect(fsSync.existsSync(devSecretFile)).toBe(true);
      expect(fsSync.readFileSync(devSecretFile, 'utf-8').trim()).toBe(secret1);

      resetDevSecretCacheForTests();
      const secret2 = getSessionSecret();
      expect(secret2).toBe(secret1);
    } finally {
      if (!existedBefore) {
        fsSync.rmSync(devSecretFile, { force: true });
        try {
          if (fsSync.existsSync(dataDir) && fsSync.readdirSync(dataDir).length === 0) {
            fsSync.rmdirSync(dataDir);
          }
        } catch {
          // ignore if directory not empty
        }
      }
    }
  });
});
