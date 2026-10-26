// EZD-024 Step 5 (vault/plans/EZD-024.md): error reporting for the server.
export {
  noteBrowserEvent,
  reportError,
  reportJobFailure,
  reportWebhookFailure,
  type ReportAlert,
  type ReportContext,
  type ReportResult,
} from './report';
export { reportRouteFailure } from './route-failure';
export { initErrorReporting, type SentryOffCode, type SentryOptions } from './sentry-options';
