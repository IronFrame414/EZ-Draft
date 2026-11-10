// EZD-5601 T1 and T2 (vault/plans/EZD-5601.md section 1 "D-Keys env", "D-Cipher", section 4; AC-EZD-5601-3,
// -6). Pure unit tests of parseEncryptionKeys, encryptUserAiKey and decryptUserAiKey. The key values are the
// plan's K1 and K2 (base64 of 32 bytes filled with 0x01 and 0x02). The secret is compared only as a boolean
// (L-018).
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  AiKeyConfigError,
  AiKeyDecryptError,
  decryptUserAiKey,
  encryptUserAiKey,
  parseEncryptionKeys,
} from './key-crypto';

const K1 = Buffer.alloc(32, 1).toString('base64');
const K2 = Buffer.alloc(32, 2).toString('base64');
const CANARY = 'sk-ant-api03-EZD5601CANARY' + randomUUID().replaceAll('-', '');
const ENV = 'AI_KEY_ENCRYPTION_KEYS';

const parse = (value: string | undefined) =>
  parseEncryptionKeys(value === undefined ? {} : { [ENV]: value });

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
  } catch (e) {
    if (e instanceof AiKeyConfigError) return e.code;
    return `other:${String(e)}`;
  }
  return null;
}

describe('EZD-5601 key-crypto', () => {
  it('T1 parseEncryptionKeys: unset or blank is missing; a good list has its versions and highest; bad lists are invalid', () => {
    expect(codeOf(() => parse(undefined))).toBe('ai_key_config_missing');
    expect(codeOf(() => parse('  '))).toBe('ai_key_config_missing');

    const one = parse('1:' + K1);
    expect(one.highest).toBe(1);
    expect([...one.versions.keys()]).toEqual([1]);

    const two = parse(' 1:' + K1 + ' , 2:' + K2);
    expect([...two.versions.keys()].sort()).toEqual([1, 2]);
    expect(two.highest).toBe(2);
    expect(two.versions.get(1)?.equals(Buffer.alloc(32, 1))).toBe(true);
    expect(two.versions.get(2)?.equals(Buffer.alloc(32, 2))).toBe(true);

    expect(codeOf(() => parse('0:' + K1))).toBe('ai_key_config_invalid');
    expect(codeOf(() => parse('1:' + K1 + ',1:' + K2))).toBe('ai_key_config_invalid');
    expect(codeOf(() => parse('1:' + K1 + ','))).toBe('ai_key_config_invalid');
    expect(codeOf(() => parse('1:QUJD'))).toBe('ai_key_config_invalid');
  });

  it('T2 round trip: version, length, uniqueness, owner binding, tamper and rotation', () => {
    const owner = { tenantId: randomUUID(), appUserId: randomUUID() };
    const both = parse('1:' + K1 + ',2:' + K2);

    const enc = encryptUserAiKey(CANARY, owner, both);
    expect(enc.secretVersion).toBe(2);
    expect(Buffer.from(enc.ciphertext, 'base64').length).toBe(
      12 + Buffer.byteLength(CANARY, 'utf8') + 16,
    );
    expect(decryptUserAiKey(enc, owner, both) === CANARY).toBe(true);

    const again = encryptUserAiKey(CANARY, owner, both);
    expect(again.ciphertext === enc.ciphertext).toBe(false);

    const decryptFails = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return e instanceof AiKeyDecryptError;
      }
      return false;
    };
    expect(
      decryptFails(() =>
        decryptUserAiKey(enc, { tenantId: owner.tenantId, appUserId: randomUUID() }, both),
      ),
    ).toBe(true);
    expect(
      decryptFails(() =>
        decryptUserAiKey(enc, { tenantId: randomUUID(), appUserId: owner.appUserId }, both),
      ),
    ).toBe(true);
    const bytes = Buffer.from(enc.ciphertext, 'base64');
    bytes[20] ^= 1;
    expect(
      decryptFails(() =>
        decryptUserAiKey({ ciphertext: bytes.toString('base64'), secretVersion: 2 }, owner, both),
      ),
    ).toBe(true);

    const v1 = encryptUserAiKey(CANARY, owner, parse('1:' + K1));
    expect(v1.secretVersion).toBe(1);
    expect(decryptUserAiKey(v1, owner, both) === CANARY).toBe(true);
    expect(decryptFails(() => decryptUserAiKey(v1, owner, parse('2:' + K2)))).toBe(true);
  });
});
