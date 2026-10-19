import { describe, expect, it } from 'vitest';
import { languageFor } from './language';
import {
  KEY_PATTERN,
  MissingMessageError,
  MissingMessageParamError,
  NAMESPACES,
  SPANISH_NAMESPACES,
  createT,
  languageFor as indexLanguageFor,
} from './index';

describe("EZD-026c done when: languageFor gives English for office and client and the user's language for field and dev", () => {
  const cases = [
    ['field', 'en', 'en'],
    ['field', 'es', 'es'],
    ['dev', 'en', 'en'],
    ['dev', 'es', 'es'],
    ['office', 'en', 'en'],
    ['office', 'es', 'en'],
    ['client', 'en', 'en'],
    ['client', 'es', 'en'],
  ] as const;

  for (const [surface, userLanguage, expected] of cases) {
    it(`${surface} with user language ${userLanguage} gives ${expected}`, () => {
      expect(languageFor(surface, { language: userLanguage })).toBe(expected);
    });
  }
});

describe('EZD-026c namespace constants and exports', () => {
  it('A12 office is all-but-dev', () => {
    expect(NAMESPACES.office).toBe('all-but-dev');
  });

  it('A12 field, client and dev namespaces', () => {
    expect(NAMESPACES.field).toEqual(['common', 'field', 'error']);
    expect(NAMESPACES.client).toEqual(['common', 'client', 'error']);
    expect(NAMESPACES.dev).toEqual(['common', 'field', 'error', 'dev']);
  });

  it('A12 Spanish namespaces', () => {
    expect(SPANISH_NAMESPACES).toEqual(['common', 'field', 'error', 'dev']);
  });

  it('A12 KEY_PATTERN matches good keys', () => {
    for (const key of ['error.db_unavailable', 'dev.messages.items', 'office.header.share']) {
      expect(KEY_PATTERN.test(key)).toBe(true);
    }
  });

  it('A12 KEY_PATTERN rejects bad keys', () => {
    for (const key of ['Error.x', 'field', 'field.', 'field.A', 'other.x', 'field.x-y']) {
      expect(KEY_PATTERN.test(key)).toBe(false);
    }
  });

  it('A12 index exports functions', () => {
    expect(typeof createT).toBe('function');
    expect(typeof indexLanguageFor).toBe('function');
  });

  it('A12 index error classes are the thrown errors', () => {
    let missingKey: unknown;
    try {
      createT('en', {})('a.b' as never);
    } catch (e) {
      missingKey = e;
    }
    expect(missingKey).toBeInstanceOf(Error);
    expect(missingKey).toBeInstanceOf(MissingMessageError);
    expect((missingKey as Error).name).toBe('MissingMessageError');

    let missingParam: unknown;
    try {
      createT('en', { 'a.b': '{x}' })('a.b');
    } catch (e) {
      missingParam = e;
    }
    expect(missingParam).toBeInstanceOf(Error);
    expect(missingParam).toBeInstanceOf(MissingMessageParamError);
    expect((missingParam as Error).name).toBe('MissingMessageParamError');
  });
});
