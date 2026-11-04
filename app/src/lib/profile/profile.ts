// EZD-108 Step 4 (vault/plans/EZD-108.md sections 1, 3; S15 Avatar; Q-0392; Q-0412): the signed-in user's
// own profile types and the input checks shared by the browser and the server. No React, no Supabase.
// `ipad_input_mode` null reads as `finger` (glossary 00c: `finger` = Pencil or finger, `pencil` = Pencil
// only). The schemas are built inside the parse functions so a browser bundle that only checks a new
// password does not keep them.
import { z } from 'zod';
import { validateNewPassword } from '../auth/password-rules';

export type Language = 'en' | 'es';
export type IpadDrawing = 'finger' | 'pencil';

export type Profile = {
  name: string | null;
  email: string;
  language: Language;
  ipadDrawing: IpadDrawing;
  hasPassword: boolean;
};

export type ProfileCaptcha = { siteKey: string; scriptUrl: string };

export type ProfileResponse = { profile: Profile; captcha: ProfileCaptcha | null };

export function ipadDrawingOf(v: string | null): IpadDrawing {
  return v === 'pencil' ? 'pencil' : 'finger';
}

export function parseProfileInput(
  body: unknown,
): { ok: true; language: Language; ipadDrawing: IpadDrawing } | { ok: false } {
  const parsed = z
    .strictObject({ language: z.enum(['en', 'es']), ipadDrawing: z.enum(['finger', 'pencil']) })
    .safeParse(body);
  if (!parsed.success) return { ok: false };
  return { ok: true, language: parsed.data.language, ipadDrawing: parsed.data.ipadDrawing };
}

export type PasswordRequest =
  | {
      mode: 'change';
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
      captchaToken?: string;
    }
  | { mode: 'set'; newPassword: string; confirmPassword: string; code?: string };

export function parsePasswordRequest(body: unknown): PasswordRequest | null {
  const parsed = z
    .discriminatedUnion('mode', [
      z.strictObject({
        mode: z.literal('change'),
        currentPassword: z.string(),
        newPassword: z.string(),
        confirmPassword: z.string(),
        captchaToken: z.string().optional(),
      }),
      z.strictObject({
        mode: z.literal('set'),
        newPassword: z.string(),
        confirmPassword: z.string(),
        code: z.string().optional(),
      }),
    ])
    .safeParse(body);
  if (!parsed.success) return null;
  const d = parsed.data;
  if (d.mode === 'change') {
    const change = {
      mode: 'change' as const,
      currentPassword: d.currentPassword,
      newPassword: d.newPassword,
      confirmPassword: d.confirmPassword,
    };
    return d.captchaToken === undefined ? change : { ...change, captchaToken: d.captchaToken };
  }
  return d.code === undefined
    ? { mode: 'set', newPassword: d.newPassword, confirmPassword: d.confirmPassword }
    : { mode: 'set', newPassword: d.newPassword, confirmPassword: d.confirmPassword, code: d.code };
}

export type NewPasswordCode =
  | 'password_too_short'
  | 'password_too_long'
  | 'password_contains_app_name'
  | 'password_contains_email_name'
  | 'password_mismatch';

export function newPasswordProblem(
  newPassword: string,
  confirmPassword: string,
  email: string,
): NewPasswordCode | null {
  const [first] = validateNewPassword(newPassword, email);
  if (first !== undefined) return `password_${first}`;
  if (newPassword !== confirmPassword) return 'password_mismatch';
  return null;
}

// A reauthentication code is exactly six digits (Q-0447 (a)); the browser and setPassword both check it.
export function codeProblem(code: string): 'code_invalid' | null {
  return /^\d{6}$/.test(code) ? null : 'code_invalid';
}
