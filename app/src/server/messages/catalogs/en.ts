import type { Message } from '../../../lib/messages/types';

export const en = {
  'dev.messages.sample': 'Sample message',
  'dev.messages.greeting': 'Hello, {name}',
  'dev.messages.items': { one: '{count} item', other: '{count} items' },
  'error.db_unavailable': "Can't reach the database. Try again in a minute.",
  'error.not_signed_in': "You're signed out. Sign in again to continue.",
  'common.sign_in.title': 'Sign in to EZ Draft',
  'common.sign_in.email_label': 'Email',
  'common.sign_in.send': 'Email me a sign-in link',
  'common.sign_in.sent':
    'If {email} has EZ Draft access, we sent a sign-in link and a 6-digit code. Open the link, or type the code here.',
  'common.sign_in.check_spam': 'Not in your inbox? Check your spam or junk folder.',
  'common.sign_in.code_label': '6-digit code',
  'common.sign_in.code_submit': 'Sign in',
  'common.sign_in.change_email': 'Use a different email',
  'common.sign_in.confirm_title': 'Finish signing in',
  'common.sign_in.confirm_submit': 'Sign in',
  'common.sign_in.sign_out': 'Sign out',
  'common.sign_in.lang_en': 'English',
  'common.sign_in.lang_es': 'Español',
  'error.invalid_email': 'Enter a valid email address.',
  'error.too_many_requests': 'Too many tries. Wait a minute and try again.',
  'error.code_invalid': 'That code is wrong or has expired.',
  'error.link_invalid': 'This sign-in link has expired or was already used.',
  'error.no_access': "This account does not have access to EZ Draft. Ask your company's owner.",
} as const satisfies Record<string, Message>;

export type MessageKey = keyof typeof en;
