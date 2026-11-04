// EZD-108 T2 (vault/plans/EZD-108.md sections 3, 4; AC-EZD-108-4, -6): the profile lib. Expected values:
// glossary 00c and Q-0392 (null iPad value reads as `finger`), docs/architecture.md Password rules (8
// characters, 72 bytes, the order of the checks, then the mismatch) as the plan's T2 row gives them.
// Round 2 (Q-0465 (a); R-046): `captchaToken` in change mode only, kept as given; `codeProblem`.
import { describe, expect, it } from 'vitest';
import {
  codeProblem,
  ipadDrawingOf,
  newPasswordProblem,
  parsePasswordRequest,
  parseProfileInput,
} from './profile';

const EMAIL = 'mia@example.test';

describe('EZD-108 profile lib', () => {
  it('T2 (a) ipadDrawingOf: null and finger read as finger, pencil as pencil', () => {
    expect(ipadDrawingOf(null)).toBe('finger');
    expect(ipadDrawingOf('finger')).toBe('finger');
    expect(ipadDrawingOf('pencil')).toBe('pencil');
  });

  it('T2 (b) parseProfileInput accepts the two lists and refuses anything else', () => {
    expect(parseProfileInput({ language: 'es', ipadDrawing: 'pencil' })).toEqual({
      ok: true,
      language: 'es',
      ipadDrawing: 'pencil',
    });
    expect(parseProfileInput({ language: 'en', ipadDrawing: 'finger' })).toEqual({
      ok: true,
      language: 'en',
      ipadDrawing: 'finger',
    });
    const bad: unknown[] = [
      { language: 'de', ipadDrawing: 'finger' },
      { language: 'de' },
      { language: 'en' },
      { ipadDrawing: 'pencil' },
      {},
      { language: 5, ipadDrawing: 'pencil' },
      { language: 'en', ipadDrawing: null },
      { language: 'en', ipadDrawing: 'stylus' },
      null,
      'es',
      [],
    ];
    for (const body of bad)
      expect(parseProfileInput(body), JSON.stringify(body)).toEqual({ ok: false });
  });

  it('T2 (c) parsePasswordRequest reads both modes and returns null for anything else', () => {
    expect(
      parsePasswordRequest({
        mode: 'change',
        currentPassword: 'old-one',
        newPassword: 'new-one',
        confirmPassword: 'new-one',
      }),
    ).toEqual({
      mode: 'change',
      currentPassword: 'old-one',
      newPassword: 'new-one',
      confirmPassword: 'new-one',
    });
    expect(
      parsePasswordRequest({ mode: 'set', newPassword: 'new-one', confirmPassword: 'new-one' }),
    ).toEqual({ mode: 'set', newPassword: 'new-one', confirmPassword: 'new-one' });
    expect(
      parsePasswordRequest({
        mode: 'set',
        newPassword: 'new-one',
        confirmPassword: 'new-one',
        code: '123456',
      }),
    ).toEqual({ mode: 'set', newPassword: 'new-one', confirmPassword: 'new-one', code: '123456' });
    const change = {
      mode: 'change',
      currentPassword: 'old-one',
      newPassword: 'new-one',
      confirmPassword: 'new-one',
    };
    expect(parsePasswordRequest({ ...change, captchaToken: 'tok-1' })).toEqual({
      ...change,
      captchaToken: 'tok-1',
    });
    expect(parsePasswordRequest({ ...change, captchaToken: 5 })).toBeNull();
    expect(parsePasswordRequest(change)).not.toHaveProperty('captchaToken');
    expect(
      parsePasswordRequest({
        mode: 'set',
        newPassword: 'new-one',
        confirmPassword: 'new-one',
        captchaToken: 'tok-1',
      }),
    ).toBeNull();
    const bad: unknown[] = [
      null,
      'change',
      {},
      { mode: 'other', newPassword: 'a', confirmPassword: 'a' },
      { mode: 'change', newPassword: 'new-one', confirmPassword: 'new-one' },
      { mode: 'change', currentPassword: 5, newPassword: 'new-one', confirmPassword: 'new-one' },
      { mode: 'set', newPassword: 'new-one' },
      { mode: 'set', newPassword: 5, confirmPassword: 'new-one' },
    ];
    for (const body of bad) expect(parsePasswordRequest(body), JSON.stringify(body)).toBeNull();
  });

  it('T2 (d) newPasswordProblem: length, app name and mismatch, in that order; null when fine', () => {
    expect(newPasswordProblem('short1', 'short1', EMAIL)).toBe('password_too_short');
    expect(newPasswordProblem('ezdraft-pass-1', 'ezdraft-pass-1', EMAIL)).toBe(
      'password_contains_app_name',
    );
    expect(newPasswordProblem('abcd-wxyz1', 'abcd-wxyz2', EMAIL)).toBe('password_mismatch');
    expect(newPasswordProblem('abcd-wxyz1', 'abcd-wxyz1', EMAIL)).toBeNull();
  });

  it('T2 (e) codeProblem: only exactly six digits pass', () => {
    for (const code of ['', '12345', '12a456', '1234567'])
      expect(codeProblem(code), JSON.stringify(code)).toBe('code_invalid');
    expect(codeProblem('123456')).toBeNull();
  });
});
