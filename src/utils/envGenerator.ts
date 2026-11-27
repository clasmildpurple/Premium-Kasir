import { scrypt } from 'scrypt-js';

function getRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateRandomHex(byteLength = 32): string {
  return bytesToHex(getRandomBytes(byteLength));
}

/**
 * Generates an scrypt password hash (<saltHex>:<derivedHex>) compatible with
 * Node's crypto.scryptSync(password, saltHex, 64) on /api/login without needing
 * a terminal or VS Code.
 */
export async function hashPasswordScryptBrowser(
  password: string
): Promise<string> {
  const saltHex = generateRandomHex(16);
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password.normalize('NFC'));
  const saltBytes = encoder.encode(saltHex);
  const derived = await scrypt(passwordBytes, saltBytes, 16384, 8, 1, 64);
  return `${saltHex}:${bytesToHex(derived)}`;
}
