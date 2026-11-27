// EZD-1501 (03c translation "Cached across jobs"; AC-EZD-1501-1;
// supabase/migrations/20261127100000_create_translation_store.sql): the phrase key of the translation store. A
// phrase is kept once per company with every run of white space turned into one space and the ends trimmed, the
// same rule as private.store_translation_phrase, so a server lookup (EZD-1502, EZD-1503) finds the stored row.
const WHITE_SPACE_RUN = /[ \t\n\r\f\v]+/g;

export function normalizePhrase(text: string): string {
  return text.replace(WHITE_SPACE_RUN, ' ').replace(/^ | $/g, '');
}
