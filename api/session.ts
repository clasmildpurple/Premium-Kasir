import {
  getActiveAdminCredentials,
  getAuthenticatedSession,
} from './_lib/auth.js';
import { type ApiRequest, type ApiResponse, sendJson } from './_lib/http.js';

export default async function handler(
  req: ApiRequest,
  res: ApiResponse
): Promise<void> {
  if ((req.method || '').toUpperCase() !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const creds = await getActiveAdminCredentials(req);
  const needsSetup = creds.source === 'unset';
  const session = getAuthenticatedSession(req);

  if (!session || needsSetup) {
    sendJson(res, 200, {
      authenticated: false,
      needsSetup,
    });
    return;
  }

  sendJson(res, 200, {
    authenticated: true,
    username: session.sub,
    needsSetup: false,
  });
}
