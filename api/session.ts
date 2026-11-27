import {
  ensureSessionSecretReady,
  getActiveAdminCredentials,
  getAuthenticatedSession,
} from './_lib/auth.js';
import {
  getServerCloudConfig,
  isAllowedAppsScriptUrl,
} from './_lib/cloudConfig.js';
import { type ApiRequest, type ApiResponse, sendJson } from './_lib/http.js';

export default async function handler(
  req: ApiRequest,
  res: ApiResponse
): Promise<void> {
  if ((req.method || '').toUpperCase() !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (!ensureSessionSecretReady(res)) {
    return;
  }

  const creds = await getActiveAdminCredentials();
  const needsSetup = creds.source === 'unset';
  const session = getAuthenticatedSession(req);
  const cloudCfg = await getServerCloudConfig(req);
  const cloudConfigured =
    Boolean(cloudCfg.appsScriptUrl) &&
    Boolean(cloudCfg.appsScriptToken) &&
    isAllowedAppsScriptUrl(cloudCfg.appsScriptUrl);

  if (!session || needsSetup) {
    sendJson(res, 200, {
      authenticated: false,
      needsSetup,
      cloudConfigured,
      missingSessionSecret: false,
    });
    return;
  }

  sendJson(res, 200, {
    authenticated: true,
    username: session.sub,
    needsSetup: false,
    cloudConfigured,
    missingSessionSecret: false,
  });
}
