// EZD-134: the page money scan skips the service worker's copies of built static files (the same scripts the page
// loaded, never scanned) and still scans every other worker fetch and every page fetch of the same path.
import { describe, expect, it } from 'vitest';
import type { TrafficResponse } from '../e2e/traffic';
import { CANARY_FIELDS } from './canary-route';
import { pageViolations } from './pages';

const response = (path: string, resourceType: string, fromServiceWorker: boolean, body: string): TrafficResponse => ({
  method: 'GET',
  path,
  resourceType,
  status: 200,
  fromServiceWorker,
  headerValues: [],
  body,
  redirectedTo: null,
});

describe('EZD-134 money scan and worker copies', () => {
  it('a worker copy of a built file is skipped; other worker fetches and page fetches are scanned', () => {
    const responses = [
      response('/_next/static/chunks/a.js', 'fetch', true, 'canaryCost'),
      response('/_next/static/chunks/a.js', 'fetch', false, 'canaryCost'),
      response('/settings', 'fetch', true, '{"canaryCost":1}'),
      response('/api/x', 'fetch', true, '{"canary_cost":1}'),
    ];
    expect(pageViolations(responses, CANARY_FIELDS, ['company_cost'])).toEqual([
      'GET /_next/static/chunks/a.js: text:canaryCost',
      'GET /settings: text:canaryCost',
      'GET /api/x: text:canary_cost',
    ]);
  });
});
