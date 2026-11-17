// EZD-105 (S15 Invite user; S15 D13; Q-0695 decisions 10 row 63; boards S15j, S15j states): the Invite user
// dialog's pure rules, shared by the dialog and its tests. No React.
import type { RolePreset } from '../permissions/catalog';
import type { MessageKey } from '../../server/messages/catalog';

export type InviteScope = 'all' | 'listed';

// Owner and Designer start on All projects; Foreman, Crew and every custom role on Listed (least privilege).
export function defaultInviteScope(preset: RolePreset | null): InviteScope {
  return preset === 'owner' || preset === 'designer' ? 'all' : 'listed';
}

export type InviteRefusalCode =
  | 'invalid_email'
  | 'already_member'
  | 'already_invited'
  | 'deactivated_member'
  | 'email_in_use';

const REFUSAL_KEYS: Record<InviteRefusalCode, MessageKey> = {
  invalid_email: 'office.users.invite.refused.invalid_email',
  already_member: 'office.users.invite.refused.already_member',
  already_invited: 'office.users.invite.refused.already_invited',
  deactivated_member: 'office.users.invite.refused.deactivated_member',
  email_in_use: 'office.users.invite.refused.email_in_use',
};

// The message shown under Email for a refused invite, or null when the code is not one of them.
export function inviteRefusalKey(code: unknown): MessageKey | null {
  return typeof code === 'string' && Object.hasOwn(REFUSAL_KEYS, code)
    ? REFUSAL_KEYS[code as InviteRefusalCode]
    : null;
}

// The same rule the server applies first (one @, something on each side, a dot after it), so an obvious slip is
// shown before Send. The server's check decides.
export function looksLikeEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}
