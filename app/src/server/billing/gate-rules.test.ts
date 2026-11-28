// EZD-1711 (AC-EZD-1711-1, -3; Q-0795 "members can open and export projects for 14 days and client links keep
// working, but nothing can be edited, created, rendered or sent. After 14 days only the paywall page shows"):
// the request gate's billing rules. Expected values: Q-0795 and the Settled "Paywall rule" row.
import { describe, expect, it } from 'vitest';
import { billingDecision, billingSkips } from './gate-rules';

const P = '/api/projects/00000000-0000-4000-8000-000000000000';
const PASS = { kind: 'pass' };
const READ_ONLY = { kind: 'refuse', code: 'billing_read_only' };
const INACTIVE = { kind: 'refuse', code: 'billing_inactive' };
const HOME = { kind: 'redirect', to: '/' };

describe('EZD-1711 billing gate rules', () => {
  it('G1 full: everything passes', () => {
    for (const [m, p] of [
      ['POST', '/api/projects'],
      ['PATCH', `${P}/model`],
      ['GET', '/projects/x'],
    ]) {
      expect(billingDecision('full', m, p)).toEqual(PASS);
    }
  });

  it('G2 grace: no edit, create, render or send; open and export pass', () => {
    // edit, create, send, render-like and settings writes are refused
    for (const [m, p] of [
      ['POST', '/api/projects'],
      ['PATCH', `${P}/model`],
      ['POST', `${P}/objects`],
      ['POST', `${P}/sends`],
      ['POST', `${P}/lock`],
      ['POST', `${P}/assistant`],
      ['DELETE', `${P}`],
      ['PATCH', '/api/settings/company'],
      ['POST', '/api/share-links'],
    ]) {
      expect(billingDecision('grace', m, p), `${m} ${p}`).toEqual(READ_ONLY);
    }
    // reads, pages, export, viewing, own profile, error reports and billing pass
    for (const [m, p] of [
      ['GET', `${P}/model`],
      ['HEAD', '/api/projects'],
      ['GET', '/projects/abc'],
      ['GET', '/'],
      ['POST', `${P}/exports`],
      ['POST', '/api/projects/recent'],
      ['POST', '/api/realtime/token'],
      ['POST', '/api/notifications/read-all'],
      ['PATCH', '/api/profile'],
      ['POST', `${P}/lock/release`],
      ['POST', '/api/monitoring'],
      ['POST', '/api/settings/billing/checkout'],
      ['POST', '/api/settings/billing/portal'],
      ['POST', '/api/billing/stripe-webhook'],
      ['POST', '/api/share-links/resolve'],
    ]) {
      expect(billingDecision('grace', m, p), `${m} ${p}`).toEqual(PASS);
    }
  });

  it('G3 locked: only the paywall (at /) and paying again', () => {
    expect(billingDecision('locked', 'GET', '/projects/abc')).toEqual(HOME);
    expect(billingDecision('locked', 'GET', '/settings/company')).toEqual(HOME);
    expect(billingDecision('locked', 'GET', '/settings/billing')).toEqual(HOME);
    expect(billingDecision('locked', 'GET', '/')).toEqual(PASS);
    expect(billingDecision('locked', 'GET', '/sign-in')).toEqual(PASS);
    expect(billingDecision('locked', 'GET', '/api/projects')).toEqual(INACTIVE);
    expect(billingDecision('locked', 'POST', `${P}/exports`)).toEqual(INACTIVE);
    expect(billingDecision('locked', 'POST', '/api/settings/billing/checkout')).toEqual(PASS);
    expect(billingDecision('locked', 'POST', '/api/monitoring')).toEqual(PASS);
    // the client link lookup answers unavailable itself (resolve_share_link)
    expect(billingDecision('locked', 'POST', '/api/share-links/resolve')).toEqual(PASS);
    // a server action (sign out) posts to the page
    expect(billingDecision('locked', 'POST', '/')).toEqual(PASS);
  });

  it('G4 escaped and doubled spellings match the same rules', () => {
    expect(billingDecision('grace', 'POST', '/%61pi/projects')).toEqual(READ_ONLY);
    expect(billingDecision('grace', 'POST', '//api//projects/')).toEqual(READ_ONLY);
    expect(billingDecision('locked', 'GET', '/API/projects')).toEqual(INACTIVE);
  });

  it('G5 skips: billing routes, error reports, sign-in pages; never Projects or a project', () => {
    expect(billingSkips('/api/settings/billing')).toBe(true);
    expect(billingSkips('/api/billing/stripe-webhook')).toBe(true);
    expect(billingSkips('/api/monitoring')).toBe(true);
    expect(billingSkips('/sign-in')).toBe(true);
    expect(billingSkips('/')).toBe(false);
    expect(billingSkips('/projects/abc')).toBe(false);
    expect(billingSkips('/api/projects')).toBe(false);
  });
});
