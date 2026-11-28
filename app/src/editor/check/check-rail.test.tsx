// EZD-612 (04 Tool rail "Check | Shift+C | Every editor tab", "on the rail of every editor tab, above Help"; S03 Check
// "Rail, above Help"; S06:100 "running Check allowed" in view only; board S03Plan "Check code (run)", icon rule).
// Markup only; the click is in app/e2e/code-check.spec.ts.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { createSurfaceSetting } from '../ceiling/surface';
import { PAUSED_TOOL_IDS } from '../selection/selection-controller';
import { DRAWING_RAIL_TOOLS } from '../tools/tool-defs';
import { DrawingRail } from '../tools/DrawingRail';

const render = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  );
const noop = () => {};
const bottomIds = (html: string) =>
  [
    ...(/data-rail="bottom">(.*)<\/div><\/nav>/.exec(html)?.[1] ?? '').matchAll(
      /data-rail-tool="([a-z-]+)"/g,
    ),
  ].map((m) => m[1]);
const checkButton = (html: string) =>
  /<button[^>]*data-rail-tool="check"[^>]*>/.exec(html)?.[0] ?? '';

describe('EZD-612 Check on the rail', () => {
  it('sits above Help with its Shift+C key', () => {
    const html = render(
      <DrawingRail
        drawing={null}
        selection={null}
        rail={{ tools: DRAWING_RAIL_TOOLS, disabled: false }}
        assistant={{ open: false, onToggle: noop }}
        check={{ shortcut: 'Shift+C', onRun: noop }}
        help={{ shortcut: '?', onOpen: noop }}
      />,
    );
    expect(bottomIds(html)).toEqual(['assistant', 'check', 'help']);
    expect(checkButton(html)).toContain('aria-keyshortcuts="Shift+C"');
    expect(html).toMatch(/data-rail-tool="check".*?data-rail-tooltip[^>]*>Check<kbd/);
  });

  it('is absent without Run code check', () => {
    const html = render(
      <DrawingRail
        drawing={null}
        selection={null}
        rail={{ tools: DRAWING_RAIL_TOOLS, disabled: false }}
        help={{ shortcut: '?', onOpen: noop }}
      />,
    );
    expect(bottomIds(html)).toEqual(['help']);
  });

  it('stays on in view only (paused drawing tools) and on the ceiling rail', () => {
    const viewOnly = render(
      <DrawingRail
        drawing={null}
        selection={null}
        rail={{ tools: DRAWING_RAIL_TOOLS, disabled: false, paused: PAUSED_TOOL_IDS }}
        check={{ shortcut: 'Shift+C', onRun: noop }}
      />,
    );
    expect(checkButton(viewOnly)).not.toContain('disabled');
    const surface = createSurfaceSetting();
    surface.setSurface('ceiling');
    const rcp = render(
      <DrawingRail
        drawing={null}
        selection={null}
        rail={{ tools: DRAWING_RAIL_TOOLS, disabled: false }}
        surface={surface}
        check={{ shortcut: 'Shift+C', onRun: noop }}
        help={{ shortcut: '?', onOpen: noop }}
      />,
    );
    expect(bottomIds(rcp)).toEqual(['check', 'help']);
  });
});
