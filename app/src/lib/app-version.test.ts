// EZD-299a T6 (vault/plans/EZD-299a.md section 4; AC-EZD-299-14). Expected values: Decided D-Build
// (`isOlderBuild` is true for a missing, non-numeric or lower header; `appBuild()` reads EZD_APP_BUILD per call,
// a match of ^[1-9][0-9]{0,14}$ is that number, anything else 0); Q-0626.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_BUILD_HEADER, appBuild, isOlderBuild } from './app-version';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('EZD-299a app version', () => {
  it('EZD-299a T6 names the header', () => {
    expect(APP_BUILD_HEADER).toBe('x-ezdraft-app-build');
  });

  it('EZD-299a T6 isOlderBuild refuses a missing, non-numeric or lower header', () => {
    expect(isOlderBuild(null, 200)).toBe(true);
    expect(isOlderBuild('abc', 200)).toBe(true);
    expect(isOlderBuild('199', 200)).toBe(true);
    expect(isOlderBuild('200', 200)).toBe(false);
    expect(isOlderBuild('201', 200)).toBe(false);
    expect(isOlderBuild('0', 0)).toBe(false);
  });

  it('EZD-299a T6 appBuild reads the env value, 0 when missing or not a number', () => {
    vi.stubEnv('EZD_APP_BUILD', '1700000000');
    expect(appBuild()).toBe(1700000000);
    vi.stubEnv('EZD_APP_BUILD', '0');
    expect(appBuild()).toBe(0);
    vi.stubEnv('EZD_APP_BUILD', '12a');
    expect(appBuild()).toBe(0);
    vi.stubEnv('EZD_APP_BUILD', undefined);
    expect(appBuild()).toBe(0);
  });
});
