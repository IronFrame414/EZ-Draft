// EZD-033 T9 (vault/plans/EZD-033.md Tests; Step 4): validateNewPassword. Expected values: Q-0094 and its
// override of 2026-10-18 (minimum 8 characters, maximum 72 bytes, no character-type rules, "ezdraft", local
// part of 4 or more characters) and Q-0103 (case ignored; spaces, ".", "-", "_" removed for "ezdraft";
// plain substring for the local part; code points for the minimum, UTF-8 bytes for the 72).
import { describe, expect, it } from 'vitest';
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_CHARS, validateNewPassword } from './password-rules';

const E = 'crew.member@example.test';

describe('EZD-033 password rules', () => {
  it('EZD-033 T9 constants', () => {
    expect(PASSWORD_MIN_CHARS).toBe(8);
    expect(PASSWORD_MAX_BYTES).toBe(72);
  });

  it.each([
    ['(a) 7 characters is too short', 'a'.repeat(7), E, ['too_short']],
    ['(b) 8 characters', 'a'.repeat(8), E, []],
    ['(c) 72 bytes', 'a'.repeat(72), E, []],
    ['(d) 73 bytes is too long', 'a'.repeat(73), E, ['too_long']],
    ['(e) 36 two-byte characters are 72 bytes', 'é'.repeat(36), E, []],
    ['(f) 37 two-byte characters are 74 bytes', 'é'.repeat(37), E, ['too_long']],
    ['(g) 7 emoji are 7 code points', '😀'.repeat(7), E, ['too_short']],
    ['(h) 8 emoji are 8 code points', '😀'.repeat(8), E, []],
    ['(i) contains ezdraft', 'my-ezdraft-password', E, ['contains_app_name']],
    ['(j) case is ignored for ezdraft', 'My-EZDraft-Password', E, ['contains_app_name']],
    ['(k) contains the local part', 'xx-crew.member-xx-long', E, ['contains_email_name']],
    [
      '(l) a 3-character local part is not checked',
      'bob-likes-long-passwords',
      'bob@example.test',
      [],
    ],
    [
      '(m) a 4-character local part is checked',
      'correct horse josh battery',
      'josh@example.test',
      ['contains_email_name'],
    ],
    ['(n) short and ezdraft, in that order', 'ezdraft', E, ['too_short', 'contains_app_name']],
    ['(o) no character-type rules', 'aaaaaaaaaaaaaaa', E, []],
    ['(p) a space is removed first', 'Ez Draft is my password', E, ['contains_app_name']],
    ['(q) "-", "_", "." are removed first', 'my-EZ_draft.password', E, ['contains_app_name']],
    [
      '(r) case is ignored for the local part',
      'xx-CREW.MEMBER-xx-long',
      E,
      ['contains_email_name'],
    ],
  ])('EZD-033 T9 %s', (_name, password, email, expected) => {
    expect(validateNewPassword(password, email)).toEqual(expected);
  });
});
