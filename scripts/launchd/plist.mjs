// launchd plist text and the programs the build agents run (EZD-1951: moved out of install.mjs, which ran the retired
// launcher). No side effects on import, so tests can read the programs without touching launchctl. Node built-ins only.
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const BUILD_LABEL = 'com.ezdraft.build';
export const WATCHDOG_LABEL = 'com.ezdraft.build-watchdog';

// The script each agent runs, relative to the checkout.
export const AGENT_SCRIPTS = Object.freeze({ [BUILD_LABEL]: 'scripts/loop.mjs', [WATCHDOG_LABEL]: 'scripts/launchd/watchdog.mjs' });
export const program = (label, base = root, node = process.execPath) => [node, path.join(base, AGENT_SCRIPTS[label])];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// PATH is the PATH of the shell that ran `install`, so node, pnpm, claude and docker resolve as they do there.
export function plist(label, { program: argv, interval, keepAlive, log }) {
  // fnm's per-shell folders (fnm_multishells) vanish with the shell, so the real Node folder goes first instead.
  const dirs = [path.dirname(process.execPath), ...String(process.env.PATH).split(':').filter((d) => d && !/fnm_multishells/.test(d))];
  const env = { PATH: [...new Set(dirs)].join(':'), HOME: os.homedir(), LANG: process.env.LANG || 'en_US.UTF-8' };
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>${argv.map((a) => `<string>${esc(a)}</string>`).join('')}</array>
  <key>WorkingDirectory</key><string>${esc(root)}</string>
  <key>EnvironmentVariables</key>
  <dict>${Object.entries(env).map(([k, v]) => `<key>${k}</key><string>${esc(v)}</string>`).join('')}</dict>
  <key>RunAtLoad</key><true/>
${keepAlive ? '  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>\n  <key>ThrottleInterval</key><integer>60</integer>\n' : ''}${interval ? `  <key>StartInterval</key><integer>${interval}</integer>\n` : ''}  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>${esc(log)}</string>
  <key>StandardErrorPath</key><string>${esc(log)}</string>
</dict>
</plist>
`;
}
