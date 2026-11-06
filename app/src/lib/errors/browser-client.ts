// EZD-341 (vault/plans/EZD-341.md): starts the browser Sentry client as Sentry.init does (sdk.js, 11.8.0), but
// through initAndBind, so getDefaultIntegrations and its nine integrations are not bundled. The options are
// EZD-024's browserSentryOptions() plus the stack parser, the integration list and the fetch transport.
import { BrowserClient, defaultStackParser, makeFetchTransport, normalizeStringifyValue } from '@sentry/browser';
import {
  getIntegrationsToSetup,
  initAndBind,
  setNormalizeStringifier,
  stackParserFromStackParserOptions,
} from '@sentry/core';
import { browserSentryOptions } from './browser-options';

export function browserClientOptions(): ConstructorParameters<typeof BrowserClient>[0] {
  const options = browserSentryOptions();
  return {
    ...options,
    stackParser: stackParserFromStackParserOptions(defaultStackParser),
    integrations: getIntegrationsToSetup({
      integrations: options.integrations,
      defaultIntegrations: options.defaultIntegrations,
    }),
    transport: makeFetchTransport,
  };
}

export function startBrowserSentry(): void {
  setNormalizeStringifier(normalizeStringifyValue);
  initAndBind(BrowserClient, browserClientOptions());
}
