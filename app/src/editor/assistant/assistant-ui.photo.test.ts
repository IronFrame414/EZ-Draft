// EZD-5603b T11, T21 (vault/plans/EZD-5603b.md section 3 U4, U5, X4, section 4 and section 6; AC-EZD-5603-7, -12).
// Pure functions of the photo state, the new server key, and the catalogs. Sources: Decided "Disabled"; X4;
// ARCH Messages and language (t()); the wording of plan section 6.
import { describe, expect, it } from 'vitest';
import { en } from '../../server/messages/catalogs/en';
import { es } from '../../server/messages/catalogs/es';
import {
  ASSISTANT_SHOWN_KEYS,
  failureFrom,
  photoControlDisabled,
  photoRemoveDisabled,
  type AssistantUi,
} from './assistant-ui';

const ui = (p: Partial<AssistantUi>): AssistantUi => ({
  open: true,
  keyState: 'present',
  entries: [],
  draft: 'add a door',
  model: 'sonnet',
  phase: 'idle',
  profileOpen: false,
  photo: null,
  photoProblem: null,
  photoPreparing: false,
  ...p,
});

describe('EZD-5603b assistant-ui photo', () => {
  it('T11 the Photo control and Remove photo are disabled by the key, the phase and preparing', () => {
    expect(photoControlDisabled(ui({ keyState: 'none' }))).toBe(true);
    expect(photoControlDisabled(ui({ keyState: 'loading' }))).toBe(true);
    expect(photoControlDisabled(ui({ phase: 'waiting' }))).toBe(true);
    expect(photoControlDisabled(ui({ photoPreparing: true }))).toBe(true);
    expect(photoControlDisabled(ui({}))).toBe(false);
    expect(photoRemoveDisabled(ui({ phase: 'draining' }))).toBe(true);
    expect(photoRemoveDisabled(ui({ phase: 'idle' }))).toBe(false);
  });

  it('T21 photo_unreadable is a shown key; both catalogs hold it; en holds the section 6 photo keys', () => {
    expect(
      failureFrom(400, {
        error: { code: 'photo_unreadable', message_key: 'error.assistant_photo_unreadable' },
      }),
    ).toEqual({
      kind: 'failed',
      messageKey: 'error.assistant_photo_unreadable',
      profileLink: false,
      costMicroUsd: null,
    });
    expect(ASSISTANT_SHOWN_KEYS.size).toBe(16);
    expect(ASSISTANT_SHOWN_KEYS.has('error.assistant_photo_unreadable' as never)).toBe(true);
    expect(Object.keys(en)).toContain('error.assistant_photo_unreadable');
    expect(Object.keys(es)).toContain('error.assistant_photo_unreadable');
    const keys = [
      'photo',
      'photo_attach',
      'photo_remove',
      'photo_note',
      'photo_wrong_type',
      'photo_too_big',
      'photo_unreadable',
      'photo_preparing',
      'photo_alt',
      'photo_size',
    ];
    for (const k of keys) expect(Object.keys(en), k).toContain(`office.assistant.${k}`);
  });
});
