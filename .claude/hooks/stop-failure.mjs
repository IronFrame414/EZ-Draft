// StopFailure: the turn ended on an API error (rate_limit, overloaded, authentication_failed, billing_error, server_error, …).
// Records the error type and time in vault/handoff/last-failure.json for the launcher (vault/PROCESS.md section 14).
import { writeFileSync } from 'node:fs';
import { readInput, projectDir } from './lib.mjs';

const input = readInput();
if (input.agent_type) process.exit(0); // only the main session's failure is the unit's failure
const info = {
  ts: new Date().toISOString(),
  error_type: input.error_type || input.error || input.matcher || 'unknown',
  message: String(input.error_message || input.message || '').slice(0, 500),
  session_id: input.session_id,
};
try { writeFileSync(`${projectDir()}/vault/handoff/last-failure.json`, JSON.stringify(info, null, 2)); } catch {}
process.exit(0);
