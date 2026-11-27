import {
  ensureSessionSecretReady,
  getAuthenticatedSession,
} from './_lib/auth.js';
import {
  getServerCloudConfig,
  isAllowedAppsScriptUrl,
} from './_lib/cloudConfig.js';
import {
  type ApiRequest,
  type ApiResponse,
  isValidCsrfOrigin,
  readJsonBody,
  sendJson,
} from './_lib/http.js';

function stripSensitiveSettings(
  obj: unknown
): Record<string, unknown> | undefined {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
  const copy = { ...(obj as Record<string, unknown>) };
  delete copy.loginUsername;
  delete copy.loginPassword;
  return copy;
}

export default async function handler(
  req: ApiRequest,
  res: ApiResponse
): Promise<void> {
  if (!ensureSessionSecretReady(res)) {
    return;
  }

  const session = getAuthenticatedSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  const method = (req.method || 'GET').toUpperCase();
  const {
    appsScriptUrl,
    appsScriptToken,
    googleSheetUrl,
    googleDriveFolderUrl,
  } = await getServerCloudConfig(req);

  // Status probe so UI knows whether server/external cloud config is ready without leaking token
  if (method === 'GET' && req.query?.mode === 'status') {
    const configured =
      Boolean(appsScriptUrl) &&
      Boolean(appsScriptToken) &&
      isAllowedAppsScriptUrl(appsScriptUrl);
    sendJson(res, 200, { configured });
    return;
  }

  if (!appsScriptUrl || !appsScriptToken) {
    sendJson(res, 503, {
      configured: false,
      error:
        'APPS_SCRIPT_URL atau APPS_SCRIPT_TOKEN belum dikonfigurasi di server environment.',
    });
    return;
  }

  if (!isAllowedAppsScriptUrl(appsScriptUrl)) {
    sendJson(res, 500, {
      configured: false,
      error: 'APPS_SCRIPT_URL server tidak valid (harus HTTPS script.google.com).',
    });
    return;
  }

  if (method === 'GET') {
    try {
      const upstream = await fetch(appsScriptUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'getAllData',
          token: appsScriptToken,
          ...(googleSheetUrl ? { googleSheetUrl } : {}),
          ...(googleDriveFolderUrl ? { googleDriveFolderUrl } : {}),
        }),
      });

      const rawText = await upstream.text();
      if (!upstream.ok) {
        sendJson(res, 502, {
          error: `Upstream Apps Script error (${upstream.status})`,
        });
        return;
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        const looksLikeHtml = rawText.trim().startsWith('<');
        sendJson(res, 502, {
          error: looksLikeHtml
            ? 'Apps Script mengembalikan halaman HTML/login (bukan JSON). Pastikan Web App di-deploy dengan "Who has access: Anyone" (Manage deployments → New version) dan URL berakhiran /exec.'
            : 'Respons Apps Script tidak valid (bukan JSON).',
        });
        return;
      }

      if (parsed.error === 'unauthorized') {
        sendJson(res, 502, {
          error:
            'Token Apps Script ditolak (unauthorized). Periksa API_TOKEN di Script Properties dan API Token pada pengaturan database.',
        });
        return;
      }

      if (parsed.status === 'error' || (typeof parsed.error === 'string' && parsed.error)) {
        const errDetail =
          (typeof parsed.error === 'string' && parsed.error) ||
          (typeof parsed.message === 'string' && parsed.message) ||
          'Apps Script mengembalikan status error.';
        sendJson(res, 502, {
          error: `Apps Script error: ${errDetail}`,
        });
        return;
      }

      if (parsed.storeSettings && typeof parsed.storeSettings === 'object') {
        parsed.storeSettings = stripSensitiveSettings(parsed.storeSettings);
      }

      sendJson(res, 200, parsed);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Gagal menghubungi Apps Script.';
      sendJson(res, 502, { error: msg });
    }
    return;
  }

  if (method === 'POST') {
    if (!isValidCsrfOrigin(req)) {
      sendJson(res, 403, { error: 'Invalid request origin' });
      return;
    }

    const body = await readJsonBody<Record<string, unknown>>(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      sendJson(res, 400, { error: 'Payload JSON tidak valid.' });
      return;
    }

    if (typeof body.action !== 'string' || !body.action.trim()) {
      sendJson(res, 400, { error: 'Field action wajib diisi.' });
      return;
    }

    const sanitizedPayload: Record<string, unknown> = {
      ...body,
      token: appsScriptToken,
      ...(googleSheetUrl && !body.googleSheetUrl ? { googleSheetUrl } : {}),
      ...(googleDriveFolderUrl && !body.googleDriveFolderUrl
        ? { googleDriveFolderUrl }
        : {}),
    };

    if (sanitizedPayload.storeSettings) {
      sanitizedPayload.storeSettings = stripSensitiveSettings(
        sanitizedPayload.storeSettings
      );
    }
    if (sanitizedPayload.settings) {
      sanitizedPayload.settings = stripSensitiveSettings(
        sanitizedPayload.settings
      );
    }

    try {
      const upstream = await fetch(appsScriptUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(sanitizedPayload),
      });

      const rawText = await upstream.text();
      if (!upstream.ok) {
        sendJson(res, 502, {
          error: `Upstream Apps Script error (${upstream.status})`,
        });
        return;
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        const looksLikeHtml = rawText.trim().startsWith('<');
        sendJson(res, 502, {
          error: looksLikeHtml
            ? 'Apps Script mengembalikan halaman HTML/login (bukan JSON). Pastikan Web App di-deploy dengan "Who has access: Anyone" dan URL berakhiran /exec.'
            : 'Respons Apps Script tidak valid (bukan JSON).',
        });
        return;
      }

      if (parsed.error === 'unauthorized') {
        sendJson(res, 502, {
          error:
            'Token Apps Script ditolak (unauthorized). Periksa API_TOKEN di Script Properties dan API Token pada pengaturan database.',
        });
        return;
      }

      if (
        parsed.status === 'error' ||
        (typeof parsed.error === 'string' && parsed.error)
      ) {
        const errDetail =
          (typeof parsed.error === 'string' && parsed.error) ||
          (typeof parsed.message === 'string' && parsed.message) ||
          'Apps Script mengembalikan status error.';
        sendJson(res, 502, {
          error: `Apps Script error: ${errDetail}`,
        });
        return;
      }

      sendJson(res, 200, parsed);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Gagal mengirim data ke Apps Script.';
      sendJson(res, 502, { error: msg });
    }
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
}
