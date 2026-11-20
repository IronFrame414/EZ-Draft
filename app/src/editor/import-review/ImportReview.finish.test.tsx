// EZD-313 (S02 Controls Finish import "Disabled while any item is unresolved"; Cancel import; Decisions "opens 03
// Plan with a short notice of the counts imported"; phase-03 EZD-309 save queue): the pieces Finish import and
// Cancel import use in the page. Finish first sends what the save queue holds (flush), so Finish writes the last
// action too; the Plan address carries the counts in the order walls, windows, doors, rooms. The flows end to end
// are in e2e/import-finish.spec.ts.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { attr, elements } from '../../../test-harness/projects-markup';
import { parseImported } from '../plan/imported';
import { ImportReview, planAfterFinish } from './ImportReview';
import { createReviewSaver, type SaveBody, type SendResult } from './review-saver';

const build = (ids: readonly string[]): SaveBody => ({
  mode: null,
  changes: ids.map((id) => ({ item_id: id, decision: 'accepted', fix: null })),
});

describe('EZD-313 save queue flush before Finish', () => {
  it('sends what is marked at once, without waiting the 2 seconds, and answers true when saved', async () => {
    vi.useFakeTimers();
    try {
      const sent: SaveBody[] = [];
      const s = createReviewSaver({
        build,
        send: async (body) => {
          sent.push(body);
          return 'saved';
        },
      });
      s.mark(['w1', 'w2']);
      expect(sent).toHaveLength(0);
      await expect(s.flush()).resolves.toBe(true);
      expect(sent.map((b) => b.changes.map((c) => c.item_id))).toEqual([['w1', 'w2']]);
      expect(s.pending()).toEqual({ ids: [], mode: null });
      // Nothing marked: nothing is sent.
      await expect(s.flush()).resolves.toBe(true);
      expect(sent).toHaveLength(1);
      s.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for a send in flight, then sends what was marked during it', async () => {
    let finishFirst: (r: SendResult) => void = () => {};
    const sent: string[][] = [];
    const s = createReviewSaver({
      build,
      send: (body) => {
        sent.push(body.changes.map((c) => c.item_id));
        if (sent.length === 1) return new Promise<SendResult>((r) => (finishFirst = r));
        return Promise.resolve('saved');
      },
      everyMs: 60_000,
    });
    s.mark(['w1']);
    s.flushNow();
    s.mark(['w2']);
    const done = s.flush();
    finishFirst('saved');
    await expect(done).resolves.toBe(true);
    expect(sent).toEqual([['w1'], ['w2']]);
    s.dispose();
  });

  it('answers false after a failed send or a refusal', async () => {
    const failing = createReviewSaver({ build, send: async () => 'retry', everyMs: 60_000 });
    failing.mark(['w1']);
    await expect(failing.flush()).resolves.toBe(false);
    expect(failing.pending().ids).toEqual(['w1']);
    failing.dispose();

    const refused = createReviewSaver({ build, send: async () => ({ refused: 409 }) });
    refused.mark(['w1']);
    await expect(refused.flush()).resolves.toBe(false);
    await expect(refused.flush()).resolves.toBe(false);
  });
});

describe('EZD-313 Plan after Finish', () => {
  it('opens the project with the counts imported, read back in the same order', () => {
    const counts = { walls: 11, windows: 4, doors: 2, rooms: 3 };
    const url = planAfterFinish('p1', counts);
    expect(url).toBe('/projects/p1?imported=11.4.2.3');
    expect(parseImported(new URL(url, 'http://x').searchParams.get('imported'))).toEqual(counts);
  });

  it('reads only four whole numbers', () => {
    for (const bad of [undefined, '', '1.2.3', '1.2.3.4.5', 'a.b.c.d', '1.2.3.-4', ['1.2.3.4']]) {
      expect(parseImported(bad), String(bad)).toBeNull();
    }
    expect(parseImported('0.0.0.0')).toEqual({ walls: 0, windows: 0, doors: 0, rooms: 0 });
  });

  it('the notice wording names each count', () => {
    expect(catalogFor('office', 'en')['office.plan.imported']).toBe(
      'Import finished: {walls} walls, {windows} windows, {doors} doors, {rooms} rooms added.',
    );
  });
});

describe('EZD-313 header before the import is read', () => {
  it('Finish import and Cancel import are disabled while loading', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
        <ImportReview projectId="p" jobId="j" />
      </MessagesProvider>,
    );
    const finish = elements(html, 'import-review-finish')[0]!;
    const cancel = elements(html, 'import-review-cancel')[0]!;
    expect(attr(finish.attrs, 'disabled')).not.toBeNull();
    expect(attr(cancel.attrs, 'disabled')).not.toBeNull();
  });
});
