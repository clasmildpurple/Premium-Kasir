import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getServerCloudConfig,
  isAllowedAppsScriptUrl,
  resetInMemoryCloudConfigForTests,
  saveExternalCloudConfig,
} from './cloudConfig';

describe('isAllowedAppsScriptUrl', () => {
  it('accepts valid HTTPS Google Apps Script /macros/ URLs', () => {
    expect(
      isAllowedAppsScriptUrl(
        'https://script.google.com/macros/s/AKfycbxTestScriptId123/exec'
      )
    ).toBe(true);
    expect(
      isAllowedAppsScriptUrl(
        'https://script.googleusercontent.com/macros/echo?user_content_key=abc'
      )
    ).toBe(true);
  });

  it('rejects insecure HTTP, localhost, metadata IPs, and non-Apps-Script hosts or paths', () => {
    expect(
      isAllowedAppsScriptUrl(
        'http://script.google.com/macros/s/AKfycbxTestScriptId123/exec'
      )
    ).toBe(false);
    expect(isAllowedAppsScriptUrl('http://127.0.0.1:3000/macros/test')).toBe(
      false
    );
    expect(
      isAllowedAppsScriptUrl('https://169.254.169.254/latest/meta-data/')
    ).toBe(false);
    expect(isAllowedAppsScriptUrl('https://evil.example.com/macros/s/123/exec')).toBe(
      false
    );
    expect(isAllowedAppsScriptUrl('https://script.google.com/home')).toBe(
      false
    );
    expect(isAllowedAppsScriptUrl('not-a-url')).toBe(false);
  });
});

describe('external cloud config storage', () => {
  let tempDir = '';
  const prevConfigPath = process.env.DATABASE_CONFIG_PATH;
  const prevScriptUrl = process.env.APPS_SCRIPT_URL;
  const prevScriptToken = process.env.APPS_SCRIPT_TOKEN;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pinkpos-cfg-test-'));
    resetInMemoryCloudConfigForTests();
    delete process.env.APPS_SCRIPT_URL;
    delete process.env.APPS_SCRIPT_TOKEN;
  });

  afterEach(async () => {
    resetInMemoryCloudConfigForTests();
    if (prevConfigPath === undefined) {
      delete process.env.DATABASE_CONFIG_PATH;
    } else {
      process.env.DATABASE_CONFIG_PATH = prevConfigPath;
    }
    if (prevScriptUrl === undefined) {
      delete process.env.APPS_SCRIPT_URL;
    } else {
      process.env.APPS_SCRIPT_URL = prevScriptUrl;
    }
    if (prevScriptToken === undefined) {
      delete process.env.APPS_SCRIPT_TOKEN;
    } else {
      process.env.APPS_SCRIPT_TOKEN = prevScriptToken;
    }
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('saves and reads configuration from external DATABASE_CONFIG_PATH outside app folder', async () => {
    const externalFile = path.join(tempDir, 'outside', 'buyer-db.config.json');
    process.env.DATABASE_CONFIG_PATH = externalFile;

    const saveResult = await saveExternalCloudConfig({
      appsScriptUrl:
        'https://script.google.com/macros/s/AKfycbxBuyerDbExample/exec',
      appsScriptToken: 'super-secret-buyer-token-1234567890',
      googleSheetUrl: 'https://docs.google.com/spreadsheets/d/sheet123/edit',
      googleDriveFolderUrl: 'https://drive.google.com/drive/folders/folder123',
    });

    expect(saveResult.savedToDisk).toBe(true);
    expect(saveResult.configFilePath).toBe(externalFile);

    // Clear in-memory cache to confirm reading from external disk file
    resetInMemoryCloudConfigForTests();

    const loaded = await getServerCloudConfig();
    expect(loaded.source).toBe('external-file');
    expect(loaded.configFilePath).toBe(externalFile);
    expect(loaded.appsScriptUrl).toBe(
      'https://script.google.com/macros/s/AKfycbxBuyerDbExample/exec'
    );
    expect(loaded.appsScriptToken).toBe('super-secret-buyer-token-1234567890');
    expect(loaded.googleSheetUrl).toBe(
      'https://docs.google.com/spreadsheets/d/sheet123/edit'
    );
    expect(loaded.googleDriveFolderUrl).toBe(
      'https://drive.google.com/drive/folders/folder123'
    );
  });

  it('falls back to environment variables when external file is empty', async () => {
    const emptyExternalFile = path.join(tempDir, 'empty-db.config.json');
    await fs.writeFile(
      emptyExternalFile,
      JSON.stringify({ appsScriptUrl: '', appsScriptToken: '' }),
      'utf-8'
    );
    process.env.DATABASE_CONFIG_PATH = emptyExternalFile;
    process.env.APPS_SCRIPT_URL =
      'https://script.google.com/macros/s/AKfycbxEnvFallback/exec';
    process.env.APPS_SCRIPT_TOKEN = 'env-secret-token-1234567890';

    const loaded = await getServerCloudConfig();
    expect(loaded.source).toBe('env');
    expect(loaded.appsScriptUrl).toBe(
      'https://script.google.com/macros/s/AKfycbxEnvFallback/exec'
    );
    expect(loaded.appsScriptToken).toBe('env-secret-token-1234567890');
  });
});
