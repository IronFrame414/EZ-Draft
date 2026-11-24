// EZD-1906a (AC-EZD-1906a-1) shared store hook. Expected behaviour: editor plan R3 (one hook for a store the page may
// not have; the reader shows a fallback until it does), as tools/DrawingTools.tsx read the drawing ui and the
// surface. Markup through renderToStaticMarkup (React's server snapshot); no browser.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { useStoreValue } from './use-store-value';
import { createValueStore, type ValueStore } from './value-store';

function Reader({ store }: { store: ValueStore<string> | null }) {
  const value = useStoreValue(store, (s) => s.get(), 'none');
  return <span>{value}</span>;
}

describe('EZD-1906a useStoreValue', () => {
  it('reads the store through select', () => {
    const store = createValueStore('ceiling');
    expect(renderToStaticMarkup(<Reader store={store} />)).toBe('<span>ceiling</span>');
    store.set('floor');
    expect(renderToStaticMarkup(<Reader store={store} />)).toBe('<span>floor</span>');
  });

  it('shows the fallback while there is no store', () => {
    expect(renderToStaticMarkup(<Reader store={null} />)).toBe('<span>none</span>');
  });
});
