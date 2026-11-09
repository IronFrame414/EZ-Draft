// EZD-299 U4a-U4c (vault/plans/EZD-299.md section 4; AC-EZD-299-10, -12, -5, -6, -8; Decided D-Status, D-Groups,
// D-Row text, D-Show, D-Actions; wording P5-P15 of section 6; board S03b). ConflictPanelView is pure: static
// markup in the office MessagesProvider; attribute order is not assumed.
import { createWallData } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MineChange, SavedValue } from '../../lib/conflicts/conflicts';
import {
  conflictRowView,
  groupConflicts,
  type ConflictViewInput,
} from '../../lib/conflicts/conflict-view';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { ConflictPanelView } from './ConflictPanel';

const P = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const Q = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const R = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LEVEL = '99999999-9999-4999-8999-999999999999';
const NOW = new Date('2026-11-07T15:00:00.000Z');

type Value = { type: string; schemaVersion: number; data: Record<string, unknown> };
type WallOpts = { end?: number; thickness?: number; height?: number };

function wall(o: WallOpts = {}): Value {
  const made = createWallData({
    start: { x: 0, y: 0 },
    end: { x: o.end ?? 150, y: 0 },
    level: LEVEL,
  });
  if (!made.ok) throw new Error(made.reason);
  const data = made.data as unknown as { attributes: Record<string, unknown> };
  return {
    type: 'wall',
    schemaVersion: 1,
    data: {
      ...data,
      attributes: {
        ...data.attributes,
        number: 4,
        ...(o.thickness !== undefined ? { thickness: o.thickness } : {}),
        ...(o.height !== undefined ? { height: o.height } : {}),
      },
    },
  };
}
const opening = (kind: 'door' | 'window', number: number, width: number): Value => ({
  type: 'opening',
  schemaVersion: 1,
  data: {
    geometry: { center: { x: 60, y: 0 }, hostWallId: LEVEL },
    status: 'new',
    level: LEVEL,
    attributes: { kind, number, width, height: 80, sillHeight: 0 },
  },
});
const mineOf = (v: Value): MineChange => ({ deleted: false, ...v });
const savedOf = (v: Value, seq = 3): SavedValue => ({ updatedSeq: seq, deleted: false, ...v });

function input(over: Partial<ConflictViewInput> & { objectId: string }): ConflictViewInput {
  const projectId = over.projectId ?? P;
  return {
    key: `${projectId}/${over.objectId}`,
    projectId,
    projectName: null,
    reason: 'conflict',
    mine: null,
    saved: null,
    actions: [],
    savedBy: null,
    savedAt: null,
    clientName: null,
    ...over,
  };
}

type ViewProps = Parameters<typeof ConflictPanelView>[0];
const noop = () => {};

function render(inputs: ConflictViewInput[], over: Partial<ViewProps> = {}, limit = 50): string {
  const { groups, total, more } = groupConflicts(inputs, P, limit);
  const props: ViewProps = {
    groups,
    total,
    more,
    status: 'ready',
    openProjectName: 'Kitchen remodel',
    busy: new Set<string>(),
    showable: new Set<string>(),
    now: NOW,
    onClose: noop,
    onAction: noop,
    onShow: noop,
    onShowMore: noop,
    onRetry: noop,
    ...over,
  };
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <ConflictPanelView {...props} />
    </MessagesProvider>,
  );
}

const decode = (s: string) =>
  s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const tags = (html: string, testid: string) =>
  [...html.matchAll(new RegExp(`<[^>]*data-testid="${testid}"[^>]*>`, 'g'))].map((m) => m[0]);
// The full text of every element with the test id: tags inside it stripped, as flat() does.
const textOf = (html: string, testid: string): string[] => {
  const out: string[] = [];
  const open = new RegExp(`<([a-z0-9]+)[^>]*data-testid="${testid}"[^>]*>`, 'g');
  for (const m of html.matchAll(open)) {
    const start = (m.index ?? 0) + m[0].length;
    const re = new RegExp(`<(/?)${m[1]}(?=[\\s>/])[^>]*>`, 'g');
    re.lastIndex = start;
    let depth = 1;
    let end = html.length;
    for (let n = re.exec(html); n !== null; n = re.exec(html)) {
      depth += n[1] === '/' ? -1 : 1;
      if (depth === 0) {
        end = n.index;
        break;
      }
    }
    out.push(decode(html.slice(start, end).replace(/<[^>]*>/g, '')));
  }
  return out;
};
const flat = (html: string) => decode(html.replace(/<[^>]*>/g, ''));
const rowBlocks = (html: string) =>
  html
    .split(/(?=<[^<>]*data-testid="conflict-row")/)
    .filter((b) => /^<[^<>]*data-testid="conflict-row"/.test(b));
const rowOf = (html: string, key: string) => {
  const found = rowBlocks(html).find((b) => b.startsWith('<') && b.slice(0, b.indexOf('>')).includes(`data-conflict-key="${key}"`));
  if (found === undefined) throw new Error(`no row ${key}`);
  return found;
};
const BUTTONS = [
  'conflict-show',
  'conflict-keep-mine',
  'conflict-keep-theirs',
  'conflict-remove',
  'conflict-reload',
] as const;
const buttonsOf = (block: string) =>
  BUTTONS.filter((id) => tags(block, id).length > 0).map((id) => id.replace('conflict-', ''));

// The board's six inputs (plan U4a).
const a = input({
  objectId: 'a',
  mine: mineOf(wall()),
  saved: savedOf(wall({ end: 144 })),
  actions: ['keep_mine', 'keep_theirs'],
  savedBy: 'Dana Ruiz',
  savedAt: '2026-11-07T14:55:00.000Z',
});
const g = input({
  objectId: 'g',
  mine: mineOf(opening('door', 2, 36)),
  saved: { updatedSeq: 5, deleted: true },
  actions: ['keep_mine', 'keep_theirs'],
  savedAt: '2026-11-07T14:59:30.000Z',
});
const h = input({
  objectId: 'h',
  mine: { deleted: true },
  saved: savedOf(opening('window', 3, 42)),
  actions: ['keep_mine', 'keep_theirs'],
});
const i = input({
  objectId: 'i',
  reason: 'invalid',
  mine: mineOf(wall({ height: 96 })),
  saved: savedOf(wall({ height: 97 })),
  actions: ['remove'],
});
const outdated = input({
  key: `outdated:${P}/w7`,
  objectId: 'w7',
  reason: 'outdated',
  mine: mineOf(wall({ thickness: 6 })),
  saved: savedOf(wall({ thickness: 4.5 }), 2),
  actions: ['reload'],
});
const j = input({
  projectId: Q,
  objectId: 'j',
  reason: 'not_open',
  mine: mineOf(wall({ end: 112 })),
  actions: ['remove'],
});

describe('EZD-299 conflict panel', () => {
  it('U4a the filled list: head, groups, row texts, saved-by lines, buttons and footer', () => {
    const showable = new Set([a.key, h.key, i.key, outdated.key]);
    const html = render([a, g, h, i, outdated, j], { showable });
    const panel = tags(html, 'conflict-panel')[0];
    expect(panel).toContain('id="changes-not-saved"');
    expect(panel).toContain('role="dialog"');
    expect(panel).toContain('aria-labelledby="changes-not-saved-title"');
    expect(html).toMatch(/id="changes-not-saved-title"[^>]*>Changes not saved</);
    expect(textOf(html, 'conflict-count')).toEqual(['6']);
    expect(flat(html)).toContain(
      "This list is kept with your account, so it's the same on every device.",
    );
    const close = tags(html, 'conflict-close')[0];
    expect(close).toContain('aria-label="Close"');

    expect(tags(html, 'conflict-group').map((t) => /data-group="([a-z_]+)"/.exec(t)?.[1])).toEqual([
      'this',
      'not_open',
    ]);
    expect(textOf(html, 'conflict-group-count')).toEqual(['5', '1']);
    expect(flat(html)).toContain('This project · Kitchen remodel');
    expect(flat(html)).toContain('Projects you can no longer open');

    const ra = rowOf(html, a.key);
    const rg = rowOf(html, g.key);
    const rh = rowOf(html, h.key);
    const ri = rowOf(html, i.key);
    const ro = rowOf(html, outdated.key);
    const rj = rowOf(html, j.key);
    expect(tags(ra, 'conflict-row')[0]).toContain('data-reason="conflict"');
    expect(tags(ro, 'conflict-row')[0]).toContain('data-reason="outdated"');
    expect(tags(rj, 'conflict-row')[0]).toContain('data-reason="not_open"');

    expect(textOf(ra, 'conflict-row-title')).toEqual(['Wall 4']);
    expect(textOf(ra, 'conflict-row-detail')).toEqual(['· Length']);
    expect(textOf(ra, 'conflict-yours-value')).toEqual([`12' 6"`]);
    expect(textOf(ra, 'conflict-saved-value')).toEqual([`12' 0"`]);
    expect(tags(ra, 'conflict-why')).toEqual([]);

    expect(textOf(rg, 'conflict-row-title')).toEqual(['Door 2']);
    expect(textOf(rg, 'conflict-why')).toEqual(['Someone else deleted this door after you changed it.']);
    expect(textOf(rg, 'conflict-hint')).toEqual(['Keep mine brings it back.']);
    expect(textOf(rg, 'conflict-yours-value')).toEqual([`3' 0"`]);
    expect(textOf(rg, 'conflict-saved-value')).toEqual(['Deleted']);

    expect(textOf(rh, 'conflict-row-title')).toEqual(['Window 3']);
    expect(textOf(rh, 'conflict-why')).toEqual([
      'You deleted this window, but someone else had changed it.',
    ]);
    expect(textOf(rh, 'conflict-hint')).toEqual(['Keep mine deletes their version.']);
    expect(textOf(rh, 'conflict-yours-value')).toEqual(['Deleted']);
    expect(textOf(rh, 'conflict-saved-value')).toEqual([`3' 6"`]);

    expect(textOf(ri, 'conflict-why')).toEqual([
      "EZ Draft built this change wrong, so it can't be saved. We've reported the problem.",
    ]);
    expect(textOf(ri, 'conflict-yours-value')).toEqual([`8' 0"`]);
    expect(tags(ri, 'conflict-saved')).toEqual([]);

    expect(textOf(ro, 'conflict-why')).toEqual([
      'This change was made in an older version of EZ Draft. Reload to send it again.',
    ]);
    expect(textOf(ro, 'conflict-row-detail')).toEqual(['· Thickness']);
    expect(textOf(ro, 'conflict-yours-value')).toEqual(['6"']);
    expect(tags(ro, 'conflict-saved')).toEqual([]);

    expect(textOf(rj, 'conflict-why')).toEqual([
      "You no longer have access to this project, so this change can't be saved.",
    ]);

    // Q-0632 (a): the saved-by line, on conflict rows with a time only.
    expect(textOf(ra, 'conflict-saved-by')).toEqual(['Dana Ruiz · 5 min ago']);
    expect(textOf(rg, 'conflict-saved-by')).toEqual(['Just now']);
    for (const block of [rh, ri, rj, ro]) expect(tags(block, 'conflict-saved-by')).toEqual([]);

    expect(buttonsOf(ra)).toEqual(['show', 'keep-mine', 'keep-theirs']);
    expect(buttonsOf(rg)).toEqual(['keep-mine', 'keep-theirs']);
    expect(buttonsOf(rh)).toEqual(['show', 'keep-mine', 'keep-theirs']);
    expect(buttonsOf(ri)).toEqual(['show', 'remove']);
    expect(buttonsOf(ro)).toEqual(['show', 'reload']);
    expect(buttonsOf(rj)).toEqual(['remove']);

    expect(textOf(html, 'conflict-footer').join('')).toContain(
      'Keep mine saves your change over the saved one. Keep theirs drops your change.',
    );
  });

  it('U4b loading, failed and empty states', () => {
    const loading = render([], { status: 'loading' });
    expect(tags(loading, 'conflict-loading').length).toBe(1);
    expect(tags(loading, 'conflict-row')).toEqual([]);
    expect(tags(loading, 'conflict-empty')).toEqual([]);
    expect(tags(loading, 'conflict-footer').length).toBe(1);

    const failed = render([a], { status: 'failed' });
    expect(tags(failed, 'conflict-error').length).toBe(1);
    expect(flat(failed)).toContain("Couldn't load the saved list.");
    expect(flat(failed)).toContain('Retry');
    expect(tags(failed, 'conflict-row').length).toBe(1);
    expect(tags(failed, 'conflict-loading')).toEqual([]);

    const empty = render([], { status: 'ready' });
    expect(textOf(empty, 'conflict-empty')).toEqual(['Every change is saved.']);
    expect(tags(empty, 'conflict-row')).toEqual([]);
    expect(tags(empty, 'conflict-error')).toEqual([]);
    expect(tags(empty, 'conflict-footer').length).toBe(1);
  });

  it('U4c group labels, details, saved-by rules, Show more and busy rows', () => {
    const wallMine = mineOf(wall({ end: 112 }));
    const n1 = input({
      projectId: R,
      objectId: 'n1',
      projectName: 'Hidden bath',
      reason: 'not_open',
      mine: wallMine,
      actions: ['remove'],
    });
    const o1 = input({
      projectId: Q,
      objectId: 'o1',
      mine: wallMine,
      actions: ['keep_mine', 'keep_theirs'],
    });
    const o2 = input({
      projectId: Q,
      objectId: 'o2',
      projectName: 'Primary bath',
      clientName: 'Client B',
      mine: wallMine,
      actions: ['keep_mine', 'keep_theirs'],
    });
    const o3 = input({
      projectId: Q,
      objectId: 'o3',
      projectName: 'Primary bath',
      mine: wallMine,
      actions: ['keep_mine', 'keep_theirs'],
    });
    const c1 = input({
      objectId: 'c1',
      mine: wallMine,
      savedBy: 'Dana Ruiz',
      savedAt: null,
      actions: ['keep_mine', 'keep_theirs'],
    });
    const c2 = input({
      objectId: 'c2',
      reason: 'not_editable',
      mine: wallMine,
      savedBy: 'Dana Ruiz',
      savedAt: '2026-11-07T14:55:00.000Z',
      actions: ['remove'],
    });
    const html = render([c1, c2, o1, o2, o3, n1], { busy: new Set([c1.key]) }, 6);
    const text = flat(html);
    expect(text).toContain('Projects you can no longer open');
    expect(text).not.toContain('Hidden bath');
    expect(text).toContain('Other projects');

    expect(textOf(rowOf(html, o1.key), 'conflict-row-detail')).toEqual(['· Length']);
    expect(textOf(rowOf(html, o2.key), 'conflict-row-detail')).toEqual([
      '· Length · Primary bath · Client B',
    ]);
    expect(textOf(rowOf(html, o3.key), 'conflict-row-detail')).toEqual([
      '· Length · Primary bath',
    ]);
    expect(tags(rowOf(html, c1.key), 'conflict-saved-by')).toEqual([]);
    expect(tags(rowOf(html, c2.key), 'conflict-saved-by')).toEqual([]);

    const more = render([c1, c2, o1], { more: true });
    expect(textOf(more, 'conflict-show-more').join('')).toContain('Show more');
    expect(tags(html, 'conflict-show-more')).toEqual([]);

    const busyRow = rowOf(html, c1.key);
    for (const id of ['conflict-keep-mine', 'conflict-keep-theirs']) {
      const found = tags(busyRow, id);
      expect(found.length).toBe(1);
      expect(found[0]).toContain('disabled');
    }
    const freeRow = rowOf(html, c2.key);
    expect(tags(freeRow, 'conflict-remove')[0]).not.toContain('disabled');
    // keep the view pure: it builds each row from the plan's function.
    expect(conflictRowView(c2).key).toBe(c2.key);
  });
});
