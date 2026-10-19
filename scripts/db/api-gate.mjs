// EZD-006 Step 1b (vault/plans/EZD-006.md; Q-0087 (ii)): the PostgREST request gate secret. Node 22
// built-ins only. A secret is 32 CSPRNG bytes as base64url (43 characters); only its SHA-256 hex digest
// is stored in the database (private.set_api_gate_hash). Never committed (CLAUDE.md rule 8).
//   node scripts/db/api-gate.mjs generate   prints a new secret and the SQL line that stores its hash
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export function newGateSecret() {
  return randomBytes(32).toString('base64url');
}

export function gateHash(secret) {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function setHashSql(hash) {
  return `select private.set_api_gate_hash('${hash}');`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const command = process.argv[2];
  if (command === 'generate') {
    const secret = newGateSecret();
    process.stdout.write(
      [
        `Secret (SUPABASE_API_GATE_SECRET; paste into Vercel for the matching environment, nowhere else):`,
        secret,
        '',
        'Run this line in the matching Supabase project SQL editor:',
        setHashSql(gateHash(secret)),
        '',
      ].join('\n'),
    );
    process.exit(0);
  }
  process.stderr.write('usage: node scripts/db/api-gate.mjs generate\n');
  process.exit(1);
}
