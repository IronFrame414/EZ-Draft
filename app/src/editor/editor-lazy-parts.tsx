// EZD-1914 (editor plan 5.2 job 5): the editor page's own lazy parts, moved unchanged out of ProjectEditor.
// EZD-1910 (editor plan R11, L4): every lazy part below is one `lazyPart` call (shared/lazy-part.tsx); nothing shows
// for the moment a module downloads, and a failed download is tried again the next time the part is wanted.
import { useSyncExternalStore } from 'react';
import { useCoarsePointer } from '../lib/device/useDeviceLayout';
import { lazyModule } from '../lib/lazy/lazy-module';
import type { InspectorPanelProps } from '../lazy/inspector-panel';
import { InspectorEmpty } from './inspector/InspectorEmpty';
import { editMenuModule } from './shared/edit-menu-module';
import { lazyPart } from './shared/lazy-part';
import { fixturesModule } from './tools/fixtures-module';

// EZD-214 (11 Budgets; EZD-120c B11): the inspector panel loads on the first press or key in the editor, or when
// something is selected; until then the empty inspector is drawn from the entry.
const inspectorModule = lazyModule(() => import('../lazy/inspector-panel'));

function useSomethingSelected({ selection }: InspectorPanelProps) {
  return useSyncExternalStore(
    selection.subscribe,
    () => selection.getUi().ids.length > 0,
    () => false,
  );
}

function InspectorPlaceholder() {
  return <InspectorEmpty coarse={useCoarsePointer()} />;
}

export const LazyInspectorPanel = lazyPart(inspectorModule, 'InspectorPanel', {
  useWanted: useSomethingSelected,
  fallback: InspectorPlaceholder,
  preloadOnFirstInput: true,
});

// EZD-233 (11 Budgets): the tablet edit bar loads on touch screens only.
const editBarModule = lazyModule(() => import('../lazy/edit-bar'));

export const LazyEditBar = lazyPart(editBarModule, 'EditBar');

// EZD-233: the menus load when one first opens and then stay (shared/edit-menu-module.ts).
export const LazyEditMenus = lazyPart(editMenuModule, 'EditMenus', {
  useWanted: (props) => props.request !== null,
});

// EZD-237: the benchmark runner loads only with `?benchmark=run` (the Benchmark card's frame).
const benchmarkRunnerModule = lazyModule(() => import('../lazy/benchmark-runner'));

export const LazyBenchmarkRunner = lazyPart(benchmarkRunnerModule, 'BenchmarkRunner');

// EZD-1985 (Q-0809 (a)): the Fixtures panel in the inspector place, from the module the Fixtures tool loads.
export const LazyFixturesPanel = lazyPart(fixturesModule, 'FixturesPanel');
