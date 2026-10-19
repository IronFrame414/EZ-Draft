import type { SPANISH_NAMESPACES } from '../../../lib/messages/language';
import type { Message } from '../../../lib/messages/types';
import type { MessageKey } from './en';

export type SpanishKey = Extract<MessageKey, `${(typeof SPANISH_NAMESPACES)[number]}.${string}`>;

export const es = {
  'dev.messages.sample': 'Mensaje de ejemplo',
  'dev.messages.greeting': 'Hola, {name}',
  'dev.messages.items': { one: '{count} elemento', other: '{count} elementos' },
  'error.db_unavailable':
    'No se puede conectar con la base de datos. Inténtalo de nuevo en un minuto.',
} as const satisfies Record<SpanishKey, Message>;
