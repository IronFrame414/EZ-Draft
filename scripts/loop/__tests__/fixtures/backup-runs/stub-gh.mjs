// Stub gh for the backup status tests (rule 5: no live GitHub call). Answers `gh run list --workflow <w> ...` with
// $GH_STUB_DIR/<case>/<w>.json, where <case> is $GH_STUB_CASE; a missing file exits 1 like gh does on an error.
// Every call is appended to $GH_STUB_DIR/calls.log so tests can see what was asked.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const dir = process.env.GH_STUB_DIR;
appendFileSync(path.join(process.env.GH_STUB_LOG || dir, 'calls.log'), args.join(' ') + '\n');
const w = args[args.indexOf('--workflow') + 1];
const f = path.join(dir, process.env.GH_STUB_CASE || '', `${w}.json`);
if (args[0] !== 'run' || args[1] !== 'list' || !existsSync(f)) { process.stderr.write(`stub gh: no answer for ${args.join(' ')}\n`); process.exit(1); }
process.stdout.write(readFileSync(f, 'utf8'));
