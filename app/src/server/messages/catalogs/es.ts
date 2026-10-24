import type { SPANISH_NAMESPACES } from '../../../lib/messages/language';
import type { Message } from '../../../lib/messages/types';
import type { MessageKey } from './en';

export type SpanishKey = Extract<MessageKey, `${(typeof SPANISH_NAMESPACES)[number]}.${string}`>;

export const es = {
  'dev.messages.sample': 'Mensaje de ejemplo',
  'dev.messages.greeting': 'Hola, {name}',
  'dev.messages.items': { one: '{count} elemento', other: '{count} elementos' },
  'dev.states.loaded': 'Cargado',
  'dev.states.sample_error': 'Error de ejemplo',
  'dev.states.sample_toast': 'Aviso de ejemplo',
  'dev.states.confirm_title': 'Confirmación de ejemplo',
  'dev.states.confirm_message': 'Pregunta de ejemplo',
  'dev.states.confirm_ok': 'Acción de ejemplo',
  'error.db_unavailable':
    'No se puede conectar con la base de datos. Inténtalo de nuevo en un minuto.',
  'error.not_signed_in': 'Se cerró tu sesión. Vuelve a iniciar sesión para continuar.',
  'error.not_authorized': 'No tienes permiso para hacer eso.',
  'error.job_not_found': 'Esa tarea ya no existe.',
  'error.invalid_input': 'Parte de esa información no es válida. Revísala e inténtalo de nuevo.',
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
  'common.sign_in.password_label': 'Contraseña',
  'common.sign_in.password_submit': 'Iniciar sesión',
  'common.sign_in.send_instead': 'Mejor envíame un enlace de acceso por correo',
  'common.sign_in.forgot': '¿Olvidaste tu contraseña? Envíame un código por correo',
  'common.retry': 'Reintentar',
  'common.offline': 'Sin conexión',
  'common.cancel': 'Cancelar',
  'common.close': 'Cerrar',
  'error.invalid_email': 'Escribe un correo electrónico válido.',
  'error.too_many_requests': 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.',
  'error.code_invalid': 'Ese código es incorrecto o ya venció.',
  'error.link_invalid': 'Este enlace de acceso venció o ya se usó.',
  'error.no_access': 'Esta cuenta no tiene acceso a EZ Draft. Pregunta al dueño de tu empresa.',
  'error.sign_in_failed': 'Algo salió mal. Inténtalo de nuevo en un minuto.',
  'error.password_wrong': 'El correo o la contraseña son incorrectos.',
  'error.password_throttled':
    "Demasiadas contraseñas incorrectas. Usa '¿Olvidaste tu contraseña? Envíame un código por correo' o inténtalo de nuevo en 15 minutos.",
  'error.code_throttled': 'Demasiados códigos incorrectos. Inténtalo de nuevo en 15 minutos.',
  'error.email_throttled': 'Demasiados correos de acceso. Inténtalo de nuevo en una hora.',
  'error.ip_throttled':
    'Demasiados intentos de acceso desde esta red. Inténtalo de nuevo en 15 minutos.',
  'error.captcha_failed': 'La verificación de seguridad no se completó. Inténtalo de nuevo.',
  'error.captcha_unavailable':
    'La verificación de seguridad no se cargó. Revisa tu conexión y vuelve a cargar la página.',
  'error.envelope_too_large': 'Ese informe de error es demasiado grande para enviarlo.',
  'error.invalid_envelope': 'No se pudo leer ese informe de error.',
  'field.device.editor_on_phone':
    'La edición se hace en un iPad o una computadora. Abre este proyecto allí.',
} as const satisfies Record<SpanishKey, Message>;
