'use client';

import { useT } from '../../../lib/messages/MessagesProvider';

export function SampleText() {
  const t = useT();
  return (
    <>
      <span data-testid="sample">{t('dev.messages.sample')}</span>
      <span data-testid="items-1">{t('dev.messages.items', { count: 1 })}</span>
      <span data-testid="items-2">{t('dev.messages.items', { count: 2 })}</span>
    </>
  );
}
