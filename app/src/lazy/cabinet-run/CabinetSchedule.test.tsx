// EZD-409 (S04 Controls "Cabinet schedule | Inspector footer | Opens the schedule: code, qty, finish, notes"; S04
// Permissions "View projects: view ... schedule", "Export: export the cabinet schedule (CSV/PDF) from the schedule
// view"; AC-EZD-409-1, -2). Markup through renderToStaticMarkup (L-020). Expected values: board S04's back wall run
// (test-utils/board-run.ts), one of each of its 8 codes; headings from the spec ("code, qty, finish, notes").
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { cabinetView, modelObjects } from '../../editor/cabinets/cabinet-view';
import { boxInspectorView } from '../../editor/cabinets/box-inspector';
import { boardModel, CAB_FLOOR, cabId } from '../../editor/cabinets/test-utils/board-run';
import { BoxInspectorScreen } from './BoxInspector';
import { CabinetScheduleView } from './CabinetSchedule';

const html = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  )
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');

const objects = modelObjects(boardModel());

describe('EZD-409 cabinet schedule view', () => {
  it('AC-EZD-409-1: one table row per code on the plan, each with its count', () => {
    const s = html(<CabinetScheduleView objects={objects} canExport={false} onClose={() => {}} />);
    expect(s).toContain('data-testid="cabinet-schedule"');
    for (const h of ['Code', 'Qty', 'Finish', 'Notes']) expect(s).toContain(`<th scope="col">${h}</th>`);
    const codes = [...s.matchAll(/data-testid="cabinet-schedule-row" data-code="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(codes).toEqual(['B15', 'B18', 'B21', 'DW24', 'F3', 'SB36', 'W1530', 'W3030']);
    const qtys = [...s.matchAll(/data-testid="cabinet-schedule-qty">(\d+)</g)].map((m) => m[1]);
    expect(qtys).toEqual(['1', '1', '1', '1', '1', '1', '1', '1']);
    expect(s).toContain('Back wall run');
  });

  it('Export CSV shows only with Export', () => {
    const without = html(
      <CabinetScheduleView objects={objects} canExport={false} onClose={() => {}} />,
    );
    expect(without).not.toContain('cabinet-schedule-export');
    const withExport = html(
      <CabinetScheduleView objects={objects} canExport onClose={() => {}} />,
    );
    expect(withExport).toContain('data-testid="cabinet-schedule-export"');
    expect(withExport).toContain('Export CSV');
  });

  it('a project with no runs shows the empty line and an Export CSV that is off', () => {
    const s = html(<CabinetScheduleView objects={[]} canExport onClose={() => {}} />);
    expect(s).toContain('No cabinets in this project yet.');
    expect(s).toMatch(/<button[^>]*data-testid="cabinet-schedule-export"[^>]*disabled=""/);
  });

  it('the inspector footer button is on for a reader too', () => {
    const view = cabinetView(objects, CAB_FLOOR)!;
    const s = html(
      <BoxInspectorScreen
        view={view}
        objects={objects}
        ids={[cabId(4)]}
        box={boxInspectorView(view, objects, cabId(4))}
        catalog={{ kind: 'ready', items: [] }}
        canEdit={false}
        swapOpen={false}
        onSwapOpen={() => {}}
        onChanges={() => []}
      />,
    );
    const button = s.match(/<button[^>]*data-testid="box-inspector-schedule"[^>]*>/)?.[0] ?? '';
    expect(button).not.toBe('');
    expect(button).not.toContain('disabled');
  });
});
