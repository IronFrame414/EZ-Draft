// EZD-120c Build step 7 (vault/plans/EZD-120c.md section 3 route; Decided "Page"; Q-0500; ARCH Entry points): the
// editor for one project at /projects/[id]. It requires a session (signed out goes to /sign-in); the browser loads
// the project through the model route, which checks the permission. The test hook is off in production.
// EZD-111 (vault/plans/EZD-111.md D-Can send; Q-0700): Share shows only with Send to client for this project; a
// failed permission load hides it and is reported (the send route decides again).
import { connection } from 'next/server';
import type { ReactElement } from 'react';
import { StateHost } from '../../../../components/states/StateHost';
import { ProjectEditor } from '../../../../editor/ProjectEditor';
import { ImportedNotice } from '../../../../editor/plan/ImportedNotice';
import { parseImported } from '../../../../editor/plan/imported';
import { MessagesProvider } from '../../../../lib/messages';
import { requireSession } from '../../../../server/auth/session';
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { loadRailOrder } from '../../../../server/profile/rail-order';
import { reportError } from '../../../../server/errors/report';
import { can } from '../../../../server/permissions';
import { settingsPermissionContext } from '../../../../server/settings/shell-data';
import { catalogFor } from '../../../../server/messages/catalog';

// EZD-299 Build step 10 (vault/plans/EZD-299.md Decided D-Page; C14): `?conflicts=open` opens the conflict list.
export default async function EditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  // Render per request, as the Projects page does (app/src/app/(office)/page.tsx).
  await connection();
  const session = await requireSession();
  const { id } = await params;
  // EZD-230 (Q-0038, Q-0122): the user's own rail tool order, read with the page so the editor asks for nothing
  // more; a failed read is reported and the rail keeps its default order.
  let railOrder: string[] = [];
  try {
    railOrder = await loadRailOrder(createSessionClient(), session);
  } catch {
    await reportError(new Error('editor_rail_order_load_failed'), {
      source: 'function',
      location: 'editor.rail_order',
    });
  }
  const query = searchParams === undefined ? undefined : await searchParams;
  const open = query?.conflicts === 'open' ? { conflictsOpen: true } : {};
  // EZD-237 (vault/plans/EZD-237.md D-Editor): `?benchmark=run` plays the benchmark (the Benchmark card's frame).
  const bench = query?.benchmark === 'run' ? { benchmark: true } : {};
  // EZD-313 (S02 Decisions): `?imported=walls.windows.doors.rooms` shows the Finish import notice once.
  const imported = parseImported(query?.imported);
  const ctx = await settingsPermissionContext();
  if (ctx === 'failed') {
    await reportError(new Error('editor_permissions_load_failed'), {
      source: 'function',
      location: 'editor.share_button',
    });
  }
  const send =
    ctx !== null && ctx !== 'failed' && can(ctx, 'send_to_client', { projectId: id })
      ? { canSend: true }
      : {};
  // EZD-416: Settings → Defaults decides the countertop panel's "Change in company settings" link.
  const defaultsLink =
    ctx !== null && ctx !== 'failed' && can(ctx, 'settings_defaults') ? { canManageDefaults: true } : {};
  return (
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <StateHost>
        {imported ? <ImportedNotice counts={imported} /> : null}
        <ProjectEditor
          projectId={id}
          railOrder={railOrder}
          devHooks={process.env.VERCEL_ENV !== 'production'}
          {...open}
          {...bench}
          {...send}
          {...defaultsLink}
        />
      </StateHost>
    </MessagesProvider>
  );
}
