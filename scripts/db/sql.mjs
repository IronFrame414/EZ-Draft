// EZD-005b Step 3 (vault/plans/EZD-005b.md): local SQL runner. Node 22 built-ins only.
//   runLocalSql(sqlText) -> Promise<{ code, stdout, stderr }>
// Writes sqlText to the stdin of `docker exec -i supabase_db_<project_id> psql ...` where <project_id>
// comes from supabase/config.toml. It takes no connection argument, so it reaches only the local
// container. `code` is psql's exit code (non-zero when the SQL raises; notices and errors go to stderr).
// When docker cannot be started it resolves code 1 with the Docker wording of scripts/db/local.mjs.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const configPath = path.join(repo, 'supabase', 'config.toml');
const DOCKER_MESSAGE = 'Local Supabase needs Docker running (start Docker Desktop).';

function projectId() {
  const toml = readFileSync(configPath, 'utf8');
  const m = /^\s*project_id\s*=\s*"([^"]+)"/m.exec(toml);
  if (!m) throw new Error('supabase/config.toml has no project_id');
  return m[1];
}

export function runLocalSql(sqlText) {
  const container = `supabase_db_${projectId()}`;
  const args = ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A'];
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const done = (r) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    const child = spawn('docker', args, { cwd: repo, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      done({ code: 1, stdout, stderr: `${DOCKER_MESSAGE}\n${stderr}${err.message}\n` });
    });
    child.on('close', (code) => {
      done({ code: code ?? 1, stdout, stderr });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(sqlText);
  });
}
