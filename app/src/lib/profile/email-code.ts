// EZD-2030 (Q-0910 A): the code Supabase emails for sign-in and for the Set password reauthentication
// (Q-0447) is 8 digits (supabase/config.toml [auth.email] otp_length = 8). Until Josh confirms the hosted
// Supabase setting is 8, a 6-digit code is still accepted so production sign-in keeps working
// (vault/build/assumptions/EZD-2030.md). The invite code (Q-0695) is a separate 6-digit code and does not use
// this. Pure, no imports: the browser and the server both check it.
export const EMAIL_CODE_LENGTH = 8;
export const EMAIL_CODE_PATTERN = /^(?:\d{8}|\d{6})$/;
// The same rule for an <input pattern> attribute (anchored by the browser).
export const EMAIL_CODE_INPUT_PATTERN = '[0-9]{8}|[0-9]{6}';

export function isEmailCode(code: string): boolean {
  return EMAIL_CODE_PATTERN.test(code);
}
