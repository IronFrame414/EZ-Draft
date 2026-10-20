// EZD-016d Step 1 (vault/plans/EZD-016d.md): the four browser device projects and their tag routing.
// Sizes: 04 Frame (desktop 1600 x 1000); Q-0053 (iPad landscape 1180 x 820); Q-0088 (Surface about 1440 x 960);
// S17/S18 Layout (phone 390 x 844). Descriptors read from the pinned @playwright/test 1.64.1 `devices`.
// Routing (planner's choice, PS Step 1): untagged tests run in desktop only; a tagged test runs in exactly its
// tagged projects. A project grep replaces the config-level grep, so the gate scope (Q-0006; scripts/gate.mjs)
// is repeated inside it as a lookahead.
import { devices } from '@playwright/test';

export type DeviceName = 'desktop' | 'ipad-landscape' | 'surface' | 'phone';

export const DEVICE_PROJECTS: ReadonlyArray<{
  name: DeviceName;
  use: (typeof devices)[string];
}> = [
  {
    name: 'desktop',
    use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 } },
  },
  {
    name: 'ipad-landscape',
    use: {
      ...devices['iPad Pro 11 landscape'],
      viewport: { width: 1180, height: 820 },
      deviceScaleFactor: 2,
    },
  },
  {
    name: 'surface',
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: 1440, height: 960 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: false,
    },
  },
  {
    name: 'phone',
    use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
  },
];

const BODY: Record<DeviceName, string> = {
  desktop: '(?:(?=[\\s\\S]*@desktop\\b)|(?![\\s\\S]*@(?:ipad|surface|phone)\\b))',
  'ipad-landscape': '(?=[\\s\\S]*@ipad\\b)',
  surface: '(?=[\\s\\S]*@surface\\b)',
  phone: '(?=[\\s\\S]*@phone\\b)',
};

export function projectGrep(device: DeviceName, scope?: string): RegExp {
  const s = typeof scope === 'string' && scope !== '' ? '(?=[\\s\\S]*(?:' + scope + '))' : '';
  return new RegExp('^' + s + BODY[device]);
}
