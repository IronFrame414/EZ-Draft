// EZD-006 Steps 5 and 6 (vault/plans/EZD-006.md): expected `authenticated` table privileges and the
// pure reader of explicit grant statements in migration files.
export type TablePrivilege = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
export type TableGrant = { privileges: TablePrivilege[]; reason: string };

export const ALL_TABLE_PRIVILEGES: TablePrivilege[] = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

// A table not listed expects all four for `authenticated` (Step 6). The four tenancy tables decide who
// sees what, so a signed-in member may not write them directly (Step 5 grants); the tickets that write
// them (EZD-105, 106, 112, 129) add a reviewed write path.
export const TABLE_GRANTS: Record<string, TableGrant> = {
  tenant: {
    privileges: ['SELECT'],
    reason: 'Company settings are written by reviewed server paths only (Step 5; EZD-112).',
  },
  app_user: {
    privileges: ['SELECT'],
    reason: 'Profile rows are written by reviewed server paths only (Step 5; EZD-026b, EZD-105).',
  },
  membership: {
    privileges: ['SELECT'],
    reason:
      'Status and scope decide access; a member must not change their own (Step 5; EZD-105, 106).',
  },
  membership_project: {
    privileges: ['SELECT'],
    reason: 'Listed projects decide access; a member must not change their own (Step 5; EZD-129).',
  },
  error_alert: {
    privileges: ['SELECT'],
    reason:
      "Written only through record_error_alert / release_error_alert_email (EZD-024); members read their company's failure rows",
  },
  backup_run: {
    privileges: [],
    reason: 'Server-only backup records (EZD-025); no API role reads or writes it',
  },
  error_tunnel_throttle: {
    privileges: [],
    reason: 'Read and written only by the security definer function error_tunnel_take (EZD-143)',
  },
  sign_in_throttle: {
    privileges: [],
    reason: 'Read and written only by the security definer throttle functions (EZD-033, Q-0094)',
  },
  user_permission: {
    privileges: ['SELECT'],
    reason:
      'Switches decide what a member may do; a member must not change their own (EZD-101; EZD-106 adds the write path).',
  },
  job: {
    privileges: ['SELECT'],
    reason:
      'Members enqueue only through enqueue_job; the runner writes with the secret key (EZD-009)',
  },
  source_file: {
    privileges: ['SELECT', 'INSERT', 'UPDATE'],
    reason:
      'Originals are kept for the life of the project; no member deletes a row (03c; 11 Data retention; EZD-132)',
  },
  customer: {
    privileges: ['SELECT', 'INSERT', 'UPDATE'],
    reason: 'No delete in v1; customers are archived (Q-0227; EZD-113).',
  },
  notification: {
    privileges: ['SELECT'],
    reason:
      'Members read their own notifications; rows are written only by definer functions and the email job (EZD-110)',
  },
  notification_setting: {
    privileges: ['SELECT'],
    reason:
      'Members read their own notification settings; rows are written only by save_my_notification_settings (EZD-140)',
  },
  edit_lock: {
    privileges: ['SELECT'],
    reason: 'Written only by the EZD-120a functions',
  },
  model_object: {
    privileges: ['SELECT'],
    reason: 'Written only by the EZD-120a functions',
  },
  model_version: {
    privileges: ['SELECT'],
    reason: 'Written only by the EZD-120a functions',
  },
  sync_conflict: {
    privileges: ['SELECT'],
    reason:
      'Members read their own refused changes; rows are written only by the EZD-299a definer functions',
  },
  user_ai_key: {
    privileges: [],
    reason:
      "Ciphertext of each user's own Anthropic key; reached only through the *_my_ai_key definer functions (EZD-5601; Q-0637)",
  },
  ai_key_attempt: {
    privileges: [],
    reason:
      'Per-user count of key checks; written only by take_ai_key_attempt (EZD-5601; AC-EZD-5601-7)',
  },
  // EZD-5602 E1 (vault/plans/EZD-5602.md section 4): reached only through the assistant's definer functions.
  ai_usage: {
    privileges: [],
    reason:
      'Who, when, model and cost of each assistant prompt; written only by record_ai_usage (EZD-5602; Q-0637)',
  },
  ai_assistant_slot: {
    privileges: [],
    reason:
      'Assistant call slots for the in-flight and per-minute limits; written only by take/release_ai_assistant_slot (EZD-5602)',
  },
};

export function expectedAuthenticatedPrivileges(table: string): TablePrivilege[] {
  return TABLE_GRANTS[table]?.privileges ?? ALL_TABLE_PRIVILEGES;
}

// Targets of `grant ... on <kind> ...` that name no table (Step 6: `on all tables in schema`, schemas,
// sequences, functions and so on add nothing).
const NON_TABLE_TARGET =
  /^(all\s|schema\s|sequence\s|function\s|procedure\s|routine\s|database\s|domain\s|type\s|language\s|foreign\s|tablespace\s|large\s|parameter\s)/i;

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

// `x`, `public.x`, `"public"."x"`, `"X"` -> the bare table name; unquoted names are lower-cased.
function bareName(raw: string): string {
  const parts = raw
    .trim()
    .split('.')
    .map((p) => p.trim());
  const last = parts[parts.length - 1] ?? '';
  if (last.startsWith('"') && last.endsWith('"')) return last.slice(1, -1).replace(/""/g, '"');
  return last.toLowerCase();
}

function bareRole(raw: string): string {
  const r = raw.trim();
  if (r.startsWith('"') && r.endsWith('"')) return r.slice(1, -1);
  return r.toLowerCase();
}

// Roles named after `to` in every `grant <privileges> on [table] <names> to <roles>` statement whose
// name list contains `table` (Step 6). Pure: no database.
export function explicitGrantRoles(migrationTexts: string[], table: string): Set<string> {
  const roles = new Set<string>();
  for (const text of migrationTexts) {
    for (const statement of stripComments(text).split(';')) {
      const m = /^\s*grant\s+([\s\S]+?)\s+on\s+([\s\S]+?)\s+to\s+([\s\S]+?)\s*$/i.exec(statement);
      if (!m) continue;
      let target = m[2].trim();
      if (NON_TABLE_TARGET.test(target)) continue;
      target = target.replace(/^table\s+/i, '');
      const names = target.split(',').map(bareName);
      if (!names.includes(table)) continue;
      const roleList = m[3].replace(/\s+with\s+grant\s+option\s*$/i, '');
      for (const role of roleList.split(',')) {
        const r = bareRole(role);
        if (r) roles.add(r);
      }
    }
  }
  return roles;
}
