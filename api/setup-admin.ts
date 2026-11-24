import {
  buildSessionCookieHeader,
  getActiveAdminCredentials,
  hashPasswordScrypt,
  saveRuntimeCredentials,
  signSessionToken,
} from './_lib/auth.js';
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

  const creds = await getActiveAdminCredentials();
  if (creds.source !== 'unset') {
    sendJson(res, 403, {
      error: 'Akun admin sudah dikonfigurasi. Silakan login.',
    });
    return;
  }

  const body = await readJsonBody<{
    username?: unknown;
    password?: unknown;
    confirmPassword?: unknown;
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

  const hash = hashPasswordScrypt(password);
  await saveRuntimeCredentials(username, hash);

  const token = signSessionToken(username);
  const cookieHeader = buildSessionCookieHeader(req, token);

  sendJson(
    res,
    201,
    {
      authenticated: true,
      username,
    },
    { 'Set-Cookie': cookieHeader }
  );
}
