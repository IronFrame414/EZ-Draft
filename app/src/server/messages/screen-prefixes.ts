// EZD-1995 (AC-EZD-1995-1; Q-0814): the screen messages each lazy screen loads with its code, by key prefix: what
// the screen uses beyond the shared common. and error. messages every page already has. One entry per file in
// app/src/lib/messages/screens/. This file imports nothing: the app build's loader
// (app/tools/screen-messages-loader.cjs) reads it on its own. page-messages-coverage.test.ts fails, naming the prefix
// to add here, when a screen can use a message that neither its list nor the page that opens it holds.
export const SCREEN_MESSAGES = {
  'assistant-panel': [
    'office.assistant.',
    'office.profile.',
  ],
  'cabinet-run': [
    'office.cabinets.',
  ],
  'conflict-panel': [
    'office.conflicts.',
  ],
  'countertops': [
    'office.cabinets.library.row.base_1',
    'office.cabinets.library.row.base_2',
    'office.cabinets.library.row.blind_corner',
    'office.cabinets.library.row.dishwasher_panel',
    'office.cabinets.library.row.drawer_base',
    'office.cabinets.library.row.end_panel',
    'office.cabinets.library.row.filler',
    'office.cabinets.library.row.sink_base',
    'office.cabinets.library.row.tall',
    'office.cabinets.library.row.wall',
    'office.countertops.',
    'office.render_models.tier.',
    'office.render_models.tier_hint.',
  ],
  'fixtures-panel': [
    'office.fixtures.',
  ],
  'help-panel': [
    'office.help.',
  ],
  'lock-ui': [
    'office.customers.',
    'office.field_measure_request.',
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
    'office.project_settings.',
    'office.projects.load_error',
    'office.projects.no_match',
    'office.projects.search_label',
    'office.projects.search_placeholder',
    'office.scope_trades.',
    'office.switcher.',
  ],
  'my-profile': [
    'office.company.',
    'office.profile.',
  ],
  'new-project': [
    'office.company.',
    'office.customers.',
    'office.dxf.',
    'office.new_project.',
    'office.pdf_scale.',
    'office.property_record.',
    'office.scope_trades.',
    'office.supplier.',
    'office.upload.',
  ],
  'send-dialog': [
    'office.customers.',
    'office.field_measure_request.',
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
    'office.project_settings.',
    'office.scope_trades.',
    'office.send.',
    'office.share.',
    'office.sheets.set.client',
    'office.sheets.set.permit',
  ],
  'sheets-screen': [
    'office.issue.',
    'office.issue_checklist.',
    'office.property_record.',
    'office.revision_log.',
    'office.sheets.',
  ],
} as const satisfies Record<string, readonly string[]>;

export type MessageScreen = keyof typeof SCREEN_MESSAGES;
