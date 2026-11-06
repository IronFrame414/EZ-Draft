// EZD-120c U4 (vault/plans/EZD-120c.md section 4; AC-EZD-120c-3, -8). Expected values: plan section 6 and
// Decided "Ticking", "Failed banner" (S03 States: "Saving…", "Saved just now", "Changes not saved"; Q-0505 "Saved";
// section 6 "Not saved"). Rendered in the real office catalog, English.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { MessagesProvider } from '../lib/messages';
import type { OutboxSync, SyncState } from '../lib/outbox/outbox-sync';
import { catalogFor } from '../server/messages/catalog';
import { elements, attr, textOf } from '../../test-harness/projects-markup';
import { SaveFailedBanner, SaveStateText } from './SaveStatus';

function syncWith(state: Partial<SyncState>): OutboxSync {
  const store = createStore<SyncState>()(() => ({
    status: 'idle',
    failures: 0,
    problem: null,
    lastSavedAt: null,
    ...state,
  }));
  return {
    ...store,
    enqueue: vi.fn(async () => {}),
    flush: vi.fn(async () => {}),
    retry: vi.fn(),
    dispose: vi.fn(),
  };
}

const render = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {ui}
    </MessagesProvider>,
  );

describe('EZD-120c save status markup', () => {
  it('U4 status: the word per status, and the failed banner only on error', () => {
    const word = (state: Partial<SyncState>) => {
      const el = elements(render(<SaveStateText sync={syncWith(state)} />), 'save-state')[0];
      return { text: textOf(el.inner), status: attr(el.attrs, 'data-save-status') };
    };
    expect(word({ status: 'idle' })).toEqual({ text: 'Saved', status: 'idle' });
    expect(word({ status: 'pending' })).toEqual({ text: 'Saving…', status: 'pending' });
    expect(word({ status: 'saved', lastSavedAt: Date.now() })).toEqual({
      text: 'Saved just now',
      status: 'saved',
    });
    expect(word({ status: 'error' })).toEqual({ text: 'Not saved', status: 'error' });

    const banner = render(<SaveFailedBanner sync={syncWith({ status: 'error' })} />);
    const el = elements(banner, 'save-failed-banner');
    expect(el).toHaveLength(1);
    expect(textOf(el[0].inner)).toContain('Changes not saved');
    expect(textOf(el[0].inner)).toContain('Retry');
    const problem = render(
      <SaveFailedBanner sync={syncWith({ status: 'error', problem: 'storage_failed' })} />,
    );
    expect(elements(problem, 'save-failed-banner')).toHaveLength(1);
    for (const status of ['idle', 'pending', 'saving', 'saved', 'offline'] as const) {
      // MessagesProvider always emits its own empty wrapper div; the banner adds nothing inside it.
      const html = render(<SaveFailedBanner sync={syncWith({ status })} />);
      expect(html.replace(/^<div[^>]*><\/div>$/, '')).toBe('');
    }
  });
});

describe('EZD-347 save-failed banner icon', () => {
  it('EZD-347 U6: the save-failed banner keeps its 20 px error icon', () => {
    const html = render(<SaveFailedBanner sync={syncWith({ status: 'error' })} />);
    const icon =
      '<svg width="20" height="20" aria-hidden="true" focusable="false" fill="currentColor"><use href="#ez-icon-error"></use></svg>';
    expect(html.split(icon).length - 1).toBe(1);
  });
});
