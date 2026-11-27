import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { buildCookieHeader, getSessionSecret } from './auth.js';
import { parseCookies } from './http.js';

export const CLOUD_CONFIG_COOKIE_NAME = 'pinkpos_cloud_cfg';
const CLOUD_CONFIG_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface ExternalCloudConfig {
  appsScriptUrl: string;
  appsScriptToken: string;
  googleSheetUrl?: string;
  googleDriveFolderUrl?: string;
  updatedAt?: string;
}

export interface ResolvedCloudConfig extends ExternalCloudConfig {
  source: 'external-file' | 'env' | 'unset';
  configFilePath: string;
}

let inMemoryCloudConfig: {
  data: ExternalCloudConfig;
  filePath: string;
} | null = null;

export function isAllowedAppsScriptUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') return false;
    const isAllowedHost =
      parsed.hostname === 'script.google.com' ||
      parsed.hostname === 'script.googleusercontent.com';
    if (!isAllowedHost) return false;
    return (
      parsed.pathname.startsWith('/macros/') ||
      parsed.pathname.startsWith('/a/macros/')
    );
  } catch {
    return false;
  }
}

function getDefaultRootConfigPath(): string {
  return path.resolve(process.cwd(), 'database.config.json');
}

function getParentExternalConfigPath(): string {
  return path.resolve(process.cwd(), '..', 'pinkpos-database.config.json');
}

function getTmpConfigPath(): string {
  return path.join(os.tmpdir(), 'pinkpos-database.config.json');
}

function getReadCandidates(): string[] {
  const customPath = process.env.DATABASE_CONFIG_PATH?.trim();
  if (customPath) {
    return [path.resolve(customPath)];
  }
  return [
    getParentExternalConfigPath(),
    getTmpConfigPath(),
    getDefaultRootConfigPath(),
  ];
}

async function resolveWritableConfigPath(): Promise<string> {
  const customPath = process.env.DATABASE_CONFIG_PATH?.trim();
  if (customPath) {
    return path.resolve(customPath);
  }

  // If user already created ../pinkpos-database.config.json outside the app folder, keep using it
  const parentPath = getParentExternalConfigPath();
  try {
    await fs.access(parentPath, fs.constants.W_OK);
    return parentPath;
  } catch {
    // not present or not writable
  }

  if (process.env.VERCEL === '1') {
    return getTmpConfigPath();
  }

  // Prefer external file 1 folder above the app if parent folder is writable; fallback to root database.config.json or tmp
  try {
    await fs.access(path.dirname(parentPath), fs.constants.W_OK);
    return parentPath;
  } catch {
    try {
      await fs.access(process.cwd(), fs.constants.W_OK);
      return getDefaultRootConfigPath();
    } catch {
      return getTmpConfigPath();
    }
  }
}

function deriveEncryptionKey(): Buffer {
  return crypto.createHash('sha256').update(getSessionSecret()).digest();
}

function encryptCloudConfigPayload(config: ExternalCloudConfig): string {
  const key = deriveEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify({
    appsScriptUrl: config.appsScriptUrl.trim(),
    appsScriptToken: config.appsScriptToken.trim(),
    googleSheetUrl: (config.googleSheetUrl || '').trim(),
    googleDriveFolderUrl: (config.googleDriveFolderUrl || '').trim(),
    updatedAt: config.updatedAt || new Date().toISOString(),
  });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptCloudConfigPayload(raw: string): ExternalCloudConfig | null {
  if (!raw || typeof raw !== 'string') return null;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  try {
    const iv = Buffer.from(parts[0], 'base64url');
    const tag = Buffer.from(parts[1], 'base64url');
    const ciphertext = Buffer.from(parts[2], 'base64url');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      deriveEncryptionKey(),
      iv
    );
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf-8');
    const parsed = JSON.parse(decrypted) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    const appsScriptUrl =
      typeof parsed.appsScriptUrl === 'string'
        ? parsed.appsScriptUrl.trim()
        : '';
    const appsScriptToken =
      typeof parsed.appsScriptToken === 'string'
        ? parsed.appsScriptToken.trim()
        : '';
    if (!appsScriptUrl && !appsScriptToken) return null;
    return {
      appsScriptUrl,
      appsScriptToken,
      googleSheetUrl:
        typeof parsed.googleSheetUrl === 'string'
          ? parsed.googleSheetUrl.trim()
          : '',
      googleDriveFolderUrl:
        typeof parsed.googleDriveFolderUrl === 'string'
          ? parsed.googleDriveFolderUrl.trim()
          : '',
      updatedAt:
        typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'SessionSecretError') {
      throw err;
    }
    return null;
  }
}

export function buildCloudConfigCookieHeader(
  req: IncomingMessage,
  config: ExternalCloudConfig
): string {
  const token = encryptCloudConfigPayload(config);
  return buildCookieHeader(
    req,
    CLOUD_CONFIG_COOKIE_NAME,
    token,
    CLOUD_CONFIG_TTL_SECONDS
  );
}

function readCloudConfigFromCookie(
  req?: IncomingMessage
): ExternalCloudConfig | null {
  if (!req) return null;
  const cookies = parseCookies(req);
  const raw = cookies[CLOUD_CONFIG_COOKIE_NAME];
  if (!raw) return null;
  return decryptCloudConfigPayload(raw);
}

async function readConfigFile(
  filePath: string
): Promise<ExternalCloudConfig | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;

    return {
      appsScriptUrl:
        typeof parsed.appsScriptUrl === 'string'
          ? parsed.appsScriptUrl.trim()
          : '',
      appsScriptToken:
        typeof parsed.appsScriptToken === 'string'
          ? parsed.appsScriptToken.trim()
          : '',
      googleSheetUrl:
        typeof parsed.googleSheetUrl === 'string'
          ? parsed.googleSheetUrl.trim()
          : '',
      googleDriveFolderUrl:
        typeof parsed.googleDriveFolderUrl === 'string'
          ? parsed.googleDriveFolderUrl.trim()
          : '',
      updatedAt:
        typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
    };
  } catch {
    return null;
  }
}

export async function getServerCloudConfig(
  req?: IncomingMessage
): Promise<ResolvedCloudConfig> {
  const envUrl = (process.env.APPS_SCRIPT_URL || '').trim();
  const envToken = (process.env.APPS_SCRIPT_TOKEN || '').trim();

  if (
    inMemoryCloudConfig &&
    (inMemoryCloudConfig.data.appsScriptUrl ||
      inMemoryCloudConfig.data.appsScriptToken)
  ) {
    const d = inMemoryCloudConfig.data;
    const finalUrl = d.appsScriptUrl || envUrl;
    const finalToken = d.appsScriptToken || envToken;
    return {
      ...d,
      appsScriptUrl: finalUrl,
      appsScriptToken: finalToken,
      source: d.appsScriptUrl || d.appsScriptToken ? 'external-file' : 'env',
      configFilePath: inMemoryCloudConfig.filePath,
    };
  }

  let firstExistingPath = '';
  for (const candidate of getReadCandidates()) {
    const fileData = await readConfigFile(candidate);
    if (fileData) {
      if (!firstExistingPath) firstExistingPath = candidate;
      if (fileData.appsScriptUrl || fileData.appsScriptToken) {
        return {
          ...fileData,
          appsScriptUrl: fileData.appsScriptUrl || envUrl,
          appsScriptToken: fileData.appsScriptToken || envToken,
          source: 'external-file',
          configFilePath: candidate,
        };
      }
    }
  }

  const cookieData = readCloudConfigFromCookie(req);
  if (cookieData && (cookieData.appsScriptUrl || cookieData.appsScriptToken)) {
    const fallbackPath =
      firstExistingPath || (await resolveWritableConfigPath());
    inMemoryCloudConfig = {
      data: cookieData,
      filePath: fallbackPath,
    };
    return {
      ...cookieData,
      appsScriptUrl: cookieData.appsScriptUrl || envUrl,
      appsScriptToken: cookieData.appsScriptToken || envToken,
      source: 'external-file',
      configFilePath: fallbackPath,
    };
  }

  const fallbackPath = firstExistingPath || (await resolveWritableConfigPath());
  return {
    appsScriptUrl: envUrl,
    appsScriptToken: envToken,
    googleSheetUrl: '',
    googleDriveFolderUrl: '',
    source: envUrl && envToken ? 'env' : 'unset',
    configFilePath: fallbackPath,
  };
}

export async function saveExternalCloudConfig(
  next: ExternalCloudConfig
): Promise<{ configFilePath: string; savedToDisk: boolean }> {
  const targetPath = await resolveWritableConfigPath();
  const payload = {
    _comment:
      'Pengaturan database eksternal SukaPOS (di luar folder src/ & dist/). Dapat diedit manual atau melalui menu Setting aplikasi.',
    appsScriptUrl: next.appsScriptUrl.trim(),
    appsScriptToken: next.appsScriptToken.trim(),
    googleSheetUrl: (next.googleSheetUrl || '').trim(),
    googleDriveFolderUrl: (next.googleDriveFolderUrl || '').trim(),
    updatedAt: new Date().toISOString(),
  };

  inMemoryCloudConfig = {
    data: {
      appsScriptUrl: payload.appsScriptUrl,
      appsScriptToken: payload.appsScriptToken,
      googleSheetUrl: payload.googleSheetUrl,
      googleDriveFolderUrl: payload.googleDriveFolderUrl,
      updatedAt: payload.updatedAt,
    },
    filePath: targetPath,
  };

  const writeTargets = Array.from(
    new Set([targetPath, getDefaultRootConfigPath(), getTmpConfigPath()])
  );

  for (const writePath of writeTargets) {
    try {
      await fs.mkdir(path.dirname(writePath), { recursive: true });
      await fs.writeFile(writePath, JSON.stringify(payload, null, 2), 'utf-8');
      inMemoryCloudConfig.filePath = writePath;
      return { configFilePath: writePath, savedToDisk: true };
    } catch {
      // try next writable fallback path
    }
  }

  return { configFilePath: targetPath, savedToDisk: false };
}

export function resetInMemoryCloudConfigForTests(): void {
  inMemoryCloudConfig = null;
}
