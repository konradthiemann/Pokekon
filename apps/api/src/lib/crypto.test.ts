import { beforeAll, describe, it, expect } from 'vitest';

// 32-byte key as 64 hex chars — set before importing the module under test.
beforeAll(() => {
  process.env.ENCRYPTION_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
});

describe('crypto (AES-256-GCM)', () => {
  it('round-trips a secret through encrypt/decrypt', async () => {
    const { encryptSecret, decryptSecret } = await import('./crypto.js');
    const secret = 'ghp_exampleTokenValue_1234567890';
    const enc = encryptSecret(secret);
    expect(enc).toMatch(/^v1:/);
    expect(enc).not.toContain(secret); // ciphertext must not leak the plaintext
    expect(decryptSecret(enc)).toBe(secret);
  });

  it('produces a different ciphertext each time (random IV)', async () => {
    const { encryptSecret } = await import('./crypto.js');
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('throws when the ciphertext has been tampered with', async () => {
    const { encryptSecret, decryptSecret } = await import('./crypto.js');
    const enc = encryptSecret('secret');
    const parts = enc.split(':');
    const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${Buffer.from('evil').toString('base64')}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('throws on a malformed payload', async () => {
    const { decryptSecret } = await import('./crypto.js');
    expect(() => decryptSecret('not-valid')).toThrow('Malformed encrypted secret.');
  });
});
