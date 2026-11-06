// EZD-341 U1, U2 (vault/plans/EZD-341.md section 4): the browser Sentry client start.
import { BrowserClient, makeFetchTransport } from '@sentry/browser';
import { getClient, getCurrentScope } from '@sentry/core';
import { afterAll, describe, expect, it } from 'vitest';
import { browserClientOptions, startBrowserSentry } from './browser-client';
import { scrubEvent } from './scrub';

describe('EZD-341 browser Sentry client start', () => {
  afterAll(async () => {
    await getClient()?.close(0);
  });

  it('EZD-341 U1 client options are the EZD-024 options plus three integrations, fetch transport and stack parser', () => {
    const options = browserClientOptions() as unknown as Record<string, unknown>;
    expect(options.dsn).toBe('https://public@ezdraft.invalid/1');
    expect(options.tunnel).toBe('/api/monitoring');
    expect(options.sendDefaultPii).toBe(false);
    expect(options.beforeSend).toBe(scrubEvent);
    expect(options.initialScope).toEqual({ tags: { 'ezd.source': 'browser' } });
    expect(options.transport).toBe(makeFetchTransport);
    expect(typeof options.stackParser).toBe('function');
    const integrations = options.integrations as Array<{ name: string }>;
    expect(integrations.map((i) => i.name)).toEqual(['GlobalHandlers', 'LinkedErrors', 'Dedupe']);
    expect('tracesSampleRate' in options).toBe(false);
  });

  it('EZD-341 U2 startBrowserSentry binds a browser client with only the three integrations', () => {
    expect(startBrowserSentry()).toBeUndefined();
    const client = getClient();
    expect(client).toBeInstanceOf(BrowserClient);
    const c = client as BrowserClient;
    expect(c.getOptions().tunnel).toBe('/api/monitoring');
    expect(c.getOptions().beforeSend).toBe(scrubEvent);
    for (const n of ['GlobalHandlers', 'LinkedErrors', 'Dedupe']) {
      expect(c.getIntegrationByName(n), n).toBeDefined();
    }
    for (const n of [
      'EventFilters',
      'FunctionToString',
      'ConversationId',
      'BrowserApiErrors',
      'Breadcrumbs',
      'Console',
      'HttpContext',
      'CultureContext',
      'BrowserSession',
    ]) {
      expect(c.getIntegrationByName(n), n).toBeUndefined();
    }
    expect(getCurrentScope().getScopeData().tags['ezd.source']).toBe('browser');
  });
});
