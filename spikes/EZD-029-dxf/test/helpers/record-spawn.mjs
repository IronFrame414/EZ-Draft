// Test-side probe for EZD-029 T7, loaded with `--import` through NODE_OPTIONS: appends the file and
// argv of every child process (spawn, fork, exec and execFile all go through ChildProcess#spawn) to
// the file named by EZD029_SPAWN_LOG, one JSON line each. It changes nothing about the spawn.
import { ChildProcess } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const log = process.env.EZD029_SPAWN_LOG;
if (log) {
  const original = ChildProcess.prototype.spawn;
  ChildProcess.prototype.spawn = function spawn(options) {
    appendFileSync(log, `${JSON.stringify({ file: options?.file, args: options?.args })}\n`);
    return original.call(this, options);
  };
}
