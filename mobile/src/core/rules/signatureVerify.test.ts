/**
 * Tests for package signature verification (spec §4.2, §24).
 */
import nacl from 'tweetnacl';
import { Buffer } from 'buffer';

import {
  canonicalizePayload,
  computeSha256,
  verifyEd25519Signature,
  verifyPackage,
  type SigningKeyInfo,
} from './signatureVerify';

describe('canonicalizePayload', () => {
  it('sorts keys recursively', () => {
    const result = canonicalizePayload({ b: 1, a: { d: 4, c: 3 } });
    expect(result).toBe('{"a":{"c":3,"d":4},"b":1}');
  });

  it('handles arrays without sorting elements', () => {
    const result = canonicalizePayload({ items: [{ b: 2, a: 1 }] });
    expect(result).toBe('{"items":[{"a":1,"b":2}]}');
  });

  it('handles primitives', () => {
    expect(canonicalizePayload(42)).toBe('42');
    expect(canonicalizePayload('hello')).toBe('"hello"');
    expect(canonicalizePayload(null)).toBe('null');
  });
});

describe('computeSha256', () => {
  it('matches known SHA-256 value for empty string', () => {
    expect(computeSha256('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('matches known SHA-256 value for "abc"', () => {
    expect(computeSha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('produces consistent output for the same input', () => {
    const a = computeSha256('{"a":1,"b":2}');
    const b = computeSha256('{"a":1,"b":2}');
    expect(a).toBe(b);
  });
});

describe('verifyEd25519Signature', () => {
  it('verifies a valid signature', () => {
    const keypair = nacl.sign.keyPair();
    const payload = { version: '1.0.0', rules: ['A', 'B'] };
    const canonical = canonicalizePayload(payload);
    const message = new Uint8Array(Buffer.from(canonical, 'utf-8'));
    const signature = nacl.sign.detached(message, keypair.secretKey);

    const sigBase64 = Buffer.from(signature).toString('base64');
    const pubBase64 = Buffer.from(keypair.publicKey).toString('base64');

    expect(verifyEd25519Signature(payload, sigBase64, pubBase64)).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const keypair = nacl.sign.keyPair();
    const payload = { version: '1.0.0', rules: ['A', 'B'] };
    const canonical = canonicalizePayload(payload);
    const message = new Uint8Array(Buffer.from(canonical, 'utf-8'));
    const signature = nacl.sign.detached(message, keypair.secretKey);

    const sigBase64 = Buffer.from(signature).toString('base64');
    const pubBase64 = Buffer.from(keypair.publicKey).toString('base64');

    const tampered = { version: '1.0.1', rules: ['A', 'B'] };
    expect(verifyEd25519Signature(tampered, sigBase64, pubBase64)).toBe(false);
  });

  it('rejects an invalid public key', () => {
    const keypair = nacl.sign.keyPair();
    const otherKeypair = nacl.sign.keyPair();
    const payload = { version: '1.0.0' };
    const canonical = canonicalizePayload(payload);
    const message = new Uint8Array(Buffer.from(canonical, 'utf-8'));
    const signature = nacl.sign.detached(message, keypair.secretKey);

    const sigBase64 = Buffer.from(signature).toString('base64');
    const wrongPubBase64 = Buffer.from(otherKeypair.publicKey).toString('base64');

    expect(verifyEd25519Signature(payload, sigBase64, wrongPubBase64)).toBe(false);
  });
});

describe('verifyPackage', () => {
  it('verifies a package with valid signature and hash', () => {
    const keypair = nacl.sign.keyPair();
    const payload = {
      payload: { rules: ['R1', 'R2'] },
      version: '1.0.0',
      bundleId: 'test-bundle',
    };
    const canonical = canonicalizePayload(payload);
    const message = new Uint8Array(Buffer.from(canonical, 'utf-8'));
    const signature = nacl.sign.detached(message, keypair.secretKey);
    const hash = computeSha256(canonical);

    const signingKeys: SigningKeyInfo[] = [{
      keyId: 'key-1',
      algorithm: 'Ed25519',
      publicKeyBase64: Buffer.from(keypair.publicKey).toString('base64'),
    }];

    expect(verifyPackage(
      payload,
      Buffer.from(signature).toString('base64'),
      'key-1',
      hash,
      signingKeys,
    )).toBe(true);
  });

  it('rejects when signing key is not found', () => {
    const keypair = nacl.sign.keyPair();
    const payload = { version: '1.0.0' };
    const canonical = canonicalizePayload(payload);
    const message = new Uint8Array(Buffer.from(canonical, 'utf-8'));
    const signature = nacl.sign.detached(message, keypair.secretKey);

    const signingKeys: SigningKeyInfo[] = [{
      keyId: 'different-key',
      algorithm: 'Ed25519',
      publicKeyBase64: Buffer.from(keypair.publicKey).toString('base64'),
    }];

    expect(verifyPackage(
      payload,
      Buffer.from(signature).toString('base64'),
      'key-1',
      null,
      signingKeys,
    )).toBe(false);
  });

  it('rejects when hash does not match', () => {
    const keypair = nacl.sign.keyPair();
    const payload = { version: '1.0.0' };
    const canonical = canonicalizePayload(payload);
    const message = new Uint8Array(Buffer.from(canonical, 'utf-8'));
    const signature = nacl.sign.detached(message, keypair.secretKey);

    const signingKeys: SigningKeyInfo[] = [{
      keyId: 'key-1',
      algorithm: 'Ed25519',
      publicKeyBase64: Buffer.from(keypair.publicKey).toString('base64'),
    }];

    expect(verifyPackage(
      payload,
      Buffer.from(signature).toString('base64'),
      'key-1',
      '0000000000000000000000000000000000000000000000000000000000000000',
      signingKeys,
    )).toBe(false);
  });
});
