// EZD-2004 (audit 2026-11-27 A11): a length as a screen reader should say it. The drawing shows 12' 6 1/2"; read
// aloud the marks come out as "apostrophe" and "quote", so the spoken name uses the words instead
// ("12 feet 6 1/2 inches", "12 pies 6 1/2 pulgadas").
import { formatLength } from '@ezdraft/geometry';
import type { T } from '../lib/messages';
import type { MessageKey } from '../server/messages/catalog';

export function spokenLength(inches: number, t: T<MessageKey>): string {
  return formatLength(inches, 16)
    .replace(/'/g, ` ${t('field.measure.length_feet')}`)
    .replace(/"/g, ` ${t('field.measure.length_inches')}`);
}
