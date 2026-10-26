// EZD-113 T7 (vault/plans/EZD-113.md sections 3, 4, 6; AC-EZD-113-1, -2, -5). Expected values: the section 3
// messages table (texts on the board or decided: Q-0228, B15a) and section 6 (proposed wording); `es` has the
// four `error.customer_*` keys; the two events are `log_only` (ARCH Events).
import { describe, expect, it } from 'vitest';
import { EVENTS } from '../../lib/events/registry';
import { en } from '../messages/catalogs/en';
import { es } from '../messages/catalogs/es';

const EN: Record<string, unknown> = {
  'error.customer_name_required': "Enter the customer's name.",
  'error.customer_email_required': "Enter the customer's email.",
  'error.customer_email_taken': 'A customer with this email already exists.',
  'error.customer_not_found': 'This customer no longer exists.',
  'office.customers.title': 'Customers',
  'office.customers.search': 'Search customers',
  'office.customers.add': 'Add customer',
  'office.customers.col_customer': 'Customer',
  'office.customers.col_email': 'Email (client verification)',
  'office.customers.col_phone': 'Phone',
  'office.customers.col_projects': 'Projects',
  'office.customers.signing_on': 'Signing check on',
  'office.customers.projects_none': 'None yet',
  'office.customers.note':
    'Before signing, a client verifies by entering the email on their customer profile. Email is required and unique per company.',
  'office.customers.status': 'Customers',
  'office.customers.empty': 'No customers yet',
  'office.customers.archived_toggle': '{count} archived',
  'office.customers.projects_count': { one: '{count} project', other: '{count} projects' },
  'office.customers.row_edit': 'Edit {name}',
  'office.customers.dialog_add': 'Add customer',
  'office.customers.dialog_edit': 'Edit customer',
  'office.customers.field_name': 'Name',
  'office.customers.field_email': 'Email',
  'office.customers.field_phone': 'Phone',
  'office.customers.field_address': 'Address',
  'office.customers.save': 'Save',
  'office.customers.archive': 'Archive',
  'office.customers.restore': 'Restore',
  'office.customers.no_match': 'No customers match "{query}".',
  'office.customers.archived_empty': 'No archived customers.',
  'office.customers.range': '{from}–{to} of {total}',
  'office.customers.prev': 'Previous',
  'office.customers.next': 'Next',
  'office.customers.load_failed': "Couldn't load customers.",
  'office.customers.save_failed': "Couldn't save the customer. Try again.",
};

describe('EZD-113 customer keys and events', () => {
  it('T7 en holds the section 3 and 6 texts exactly', () => {
    const catalog = en as unknown as Record<string, unknown>;
    for (const [key, text] of Object.entries(EN)) expect(catalog[key], key).toEqual(text);
  });

  it('T7 es holds the four error.customer_* keys, non-empty', () => {
    const catalog = es as unknown as Record<string, unknown>;
    for (const key of [
      'error.customer_name_required',
      'error.customer_email_required',
      'error.customer_email_taken',
      'error.customer_not_found',
    ]) {
      expect(typeof catalog[key], key).toBe('string');
      expect((catalog[key] as string).trim().length, key).toBeGreaterThan(0);
    }
  });

  it('T7 customer.created and customer.updated are log_only', () => {
    const events = EVENTS as unknown as Record<string, { kind: string } | undefined>;
    expect(events['customer.created']?.kind).toBe('log_only');
    expect(events['customer.updated']?.kind).toBe('log_only');
  });
});
