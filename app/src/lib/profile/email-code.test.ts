// EZD-2030 (Q-0910 A; AC-EZD-2030-2, -3): the emailed sign-in and reauthentication code is 8 digits; a
// 6-digit code is still accepted until Josh confirms the hosted Supabase setting; 7 digits are refused.
import { describe, expect, it } from 'vitest';
import {
  EMAIL_CODE_INPUT_PATTERN,
  EMAIL_CODE_LENGTH,
  EMAIL_CODE_PATTERN,
  isEmailCode,
} from './email-code';

const ACCEPTED = ['12345678', '00000000', '123456', '000000'];
const REFUSED = ['', '12345', '1234567', '123456789', '1234 5678', '1234a678', '12345678 ', '١٢٣٤٥٦٧٨'];

describe('EZD-2030 emailed code', () => {
  it('8 digits is the code length (otp_length = 8)', () => {
    expect(EMAIL_CODE_LENGTH).toBe(8);
  });

  it('8 digits pass, 6 digits pass for now, 7 digits and anything else are refused', () => {
    for (const code of ACCEPTED) expect(isEmailCode(code), code).toBe(true);
    for (const code of REFUSED) expect(isEmailCode(code), JSON.stringify(code)).toBe(false);
  });

  it('the input pattern attribute accepts exactly what the server accepts', () => {
    // Browsers anchor a pattern attribute as ^(?:pattern)$.
    const input = new RegExp(`^(?:${EMAIL_CODE_INPUT_PATTERN})$`, 'v');
    for (const code of [...ACCEPTED, ...REFUSED])
      expect(input.test(code), JSON.stringify(code)).toBe(EMAIL_CODE_PATTERN.test(code));
  });
});
