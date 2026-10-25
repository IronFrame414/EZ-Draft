// EZD-103a Step 4 (vault/plans/EZD-103a.md Decided "Sections"; AC-EZD-103-1; Q-0210, Q-0225, Q-0228, Q-0234):
// the Settings sections in nav order, each with the permission switch that opens it. Browser and server.
import type { IconName } from '../../components/icon/icon-names.generated';
import type { MessageKey } from '../../server/messages/catalog';
import type { PermissionKey } from '../permissions/catalog';

export type SettingsSectionId =
  | 'company'
  | 'users'
  | 'title_block'
  | 'sheet_presets'
  | 'defaults'
  | 'catalog'
  | 'render_models'
  | 'code_edition'
  | 'libraries'
  | 'system_status';

export type SettingsSection = {
  id: SettingsSectionId;
  slug: string;
  permission: PermissionKey;
  label: MessageKey;
  location: MessageKey;
  icon: IconName;
  badge: 'users' | 'units' | null;
};

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    id: 'company',
    slug: 'company',
    permission: 'settings_company',
    label: 'office.settings.section.company',
    location: 'office.settings.location.company',
    icon: 'domain',
    badge: null,
  },
  {
    id: 'users',
    slug: 'users',
    permission: 'settings_users',
    label: 'office.settings.section.users',
    location: 'office.settings.location.users',
    icon: 'group',
    badge: 'users',
  },
  {
    id: 'title_block',
    slug: 'title-block',
    permission: 'settings_title_block',
    label: 'office.settings.section.title_block',
    location: 'office.settings.location.title_block',
    icon: 'view_quilt',
    badge: null,
  },
  {
    id: 'sheet_presets',
    slug: 'sheet-presets',
    permission: 'settings_sheet_presets',
    label: 'office.settings.section.sheet_presets',
    location: 'office.settings.location.sheet_presets',
    icon: 'description',
    badge: null,
  },
  {
    id: 'defaults',
    slug: 'defaults',
    permission: 'settings_defaults',
    label: 'office.settings.section.defaults',
    location: 'office.settings.location.defaults',
    icon: 'tune',
    badge: 'units',
  },
  {
    id: 'catalog',
    slug: 'catalog',
    permission: 'settings_catalog',
    label: 'office.settings.section.catalog',
    location: 'office.settings.location.catalog',
    icon: 'inventory_2',
    badge: null,
  },
  {
    id: 'render_models',
    slug: 'render-models',
    permission: 'settings_render_models',
    label: 'office.settings.section.render_models',
    location: 'office.settings.location.render_models',
    icon: 'auto_awesome',
    badge: null,
  },
  {
    id: 'code_edition',
    slug: 'code-edition',
    permission: 'settings_code_edition',
    label: 'office.settings.section.code_edition',
    location: 'office.settings.location.code_edition',
    icon: 'gavel',
    badge: null,
  },
  {
    id: 'libraries',
    slug: 'libraries',
    permission: 'settings_libraries',
    label: 'office.settings.section.libraries',
    location: 'office.settings.location.libraries',
    icon: 'library_books',
    badge: null,
  },
  {
    id: 'system_status',
    slug: 'system-status',
    permission: 'settings_system_status',
    label: 'office.settings.section.system_status',
    location: 'office.settings.location.system_status',
    icon: 'monitor_heart',
    badge: null,
  },
];

export function settingsHref(s: SettingsSection): string {
  return `/settings/${s.slug}`;
}

export function sectionBySlug(slug: string): SettingsSection | null {
  return SETTINGS_SECTIONS.find((s) => s.slug === slug) ?? null;
}

// `/settings/<slug>` or `/settings/<slug>/…`; anything else is no section.
export function sectionForPath(pathname: string | null): SettingsSection | null {
  if (pathname === null) return null;
  const m = /^\/settings\/([^/]+)(?:\/|$)/.exec(pathname);
  return m ? sectionBySlug(m[1]) : null;
}

export function allowedSections(can: (p: PermissionKey) => boolean): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((s) => can(s.permission));
}
