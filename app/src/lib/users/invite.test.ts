// EZD-105 dialog rules. Expected values: S15 D13 and Q-0695 decisions 10 row 63 / 09n Project scope row 5 (Owner
// and Designer All; Foreman, Crew and custom roles Listed); boards S15j states W16-W19 for the refusal wording.
import { describe, expect, it } from 'vitest';
import { en } from '../../server/messages/catalogs/en';
import { defaultInviteScope, inviteRefusalKey, looksLikeEmail } from './invite';

describe('EZD-105 invite dialog rules', () => {
  it('I1 default Project access by role (09n Project scope row 5)', () => {
    expect(defaultInviteScope('owner')).toBe('all');
    expect(defaultInviteScope('designer')).toBe('all');
    expect(defaultInviteScope('foreman')).toBe('listed');
    expect(defaultInviteScope('crew')).toBe('listed');
    expect(defaultInviteScope(null)).toBe('listed');
  });

  it('I2 each refusal shows its approved line; the other company is never named', () => {
    const shown = (code: string) => {
      const key = inviteRefusalKey(code);
      return key === null ? null : en[key];
    };
    expect(shown('invalid_email')).toBe('Enter a full email address, like name@company.com.');
    expect(shown('already_member')).toBe('This person is already on your team.');
    expect(shown('already_invited')).toBe('This email already has an invite. Use Resend on their row.');
    expect(shown('email_in_use')).toBe(
      'This email is already used by another company in EZ Draft. Ask for a different email.',
    );
    expect(shown('deactivated_member')).not.toBeNull();
    expect(inviteRefusalKey('member_state')).toBeNull();
    expect(inviteRefusalKey(undefined)).toBeNull();
    expect(inviteRefusalKey('toString')).toBeNull();
  });

  it('I3 an obvious slip is caught before Send', () => {
    expect(looksLikeEmail('luis.ortega@example.com')).toBe(true);
    expect(looksLikeEmail('  luis.ortega@example.com ')).toBe(true);
    for (const bad of ['', 'luis.ortega@example', 'luis', '@example.com', 'a b@example.com']) {
      expect(looksLikeEmail(bad), bad).toBe(false);
    }
  });
});
