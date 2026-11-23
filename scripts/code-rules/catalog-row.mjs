// EZD-611a (09c Code check engine; 03e code_rule; R26 R34): the one mapping from a Code rules catalog entry
// (vault/spec/code-rules.json, the source of truth) to a public.code_rule row. The migration generator
// (write-migration.mjs) and the catalog sync test (app/src/server/code-check/code-rule-catalog.db.test.ts) both use
// it, so the table and the file cannot drift without the test failing.

export const CATALOG_PATH = 'vault/spec/code-rules.json';

// The catalog's section columns by edition key (09c: "8th Edition with the 2020 NEC, in force now; 9th Edition with
// the 2023 NEC, for permits applied for after December 31, 2026").
export const SECTION_COLUMN_BY_EDITION = {
  fbc8_nec2020: 'section_fbc8_nec2020',
  fbc9_nec2023: 'section_fbc9_nec2023',
};

const RULE_TYPE = { Automatic: 'automatic', 'Needs data': 'needs_data', Reminder: 'reminder' };
const SOURCE = { 'Code text': 'code_text', 'Published summary': 'published_summary', Unverified: 'unverified' };

const snake = (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
const orNull = (s) => (s.trim() === '' ? null : s);

/** The code_rule columns the catalog sets, in table order. verified_by and verified_at are never set here. */
export const CATALOG_COLUMNS = [
  'rule_id',
  'rule_group',
  'code',
  'section_fbc8_nec2020',
  'section_fbc9_nec2023',
  'title',
  'applies_to',
  'check_text',
  'edition_difference',
  'rule_type',
  'needs',
  'rule_trigger',
  'source',
  'url',
  'note',
  'severity',
];

/**
 * @param {Record<string, string>} e one catalog entry
 * @returns {Record<string, string | null>}
 */
export function catalogRow(e) {
  const ruleType = RULE_TYPE[e.type];
  const source = SOURCE[e.source];
  if (ruleType === undefined) throw new Error(`${e.id}: unknown type ${e.type}`);
  if (source === undefined) throw new Error(`${e.id}: unknown source ${e.source}`);
  return {
    rule_id: e.id,
    rule_group: e.group,
    code: e.code,
    // section_now is the 8th Edition (in force now), section_next the 9th (09c; R34).
    section_fbc8_nec2020: orNull(e.section_now),
    section_fbc9_nec2023: orNull(e.section_next),
    title: e.title,
    applies_to: e.applies_to,
    check_text: e.check,
    edition_difference: orNull(e.edition_difference),
    rule_type: ruleType,
    needs: orNull(e.needs),
    rule_trigger: snake(e.trigger),
    source,
    url: orNull(e.url),
    note: orNull(e.note),
    // The catalog has no severity column: every catalog rule warns (vault/build/assumptions.md EZD-611a); the
    // alteration scope turns an existing, unaltered condition into a note at check time.
    severity: 'warning',
  };
}
