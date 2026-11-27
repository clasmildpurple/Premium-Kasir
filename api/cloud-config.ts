import {
  checkLoginRateLimit,
  clearLoginFailures,
  delayFailedLogin,
  ensureSessionSecretReady,
  getActiveAdminCredentials,
  getAuthenticatedSession,
  recordLoginFailure,
  verifyPasswordScrypt,
} from './_lib/auth.js';
import {
  buildCloudConfigCookieHeader,
  getServerCloudConfig,
  isAllowedAppsScriptUrl,
  saveExternalCloudConfig,
} from './_lib/cloudConfig.js';
import {
  type ApiRequest,
  type ApiResponse,
  isValidCsrfOrigin,
  readJsonBody,
  sendJson,
} from './_lib/http.js';

async function probeAppsScriptConnection(params: {
  appsScriptUrl: string;
  appsScriptToken: string;
  googleSheetUrl?: string;
  googleDriveFolderUrl?: string;
}): Promise<{
  connectionOk: boolean;
  sheetUrl?: string;
  isEmptySheet?: boolean;
  connectionError?: string;
}> {
  try {
    const upstream = await fetch(params.appsScriptUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'getAllData',
        token: params.appsScriptToken,
        ...(params.googleSheetUrl ? { googleSheetUrl: params.googleSheetUrl } : {}),
        ...(params.googleDriveFolderUrl
          ? { googleDriveFolderUrl: params.googleDriveFolderUrl }
          : {}),
      }),
    });

    const rawText = await upstream.text();
    if (!upstream.ok) {
      return {
        connectionOk: false,
        connectionError: `Upstream Apps Script error (HTTP ${upstream.status}).`,
      };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      const looksLikeHtml = rawText.trim().startsWith('<');
      return {
        connectionOk: false,
        connectionError: looksLikeHtml
          ? 'Apps Script mengembalikan halaman HTML/login (bukan JSON). Pastikan Web App di-deploy dengan "Who has access: Anyone" dan URL berakhiran /exec.'
          : 'Respons Apps Script tidak valid (bukan JSON).',
      };
    }

    if (parsed.error === 'unauthorized') {
      return {
        connectionOk: false,
        connectionError:
          'Token Apps Script ditolak (unauthorized). Periksa API_TOKEN di Script Properties dan samakan dengan API Token di sini.',
      };
    }

    if (
      parsed.status === 'error' ||
      (typeof parsed.error === 'string' && parsed.error)
    ) {
      const errDetail =
        (typeof parsed.error === 'string' && parsed.error) ||
        (typeof parsed.message === 'string' && parsed.message) ||
        'Apps Script mengembalikan status error.';
      return {
        connectionOk: false,
        connectionError: `Apps Script error: ${errDetail}`,
      };
    }

    const sheetUrl =
      typeof parsed.sheetUrl === 'string' ? parsed.sheetUrl : undefined;
    const isEmptySheet =
      (!Array.isArray(parsed.products) || parsed.products.length === 0) &&
      (!Array.isArray(parsed.orders) || parsed.orders.length === 0) &&
      (!Array.isArray(parsed.categories) || parsed.categories.length === 0);

    return {
      connectionOk: true,
      sheetUrl,
      isEmptySheet,
    };
  } catch (err) {
    return {
      connectionOk: false,
      connectionError:
        err instanceof Error
          ? `Gagal menghubungi Apps Script: ${err.message}`
          : 'Gagal menghubungi Apps Script.',
    };
  }
}

export default async function handler(
  req: ApiRequest,
  res: ApiResponse
): Promise<void> {
  if (!ensureSessionSecretReady(res)) {
    return;
  }

  const method = (req.method || 'GET').toUpperCase();

  if (method === 'GET') {
    const session = getAuthenticatedSession(req);
    if (!session) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }

    const cfg = await getServerCloudConfig(req);
    const configured =
      Boolean(cfg.appsScriptUrl) &&
      Boolean(cfg.appsScriptToken) &&
      isAllowedAppsScriptUrl(cfg.appsScriptUrl);

    sendJson(res, 200, {
      configured,
      source: cfg.source,
      configFilePath: cfg.configFilePath,
      appsScriptUrl: cfg.appsScriptUrl,
      hasToken: Boolean(cfg.appsScriptToken),
      googleSheetUrl: cfg.googleSheetUrl || '',
      googleDriveFolderUrl: cfg.googleDriveFolderUrl || '',
    });
    return;
  }

  if (method === 'POST') {
    if (!isValidCsrfOrigin(req)) {
      sendJson(res, 403, { error: 'Invalid request origin' });
      return;
    }

    const body = await readJsonBody<{
      appsScriptUrl?: string;
      appsScriptToken?: string;
      googleSheetUrl?: string;
      googleDriveFolderUrl?: string;
      adminUsername?: string;
      adminPassword?: string;
      verifyConnection?: boolean;
    }>(req);

    if (!body || typeof body !== 'object') {
      sendJson(res, 400, { error: 'Payload JSON tidak valid.' });
      return;
    }

    const session = getAuthenticatedSession(req);
    const creds = await getActiveAdminCredentials();

    if (!session) {
      // Allow unauthenticated save during initial first-run setup (when no admin exists yet)
      if (creds.source !== 'unset') {
        const adminUsername =
          typeof body.adminUsername === 'string'
            ? body.adminUsername.trim()
            : '';
        const adminPassword =
          typeof body.adminPassword === 'string' ? body.adminPassword : '';

        if (!adminUsername || !adminPassword) {
          sendJson(res, 401, {
            error:
              'Masukkan Username dan Password admin untuk menyimpan pengaturan database dari halaman login.',
          });
          return;
        }

        const rateCheck = await checkLoginRateLimit(req, adminUsername);
        if (!rateCheck.allowed) {
          res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
          sendJson(res, 429, {
            error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${Math.ceil(rateCheck.retryAfterSeconds / 60)} menit.`,
          });
          return;
        }

        const passOk = verifyPasswordScrypt(adminPassword, creds.passwordHash);
        const userOk =
          adminUsername.toLowerCase() === creds.username.toLowerCase();
        if (!userOk || !passOk) {
          await delayFailedLogin(300);
          const fail = await recordLoginFailure(req, adminUsername);
          if (fail.locked) {
            res.setHeader('Retry-After', String(fail.retryAfterSeconds));
            sendJson(res, 429, {
              error:
                'Terlalu banyak percobaan login gagal (5x). Akun dikunci selama 5 menit.',
            });
            return;
          }
          sendJson(res, 401, {
            error: 'Username atau password salah.',
          });
          return;
        }

        await clearLoginFailures(req, adminUsername);
      }
    }

    const existing = await getServerCloudConfig(req);
    const nextUrl =
      typeof body.appsScriptUrl === 'string'
        ? body.appsScriptUrl.trim()
        : existing.appsScriptUrl;
    const nextToken =
      typeof body.appsScriptToken === 'string' && body.appsScriptToken.trim()
        ? body.appsScriptToken.trim()
        : existing.appsScriptToken;

    if (!nextUrl) {
      sendJson(res, 400, {
        error: 'URL Web App Google Apps Script (/exec) wajib diisi.',
      });
      return;
    }

    if (!isAllowedAppsScriptUrl(nextUrl)) {
      sendJson(res, 400, {
        error:
          'URL Apps Script tidak valid. Harus HTTPS dengan format https://script.google.com/macros/s/.../exec (atau /a/macros/.../exec)',
      });
      return;
    }

    if (!nextToken) {
      sendJson(res, 400, {
        error:
          'API Token Apps Script wajib diisi (harus sama dengan API_TOKEN di Script Properties).',
      });
      return;
    }

    const nextConfigPayload = {
      appsScriptUrl: nextUrl,
      appsScriptToken: nextToken,
      googleSheetUrl:
        typeof body.googleSheetUrl === 'string'
          ? body.googleSheetUrl.trim()
          : existing.googleSheetUrl,
      googleDriveFolderUrl:
        typeof body.googleDriveFolderUrl === 'string'
          ? body.googleDriveFolderUrl.trim()
          : existing.googleDriveFolderUrl,
    };

    let saved = await saveExternalCloudConfig(nextConfigPayload);

    const shouldProbe = body.verifyConnection !== false;
    const probe = shouldProbe
      ? await probeAppsScriptConnection(nextConfigPayload)
      : { connectionOk: true as const };

    if (
      probe.connectionOk &&
      probe.sheetUrl &&
      !nextConfigPayload.googleSheetUrl
    ) {
      nextConfigPayload.googleSheetUrl = probe.sheetUrl;
      saved = await saveExternalCloudConfig(nextConfigPayload);
    }

    const configCookie = buildCloudConfigCookieHeader(req, nextConfigPayload);

    sendJson(
      res,
      200,
      {
        ok: true,
        configured: true,
        source: 'external-file',
        configFilePath: saved.configFilePath,
        savedToDisk: saved.savedToDisk,
        appsScriptUrl: nextUrl,
        hasToken: true,
        googleSheetUrl: nextConfigPayload.googleSheetUrl || '',
        connectionOk: probe.connectionOk,
        sheetUrl: probe.sheetUrl || nextConfigPayload.googleSheetUrl || '',
        isEmptySheet: probe.isEmptySheet,
        connectionError: probe.connectionError,
      },
      { 'Set-Cookie': configCookie }
    );
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
}
