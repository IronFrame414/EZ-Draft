// EZD-164 U5 (vault/plans/EZD-164.md section 4): registerSpikeWorker.
import { describe, expect, it, vi } from 'vitest';
import { registerSpikeWorker, type SpikeSwEnv } from './register-spike-worker';

const envWith = (
  serviceWorker: { register: ReturnType<typeof vi.fn> } | undefined,
  isSecureContext: boolean,
): SpikeSwEnv =>
  ({
    navigator: serviceWorker ? { serviceWorker } : {},
    window: { isSecureContext },
  }) as unknown as SpikeSwEnv;

describe('EZD-164 registerSpikeWorker', () => {
  it('EZD-164 U5 (a) unsupported', async () => {
    expect(await registerSpikeWorker(envWith(undefined, true))).toBe('unsupported');
    const register = vi.fn();
    expect(await registerSpikeWorker(envWith({ register }, false))).toBe('unsupported');
    expect(register).not.toHaveBeenCalled();
  });

  it('EZD-164 U5 (b) registered', async () => {
    const register = vi.fn().mockResolvedValue({});
    expect(await registerSpikeWorker(envWith({ register }, true))).toBe('registered');
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith('/dev/sw-offline/worker', {
      scope: '/dev/sw-offline/',
      updateViaCache: 'none',
    });
  });

  it('EZD-164 U5 (c) failed', async () => {
    const register = vi.fn().mockRejectedValue(new Error('x'));
    await expect(registerSpikeWorker(envWith({ register }, true))).resolves.toBe('failed');
  });
});
