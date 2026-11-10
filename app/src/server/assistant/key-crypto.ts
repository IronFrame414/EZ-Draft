// EZD-5601 Step 12 (vault/plans/EZD-5601.md "D-Keys env", "D-Cipher"; Q-0637 key storage; AC-EZD-5601-3,
// -6): the user's Anthropic key is encrypted in the app with AES-256-GCM before it reaches the database, bound
// to its owner by the AAD ezd-ai-key-v1:<tenantId>:<appUserId>. The encryption keys come from
// AI_KEY_ENCRYPTION_KEYS, read per call; this is the only app/src file naming it. Errors carry a code only.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type EncryptionKeys = { versions: ReadonlyMap<number, Buffer>; highest: number };

export class AiKeyConfigError extends Error {
  readonly code: 'ai_key_config_missing' | 'ai_key_config_invalid';

  constructor(code: 'ai_key_config_missing' | 'ai_key_config_invalid') {
    super(code);
    this.name = 'AiKeyConfigError';
    this.code = code;
  }
}

export class AiKeyDecryptError extends Error {
  readonly code = 'ai_key_undecryptable';

  constructor() {
    super('ai_key_undecryptable');
    this.name = 'AiKeyDecryptError';
  }
}

export type KeyOwner = { tenantId: string; appUserId: string };

const ENV_NAME = 'AI_KEY_ENCRYPTION_KEYS';
const ENTRY = /^([1-9][0-9]{0,5}):([A-Za-z0-9+/]{43}=)$/;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function parseEncryptionKeys(
  env: Record<string, string | undefined> = process.env,
): EncryptionKeys {
  const raw = env[ENV_NAME];
  if (raw === undefined || raw.trim() === '') throw new AiKeyConfigError('ai_key_config_missing');
  const versions = new Map<number, Buffer>();
  for (const part of raw.split(',')) {
    const match = ENTRY.exec(part.trim());
    if (!match) throw new AiKeyConfigError('ai_key_config_invalid');
    const version = Number(match[1]);
    const key = Buffer.from(match[2], 'base64');
    if (key.length !== 32 || versions.has(version)) {
      throw new AiKeyConfigError('ai_key_config_invalid');
    }
    versions.set(version, key);
  }
  return { versions, highest: Math.max(...versions.keys()) };
}

function aad(owner: KeyOwner): Buffer {
  return Buffer.from(`ezd-ai-key-v1:${owner.tenantId}:${owner.appUserId}`, 'utf8');
}

export function encryptUserAiKey(
  key: string,
  owner: KeyOwner,
  keys: EncryptionKeys,
): { ciphertext: string; secretVersion: number } {
  const secret = keys.versions.get(keys.highest);
  if (secret === undefined) throw new AiKeyConfigError('ai_key_config_invalid');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', secret, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad(owner));
  const encrypted = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([iv, encrypted, tag]).toString('base64'),
    secretVersion: keys.highest,
  };
}

export function decryptUserAiKey(
  row: { ciphertext: string; secretVersion: number },
  owner: KeyOwner,
  keys: EncryptionKeys,
): string {
  const secret = keys.versions.get(row.secretVersion);
  if (secret === undefined) throw new AiKeyDecryptError();
  const bytes = Buffer.from(row.ciphertext, 'base64');
  if (bytes.length < IV_BYTES + 1 + TAG_BYTES) throw new AiKeyDecryptError();
  try {
    const decipher = createDecipheriv('aes-256-gcm', secret, bytes.subarray(0, IV_BYTES), {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(aad(owner));
    decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES));
    return Buffer.concat([
      decipher.update(bytes.subarray(IV_BYTES, bytes.length - TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new AiKeyDecryptError();
  }
}
