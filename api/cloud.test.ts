import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSessionCookieHeader,
  signSessionToken,
} from './_lib/auth.js';
import { resetInMemoryCloudConfigForTests } from './_lib/cloudConfig.js';
import type { ApiRequest, ApiResponse } from './_lib/http.js';
import cloudConfigHandler from './cloud-config.js';
import cloudHandler from './cloud.js';
import { generateAppsScriptCode } from '../src/data/posData.js';

function createMockRequest(options: {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, unknown>;
}): ApiRequest {
  return {
    method: options.method || 'GET',
    headers: {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      'x-requested-with': 'XMLHttpRequest',
      ...(options.headers || {}),
    },
    body: options.body,
    query: options.query || {},
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

describe('TAHAP 4: Apps Script token transmitted only in POST body (never URL)', () => {
  const prevEnv: Record<string, string | undefined> = {};
  const keys = [
    'VERCEL',
    'SESSION_SECRET',
    'APPS_SCRIPT_URL',
    'APPS_SCRIPT_TOKEN',
    'DATABASE_CONFIG_PATH',
  ];
  let tempDir = '';

  beforeEach(async () => {
    for (const k of keys) {
      prevEnv[k] = process.env[k];
      delete process.env[k];
    }
    resetInMemoryCloudConfigForTests();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pinkpos-cloud-test-'));
    process.env.DATABASE_CONFIG_PATH = path.join(tempDir, 'db.config.json');
    process.env.VERCEL = '1';
    process.env.SESSION_SECRET = 'k'.repeat(40);
    process.env.APPS_SCRIPT_URL =
      'https://script.google.com/macros/s/AKfycbTestDeployId/exec';
    process.env.APPS_SCRIPT_TOKEN = 'super-secret-apps-script-token-999';
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const k of keys) {
      if (prevEnv[k] === undefined) delete process.env[k];
      else process.env[k] = prevEnv[k];
    }
    resetInMemoryCloudConfigForTests();
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('sends /api/cloud GET read request upstream via POST JSON body without putting token in URL', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'ok',
            products: [],
            orders: [],
            categories: [],
            sheetUrl: 'https://docs.google.com/spreadsheets/d/abc123456789012345/edit',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const cookie = buildSessionCookieHeader(
      createMockRequest({}),
      signSessionToken('admin')
    ).split(';')[0];

    const req = createMockRequest({
      method: 'GET',
      headers: { cookie },
    });
    const { res, result } = createMockResponse();

    await cloudHandler(req, res);
    expect(result().statusCode).toBe(200);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
    expect(String(calledUrl)).not.toContain('token=');
    expect(String(calledUrl)).not.toContain('super-secret-apps-script-token-999');
    expect(calledInit?.method).toBe('POST');

    const sentBody = JSON.parse(String(calledInit?.body || '{}')) as Record<
      string,
      unknown
    >;
    expect(sentBody.action).toBe('getAllData');
    expect(sentBody.token).toBe('super-secret-apps-script-token-999');
  });

  it('sends /api/cloud-config connection probe upstream via POST JSON body without token in URL', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'ok',
            products: [],
            orders: [],
            categories: [],
            sheetUrl: 'https://docs.google.com/spreadsheets/d/xyz123456789012345/edit',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const cookie = buildSessionCookieHeader(
      createMockRequest({}),
      signSessionToken('admin')
    ).split(';')[0];

    const req = createMockRequest({
      method: 'POST',
      headers: { cookie },
      body: {
        appsScriptUrl: 'https://script.google.com/macros/s/AKfycbProbe/exec',
        appsScriptToken: 'probe-secret-token-123',
        verifyConnection: true,
      },
    });
    const { res, result } = createMockResponse();

    await cloudConfigHandler(req, res);
    expect(result().statusCode).toBe(200);
    expect(result().body.connectionOk).toBe(true);

    const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
    expect(String(calledUrl)).not.toContain('token=');
    expect(String(calledUrl)).not.toContain('probe-secret-token-123');
    expect(calledInit?.method).toBe('POST');
    const sentBody = JSON.parse(String(calledInit?.body || '{}')) as Record<
      string,
      unknown
    >;
    expect(sentBody.action).toBe('getAllData');
    expect(sentBody.token).toBe('probe-secret-token-123');
  });

  it('generates Code.gs with constant-time verifyToken, getAllData inside doPost, and no URL token reads in doGet', () => {
    const script = generateAppsScriptCode({
      GOOGLE_SHEET_URL: '',
      GOOGLE_DRIVE_FOLDER_URL: '',
      SHEET_NAME_PRODUCTS: 'Products',
      SHEET_NAME_ORDERS: 'Orders',
      LAST_SYNCED: '',
    });

    expect(script).not.toContain('e.parameter.token');
    expect(script).toContain('if (action === "getAllData")');
    expect(script).toContain('charCodeAt');
    expect(script).toContain('diff |=');
    expect(script).toContain('method_not_allowed');
  });
});
