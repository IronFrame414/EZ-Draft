// EZD-134 (03b Architecture rule 12 "Every request carries the app version"; Q-0530): every answer names the
// build in x-ezdraft-app-build, the same number next.config.ts inlines as EZD_APP_BUILD, through a header rule
// (the request gate's answer headers would be copied onto the request and make every save look current).
import { describe, expect, it } from 'vitest';
import { APP_BUILD_HEADER } from './app-version';

describe('EZD-134 app build header', () => {
  it('a header rule for every path carries the inlined build number', async () => {
    const config = (await import('../../next.config')).default;
    const build = config.env?.EZD_APP_BUILD;
    expect(build).toMatch(/^[1-9][0-9]{9}$/);
    const rules = await config.headers!();
    const all = rules.find((r) => r.source === '/:path*');
    expect(all?.headers).toEqual([{ key: APP_BUILD_HEADER, value: build }]);
  });
});
