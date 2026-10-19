import { NAMESPACES } from '../../lib/messages/language';
import type { Language, Message, Surface } from '../../lib/messages/types';
import { en } from './catalogs/en';
import type { MessageKey } from './catalogs/en';
import { es } from './catalogs/es';

export type { MessageKey } from './catalogs/en';
export type { SpanishKey } from './catalogs/es';

export function catalogFor(
  surface: Surface,
  language: Language,
): Readonly<Partial<Record<MessageKey, Message>>> {
  if (language === 'es' && (surface === 'office' || surface === 'client')) {
    throw new Error(`Surface ${surface} is English only: language es is not available`);
  }
  const allowed = NAMESPACES[surface];
  const source: Readonly<Record<string, Message>> = language === 'es' ? es : en;
  const out: Partial<Record<MessageKey, Message>> = {};
  for (const key of Object.keys(source)) {
    const namespace = key.slice(0, key.indexOf('.'));
    const inSurface = allowed === 'all-but-dev' ? namespace !== 'dev' : allowed.includes(namespace);
    if (inSurface) out[key as MessageKey] = source[key];
  }
  return Object.freeze(out);
}
