// EZD-1910 (AC-EZD-1910-1; editor plan R11, L4) one helper for the editor's lazy parts. Expected behaviour: the
// `Lazy*` wrappers it replaces (ProjectEditor.tsx before EZD-1910): nothing shows until the module is there, then the
// named export with the same props; the inspector draws its empty panel from the entry until then (EZD-214), and the
// first press or key fetches its module without a React commit (11 rule 4). Markup through renderToStaticMarkup
// (React's server snapshot); no browser.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { LazyModule } from '../../lib/lazy/lazy-module';
import { lazyModule } from '../../lib/lazy/lazy-module';
import { lazyPart, preloadOnFirstInput } from './lazy-part';

const parts = {
  Greeting: ({ name }: { name: string }) => <b>hello {name}</b>,
  Count: ({ n }: { n: number }) => <i>{n}</i>,
};

/** A module that is already there (`peek` returns it) or not yet (`peek` returns undefined). */
function fakeModule<T>(value: T | undefined): LazyModule<T> & { load: ReturnType<typeof vi.fn> } {
  return {
    load: vi.fn(() => (value ? Promise.resolve(value) : new Promise<T>(() => {}))),
    preload: () => {},
    peek: () => value,
  };
}

describe('EZD-1910 lazyPart', () => {
  it('draws the named export with the same props once the module is there', () => {
    const Greeting = lazyPart(fakeModule(parts), 'Greeting');
    const Count = lazyPart(fakeModule(parts), 'Count');
    expect(renderToStaticMarkup(<Greeting name="Ana" />)).toBe('<b>hello Ana</b>');
    expect(renderToStaticMarkup(<Count n={3} />)).toBe('<i>3</i>');
  });

  it('draws nothing while the module is not there', () => {
    const Greeting = lazyPart(fakeModule<typeof parts>(undefined), 'Greeting');
    expect(renderToStaticMarkup(<Greeting name="Ana" />)).toBe('');
  });

  it('draws the fallback while the module is not there, and the part once it is', () => {
    const Empty = () => <p>empty</p>;
    const Missing = lazyPart(fakeModule<typeof parts>(undefined), 'Greeting', { fallback: Empty });
    const Present = lazyPart(fakeModule(parts), 'Greeting', { fallback: Empty });
    expect(renderToStaticMarkup(<Missing name="Ana" />)).toBe('<p>empty</p>');
    expect(renderToStaticMarkup(<Present name="Ana" />)).toBe('<b>hello Ana</b>');
  });

  it('draws through a render function for parts that pick or combine exports', () => {
    const Both = lazyPart(fakeModule(parts), (mod, props: { name: string; n: number }) => (
      <>
        <mod.Greeting name={props.name} />
        <mod.Count n={props.n} />
      </>
    ));
    expect(renderToStaticMarkup(<Both name="Bo" n={2} />)).toBe('<b>hello Bo</b><i>2</i>');
  });

  it('a module loaded before it is wanted still shows (the menus stay once loaded, EZD-233)', () => {
    const Greeting = lazyPart(fakeModule(parts), 'Greeting', { useWanted: () => false });
    expect(renderToStaticMarkup(<Greeting name="Ana" />)).toBe('<b>hello Ana</b>');
  });

  it('shows a module that finished loading after the part was made (the inspector after the first press)', async () => {
    const mod = lazyModule(() => Promise.resolve(parts));
    const Greeting = lazyPart(mod, 'Greeting', { useWanted: () => false });
    expect(renderToStaticMarkup(<Greeting name="Ana" />)).toBe('');
    await mod.load();
    expect(renderToStaticMarkup(<Greeting name="Ana" />)).toBe('<b>hello Ana</b>');
  });
});

describe('EZD-1910 preloadOnFirstInput (EZD-214 inspector)', () => {
  it('the first press fetches the module once; later presses and keys do nothing', () => {
    const target = new EventTarget();
    const mod = fakeModule<typeof parts>(undefined);
    preloadOnFirstInput(target, mod);
    expect(mod.load).not.toHaveBeenCalled();
    target.dispatchEvent(new Event('pointerdown'));
    expect(mod.load).toHaveBeenCalledTimes(1);
    target.dispatchEvent(new Event('pointerdown'));
    target.dispatchEvent(new Event('keydown'));
    expect(mod.load).toHaveBeenCalledTimes(1);
  });

  it('the first key fetches the module too', () => {
    const target = new EventTarget();
    const mod = fakeModule<typeof parts>(undefined);
    preloadOnFirstInput(target, mod);
    target.dispatchEvent(new Event('keydown'));
    expect(mod.load).toHaveBeenCalledTimes(1);
  });

  it('a stop before any input leaves the module unloaded', () => {
    const target = new EventTarget();
    const mod = fakeModule<typeof parts>(undefined);
    const stop = preloadOnFirstInput(target, mod);
    stop();
    target.dispatchEvent(new Event('pointerdown'));
    expect(mod.load).not.toHaveBeenCalled();
  });

  it('a failed fetch is not thrown', async () => {
    const target = new EventTarget();
    const mod = { load: vi.fn(() => Promise.reject(new Error('offline'))), preload() {}, peek: () => undefined };
    preloadOnFirstInput(target, mod);
    target.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    expect(mod.load).toHaveBeenCalledTimes(1);
  });
});
