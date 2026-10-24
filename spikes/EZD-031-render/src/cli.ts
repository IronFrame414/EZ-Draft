// EZD-031 Steps 5 and 6: argument parsing and the live-mode guards. main() never throws and never exits the process.
import path from 'node:path';
import readline from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { AiError } from '../../../app/src/server/ai/errors';
import type { ImageEditProvider } from '../../../app/src/server/ai/types';
import { TrialError } from './errors';
import type { Sleep } from './providers';
import { executeTrial, prepareTrial, type PreparedTrial, type RunStatus, type TrialOptions, type TrialSummary } from './trial';

export type CliIo = {
  env: Record<string, string | undefined>;
  isTTY: boolean;
  ask(prompt: string): Promise<string>;
  out(line: string): void;
  err(line: string): void;
  sleep?: Sleep;
};

export type CliResult = {
  exitCode: 0 | 1 | 2;
  status: RunStatus | null;
  error: Error | null;
  summary: TrialSummary | null;
};

const PROVIDERS: ImageEditProvider[] = ['gemini', 'openai', 'bfl'];

function parseCap(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const value = Number(text);
  return text.trim() !== '' && Number.isFinite(value) && value > 0 ? value : Number.NaN;
}

function parseOptions(argv: string[], io: CliIo): TrialOptions {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  let values;
  try {
    values = parseArgs({
      args,
      allowPositionals: false,
      options: {
        mode: { type: 'string' },
        rooms: { type: 'string' },
        models: { type: 'string' },
        prices: { type: 'string' },
        'run-dir': { type: 'string' },
        resume: { type: 'string' },
        providers: { type: 'string' },
        'max-usd': { type: 'string' },
      },
    }).values;
  } catch {
    throw new TrialError('args_invalid', 'flag');
  }
  if (values.mode !== 'stub' && values.mode !== 'live') throw new TrialError('args_invalid', 'mode');
  if (!values.rooms) throw new TrialError('args_invalid', 'rooms');
  let providers: ImageEditProvider[] | undefined;
  if (values.providers !== undefined) {
    providers = values.providers.split(',').map((p) => p.trim()) as ImageEditProvider[];
    if (providers.length === 0 || providers.some((p) => !PROVIDERS.includes(p))) throw new TrialError('args_invalid', 'providers');
  }
  const cap = parseCap(values['max-usd']);
  if (values.mode === 'live') {
    if (io.env.CI) throw new TrialError('live_refused_ci');
    if (!io.isTTY) throw new TrialError('live_refused_no_tty');
    if (cap === undefined || Number.isNaN(cap)) throw new TrialError('live_refused_no_cap');
  } else if (cap !== undefined && Number.isNaN(cap)) {
    throw new TrialError('args_invalid', 'max-usd');
  }
  return {
    mode: values.mode,
    rooms: values.rooms,
    models: values.models,
    prices: values.prices,
    runDir: values['run-dir'],
    resume: values.resume,
    providers,
    capUsd: cap,
    env: io.env,
    sleep: io.sleep,
  };
}

function confirmationLines(p: PreparedTrial): string[] {
  const lines = [`rooms: ${p.rooms.length}`];
  for (const room of p.rooms) lines.push(`room: ${room.id}`);
  for (const m of p.models) {
    lines.push(`model: ${m.provider} ${m.model} (${m.label})${m.settings ? ' settings ' + JSON.stringify(m.settings) : ''}`);
  }
  lines.push(`renders: ${p.renders}`);
  lines.push(`cap: ${p.options.capUsd} USD`);
  for (const m of p.unpriced) lines.push(`no price: ${m.provider} ${m.label}`);
  for (const provider of PROVIDERS) if (p.access[provider]) lines.push(`${provider}: key found`);
  return lines;
}

export async function main(argv: string[], io: CliIo): Promise<CliResult> {
  let prepared: PreparedTrial;
  try {
    const options = parseOptions(argv, io);
    prepared = await prepareTrial(options);
  } catch (error) {
    if (error instanceof TrialError) {
      io.err(`refused: ${error.code}`);
      return { exitCode: 2, status: null, error, summary: null };
    }
    if (error instanceof AiError) {
      io.err(`refused: ${error.code} (${error.message})`);
      return { exitCode: 2, status: null, error, summary: null };
    }
    io.err(`crashed: ${error instanceof Error ? error.name : 'Error'}`);
    return { exitCode: 1, status: null, error: error instanceof Error ? error : new Error('unknown'), summary: null };
  }

  try {
    if (prepared.options.mode === 'live') {
      for (const line of confirmationLines(prepared)) io.out(line);
      const answer = await io.ask('Type yes to start: ');
      if (answer.trim() !== 'yes') return { exitCode: 0, status: 'cancelled', error: null, summary: null };
    }
    const summary = await executeTrial(prepared);
    io.out(`status: ${summary.status}`);
    io.out(`run: ${summary.runDir}`);
    return { exitCode: 0, status: summary.status, error: null, summary };
  } catch (error) {
    io.err(`crashed: ${error instanceof Error ? error.name : 'Error'}`);
    return { exitCode: 1, status: null, error: error instanceof Error ? error : new Error('unknown'), summary: null };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await main(process.argv.slice(2), {
    env: process.env,
    isTTY: process.stdin.isTTY === true,
    ask: async (prompt) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      try {
        return await rl.question(prompt);
      } finally {
        rl.close();
      }
    },
    out: (line) => process.stdout.write(line + '\n'),
    err: (line) => process.stderr.write(line + '\n'),
  });
  process.exitCode = result.exitCode;
}
