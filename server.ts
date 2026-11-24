import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import loginHandler from './api/login.js';
import logoutHandler from './api/logout.js';
import sessionHandler from './api/session.js';
import changePasswordHandler from './api/change-password.js';
import setupAdminHandler from './api/setup-admin.js';
import cloudHandler from './api/cloud.js';
import cloudConfigHandler from './api/cloud-config.js';
import { getAuthenticatedSession } from './api/_lib/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const DATA_DIR = path.resolve(__dirname, '.data');
const STATE_FILE = path.join(DATA_DIR, 'pos-state.json');
const FALLBACK_STATE_FILE = path.join(os.tmpdir(), 'pinkpos-pos-state.json');

interface PersistedState {
  googleConfig?: Record<string, unknown>;
  storeSettings?: Record<string, unknown>;
  categories?: unknown[];
  products?: unknown[];
  orders?: unknown[];
  updatedAt?: string;
}

function sanitizeStoreSettingsRecord(
  settings: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!settings || typeof settings !== 'object') return settings;
  const copy = { ...settings };
  if (copy.storeName === 'PinkPOS Resto') {
    copy.storeName = 'SukaPOS';
  }
  delete copy.loginUsername;
  delete copy.loginPassword;
  return copy;
}

function sanitizeGoogleConfigRecord(
  cfg: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!cfg || typeof cfg !== 'object') return cfg;
  const copy = { ...cfg };
  delete copy.APPS_SCRIPT_URL;
  return copy;
}

async function readPersistedState(): Promise<PersistedState | null> {
  for (const statePath of [STATE_FILE, FALLBACK_STATE_FILE]) {
    try {
      const raw = await fs.readFile(statePath, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedState;
      if (parsed && typeof parsed === 'object') {
        if (parsed.storeSettings) {
          parsed.storeSettings = sanitizeStoreSettingsRecord(parsed.storeSettings);
        }
        if (parsed.googleConfig) {
          parsed.googleConfig = sanitizeGoogleConfigRecord(parsed.googleConfig);
        }
        return parsed;
      }
    } catch {
      // try next path
    }
  }
  return null;
}

async function writePersistedState(partial: PersistedState): Promise<PersistedState> {
  const existing = (await readPersistedState()) ?? {};
  const next: PersistedState = {
    ...existing,
    ...partial,
    ...(partial.storeSettings
      ? { storeSettings: sanitizeStoreSettingsRecord(partial.storeSettings) }
      : {}),
    ...(partial.googleConfig
      ? { googleConfig: sanitizeGoogleConfigRecord(partial.googleConfig) }
      : {}),
    updatedAt: new Date().toISOString(),
  };

  for (const statePath of [STATE_FILE, FALLBACK_STATE_FILE]) {
    try {
      await fs.mkdir(path.dirname(statePath), { recursive: true });
      await fs.writeFile(statePath, JSON.stringify(next, null, 2), 'utf-8');
      break;
    } catch {
      // try fallback tmp path if .data is read-only
    }
  }
  return next;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Auth, session & cloud proxy routes (shared with Vercel /api functions)
  app.all('/api/login', (req, res) => void loginHandler(req, res));
  app.all('/api/logout', (req, res) => void logoutHandler(req, res));
  app.all('/api/session', (req, res) => void sessionHandler(req, res));
  app.all('/api/change-password', (req, res) => void changePasswordHandler(req, res));
  app.all('/api/setup-admin', (req, res) => void setupAdminHandler(req, res));
  app.all('/api/cloud', (req, res) => void cloudHandler(req, res));
  app.all('/api/cloud-config', (req, res) => void cloudConfigHandler(req, res));

  // Load persisted state across browsers / sessions (authenticated only)
  app.get('/api/state', async (req, res) => {
    if (!getAuthenticatedSession(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const saved = await readPersistedState();
    if (!saved) {
      res.json({ hasSavedState: false, state: null });
      return;
    }

    res.json({ hasSavedState: true, state: saved });
  });

  // Save updated state to server persistence (authenticated only)
  app.post('/api/state', async (req, res) => {
    if (!getAuthenticatedSession(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ error: 'Invalid state payload' });
      return;
    }

    const patch: PersistedState = {};
    if (body.googleConfig && typeof body.googleConfig === 'object') {
      patch.googleConfig = sanitizeGoogleConfigRecord(
        body.googleConfig as Record<string, unknown>
      );
    }
    if (body.storeSettings && typeof body.storeSettings === 'object') {
      patch.storeSettings = sanitizeStoreSettingsRecord(
        body.storeSettings as Record<string, unknown>
      );
    }
    if (Array.isArray(body.categories)) {
      patch.categories = body.categories;
    }
    if (Array.isArray(body.products)) {
      patch.products = body.products;
    }
    if (Array.isArray(body.orders)) {
      patch.orders = body.orders;
    }

    const saved = await writePersistedState(patch);
    res.json({ ok: true, updatedAt: saved.updatedAt });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
