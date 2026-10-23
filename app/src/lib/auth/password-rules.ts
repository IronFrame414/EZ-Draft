// EZD-033 Step 4 (vault/plans/EZD-033.md): the rules for a new password, shared by the screens that set one
// (EZD-105b, EZD-108). Q-0094 and its override of 2026-10-18 (minimum 8 characters, maximum 72 bytes, no
// character-type rules, no "ezdraft", no email local part of 4 or more characters); Q-0103 (case ignored;
// spaces, ".", "-" and "_" removed before the "ezdraft" check; code points for the minimum, UTF-8 bytes for
// the maximum). The password is not normalized, so the same bytes work on every path. validateNewPassword is not used at sign-in.

export const PASSWORD_MIN_CHARS = 8;
export const PASSWORD_MAX_BYTES = 72;

export type PasswordProblem =
  'too_short' | 'too_long' | 'contains_app_name' | 'contains_email_name';

export function validateNewPassword(password: string, email: string): PasswordProblem[] {
  const problems: PasswordProblem[] = [];
  if (Array.from(password).length < PASSWORD_MIN_CHARS) problems.push('too_short');
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) problems.push('too_long');
  const lower = password.toLowerCase();
  if (lower.replace(/[\s._-]/g, '').includes('ezdraft')) problems.push('contains_app_name');
  const at = email.lastIndexOf('@');
  const localPart = at < 0 ? email : email.slice(0, at);
  if (Array.from(localPart).length >= 4 && lower.includes(localPart.toLowerCase())) {
    problems.push('contains_email_name');
  }
  return problems;
}
