// EZD-026d A2, A3, A4, A5, A8 (vault/plans/EZD-026d.md section 4).
import { describe, expect, expectTypeOf, it } from 'vitest';
import { KEY_PATTERN, NAMESPACES, SPANISH_NAMESPACES } from '../../lib/messages/language';
import type { Language, Message, Surface } from '../../lib/messages/types';
import { catalogFor } from './catalog';
import type { SpanishKey } from './catalog';
import { en } from './catalogs/en';
import { es } from './catalogs/es';
import { getT } from './get-t';

const nsOf = (key: string): string => key.slice(0, key.indexOf('.'));

function expectedKeys(surface: Surface): string[] {
  const spec = NAMESPACES[surface];
  return Object.keys(en)
    .filter((k) => (spec === 'all-but-dev' ? nsOf(k) !== 'dev' : spec.includes(nsOf(k))))
    .sort();
}

const ALLOWED: [Surface, Language][] = [
  ['office', 'en'],
  ['client', 'en'],
  ['field', 'en'],
  ['field', 'es'],
  ['dev', 'en'],
  ['dev', 'es'],
];

const placeholders = (s: string): string[] =>
  [...s.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1]).sort();

function forms(m: Message): string[] {
  return typeof m === 'string' ? [m] : [m.one, m.other];
}

describe('EZD-026d catalogs', () => {
  describe.each(ALLOWED)('A2 surface subset %s / %s', (surface, language) => {
    it('holds exactly the keys of its namespaces with values from the language catalog', () => {
      const cat = catalogFor(surface, language);
      expect(Object.keys(cat).sort()).toEqual(expectedKeys(surface));
      const source: Record<string, Message> = language === 'es' ? es : en;
      for (const [k, v] of Object.entries(cat)) expect(v).toEqual(source[k]);
      expect(Object.isFrozen(cat)).toBe(true);
    });
  });

  it('A2 dev surface has the dev keys; getT works per surface', () => {
    for (const language of ['en', 'es'] as const) {
      const cat = catalogFor('dev', language);
      expect(cat).toHaveProperty(['dev.messages.greeting']);
      expect(cat).toHaveProperty(['dev.messages.items']);
      expect(cat).toHaveProperty(['dev.messages.sample']);
    }
    expect(getT('dev', 'es')('dev.messages.sample')).toBe('Mensaje de ejemplo');
    expect(getT('dev', 'es').language).toBe('es');
    expect(getT('field', 'es').has('dev.messages.sample')).toBe(false);
    expect(getT('field', 'en')('error.db_unavailable')).toBe(
      "Can't reach the database. Try again in a minute.",
    );
  });

  it('A3 office and client refuse Spanish', () => {
    for (const surface of ['office', 'client'] as const) {
      expect(() => catalogFor(surface, 'es')).toThrow(Error);
      expect(() => getT(surface, 'es')).toThrow(Error);
      for (const call of [() => catalogFor(surface, 'es'), () => getT(surface, 'es')]) {
        try {
          call();
        } catch (e) {
          expect((e as Error).message).toContain(surface);
          expect((e as Error).message).toContain('es');
        }
      }
      expect(() => catalogFor(surface, 'en')).not.toThrow();
    }
  });

  it('EZD-026d done when: the Spanish catalog has text for every key of the Spanish namespaces', () => {
    const wanted = Object.keys(en)
      .filter((k) => (SPANISH_NAMESPACES as readonly string[]).includes(nsOf(k)))
      .sort();
    expect(Object.keys(es).sort()).toEqual(wanted);
    const enc: Record<string, Message> = en;
    const esc: Record<string, Message> = es;
    for (const key of wanted) {
      const e = enc[key];
      const s = esc[key];
      if (typeof e === 'string') {
        expect(typeof s, key).toBe('string');
      } else {
        expect(typeof s, key).toBe('object');
        expect(Object.keys(s as object).sort(), key).toEqual(['one', 'other']);
        expect(placeholders((s as { one: string }).one), key).toEqual(placeholders(e.one));
        expect(placeholders((s as { other: string }).other), key).toEqual(placeholders(e.other));
      }
      for (const f of forms(s)) expect(f.trim().length, key).toBeGreaterThan(0);
      expect(placeholders(forms(s).join(' ')), key).toEqual(placeholders(forms(e).join(' ')));
    }
  });

  it('A5 every key matches the key format', () => {
    for (const key of Object.keys(en)) expect(key).toMatch(KEY_PATTERN);
  });

  it('A8 types: es keys equal SpanishKey; a key outside MessageKey fails the typecheck and throws', () => {
    expectTypeOf<keyof typeof es>().toEqualTypeOf<SpanishKey>();
    const t = getT('dev', 'en');
    // @ts-expect-error 'dev.messages.nope' is not a MessageKey
    expect(() => t('dev.messages.nope')).toThrow();
  });
});
