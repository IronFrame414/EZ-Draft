// EZD-112 T9 (vault/plans/EZD-112.md section 3 "messages" and section 4; AC-EZD-112-2, -3, -4, -5).
// Expected values: the four `error.*` texts of section 3 (Q-0228), present in `es` as well (ARCH Messages:
// `error` is a Spanish namespace), every `office.company.*` key of section 3 in `en` (office is English only,
// Q-0121 (a)), and `EVENTS['tenant.updated']` is `log_only` (ARCH Events).
import { describe, expect, it } from 'vitest';
import { en } from '../../server/messages/catalogs/en';
import { es } from '../../server/messages/catalogs/es';
import { EVENTS } from '../events/registry';

const ERROR_TEXTS: Record<string, string> = {
  'error.company_name_required': 'Enter your company name.',
  'error.logo_too_large': 'Logos can be up to 5 MB. Choose a smaller file.',
  'error.logo_wrong_type': 'Logos must be PNG, JPG or SVG.',
  'error.logo_svg_unsafe': "This SVG can't be used. Save it as PNG and try again.",
};

// Section 3: the board keys, then section 6's proposed keys.
const OFFICE_KEYS = [
  'identity',
  'name',
  'logo',
  'logo_replace',
  'logo_remove',
  'logo_hint',
  'license',
  'sends_note',
  'contact',
  'phone',
  'email',
  'website',
  'address',
  'title_block_hint',
  'title_block_link',
  'discard',
  'save',
  'status_license',
  'subtitle',
  'logo_upload',
  'logo_uploading',
  'logo_saved',
  'logo_alt',
  'logo_upload_failed',
  'unsaved',
  'save_failed',
  'load_failed',
  'offline',
  'logo_size',
].map((k) => `office.company.${k}`);

const BOARD_TEXTS: Record<string, string> = {
  'office.company.identity': 'Identity',
  'office.company.name': 'Company name',
  'office.company.logo': 'Logo',
  'office.company.logo_replace': 'Replace',
  'office.company.logo_remove': 'Remove',
  'office.company.logo_hint': 'PNG, JPG or SVG, up to 5 MB',
  'office.company.license': 'License number',
  'office.company.sends_note':
    'Logo and license changes apply to future sends only. Sent versions are permanent and never change.',
  'office.company.contact': 'Contact',
  'office.company.phone': 'Phone',
  'office.company.email': 'Email',
  'office.company.website': 'Website',
  'office.company.address': 'Address',
  'office.company.title_block_hint':
    'License and contact print in the title block company block when "Company logo, license and contact" is on.',
  'office.company.title_block_link': 'Title block',
  'office.company.discard': 'Discard',
  'office.company.save': 'Save',
  'office.company.status_license': 'License',
  'office.company.logo_size': '{kb} KB',
};

describe('EZD-112 messages and event', () => {
  it('T9 error texts in en, the same keys in es, every office.company key in en, tenant.updated is log_only', () => {
    const enMap = en as Record<string, unknown>;
    const esMap = es as Record<string, unknown>;
    for (const [key, text] of Object.entries(ERROR_TEXTS)) {
      expect(enMap[key], key).toBe(text);
      expect(typeof esMap[key], `es ${key}`).toBe('string');
      expect((esMap[key] as string).length, `es ${key}`).toBeGreaterThan(0);
    }
    for (const key of OFFICE_KEYS) {
      expect(enMap[key], key).toBeDefined();
    }
    for (const [key, text] of Object.entries(BOARD_TEXTS)) {
      expect(enMap[key], key).toBe(text);
    }
    expect(EVENTS['tenant.updated' as keyof typeof EVENTS].kind).toBe('log_only');
  });
});
