// EZD-1913c (editor plan 5.3 "features plug in"; 2.1 "Sheets screen (panel, canvas, status)"): the Sheets screen as a
// registry feature, moved unchanged out of ProjectEditor.
// - EZD-702a (S13 Entry points "Header tab Sheets"): the Sheets screen covers the plan like 3D; the tab shows with the
//   plan alone too (no plan canvas needed). Its module and store are made on the first press of Sheets and kept while
//   the editor is open, so the open sheet stays on a return. One wrapper on every tab, so a switch to Sheets and back
//   never remounts the plan canvas: while Sheets shows the plan is mounted but not shown.
// - EZD-702b (AC-EZD-702b-2): the screen draws its open sheet from the model (the routed store, EZD-5605) only while
//   Sheets is shown.
// - EZD-717: Issue drains the outbox first, so the issued checkpoint holds the latest edits (as Send does); a set
//   issued on the Sheets screen moves the header to "Rev N issued" at once (board S13Sheets header "Working copy · Rev
//   0 issued"; the page's issued number, read by features/versions.tsx).
// - EZD-719: a client send numbered Rev N shows at once in the header and the Sheets screen's revision log.
// - EZD-1991 (Q-0813; Settings > Title block "Open Sheets"): `?view=sheets` opens the editor on its Sheets screen.
import { useEffect, useMemo, useState } from 'react';
import type { SheetsScreen } from '../../lazy/sheets-screen';
import { lazyModule } from '../../lib/lazy/lazy-module';
import { withScreenMessages } from '../../lib/messages/screen-messages';
import { lazyPart, useLazy } from '../shared/lazy-part';
import { newerVersionNo } from '../version-label';
import type { EditorFeature, EditorFeatureContext } from './types';

// EZD-702a (11 Budgets; 11 rule 7): the Sheets screen loads when the Sheets tab is first pressed.
const sheetsScreenModule = lazyModule(() =>
  withScreenMessages(
    import('../../lib/messages/screens/sheets-screen.messages'),
    import('../../lazy/sheets-screen'),
  ),
);

// One part for the panel, canvas and status (EZD-120c B11: the entry's size).
const LazySheets = lazyPart(sheetsScreenModule, 'SheetsPart');

export type SheetsOwn = { readonly screen: SheetsScreen | null };

const ownOf = (ctx: EditorFeatureContext): SheetsOwn | undefined =>
  ctx.own?.get('sheets') as SheetsOwn | undefined;

const shows = (ctx: EditorFeatureContext): boolean =>
  ctx.ready !== undefined && ctx.chosenView === 'sheets';

function useSheetsOwn(ctx: EditorFeatureContext): SheetsOwn {
  const { page, projectId } = ctx;
  const routedStore = ctx.ready?.controllers.routed ?? null;
  const sync = ctx.ready?.session.sync ?? null;
  const showSheets = shows(ctx);
  const [opened, setOpened] = useState(ctx.props?.initialView === 'sheets');
  useEffect(
    () =>
      page?.viewPressed.add((v) => {
        if (v === 'sheets') setOpened(true);
      }),
    [page],
  );
  const mod = useLazy(sheetsScreenModule, opened);
  const screen = useMemo(
    () => (mod === undefined ? null : mod.createSheetsScreen(projectId)),
    [mod, projectId],
  );
  useEffect(() => {
    if (screen !== null) void screen.load();
  }, [screen]);
  // EZD-702b (AC-EZD-702b-2): the screen draws its open sheet from the model only while Sheets is shown.
  useEffect(() => {
    if (screen === null) return;
    screen.setModel(routedStore);
    return () => screen.setModel(null);
  }, [screen, routedStore]);
  useEffect(() => {
    screen?.setShown(showSheets);
  }, [screen, showSheets]);
  // EZD-717: Issue drains the outbox first, so the issued checkpoint holds the latest edits (as Send does).
  useEffect(() => {
    if (screen === null) return;
    screen.setSync(sync);
    return () => screen.setSync(null);
  }, [screen, sync]);
  // EZD-717: a set issued on the Sheets screen moves the header to "Rev N issued" at once.
  useEffect(() => {
    if (screen === null || page === undefined) return;
    const read = () => {
      let max: number | null = null;
      for (const r of screen.get().issue.revisions)
        if (max === null || r.revNo > max) max = r.revNo;
      page.issuedNo.set(newerVersionNo(page.issuedNo.get(), max));
    };
    read();
    return screen.subscribe(read);
  }, [screen, page]);
  // EZD-719: a client send numbered Rev N shows at once in the header and the Sheets screen's revision log.
  useEffect(
    () =>
      page?.revSent.add((rev) => {
        page.issuedNo.set(newerVersionNo(page.issuedNo.get(), rev));
        if (screen !== null) void screen.reloadIssue();
      }),
    [screen, page],
  );
  useEffect(() => (screen === null ? undefined : () => screen.dispose()), [screen]);
  return { screen };
}

export const feature: EditorFeature = {
  id: 'sheets',
  order: 550,
  active: shows,
  useOwn: useSheetsOwn,
  screen: { view: 'sheets', shows, hidesPlan: true },
  screenCanvas: (ctx) => {
    const screen = ownOf(ctx)?.screen ?? null;
    return screen && <LazySheets part="canvas" screen={screen} />;
  },
  screenLeftPanel: (ctx) => {
    const screen = ownOf(ctx)?.screen ?? null;
    return screen && <LazySheets part="panel" screen={screen} canEdit={ctx.mayEdit} />;
  },
  screenStatusStart: (ctx) => {
    const screen = ownOf(ctx)?.screen ?? null;
    return screen && <LazySheets part="start" screen={screen} />;
  },
  screenStatusEnd: (ctx) => {
    const screen = ownOf(ctx)?.screen ?? null;
    return screen && <LazySheets part="end" screen={screen} />;
  },
};
