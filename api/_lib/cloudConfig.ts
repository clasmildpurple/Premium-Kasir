import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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
    return parsed.pathname.startsWith('/macros/');
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

function getVercelTmpConfigPath(): string {
  return path.join(os.tmpdir(), 'pinkpos-database.config.json');
}

function getReadCandidates(): string[] {
  const candidates: string[] = [];
  const customPath = process.env.DATABASE_CONFIG_PATH?.trim();
  if (customPath) {
    candidates.push(path.resolve(customPath));
  }
  // External file one directory above the app folder (if user placed it outside folder)
  candidates.push(getParentExternalConfigPath());
  // Vercel ephemeral writable override if running on Vercel
  if (process.env.VERCEL === '1') {
    candidates.push(getVercelTmpConfigPath());
  }
  // Root config file outside src/ and dist/
  candidates.push(getDefaultRootConfigPath());
  return candidates;
}

async function resolveWritableConfigPath(): Promise<string> {
  const customPath = process.env.DATABASE_CONFIG_PATH?.trim();
  if (customPath) {
    return path.resolve(customPath);
  }

  // If user already created ../pinkpos-database.config.json outside the app folder, keep using it
  const parentPath = getParentExternalConfigPath();
  try {
    await fs.access(parentPath);
    return parentPath;
  } catch {
    // not present
  }

  if (process.env.VERCEL === '1') {
    return getVercelTmpConfigPath();
  }

  // Prefer external file 1 folder above the app if parent folder is writable; fallback to root database.config.json
  try {
    await fs.access(path.dirname(parentPath), fs.constants.W_OK);
    return parentPath;
  } catch {
    return getDefaultRootConfigPath();
  }
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

export async function getServerCloudConfig(): Promise<ResolvedCloudConfig> {
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
      'Pengaturan database eksternal PinkPOS (di luar folder src/ & dist/). Dapat diedit manual atau melalui menu Setting aplikasi.',
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

  try {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, JSON.stringify(payload, null, 2), 'utf-8');
    return { configFilePath: targetPath, savedToDisk: true };
  } catch {
    // Fallback to root database.config.json if parent folder is read-only
    const rootFallback = getDefaultRootConfigPath();
    if (targetPath !== rootFallback) {
      try {
        await fs.writeFile(
          rootFallback,
          JSON.stringify(payload, null, 2),
          'utf-8'
        );
        inMemoryCloudConfig.filePath = rootFallback;
        return { configFilePath: rootFallback, savedToDisk: true };
      } catch {
        // keep in-memory copy if filesystem is completely read-only
      }
    }
    return { configFilePath: targetPath, savedToDisk: false };
  }
}

export function resetInMemoryCloudConfigForTests(): void {
  inMemoryCloudConfig = null;
}
