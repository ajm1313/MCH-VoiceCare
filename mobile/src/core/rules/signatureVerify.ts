/**
 * Package signature verification — spec §4.2, §24.
 *
 * The app MUST verify bundle signature and hashes before activation.
 * Uses Ed25519 (RFC 8032) via tweetnacl — a pure-JS, well-audited
 * implementation that works in React Native without a native bridge.
 *
 * If verification fails, the previous active package remains in use
 * (spec §39.2: invalid package signature -> keep previous valid package).
 */
import nacl from 'tweetnacl';
import { Buffer } from 'buffer';

/**
 * Canonical JSON serialization for signature verification.
 * Uses sorted keys and no extra whitespace so that the same logical
 * payload always produces the same bytes on both server and client.
 */
export function canonicalizePayload(payload: unknown): string {
  if (payload === null || payload === undefined) {
    return 'null';
  }
  if (typeof payload !== 'object') {
    return JSON.stringify(payload);
  }
  return JSON.stringify(sortKeys(payload));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Compute the SHA-256 hex digest of a string payload.
 */
export function computeSha256(payload: string): string {
  // tweetnacl does not provide SHA-256 directly; use a lightweight
  // implementation via the built-in hash function from tweetnacl-util
  // or the JS crypto API. We use a manual implementation here for
  // React Native compatibility (no Web Crypto API in older RN).
  // tweetnacl's hash function uses SHA-512, so we use a separate
  // pure-JS SHA-256 implementation.
  return sha256Hex(payload);
}

// --- Pure-JS SHA-256 (no native dependency) ---
// Based on the public-domain implementation by Joseph Myers.
// This is sufficient for package hash verification (not for password hashing).

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256Hex(message: string): string {
  const bytes = new Uint8Array(Buffer.from(message, 'utf-8'));
  return bytesToHex(sha256(bytes));
}

function sha256(message: Uint8Array): Uint8Array {
  const l = message.length;
  const bitLen = l * 8;
  const k = Math.ceil((l + 9) / 64) * 64;
  const data = new Uint8Array(k);
  data.set(message);
  data[l] = 0x80;
  // Write 64-bit big-endian length
  data[k - 4] = (bitLen >>> 24) & 0xff;
  data[k - 3] = (bitLen >>> 16) & 0xff;
  data[k - 2] = (bitLen >>> 8) & 0xff;
  data[k - 1] = bitLen & 0xff;

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  const w = new Uint32Array(64);

  for (let i = 0; i < k; i += 64) {
    for (let j = 0; j < 16; j++) {
      w[j] = (data[i + j * 4] << 24) | (data[i + j * 4 + 1] << 16) |
             (data[i + j * 4 + 2] << 8) | data[i + j * 4 + 3];
    }
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) & 0xffffffff;
    }

    let a = h[0], b = h[1], c = h[2], d = h[3];
    let e = h[4], f = h[5], g = h[6], hh = h[7];

    for (let j = 0; j < 64; j++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + SHA256_K[j] + w[j]) & 0xffffffff;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) & 0xffffffff;
      hh = g; g = f; f = e;
      e = (d + t1) & 0xffffffff;
      d = c; c = b; b = a;
      a = (t1 + t2) & 0xffffffff;
    }

    h[0] = (h[0] + a) & 0xffffffff;
    h[1] = (h[1] + b) & 0xffffffff;
    h[2] = (h[2] + c) & 0xffffffff;
    h[3] = (h[3] + d) & 0xffffffff;
    h[4] = (h[4] + e) & 0xffffffff;
    h[5] = (h[5] + f) & 0xffffffff;
    h[6] = (h[6] + g) & 0xffffffff;
    h[7] = (h[7] + hh) & 0xffffffff;
  }

  const result = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    result[i * 4] = (h[i] >>> 24) & 0xff;
    result[i * 4 + 1] = (h[i] >>> 16) & 0xff;
    result[i * 4 + 2] = (h[i] >>> 8) & 0xff;
    result[i * 4 + 3] = h[i] & 0xff;
  }
  return result;
}

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) & 0xffffffff;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// --- Ed25519 signature verification ---

export interface SigningKeyInfo {
  keyId: string;
  algorithm: string;
  publicKeyBase64: string;
}

/**
 * Verify an Ed25519 signature on a package payload.
 *
 * @param payload The package payload object that was signed
 * @param signatureBase64 Base64-encoded Ed25519 signature
 * @param publicKeyBase64 Base64-encoded Ed25519 public key
 * @returns true if the signature is valid, false otherwise
 */
export function verifyEd25519Signature(
  payload: unknown,
  signatureBase64: string,
  publicKeyBase64: string,
): boolean {
  try {
    const canonical = canonicalizePayload(payload);
    const message = new Uint8Array(Buffer.from(canonical, 'utf-8'));
    const signature = new Uint8Array(Buffer.from(signatureBase64, 'base64'));
    const publicKey = new Uint8Array(Buffer.from(publicKeyBase64, 'base64'));

    return nacl.sign.detached.verify(message, signature, publicKey);
  } catch {
    return false;
  }
}

/**
 * Verify a package's signature AND SHA-256 hash.
 *
 * @param payload The package payload
 * @param signatureBase64 Base64-encoded Ed25519 signature
 * @param signingKeyId The key ID to look up
 * @param expectedSha256 Expected SHA-256 hex digest (lowercase)
 * @param signingKeys Array of active signing keys from bootstrap
 * @returns true if both signature and hash are valid
 */
export function verifyPackage(
  payload: unknown,
  signatureBase64: string,
  signingKeyId: string,
  expectedSha256: string | null,
  signingKeys: SigningKeyInfo[],
): boolean {
  // Find the matching active signing key
  const key = signingKeys.find(k => k.keyId === signingKeyId);
  if (!key) {
    return false;
  }

  // Verify Ed25519 signature
  const sigValid = verifyEd25519Signature(payload, signatureBase64, key.publicKeyBase64);
  if (!sigValid) {
    return false;
  }

  // Verify SHA-256 hash if provided
  if (expectedSha256) {
    const canonical = canonicalizePayload(payload);
    const actualHash = computeSha256(canonical);
    if (actualHash !== expectedSha256.toLowerCase()) {
      return false;
    }
  }

  return true;
}
