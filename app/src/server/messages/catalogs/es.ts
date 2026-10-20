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
  'error.not_signed_in': 'Se cerró tu sesión. Vuelve a iniciar sesión para continuar.',
  'common.sign_in.title': 'Inicia sesión en EZ Draft',
  'common.sign_in.email_label': 'Correo electrónico',
  'common.sign_in.send': 'Envíame un enlace de acceso por correo',
  'common.sign_in.sent':
    'Si {email} tiene acceso a EZ Draft, enviamos un enlace de acceso y un código de 6 dígitos. Abre el enlace o escribe el código aquí.',
  'common.sign_in.check_spam':
    '¿No está en tu bandeja de entrada? Revisa la carpeta de spam o correo no deseado.',
  'common.sign_in.code_label': 'Código de 6 dígitos',
  'common.sign_in.code_submit': 'Iniciar sesión',
  'common.sign_in.change_email': 'Usar otro correo electrónico',
  'common.sign_in.confirm_title': 'Termina de iniciar sesión',
  'common.sign_in.confirm_submit': 'Iniciar sesión',
  'common.sign_in.sign_out': 'Cerrar sesión',
  'common.sign_in.lang_en': 'English',
  'common.sign_in.lang_es': 'Español',
  'error.invalid_email': 'Escribe un correo electrónico válido.',
  'error.too_many_requests': 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.',
  'error.code_invalid': 'Ese código es incorrecto o ya venció.',
  'error.link_invalid': 'Este enlace de acceso venció o ya se usó.',
  'error.no_access': 'Esta cuenta no tiene acceso a EZ Draft. Pregunta al dueño de tu empresa.',
  'error.sign_in_failed': 'Algo salió mal. Inténtalo de nuevo en un minuto.',
} as const satisfies Record<SpanishKey, Message>;
