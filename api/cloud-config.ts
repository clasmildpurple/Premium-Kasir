import { getAuthenticatedSession } from './_lib/auth.js';
import {
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

export default async function handler(
  req: ApiRequest,
  res: ApiResponse
): Promise<void> {
  const session = getAuthenticatedSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  const method = (req.method || 'GET').toUpperCase();

  if (method === 'GET') {
    const cfg = await getServerCloudConfig();
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
    }>(req);

    if (!body || typeof body !== 'object') {
      sendJson(res, 400, { error: 'Payload JSON tidak valid.' });
      return;
    }

    const existing = await getServerCloudConfig();
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
          'URL Apps Script tidak valid. Harus HTTPS dengan format https://script.google.com/macros/s/.../exec',
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

    const saved = await saveExternalCloudConfig({
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
    });

    sendJson(res, 200, {
      ok: true,
      configured: true,
      source: 'external-file',
      configFilePath: saved.configFilePath,
      savedToDisk: saved.savedToDisk,
      appsScriptUrl: nextUrl,
      hasToken: true,
    });
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
}
