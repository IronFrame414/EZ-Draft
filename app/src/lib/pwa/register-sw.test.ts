// EZD-013 U2 (vault/plans/EZD-013.md section 4).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerServiceWorker, type SwEnv } from './register-sw';
import { captureBrowserError } from '../errors/capture';

vi.mock('../errors/capture', () => ({ captureBrowserError: vi.fn() }));

const here = path.dirname(fileURLToPath(import.meta.url));

function makeEnv(opts: {
  secure?: boolean;
  readyState?: DocumentReadyState;
  serviceWorker?: boolean;
  register?: ReturnType<typeof vi.fn>;
}) {
  const register = opts.register ?? vi.fn().mockResolvedValue({});
  const container = { register };
  const listeners: { type: string; fn: () => void }[] = [];
  const env = {
    navigator: opts.serviceWorker === false ? {} : { serviceWorker: container },
    window: {
      isSecureContext: opts.secure ?? true,
      addEventListener: (type: string, fn: () => void) => {
        listeners.push({ type, fn });
      },
    },
    document: { readyState: opts.readyState ?? 'complete' },
  } as unknown as SwEnv;
  return { env, register, container, listeners };
}

afterEach(() => {
  vi.mocked(captureBrowserError).mockClear();
});

describe('EZD-013 registerServiceWorker', () => {
  it('U2 (a): secure and loaded registers /sw.js once', async () => {
    const { env, register, container } = makeEnv({});
    expect(await registerServiceWorker(env)).toBe('registered');
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' });
    expect(register.mock.contexts[0]).toBe(container);
    expect(captureBrowserError).not.toHaveBeenCalled();
  });

  it('U2 (b): while loading it waits for the load event', async () => {
    const { env, register, listeners } = makeEnv({ readyState: 'loading' });
    const pending = registerServiceWorker(env);
    expect(register).not.toHaveBeenCalled();
    const load = listeners.find((l) => l.type === 'load');
    expect(load).toBeDefined();
    load?.fn();
    expect(await pending).toBe('registered');
    expect(register).toHaveBeenCalledTimes(1);
    expect(captureBrowserError).not.toHaveBeenCalled();
  });

  it('U2 (c): no serviceWorker on navigator is unsupported', async () => {
    const { env, register } = makeEnv({ serviceWorker: false });
    expect(await registerServiceWorker(env)).toBe('unsupported');
    expect(register).not.toHaveBeenCalled();
    expect(captureBrowserError).not.toHaveBeenCalled();
  });

  it('U2 (d): an insecure context is unsupported', async () => {
    const { env, register } = makeEnv({ secure: false });
    expect(await registerServiceWorker(env)).toBe('unsupported');
    expect(register).not.toHaveBeenCalled();
    expect(captureBrowserError).not.toHaveBeenCalled();
  });

  it('U2 (e): a rejected register is failed, reported once, never thrown', async () => {
    const err = new Error('EZD-013 sw');
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const { env } = makeEnv({ register: vi.fn().mockRejectedValue(err) });
      expect(await registerServiceWorker(env)).toBe('failed');
      await new Promise((r) => setTimeout(r, 0));
      expect(unhandled).not.toHaveBeenCalled();
      expect(captureBrowserError).toHaveBeenCalledTimes(1);
      expect(captureBrowserError).toHaveBeenCalledWith(err, 'pwa.register');
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('U2 (f): the source has no static import of the error capture module', () => {
    const src = readFileSync(path.join(here, 'register-sw.ts'), 'utf8');
    expect(src).not.toMatch(/^\s*import\s[^;]*from\s+['"]\.\.\/errors\/capture['"]/m);
  });
});
