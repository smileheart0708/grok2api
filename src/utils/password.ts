import { base64UrlDecode, base64UrlEncode } from "./crypto";

export interface PasswordHashResult {
  hash: string;
  salt: string;
  iter: number;
}

const MAX_PASSWORD_ITER = 100_000;
const DEFAULT_PASSWORD_ITER = MAX_PASSWORD_ITER;
const SALT_LENGTH = 16;
const HASH_BITS = 256;

function normalizePasswordIter(iter: number): number {
  const normalized = Math.floor(iter);
  if (!Number.isFinite(normalized) || normalized <= 0) return DEFAULT_PASSWORD_ITER;
  return normalized > MAX_PASSWORD_ITER ? MAX_PASSWORD_ITER : normalized;
}

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
  const safeIter = normalizePasswordIter(iter);
  const saltBytes = new Uint8Array(SALT_LENGTH);
  crypto.getRandomValues(saltBytes);
  const hash = await deriveHash(password, saltBytes, safeIter);
  return {
    hash,
    salt: base64UrlEncode(saltBytes),
    iter: safeIter,
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
  if (iter > MAX_PASSWORD_ITER) return false;

  let saltBytes: Uint8Array;
  try {
    saltBytes = base64UrlDecode(salt);
  } catch {
    return false;
  }
  let actualHash: string;
  try {
    actualHash = await deriveHash(args.password, saltBytes, iter);
  } catch {
    return false;
  }
  return timingSafeEqual(actualHash, expectedHash);
}
