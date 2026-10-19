import { describe, expect, it } from 'vitest';
import { MissingMessageError, MissingMessageParamError, createT } from './t';

const enMessages = {
  'x.a': 'Hello',
  'x.b': 'Hi {name}',
  'x.c': '{n} of {n}',
  'x.p': { one: '{count} item', other: '{count} items' },
};

describe("EZD-026c done when: createT returns a key's text, fills placeholders, picks the plural form and throws on a missing key or parameter", () => {
  const t = createT('en', enMessages);

  it('A6 returns plain text', () => {
    expect(t('x.a')).toBe('Hello');
  });

  it('A6 fills a placeholder', () => {
    expect(t('x.b', { name: 'Ana' })).toBe('Hi Ana');
  });

  it('A6 fills every occurrence', () => {
    expect(t('x.c', { n: 3 })).toBe('3 of 3');
  });

  it('A6 throws on a missing param (none given and empty)', () => {
    expect(() => t('x.b')).toThrow(MissingMessageParamError);
    expect(() => t('x.b', {})).toThrow(MissingMessageParamError);
    expect(() => t('x.b')).toThrow(/name/);
    expect(() => t('x.b', {})).toThrow(/name/);
  });

  it('A6 throws on a missing key, naming key and language', () => {
    expect(() => t('x.zz' as never)).toThrow(MissingMessageError);
    expect(() => t('x.zz' as never)).toThrow(/x\.zz/);
    expect(() => t('x.zz' as never)).toThrow(/en/);
  });

  it('A6 has() and language', () => {
    expect(t.has('x.a')).toBe(true);
    expect(t.has('nope')).toBe(false);
    expect(t.has('toString')).toBe(false);
    expect(t.has('constructor')).toBe(false);
    expect(t.language).toBe('en');
  });
});

describe('EZD-026c plurals and numbers', () => {
  const en = createT('en', enMessages);
  const es = createT('es', {
    'x.p': { one: '{count} elemento', other: '{count} elementos' },
  });

  it('A7 English forms', () => {
    expect(en('x.p', { count: 0 })).toBe('0 items');
    expect(en('x.p', { count: 1 })).toBe('1 item');
    expect(en('x.p', { count: 2 })).toBe('2 items');
  });

  it('A7 Spanish forms, no number grouping', () => {
    expect(es('x.p', { count: 0 })).toBe('0 elementos');
    expect(es('x.p', { count: 1 })).toBe('1 elemento');
    expect(es('x.p', { count: 2 })).toBe('2 elementos');
    expect(es('x.p', { count: 1500 })).toBe('1500 elementos');
    expect(es('x.p', { count: 1000000 })).toBe('1000000 elementos');
  });

  it('A7 plural without a numeric count throws', () => {
    expect(() => en('x.p')).toThrow(MissingMessageParamError);
    expect(() => en('x.p')).toThrow(/count/);
    expect(() => en('x.p', { count: '2' })).toThrow(MissingMessageParamError);
    expect(() => en('x.p', { count: '2' })).toThrow(/count/);
  });
});
