// EZD-1910 (editor plan R11, lever L4; 11 rule 7 "Load code on first use"): one helper for the editor's lazy parts,
// in place of a hand-written `Lazy*` wrapper per part. Call `lazyPart` at module level only: a call during render
// makes a new component each time, and React would remount the part on every render.
import { createElement, useEffect, useState, type JSXElementConstructor, type ReactNode } from 'react';
import type { LazyModule } from '../../lib/lazy/lazy-module';

// EZD-233: the module loads while `wanted`; nothing shows for the moment it downloads, and a failed download is tried
// again the next time it is wanted.
export function useLazy<T>(module: LazyModule<T>, wanted = true): T | undefined {
  const [mod, setMod] = useState(() => module.peek());
  useEffect(() => {
    if (mod || !wanted) return;
    let live = true;
    module.load().then(
      (m) => {
        if (live) setMod(m);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [module, mod, wanted]);
  return mod;
}

// EZD-214 (11 rule 4: a pan makes no commit): the first press or key anywhere fetches the module without a React
// commit; the next render that happens anyway shows the part (see `module.peek()` in the part below).
// Capture as an options object: Node's EventTarget reads a bare `true` on remove as no capture.
const CAPTURE = { capture: true } as const;

export function preloadOnFirstInput(target: EventTarget, module: LazyModule<unknown>): () => void {
  const stop = () => {
    target.removeEventListener('pointerdown', first, CAPTURE);
    target.removeEventListener('keydown', first, CAPTURE);
  };
  function first() {
    stop();
    module.load().catch(() => {});
  }
  target.addEventListener('pointerdown', first, CAPTURE);
  target.addEventListener('keydown', first, CAPTURE);
  return stop;
}

function usePreloadOnFirstInput(module: LazyModule<unknown>, on: boolean) {
  useEffect(() => {
    if (!on || module.peek() !== undefined) return;
    return preloadOnFirstInput(window, module);
  }, [module, on]);
}

export type LazyPartOptions<P> = {
  /** Whether the part wants its module now (it may read a store, so it runs as a hook). Default: always. */
  useWanted?: (props: P) => boolean;
  /** Drawn while the module is not there yet. Default: nothing. */
  fallback?: JSXElementConstructor<P>;
  /** Fetch the module on the first press or key in the page, before the part wants it. */
  preloadOnFirstInput?: boolean;
};

type AnyPart = JSXElementConstructor<never>;
type PartNames<M> = { [K in keyof M]: M[K] extends AnyPart ? K : never }[keyof M];
type PartProps<M, K extends keyof M> = M[K] extends JSXElementConstructor<infer P> ? P : never;

const alwaysWanted = () => true;

/** A component that draws `module`'s export `name` (or `render(module, props)`) once the module is there. */
export function lazyPart<M, K extends PartNames<M>>(
  module: LazyModule<M>,
  name: K,
  options?: LazyPartOptions<PartProps<M, K>>,
): (props: PartProps<M, K>) => ReactNode;
export function lazyPart<M, P extends object>(
  module: LazyModule<M>,
  render: (mod: M, props: P) => ReactNode,
  options?: LazyPartOptions<P>,
): (props: P) => ReactNode;
export function lazyPart<M, P extends object>(
  module: LazyModule<M>,
  part: PropertyKey | ((mod: M, props: P) => ReactNode),
  { useWanted = alwaysWanted, fallback: Fallback, preloadOnFirstInput: preload = false }: LazyPartOptions<P> = {},
): (props: P) => ReactNode {
  const draw =
    typeof part === 'function'
      ? part
      : (mod: M, props: P) => createElement(mod[part as keyof M] as unknown as JSXElementConstructor<P>, props);
  return function LazyPart(props: P) {
    usePreloadOnFirstInput(module, preload);
    const mod = useLazy(module, useWanted(props)) ?? module.peek();
    if (mod) return draw(mod, props);
    return Fallback ? createElement(Fallback, props) : null;
  };
}
