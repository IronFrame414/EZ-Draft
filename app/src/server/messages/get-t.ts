import { createT } from '../../lib/messages/t';
import type { T } from '../../lib/messages/t';
import type { Language, Message, Surface } from '../../lib/messages/types';
import { catalogFor } from './catalog';
import type { MessageKey } from './catalog';

export function getT(surface: Surface, language: Language): T<MessageKey> {
  return createT(language, catalogFor(surface, language) as Readonly<Record<MessageKey, Message>>);
}
