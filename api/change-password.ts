import {
  buildSessionCookieHeader,
  getActiveAdminCredentials,
  getAuthenticatedSession,
  hashPasswordScrypt,
  saveRuntimeCredentials,
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

  const session = getAuthenticatedSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'Sesi tidak valid atau telah berakhir.' });
    return;
  }

  const body = await readJsonBody<{
    oldPassword?: unknown;
    newPassword?: unknown;
    confirmPassword?: unknown;
  }>(req);

  const oldPassword =
    typeof body?.oldPassword === 'string' ? body.oldPassword : '';
  const newPassword =
    typeof body?.newPassword === 'string' ? body.newPassword : '';
  const confirmPassword =
    typeof body?.confirmPassword === 'string' ? body.confirmPassword : '';

  if (!oldPassword || !newPassword || !confirmPassword) {
    sendJson(res, 400, {
      error: 'Password lama, password baru, dan konfirmasi wajib diisi.',
    });
    return;
  }

  if (newPassword.length < 8) {
    sendJson(res, 400, {
      error: 'Password baru minimal 8 karakter.',
    });
    return;
  }

  if (newPassword !== confirmPassword) {
    sendJson(res, 400, {
      error: 'Konfirmasi password baru tidak sesuai.',
    });
    return;
  }

  const creds = await getActiveAdminCredentials();
  if (creds.source === 'unset' || !creds.passwordHash) {
    sendJson(res, 503, { error: 'Akun admin belum dikonfigurasi.' });
    return;
  }

  if (!verifyPasswordScrypt(oldPassword, creds.passwordHash)) {
    sendJson(res, 401, { error: 'Password lama tidak sesuai.' });
    return;
  }

  const nextHash = hashPasswordScrypt(newPassword);
  await saveRuntimeCredentials(creds.username, nextHash);

  const refreshedToken = signSessionToken(creds.username);
  const cookieHeader = buildSessionCookieHeader(req, refreshedToken);

  sendJson(
    res,
    200,
    {
      ok: true,
      message: 'Password berhasil diperbarui dengan aman.',
    },
    { 'Set-Cookie': cookieHeader }
  );
}
