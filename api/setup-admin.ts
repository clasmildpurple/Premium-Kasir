import {
  buildSessionCookieHeader,
  ensureSessionSecretReady,
  getActiveAdminCredentials,
  hashPasswordScrypt,
  isProduction,
  isValidSetupToken,
  saveRuntimeCredentials,
  signSessionToken,
} from './_lib/auth.js';
import {
  buildCloudConfigCookieHeader,
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
  if ((req.method || '').toUpperCase() !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (!isValidCsrfOrigin(req)) {
    sendJson(res, 403, { error: 'Invalid request origin' });
    return;
  }

  if (!ensureSessionSecretReady(res)) {
    return;
  }

  const creds = await getActiveAdminCredentials();
  if (creds.source !== 'unset') {
    sendJson(res, 403, {
      error: 'Akun admin sudah dikonfigurasi. Silakan login.',
    });
    return;
  }

  const inProd = isProduction();
  if (inProd) {
    const envUser = process.env.ADMIN_USERNAME?.trim() || '';
    const envHash = process.env.ADMIN_PASSWORD_HASH?.trim() || '';
    const envSecret = process.env.SESSION_SECRET?.trim() || '';
    if (!envUser || !envHash || !envSecret) {
      if (!isValidSetupToken(req)) {
        sendJson(res, 403, {
          error:
            'Setup admin dinonaktifkan di production. Isi ADMIN_USERNAME, ADMIN_PASSWORD_HASH, dan SESSION_SECRET di environment variable atau sertakan header x-setup-token yang valid.',
        });
        return;
      }
    }
  }

  const body = await readJsonBody<{
    username?: unknown;
    password?: unknown;
    confirmPassword?: unknown;
    cloudConfig?: {
      appsScriptUrl?: unknown;
      appsScriptToken?: unknown;
      googleSheetUrl?: unknown;
      googleDriveFolderUrl?: unknown;
    };
  }>(req);

  const username =
    typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const confirmPassword =
    typeof body?.confirmPassword === 'string' ? body.confirmPassword : '';

  if (!username || !password || !confirmPassword) {
    sendJson(res, 400, {
      error: 'Username, password, dan konfirmasi password wajib diisi.',
    });
    return;
  }

  if (password.length < 8) {
    sendJson(res, 400, {
      error: 'Password minimal 8 karakter.',
    });
    return;
  }

  if (password !== confirmPassword) {
    sendJson(res, 400, {
      error: 'Konfirmasi password tidak sesuai.',
    });
    return;
  }

  const cookiesToSet: string[] = [];

  if (body?.cloudConfig && typeof body.cloudConfig === 'object') {
    const rawUrl =
      typeof body.cloudConfig.appsScriptUrl === 'string'
        ? body.cloudConfig.appsScriptUrl.trim()
        : '';
    const rawToken =
      typeof body.cloudConfig.appsScriptToken === 'string'
        ? body.cloudConfig.appsScriptToken.trim()
        : '';
    const rawSheet =
      typeof body.cloudConfig.googleSheetUrl === 'string'
        ? body.cloudConfig.googleSheetUrl.trim()
        : '';
    const rawDrive =
      typeof body.cloudConfig.googleDriveFolderUrl === 'string'
        ? body.cloudConfig.googleDriveFolderUrl.trim()
        : '';

    if (rawUrl || rawToken) {
      if (!rawUrl || !isAllowedAppsScriptUrl(rawUrl)) {
        sendJson(res, 400, {
          error:
            'URL Apps Script tidak valid. Harus HTTPS dengan format https://script.google.com/macros/s/.../exec (atau /a/macros/.../exec)',
        });
        return;
      }
      if (!rawToken) {
        sendJson(res, 400, {
          error: 'API Token Apps Script wajib diisi.',
        });
        return;
      }
      const nextCloudPayload = {
        appsScriptUrl: rawUrl,
        appsScriptToken: rawToken,
        googleSheetUrl: rawSheet,
        googleDriveFolderUrl: rawDrive,
      };
      await saveExternalCloudConfig(nextCloudPayload);
      cookiesToSet.push(buildCloudConfigCookieHeader(req, nextCloudPayload));
    }
  }

  const hash = hashPasswordScrypt(password);
  if (!inProd) {
    await saveRuntimeCredentials(username, hash);
  }

  const token = signSessionToken(username);
  const cookieHeader = buildSessionCookieHeader(req, token);
  cookiesToSet.push(cookieHeader);

  sendJson(
    res,
    201,
    {
      authenticated: true,
      username,
      ...(inProd
        ? {
            requiresEnvUpdate: true,
            message:
              'Sesi sementara dibuat. Agar akun admin permanen di production, atur ADMIN_USERNAME dan ADMIN_PASSWORD_HASH (via npm run hash-password) di Vercel.',
          }
        : {}),
    },
    { 'Set-Cookie': cookiesToSet }
  );
}
