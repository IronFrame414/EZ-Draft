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
  'common.invite.email_subject': 'Te invitaron a unirte a {company} en EZ Draft',
  'common.invite.email_intro':
    '{company} te invitó a EZ Draft. Abre el enlace y presiona Aceptar para unirte.',
  'common.invite.email_code': 'Tu código de invitación: {code}',
  'common.invite.email_expiry': 'El enlace y el código funcionan durante 7 días.',
  'common.invite.email_link': 'Aceptar la invitación',
  'common.invite.title': 'Únete a {company} en EZ Draft',
  'common.invite.intro': 'Presiona Aceptar para unirte e iniciar sesión.',
  'common.invite.accept': 'Aceptar',
  'common.invite.invalid_title': 'Este enlace de invitación ya no funciona',
  'common.invite.invalid':
    'Puede que haya vencido, que ya se haya usado o que se haya cancelado. Pide a quien te invitó que vuelva a enviar la invitación.',
  'common.invite.failed': 'No se pudo aceptar la invitación. Inténtalo de nuevo.',
  'common.invite.to_sign_in': 'Ir a iniciar sesión',
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
  'common.terms.title': 'Términos del servicio',
  'common.terms.no_certification':
    'EZ Draft no certifica que ningún plano, cálculo o diseño cumpla con los códigos de construcción, eléctricos ni otros.',
  'common.terms.responsibility':
    'EZ Draft es solo para diseño y planificación. La responsabilidad del cumplimiento de los códigos es del usuario con licencia: todos los cálculos y códigos deben ser verificados por el usuario y por un profesional con licencia en la jurisdicción del proyecto.',
  'common.terms.placeholder':
    'Texto provisional: los términos completos del servicio aún no están redactados y reemplazarán este texto. Las dos declaraciones anteriores ya se aplican.',
  'common.terms.back': 'Volver a iniciar sesión',
  'common.retry': 'Reintentar',
  'common.offline': 'Sin conexión',
  'common.cancel': 'Cancelar',
  'common.close': 'Cerrar',
  'common.disclaimer':
    'Solo para diseño y planificación. Todos los cálculos y códigos deben ser verificados por el usuario y por un profesional con licencia en la jurisdicción del proyecto.',
  'common.no_access': 'No tienes acceso a esto. Pregúntale a tu supervisor.',
  'error.project_not_found': 'Ese proyecto no está disponible.',
  'error.version_not_found': 'Esa versión no está disponible.',
  'error.thumbnail_invalid': 'No se pudo guardar esa imagen del plano.',
  'error.thumbnail_not_found': 'Esa imagen del plano no está disponible.',
  'error.stale_lock_epoch':
    'Otra persona está editando este proyecto ahora, así que estos cambios no se guardaron.',
  'error.save_conflict':
    'Otra persona cambió los mismos elementos primero, así que estos cambios no se guardaron.',
  'error.notification_not_found': 'Esa notificación ya no existe.',
  'error.app_outdated': 'EZ Draft se actualizó. Recarga para seguir guardando tus cambios.',
  'error.sync_conflict_not_found': 'Ese cambio ya no está en la lista.',
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
  'error.page_not_found': 'Página no encontrada.',
  'error.company_name_required': 'Escribe el nombre de tu empresa.',
  'error.logo_too_large': 'Los logotipos pueden pesar hasta 4 MB. Elige un archivo más pequeño.',
  'error.logo_wrong_type': 'Los logotipos deben ser PNG, JPG o SVG.',
  'error.logo_svg_unsafe': 'Este SVG no se puede usar. Guárdalo como PNG e inténtalo de nuevo.',
  'error.customer_name_required': 'Escribe el nombre del cliente.',
  'error.customer_email_required': 'Escribe el correo electrónico del cliente.',
  'error.customer_email_taken': 'Ya existe un cliente con este correo electrónico.',
  'error.customer_not_found': 'Este cliente ya no existe.',
  'error.member_not_found': 'Esta persona ya no está en esta empresa.',
  'error.project_unavailable':
    'Uno de estos proyectos ya no está disponible. Puede que esté archivado. Elige los proyectos de nuevo.',
  'error.foreman_unavailable': 'Esta persona ya no es un miembro activo. Elige otro capataz.',
  'error.role_name_required': 'Ponle un nombre al rol.',
  'error.role_name_taken': 'Ya existe un rol con este nombre.',
  'error.role_not_found': 'Este rol ya no existe.',
  'error.role_in_use': 'No se puede eliminar: hay personas con este rol. Cámbialas primero.',
  'error.role_preset': 'Los roles predefinidos no se pueden cambiar. Para cambiar uno, crea un rol nuevo a partir de él.',
  'error.member_state':
    'Esta persona cambió desde que se cargó la página. Recarga e inténtalo de nuevo.',
  'error.last_settings_users_holder':
    'Al menos una persona activa debe conservar el permiso de la página Usuarios y permisos.',
  'error.active_elsewhere':
    'Esta persona está activa en otra empresa, así que no se puede reactivar aquí.',
  'error.project_customer_unavailable':
    'Este cliente no está disponible. Elige otro cliente o deja Cliente vacío.',
  'error.password_too_short': 'Usa al menos 8 caracteres.',
  'error.password_too_long': 'Esa contraseña es demasiado larga.',
  'error.password_contains_app_name': 'No uses "ezdraft" en tu contraseña.',
  'error.password_contains_email_name':
    'No uses la primera parte de tu correo electrónico en tu contraseña.',
  'error.password_mismatch': 'Las contraseñas nuevas no coinciden.',
  'error.current_password_wrong': 'Tu contraseña actual es incorrecta.',
  'error.current_password_throttled':
    'Demasiadas contraseñas incorrectas. Inténtalo de nuevo en 15 minutos.',
  'error.password_same': 'Elige una contraseña distinta de la actual.',
  'error.password_breached': 'Esta contraseña apareció en una filtración de datos. Elige otra.',
  'error.ai_key_invalid':
    'Eso no parece una clave de API de Anthropic. Las claves empiezan con sk-ant-.',
  'error.ai_key_refused':
    'Anthropic no aceptó esta clave. No se guardó nada. Revisa la clave y pégala de nuevo.',
  'error.ai_key_out_of_credit':
    'Tu cuenta de Anthropic no tiene crédito. No se guardó nada. Agrega crédito en Anthropic y vuelve a agregar la clave.',
  'error.ai_key_check_failed':
    'No se pudo verificar la clave con Anthropic. No se guardó nada. Inténtalo de nuevo en un minuto.',
  'error.ai_key_throttled': 'Demasiados intentos. Inténtalo de nuevo en 15 minutos.',
  'error.ai_key_unavailable':
    'Ahora no se pueden guardar claves. No se guardó nada. Inténtalo más tarde.',
  // EZD-5602 Build step 13 (vault/plans/EZD-5602.md section 6): the assistant's errors.
  'error.assistant_no_key': 'Agrega tu clave de API de Anthropic para usar el asistente.',
  'error.assistant_key_refused':
    'Anthropic no aceptó tu clave de API. No cambió nada en el dibujo. Revísala o cámbiala en Mi perfil.',
  'error.assistant_out_of_credit':
    'Tu cuenta de Anthropic no tiene crédito. No cambió nada en el dibujo. Agrega crédito en Anthropic y vuelve a enviar.',
  'error.assistant_busy':
    'El asistente todavía está respondiendo tu último mensaje. Espera la respuesta y vuelve a enviar.',
  'error.assistant_rate_limited':
    'Enviaste muchos mensajes en el último minuto. Espera un minuto y vuelve a enviar.',
  'error.assistant_provider_rate_limited':
    'Anthropic está recibiendo demasiadas solicitudes con tu clave. No cambió nada en el dibujo. Espera un momento y vuelve a enviar.',
  'error.assistant_request_refused':
    'Anthropic rechazó esta solicitud. No cambió nada en el dibujo. Intenta escribir el mensaje de otra forma.',
  'error.assistant_unavailable':
    'Anthropic no responde en este momento. No cambió nada en el dibujo. Vuelve a enviar en un minuto.',
  'error.assistant_drawing_too_large':
    'Este dibujo es demasiado grande para enviarlo al asistente. No cambió nada en el dibujo.',
  'error.assistant_invalid_reply':
    'No se pudo leer la respuesta del asistente. No cambió nada en el dibujo. Vuelve a enviar.',
  'error.assistant_photo_unreadable':
    'EZ Draft no pudo leer esa foto, así que no se envió nada. Adjunta otra.',
  'field.device.editor_on_phone':
    'La edición se hace en un iPad o una computadora. Abre este proyecto allí.',
} as const satisfies Record<SpanishKey, Message>;
