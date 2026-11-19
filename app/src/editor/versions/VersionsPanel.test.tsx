// EZD-122 P1-P9 (AC-EZD-122-2, -3, -6, -7, -9, -10). Expected values from the spec and the board, never the code:
// board S20 (groups Sent, Named snapshots, Working versions; rows "Version 3" / "Sep 26 · client", "Before island
// resize" / "Oct 2 · Josh Bishop", "Oct 10 · 4:12 PM" / "Stop editing · Josh Bishop", "Revert from Rev 0 · Josh
// Bishop"; "+ 9 older · unsent versions clean up at 30 days"; status "Viewing Rev 0 · read-only", "Sent 5 Snapshots 2
// Working 12"; inspector "Revert to this"); examples 09p "Working-row collapse" (0 → only the Working copy row; 3 →
// three rows, no collapse line; 12 → three rows, then "+ 9 older"); Q-0700 05 (N from Defaults; inspector label, date
// and time, author, cause, parent; Name snapshot on working rows only); S20 Permissions (controls the user lacks are
// hidden); S20 "opens the version read-only". Rendered in the real office catalog, English, in UTC.
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import type { VersionRow } from '../../lib/versions/versions';
import { catalogFor } from '../../server/messages/catalog';
import { elements, textOf } from '../../../test-harness/projects-markup';
import { createModelStore } from '../model/model-store';
import { createRoutedStore } from '../model/routed-store';
import { createVersionView } from './version-view';
import { groupVersions } from './versions-list';
import { VersionInspector, VersionsPanel, VersionsStatus } from './VersionsPanel';

const UTC = 'UTC';

const html = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  );

let n = 0;
const row = (o: Partial<VersionRow>): VersionRow => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  label: null,
  cause: null,
  isSnapshot: false,
  isSent: false,
  versionNo: null,
  sentTo: null,
  sentAt: null,
  createdAt: '2026-10-10T16:12:00Z',
  author: 'Josh Bishop',
  parentId: null,
  ...o,
});

const working = (i: number) =>
  row({
    cause: 'stop_editing',
    createdAt: new Date(Date.UTC(2026, 9, 10, 16, 12) - i * 3_600_000).toISOString(),
  });

const panel = (rows: VersionRow[] | null, o: { days?: number; viewingId?: string | null } = {}) =>
  html(
    <VersionsPanel
      rows={rows}
      failed={false}
      openFailed={false}
      viewingId={o.viewingId ?? null}
      openingId={null}
      cleanupAgeDays={o.days ?? 30}
      onOpen={() => {}}
      onBack={() => {}}
      timeZone={UTC}
    />,
  );

const rowTexts = (h: string) => elements(h, 'version-row').map((e) => textOf(e.inner));

describe('EZD-122 Versions panel', () => {
  it('P1 a project with no checkpoint shows only the Working copy row (AC-EZD-122-9; 09p collapse example 1)', () => {
    const h = panel([]);
    expect(elements(h, 'version-working-copy')).toHaveLength(1);
    expect(textOf(elements(h, 'version-working-copy')[0]!.inner)).toBe('Working copy');
    expect(elements(h, 'version-row')).toHaveLength(0);
    expect(h).not.toContain('Named snapshots');
    expect(h).not.toContain('older');
  });

  it('P2 groups Sent, Named snapshots and Working versions; each row shows its label or date and time, cause and author (AC-EZD-122-2)', () => {
    const sent = row({
      isSent: true,
      versionNo: 3,
      sentTo: 'Zed Co',
      sentAt: '2026-09-26T15:00:00Z',
      createdAt: '2026-09-26T15:00:00Z',
      cause: 'send',
      author: null,
    });
    const snap = row({
      isSnapshot: true,
      label: 'Before island resize',
      createdAt: '2026-10-02T14:00:00Z',
    });
    const stop = row({ cause: 'stop_editing', createdAt: '2026-10-10T16:12:00Z' });
    const reverted = row({
      cause: 'revert',
      label: 'Revert from Version 1',
      createdAt: '2026-10-03T14:40:00Z',
    });
    const h = panel([stop, reverted, snap, sent]);
    expect(textOf(elements(h, 'versions-group-sent')[0]!.inner)).toBe('Sent');
    expect(textOf(elements(h, 'versions-group-snapshots')[0]!.inner)).toBe('Named snapshots');
    expect(textOf(elements(h, 'versions-group-working')[0]!.inner)).toBe('Working versions');
    expect(rowTexts(h)).toEqual([
      'V3Version 3Sep 26 · Zed Co',
      'Before island resizeOct 2 · Josh Bishop',
      'Oct 10 · 4:12 PMStop editing · Josh Bishop',
      'Oct 3 · 2:40 PMRevert from Version 1 · Josh Bishop',
    ]);
  });

  it('P3 three working rows, then "+ K older · unsent versions clean up at N days" with N from Defaults (AC-EZD-122-7; 09p examples 2, 3)', () => {
    const three = panel([0, 1, 2].map(working));
    expect(elements(three, 'version-row')).toHaveLength(3);
    expect(elements(three, 'versions-older')).toHaveLength(0);

    const twelve = Array.from({ length: 12 }, (_, i) => working(i));
    const h = panel(twelve);
    expect(elements(h, 'version-row')).toHaveLength(3);
    expect(textOf(elements(h, 'versions-older')[0]!.inner)).toBe(
      '+ 9 older · unsent versions clean up at 30 days',
    );
    expect(textOf(elements(panel(twelve, { days: 45 }), 'versions-older')[0]!.inner)).toBe(
      '+ 9 older · unsent versions clean up at 45 days',
    );
    expect(groupVersions(twelve)).toMatchObject({
      older: 9,
      counts: { sent: 0, snapshots: 0, working: 12 },
    });
    expect(groupVersions([])).toMatchObject({
      older: 0,
      working: [],
      counts: { sent: 0, snapshots: 0, working: 0 },
    });
  });

  it('P4 the status bar reads "Viewing <label> · read-only" with Back to working copy, and the counts (AC-EZD-122-3, -9)', () => {
    const rows = [
      ...Array.from({ length: 12 }, (_, i) => working(i)),
      row({ isSnapshot: true, label: 'A' }),
      row({ isSnapshot: true, label: 'B' }),
      ...[1, 2, 3, 4, 5].map((v) =>
        row({ isSent: true, versionNo: v, sentAt: '2026-09-01T00:00:00Z' }),
      ),
    ];
    const sent = rows[rows.length - 1]!;
    const h = html(<VersionsStatus rows={rows} viewing={sent} onBack={() => {}} timeZone={UTC} />);
    expect(textOf(elements(h, 'versions-viewing')[0]!.inner)).toBe('Viewing Version 5 · read-only');
    expect(textOf(elements(h, 'versions-back')[0]!.inner)).toBe('Back to working copy');
    expect(textOf(elements(h, 'versions-counts')[0]!.inner)).toBe(
      'Sent 5 · Snapshots 2 · Working 12',
    );

    const empty = html(
      <VersionsStatus rows={[]} viewing={null} onBack={() => {}} timeZone={UTC} />,
    );
    expect(textOf(elements(empty, 'versions-counts')[0]!.inner)).toBe(
      'Sent 0 · Snapshots 0 · Working 0',
    );
    expect(elements(empty, 'versions-viewing')).toHaveLength(0);
  });

  it('P5 the inspector shows label, date and time, author, cause and parent (Q-0700 05)', () => {
    const parent = row({ isSnapshot: true, label: 'Pre-permit check' });
    const w = row({
      cause: 'stop_editing',
      parentId: parent.id,
      createdAt: '2026-10-10T16:12:00Z',
    });
    const h = html(
      <VersionInspector
        row={w}
        rows={[w, parent]}
        canEditModel
        canRevert
        onName={async () => null}
        onRevert={() => {}}
        reverting={false}
        error={null}
        timeZone={UTC}
      />,
    );
    const v = (id: string) => textOf(elements(h, `version-detail-${id}`)[0]!.inner);
    expect(v('when')).toBe('Date and timeOct 10 · 4:12 PM');
    expect(v('author')).toBe('AuthorJosh Bishop');
    expect(v('cause')).toBe('CauseStop editing');
    expect(v('parent')).toBe('ParentPre-permit check');
    expect(elements(h, 'version-name-snapshot')).toHaveLength(1);
    expect(textOf(elements(h, 'version-revert')[0]!.inner)).toBe('Revert to this');
  });

  it('P6 without Edit model there is no Name snapshot and no Revert; a sent row has no Name snapshot (AC-EZD-122-6, -4)', () => {
    const w = row({ cause: 'stop_editing' });
    const viewer = html(
      <VersionInspector
        row={w}
        rows={[w]}
        canEditModel={false}
        canRevert={false}
        onName={async () => null}
        onRevert={() => {}}
        reverting={false}
        error={null}
        timeZone={UTC}
      />,
    );
    expect(elements(viewer, 'version-name-snapshot')).toHaveLength(0);
    expect(elements(viewer, 'version-snapshot-name')).toHaveLength(0);
    expect(elements(viewer, 'version-revert')).toHaveLength(0);

    const sent = row({ isSent: true, versionNo: 2, sentAt: '2026-09-12T00:00:00Z' });
    const editor = html(
      <VersionInspector
        row={sent}
        rows={[sent]}
        canEditModel
        canRevert
        onName={async () => null}
        onRevert={() => {}}
        reverting={false}
        error={null}
        timeZone={UTC}
      />,
    );
    expect(elements(editor, 'version-name-snapshot')).toHaveLength(0);
    expect(elements(editor, 'version-revert')).toHaveLength(1);
  });

  it('P7 an empty name cannot be submitted (AC-EZD-122-4)', () => {
    const w = row({ cause: 'stop_editing' });
    const h = html(
      <VersionInspector
        row={w}
        rows={[w]}
        canEditModel
        canRevert={false}
        onName={async () => null}
        onRevert={() => {}}
        reverting={false}
        error={null}
        timeZone={UTC}
      />,
    );
    expect(elements(h, 'version-name-snapshot')[0]!.attrs).toContain('disabled');
  });

  it('P8 a version opens read-only on the canvas and Back returns the working copy (AC-EZD-122-3, -10)', async () => {
    const wall = (x: number) => ({ type: 'wall', schemaVersion: 1, data: { x } });
    const base = createModelStore({
      objects: new Map([
        ['w1', wall(1)],
        ['w2', wall(2)],
      ]),
    });
    const routed = createRoutedStore(base);
    const told: string[][] = [];
    routed.subscribe((s) => told.push([...s.lastChangedIds].sort()));
    let resets = 0;
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ version: { id: 'v1', objects: [{ id: 'w1', ...wall(9) }] }, invalid: [] }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const view = createVersionView({
      projectId: 'p',
      routed,
      base,
      reset: () => resets++,
      fetchImpl,
    });
    const v = row({ cause: 'stop_editing' });
    await view.open(v);
    expect(view.getState().viewing).toBe(v);
    expect([...routed.getState().objects.keys()]).toEqual(['w1']);
    expect(routed.getState().objects.get('w1')).toEqual(wall(9));
    expect(told[0]).toEqual(['w1', 'w2']);
    // Read-only: an edit changes nothing, on the version or the working copy.
    expect(routed.applyEdit([{ id: 'w1', value: wall(5) }] as never)).toEqual([]);
    expect(routed.getState().objects.get('w1')).toEqual(wall(9));
    expect(base.getState().objects.get('w1')).toEqual(wall(1));

    view.back();
    expect(view.getState().viewing).toBeNull();
    expect(routed.getState().objects).toBe(base.getState().objects);
    expect(resets).toBe(2);
  });

  it('P9 a version that cannot be read leaves the working copy shown', async () => {
    const base = createModelStore({ objects: new Map() });
    const routed = createRoutedStore(base);
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { code: 'version_not_found' } }), {
        status: 404,
      })) as unknown as typeof fetch;
    const view = createVersionView({ projectId: 'p', routed, base, reset: () => {}, fetchImpl });
    await view.open(row({}));
    expect(view.getState()).toEqual({ viewing: null, opening: null, failed: true });
    expect(routed.getState().objects).toBe(base.getState().objects);
  });
});
