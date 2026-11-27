// EZD-1995 (AC-EZD-1995-1; audit 2026-11-26 F1; Q-0814; CLAUDE.md rule 11 "a page sends only its own messages"): the
// screen messages each office and editor page sends with its HTML, by key prefix, in place of the whole office
// catalog. A lazy screen that needs more loads its own messages with its code (screen-prefixes.ts,
// lib/messages/screen-messages.ts).
// page-messages-coverage.test.ts reads every page's source and fails, naming the prefix to add here, when a page
// can use a message its list leaves out.
import type { Message } from '../../lib/messages/types';
import { catalogFor } from './catalog';
import type { MessageKey } from './catalog';

/** Every page gets these: route answers name error.* keys (message_key), and common.* is shared wording. */
export const SHARED_PREFIXES = ['common.', 'error.'] as const;

/** The page header, error alerts and the tool names every office and editor page shows. */
const EVERY_PAGE = [
  'office.alert.',
  'office.email.',
  'office.header.',
  'office.tool.',
  // EZD-1995: the geometry package's typed-angle refusal (packages/geometry/src/turn.ts).
  'office.typed.angle_refused',
] as const;
/** Dates and last-active times (lib/users/users.ts), read through the signed-in account. */
const USER_DATES = [
  'office.users.date',
  'office.users.date_year',
  'office.users.last_active.',
] as const;
/** Submittal profile checks (lib/submittal-profiles/profiles.ts) that settings answers can name. */
const SUBMITTAL_CHECKS = [
  'office.sheet_presets.max_file_invalid',
  'office.sheet_presets.name_required',
  'office.sheet_presets.naming_bad_chars',
  'office.sheet_presets.naming_max_invalid',
  'office.sheet_presets.naming_needs_address',
  'office.sheet_presets.naming_required',
  'office.sheet_presets.naming_unknown_token',
  'office.sheet_presets.resubmittal.',
  'office.sheet_presets.revision.',
  'office.sheet_presets.signer.',
  'office.sheet_presets.split.',
  'office.sheet_presets.stamp_invalid',
  'office.sheet_presets.stamp_position.',
  'office.sheet_presets.type.',
] as const;
/** Title block field names and sample revisions (lib/title-block/title-block.ts). */
const TITLE_BLOCK_FIELDS = [
  'office.title_block.field.',
  'office.title_block.sample.rev_client',
  'office.title_block.sample.rev_permit',
] as const;
/** Defaults, shortcuts and edit refusals that the defaults and model answers can name. */
const DEFAULTS_ANSWERS = [
  'office.beam.',
  'office.conflicts.object.',
  'office.defaults.',
  'office.device.',
  'office.length.',
  'office.shortcuts.',
] as const;
/** The avatar menu, the notification bell and the sign-out guard of the page header. */
const ACCOUNT_MENU = [
  'office.account.',
  'office.notifications.',
  'office.outbox.',
  'office.profile.load_failed',
  'office.settings.',
] as const;

/** The key prefixes of each page, after SHARED_PREFIXES. */
export const PAGE_MESSAGES = {
  // Projects at /.
  projects: [
    ...EVERY_PAGE,
    ...USER_DATES,
    ...SUBMITTAL_CHECKS,
    ...TITLE_BLOCK_FIELDS,
    ...DEFAULTS_ANSWERS,
    ...ACCOUNT_MENU,
    'office.code_edition.',
    'office.field_measure_request.',
    'office.new_project.load_failed',
    'office.projects.',
  ],
  // The /dev/entry/office placeholder the projects-settings download row measures.
  office_entry: [
    ...EVERY_PAGE,
    ...USER_DATES,
    ...SUBMITTAL_CHECKS,
    ...TITLE_BLOCK_FIELDS,
    ...DEFAULTS_ANSWERS,
    ...ACCOUNT_MENU,
    'office.code_edition.',
    'office.field_measure_request.',
    'office.projects.card.',
    'office.projects.status.',
  ],
  // The Settings shell and every Settings page (server/settings/settings-root.tsx).
  settings: [
    ...EVERY_PAGE,
    ...DEFAULTS_ANSWERS,
    ...ACCOUNT_MENU,
    'office.benchmark.',
    'office.code_edition.',
    'office.company.',
    'office.customers.',
    'office.field_measure_request.',
    'office.left_panel.room_type.',
    'office.libraries.',
    'office.new_project.type_',
    'office.profile.email_link',
    'office.render_models.',
    'office.roles.',
    'office.sheet_presets.',
    'office.system_status.',
    'office.title_block.',
    'office.users.',
  ],
  // The editor at /projects/[id], and the dev pages that show it.
  editor: [
    ...EVERY_PAGE,
    ...USER_DATES,
    ...SUBMITTAL_CHECKS,
    ...TITLE_BLOCK_FIELDS,
    ...DEFAULTS_ANSWERS,
    'field.device.',
    'office.assistant.title',
    // EZD-1995: the room fields load on a plain open of a project with existing details, so theirs stay here.
    'office.cabinets.tile.pattern.',
    'office.catalog.',
    'office.ceiling.',
    'office.check.',
    'office.code_edition.',
    'office.company.',
    'office.conflicts.banner.',
    'office.dxf.',
    'office.edit.',
    'office.editor.',
    'office.electrical.',
    'office.engineer.',
    // EZD-1995: the offline banner icon (components/phone/OfflineStatusIcon.tsx, `${labels}.offline_icon.*`).
    'field.offline_icon.',
    'office.offline_icon.',
    'office.fixtures.blocking_invalid',
    'office.fixtures.detail.',
    'office.fixtures.invalid',
    'office.floors.',
    'office.inspector.',
    'office.left_panel.',
    'office.libraries.empty.',
    'office.libraries.search.',
    'office.libraries.tab.',
    'office.lock.',
    'office.new_project.continue_review',
    'office.notifications.',
    'office.pdf_scale.',
    'office.phase.',
    'office.pin.',
    'office.plan.',
    'office.rail.',
    'office.review.gap_back',
    'office.review_list.',
    'office.saved_groups.',
    'office.scene3d.',
    'office.selection.',
    'office.shell.',
    'office.status.',
    'office.supplier.',
    'office.tools.',
    'office.typed.',
    'office.upload.',
    'office.versions.',
  ],
  // Import review at /projects/[id]/import/[jobId].
  import_review: [
    ...EVERY_PAGE,
    ...USER_DATES,
    ...SUBMITTAL_CHECKS,
    ...TITLE_BLOCK_FIELDS,
    'office.beam.',
    'office.catalog.',
    'office.code_edition.',
    'office.company.',
    'office.customers.',
    'office.defaults.',
    'office.device.',
    'office.editor.',
    'office.field_measure_request.',
    'office.length.',
    'office.lock.',
    'office.new_project.address',
    'office.new_project.customer',
    'office.new_project.customer_line',
    'office.new_project.customer_more',
    'office.new_project.customer_none',
    'office.new_project.customer_placeholder',
    'office.new_project.name',
    'office.new_project.scope',
    'office.new_project.type',
    'office.new_project.type_',
    'office.notifications.',
    'office.plan.',
    'office.project_settings.',
    'office.projects.load_error',
    'office.projects.no_match',
    'office.projects.search_label',
    'office.projects.search_placeholder',
    'office.review.',
    'office.scope_trades.',
    'office.shortcuts.',
    'office.switcher.',
    'office.tools.',
  ],
  // The supplier file page at /projects/[id]/supplier.
  supplier: [
    ...EVERY_PAGE,
    ...USER_DATES,
    'office.ceiling.status.view',
    'office.length.refused',
    'office.rail.',
    'office.shell.',
    'office.supplier.',
    'office.upload.',
  ],
  // The not-found page's signed-in header.
  not_found: [
    ...EVERY_PAGE,
    ...USER_DATES,
    ...SUBMITTAL_CHECKS,
    ...TITLE_BLOCK_FIELDS,
    ...DEFAULTS_ANSWERS,
    ...ACCOUNT_MENU,
    'office.projects.search_label',
    'office.projects.search_placeholder',
    'office.projects.title',
    'office.projects.unsynced',
  ],
} as const satisfies Record<string, readonly string[]>;

export type MessagePage = keyof typeof PAGE_MESSAGES;

export type PageCatalog = Readonly<Partial<Record<MessageKey, Message>>>;

const built = new Map<MessagePage, PageCatalog>();

/** The page's messages: every English office message whose key starts with one of the page's prefixes. */
export function pageMessages(page: MessagePage): PageCatalog {
  const done = built.get(page);
  if (done) return done;
  const prefixes: readonly string[] = [...SHARED_PREFIXES, ...PAGE_MESSAGES[page]];
  const all = catalogFor('office', 'en');
  const out: Partial<Record<MessageKey, Message>> = {};
  for (const key of Object.keys(all) as MessageKey[]) {
    if (prefixes.some((p) => key.startsWith(p))) out[key] = all[key];
  }
  const frozen = Object.freeze(out);
  built.set(page, frozen);
  return frozen;
}
