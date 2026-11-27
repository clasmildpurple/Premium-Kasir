import crypto from 'node:crypto';
import {
  buildSessionCookieHeader,
  checkLoginRateLimit,
  clearLoginFailures,
  delayFailedLogin,
  ensureSessionSecretReady,
  getActiveAdminCredentials,
  recordLoginFailure,
  signSessionToken,
  verifyPasswordScrypt,
} from './_lib/auth.js';
import {
  type ApiRequest,
  type ApiResponse,
  isValidCsrfOrigin,
  readJsonBody,
  sendJson,
} from './_lib/http.js';

function safeEqualLower(a: string, b: string): boolean {
  const bufA = Buffer.from(a.trim().toLowerCase(), 'utf-8');
  const bufB = Buffer.from(b.trim().toLowerCase(), 'utf-8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

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

  const body = await readJsonBody<{ username?: unknown; password?: unknown }>(
    req
  );
  const username =
    typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!username || !password) {
    sendJson(res, 400, {
      error: 'Username dan password wajib diisi.',
    });
    return;
  }

  const rateCheck = await checkLoginRateLimit(req, username);
  if (!rateCheck.allowed) {
    res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
    sendJson(res, 429, {
      error: `Terlalu banyak percobaan login gagal. Coba lagi dalam ${Math.ceil(rateCheck.retryAfterSeconds / 60)} menit.`,
      retryAfterSeconds: rateCheck.retryAfterSeconds,
    });
    return;
  }

  const creds = await getActiveAdminCredentials();
  if (creds.source === 'unset' || !creds.passwordHash || !creds.username) {
    sendJson(res, 503, {
      error:
        'Akun admin belum dikonfigurasi. Lakukan setup awal atau isi ADMIN_USERNAME & ADMIN_PASSWORD_HASH.',
      needsSetup: true,
    });
    return;
  }

  const passwordMatches = verifyPasswordScrypt(password, creds.passwordHash);
  const usernameMatches = safeEqualLower(username, creds.username);

  if (!usernameMatches || !passwordMatches) {
    await delayFailedLogin(300);
    const failureInfo = await recordLoginFailure(req, username);
    if (failureInfo.locked) {
      res.setHeader('Retry-After', String(failureInfo.retryAfterSeconds));
      sendJson(res, 429, {
        error:
          'Terlalu banyak percobaan login gagal (5x). Akun dikunci selama 5 menit.',
        retryAfterSeconds: failureInfo.retryAfterSeconds,
      });
      return;
    }

    sendJson(res, 401, {
      error: 'Username atau password salah.',
    });
    return;
  }

  await clearLoginFailures(req, username);

  const token = signSessionToken(creds.username);
  const cookieHeader = buildSessionCookieHeader(req, token);

  sendJson(
    res,
    200,
    {
      authenticated: true,
      username: creds.username,
    },
    { 'Set-Cookie': cookieHeader }
  );
}
