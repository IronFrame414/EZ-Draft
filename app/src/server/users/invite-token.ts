// EZD-105 (Q-0695 decisions 10 row 61; Q-0216; architecture "Password sign-in (EZD-033)" (vii), the
// throttle.ts pattern): an invite's link token and 6-digit code, worked out from its random value with a key
// HKDF-derived from the server-only gate secret under the label ezd-invite-v1. The key never leaves this
// process; the database stores only the random value and the token's sha-256, so the link and code can be
// shown again to the last sender and Owners without a plain hash of the code being stored. Each function reads
// the gate secret per call and throws api_gate_secret_not_set when it is missing (serverGateSecret).
import { createHash, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { serverGateSecret } from '../db/env';
import { appOrigin } from '../errors/app-origin';

const LABEL = 'ezd-invite-v1';

function inviteKey(): Buffer {
  return Buffer.from(hkdfSync('sha256', serverGateSecret(), Buffer.alloc(0), LABEL, 32));
}

// A new per-invite random value: 32 bytes as 64 lower-case hex characters (the invite.secret check).
export function newInviteSecret(): string {
  return randomBytes(32).toString('hex');
}

// The link token: base64url of HMAC-SHA256(key, "token:<secret>"), 43 characters.
export function inviteToken(secret: string): string {
  return createHmac('sha256', inviteKey()).update(`token:${secret}`).digest('base64url');
}

// The 6-digit code: the first 6 bytes of HMAC-SHA256(key, "code:<secret>") as a number, mod 1,000,000,
// with leading zeros kept.
export function inviteCode(secret: string): string {
  const mac = createHmac('sha256', inviteKey()).update(`code:${secret}`).digest();
  return String(mac.readUIntBE(0, 6) % 1_000_000).padStart(6, '0');
}

// Lower-case hex sha-256 of the token: the invite.token_sha256 lookup key.
export function inviteTokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

// The absolute /invite/<token> URL the email carries and Copy link copies.
export function inviteLink(
  token: string,
  env: Record<string, string | undefined> = process.env,
): string {
  return `${appOrigin(env)}/invite/${token}`;
}

// A link token as the page receives it: 43 base64url characters.
export function isInviteToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
