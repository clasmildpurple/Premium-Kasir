import { buildSessionCookieHeader } from './_lib/auth.js';
import {
  type ApiRequest,
  type ApiResponse,
  isValidCsrfOrigin,
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

  const expiredCookie = buildSessionCookieHeader(req, '', 0);
  sendJson(
    res,
    200,
    { authenticated: false },
    { 'Set-Cookie': expiredCookie }
  );
}
