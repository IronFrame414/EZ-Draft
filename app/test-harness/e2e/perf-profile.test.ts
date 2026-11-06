// EZD-017 T13 (vault/plans/EZD-017.md section 4): the perf check's desktop profile equals the browser harness's
// desktop project. Sizes: EZD-016d Step 1; 04 Frame (1600 x 1000).
import { describe, expect, test } from 'vitest';
import { DEVICE_PROJECTS } from './devices';
// Plain .mjs module; app/tsconfig.json has allowJs, so its types are inferred.
import { PROFILES } from '../../../scripts/perf/perf.config.mjs';

describe('EZD-017 perf profile', () => {
  test('EZD-017 T13 Profile equals the harness', () => {
    const profile = PROFILES.desktop;
    const desktop = DEVICE_PROJECTS.find((p) => p.name === 'desktop');
    expect(desktop).toBeDefined();
    const use = desktop!.use;

    expect(use.viewport).toEqual({ width: 1600, height: 1000 });
    expect(use.deviceScaleFactor).toBe(1);
    expect(use.hasTouch).toBe(false);
    expect(use.isMobile).toBe(false);
    expect(use.defaultBrowserType).toBe('chromium');

    expect(profile.viewport).toEqual({ width: 1600, height: 1000 });
    expect(profile.deviceScaleFactor).toBe(1);
    expect(profile.hasTouch).toBe(false);
    expect(profile.isMobile).toBe(false);
    expect(profile.browser).toBe('chromium');
  });
});

describe('EZD-207c perf iPad profile', () => {
  test('EZD-207c V5 iPad size equals harness', () => {
    const ipad = DEVICE_PROJECTS.find((p) => p.name === 'ipad-landscape');
    expect(ipad).toBeDefined();
    const use = ipad!.use;
    expect(PROFILES.ipad.viewport).toEqual(use.viewport);
    expect(PROFILES.ipad.viewport).toEqual({ width: 1180, height: 820 });
    expect(PROFILES.ipad.deviceScaleFactor).toBe(use.deviceScaleFactor);
    expect(PROFILES.ipad.deviceScaleFactor).toBe(2);
    expect(PROFILES.ipad.browser).toBe('chromium');
  });
});
