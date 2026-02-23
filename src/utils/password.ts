import { base64UrlDecode, base64UrlEncode } from "./crypto";

export interface PasswordHashResult {
  hash: string;
  salt: string;
  iter: number;
}

const DEFAULT_PASSWORD_ITER = 120_000;
const SALT_LENGTH = 16;
const HASH_BITS = 256;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function deriveHash(password: string, saltBytes: Uint8Array, iter: number): Promise<string> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(saltBytes),
      iterations: iter,
    },
    baseKey,
    HASH_BITS,
  );
  return base64UrlEncode(new Uint8Array(bits));
}

export async function hashPassword(password: string, iter = DEFAULT_PASSWORD_ITER): Promise<PasswordHashResult> {
  const saltBytes = new Uint8Array(SALT_LENGTH);
  crypto.getRandomValues(saltBytes);
  const hash = await deriveHash(password, saltBytes, iter);
  return {
    hash,
    salt: base64UrlEncode(saltBytes),
    iter,
  };
}

export async function verifyPassword(args: {
  password: string;
  hash: string;
  salt: string;
  iter: number;
}): Promise<boolean> {
  const expectedHash = args.hash.trim();
  const salt = args.salt.trim();
  const iter = Math.floor(args.iter);
  if (!expectedHash || !salt || !Number.isFinite(iter) || iter <= 0) return false;

  let saltBytes: Uint8Array;
  try {
    saltBytes = base64UrlDecode(salt);
  } catch {
    return false;
  }
  const actualHash = await deriveHash(args.password, saltBytes, iter);
  return timingSafeEqual(actualHash, expectedHash);
}
