import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getEnv } from '../env.js';

// Encrypt secrets (per-user LLM API keys) at rest with AES-256-GCM. The key comes
// from ENCRYPTION_KEY (server-only); plaintext keys never touch the client.
// Stored format: "v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>".

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce, recommended for GCM
const PREFIX = 'v1';

/** Decode ENCRYPTION_KEY (64 hex chars or 44-char base64) into exactly 32 bytes. */
function getKey(): Buffer {
  const raw = getEnv().encryptionKey;
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must decode to 32 bytes (64 hex chars or base64 of 32 bytes).');
  }
  return key;
}

/** Encrypt a UTF-8 plaintext into the versioned, self-describing string format. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/** Decrypt a value produced by {@link encryptSecret}. Throws on tampering or bad format. */
export function decryptSecret(payload: string): string {
  const [prefix, ivB64, tagB64, ctB64] = payload.split(':');
  if (prefix !== PREFIX || ivB64 === undefined || tagB64 === undefined || ctB64 === undefined) {
    throw new Error('Malformed encrypted secret.');
  }
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}
