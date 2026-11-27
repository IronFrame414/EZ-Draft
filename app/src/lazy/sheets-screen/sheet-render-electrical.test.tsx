// EZD-708b (S06/09a "Every electrical sheet carries the note that the electrical contractor of record verifies the
// design"; R7 the preview draws what the PDF prints): the open panel sheet (E2.0), which has no viewport, is still
// drawn, and through the real renderer its drawing is the EC note.
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { createModelStore } from '../../editor/model/model-store';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { EC_NOTE_TEXT } from '../../lib/sheets/electrical-kinds';
import { defaultSheetSet, type SheetSetSummary } from '../../lib/sheets/sheet-set';
import { runSheetJob } from '../../workers/sheet-job';
import { createSheetRenderer } from '../sheets';
import { createSheetsScreen } from './sheets-screen-store';

const PROJECT = '00000000-0000-4000-8000-000000000001';
const FLOOR = '11111111-1111-4111-8111-111111111111';
const SETS: SheetSetSummary[] = [
  {
    id: null,
    kind: 'permit',
    size: '24x36',
    keyPlacement: 'every_sheet',
    lastIssuedVersionId: null,
    sheets: defaultSheetSet([]),
  },
];
const floor: ObjectValue = {
  type: 'floor',
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data: { name: 'Floor 1', order: 1 },
};
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

describe('EZD-708b the panel sheet preview', () => {
  it('E2.0 has no viewport and still draws the EC note', async () => {
    const store = createModelStore({ objects: new Map([[FLOOR, floor]]) });
    const renderer = createSheetRenderer((input) => runSheetJob(input));
    const screen = createSheetsScreen(
      PROJECT,
      async () => new Response(JSON.stringify({ sets: SETS }), { status: 200 }),
      { loadRenderer: async () => renderer },
    );
    await screen.load();
    screen.setModel(store);
    screen.setShown(true);
    screen.open('E2.0');
    await settle();
    expect(screen.get().drawing?.sheet).toBe('E2.0');
    expect(screen.get().drawing?.markup).toContain(`>${EC_NOTE_TEXT}</text>`);
  });
});
