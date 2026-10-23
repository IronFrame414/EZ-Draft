// EZD-024 T17 (vault/plans/EZD-024.md Tests; Step 6): the browser Sentry options.
import { describe, expect, it } from 'vitest';
import { browserSentryOptions } from './browser-options';
import { scrubEvent } from './scrub';

describe('EZD-024 browser Sentry options', () => {
  it('EZD-024 T17 sends through the tunnel with the placeholder DSN, scrubbed, with no tracing or replay', () => {
    const options = browserSentryOptions() as Record<string, unknown>;
    expect(options.dsn).toBe('https://public@ezdraft.invalid/1');
    expect(options.tunnel).toBe('/api/monitoring');
    expect(options.sendDefaultPii).toBe(false);
    expect(options.beforeSend).toBe(scrubEvent);
    const scope = options.initialScope as { tags?: Record<string, string> };
    expect(scope.tags?.['ezd.source']).toBe('browser');
    expect('tracesSampleRate' in options).toBe(false);
    expect('replaysSessionSampleRate' in options).toBe(false);
    // A function form receives stand-in default integrations and must drop the banned ones.
    const standIns = ['Breadcrumbs', 'BrowserTracing', 'Replay'].map((name) => ({ name }));
    const integrations =
      typeof options.integrations === 'function'
        ? (options.integrations as (defaults: Array<{ name: string }>) => Array<{ name: string }>)(
            standIns,
          )
        : ((options.integrations ?? []) as Array<{ name: string }>);
    for (const integration of integrations) {
      for (const banned of ['Replay', 'BrowserTracing', 'Breadcrumbs']) {
        expect(integration.name, integration.name).not.toContain(banned);
      }
    }
  });
});
