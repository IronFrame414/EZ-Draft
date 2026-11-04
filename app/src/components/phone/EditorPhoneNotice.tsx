'use client';
// What a phone sees instead of the editor (Q-0056 (a); vault/plans/EZD-014a.md Step 6).
import type { ReactNode } from 'react';
import { useT } from '../../lib/messages';
import { Disclaimer } from '../disclaimer/Disclaimer';
import { PhoneFrame } from './PhoneFrame';
import { PhoneHeader } from './PhoneHeader';
import styles from './EditorPhoneNotice.module.css';

export type EditorPhoneNoticeProps = { title?: string; subtitle?: readonly ReactNode[] };

export function EditorPhoneNotice({ title, subtitle }: EditorPhoneNoticeProps) {
  const t = useT();
  return (
    <PhoneFrame header={title ? <PhoneHeader title={title} subtitle={subtitle} /> : undefined}>
      <p className={styles.notice} data-phone-notice="">
        {t('field.device.editor_on_phone')}
      </p>
      <Disclaimer placement="page" />
    </PhoneFrame>
  );
}
