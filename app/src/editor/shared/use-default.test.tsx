// EZD-1910 (AC-EZD-1910-2; editor plan R12) one hook for the editor's six Defaults readers. Expected values: the
// readers it replaces (ProjectEditor.tsx before EZD-1910): a number Default reads as itself and null while not set
// (EZD-407, EZD-515); the auto-fill increment only above zero (EZD-408); the ACT minimum border '1/4' and '1/3' as
// those shares and half a tile otherwise (EZD-511, S05 Validation); the eight countertop Defaults together (EZD-412,
// EZD-414, EZD-415, EZD-416); the key map through bindingsOf (EZD-222). One project channel resync (EZD-116,
// AC-EZD-116-8) re-reads the defaults and every reader shows the new values. Markup through renderToStaticMarkup.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from '../../lib/defaults/shortcut-keys';
import { createProjectDefaults, type ProjectDefaults } from '../project-defaults';
import { editorDefaults, useDefault } from './use-default';

function Readers({ defaults }: { defaults: ProjectDefaults | null }) {
  const fit = useDefault(defaults, editorDefaults.fitTolerance);
  const keys = useDefault(defaults, editorDefaults.keyboardShortcuts);
  const autoFill = useDefault(defaults, editorDefaults.autoFillIncrement);
  const fan = useDefault(defaults, editorDefaults.fanClearance);
  const act = useDefault(defaults, editorDefaults.actMinShare);
  const tops = useDefault(defaults, editorDefaults.countertopDefaults);
  return (
    <pre>
      {JSON.stringify({ fit, select: keys['select'], autoFill, fan, act, tops })}
    </pre>
  );
}

function read(defaults: ProjectDefaults | null) {
  const html = renderToStaticMarkup(<Readers defaults={defaults} />);
  return JSON.parse(html.replace(/^<pre>|<\/pre>$/g, '').replace(/&quot;/g, '"')) as Record<string, unknown>;
}

const NO_TOPS = {
  overhang_standard: null,
  overhang_against_wall: null,
  countertop_increment: null,
  overhang_seating_counter: null,
  overhang_seating_bar: null,
  seating_support_limit: null,
  countertop_bracket_spacing: null,
  countertop_seat_width: null,
};

/** Defaults whose resync answers with `next`; `fire` is the project channel's resync. */
function withResync(initial: Record<string, unknown>, next: Record<string, unknown>) {
  let fire = () => {};
  const defaults = createProjectDefaults({
    projectId: 'p1',
    initial: initial as never,
    resync: (_id, cb) => {
      fire = cb;
      return () => {};
    },
    fetchImpl: (async () => new Response(JSON.stringify({ defaults: next }), { status: 200 })) as typeof fetch,
  });
  return { defaults, resync: () => fire() };
}

describe('EZD-1910 useDefault', () => {
  it('reads all-null values while there is no session', () => {
    expect(read(null)).toEqual({
      fit: null,
      select: DEFAULT_BINDINGS['select'],
      autoFill: null,
      fan: null,
      act: 1 / 2,
      tops: NO_TOPS,
    });
  });

  it('reads each Default as the reader it replaces did', () => {
    const { defaults } = withResync(
      {
        cabinet_fit_tolerance: 0.25,
        cabinet_autofill_increment: 0,
        fan_blade_clearance: 7,
        act_min_border: '1/3',
        overhang_standard: 1.5,
        countertop_seat_width: 24,
      },
      {},
    );
    expect(read(defaults)).toEqual({
      fit: 0.25,
      select: DEFAULT_BINDINGS['select'],
      autoFill: null,
      fan: 7,
      act: 1 / 3,
      tops: { ...NO_TOPS, overhang_standard: 1.5, countertop_seat_width: 24 },
    });
  });

  it('one resync updates every reader at once', async () => {
    const { defaults, resync } = withResync(
      { cabinet_fit_tolerance: 0.25, act_min_border: '1/2' },
      {
        cabinet_fit_tolerance: 0.5,
        keyboard_shortcuts: { select: 'q' },
        cabinet_autofill_increment: 3,
        fan_blade_clearance: 7,
        act_min_border: '1/4',
        overhang_standard: 1.5,
        overhang_against_wall: 0.5,
      },
    );
    let notified = 0;
    defaults.subscribe(() => notified++);
    resync();
    await defaults.refresh();
    expect(notified).toBeGreaterThan(0);
    expect(read(defaults)).toEqual({
      fit: 0.5,
      select: 'q',
      autoFill: 3,
      fan: 7,
      act: 1 / 4,
      tops: { ...NO_TOPS, overhang_standard: 1.5, overhang_against_wall: 0.5 },
    });
  });
});
