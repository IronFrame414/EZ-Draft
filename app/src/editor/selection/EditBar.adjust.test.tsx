// EZD-5605 T18 (vault/plans/EZD-5605.md section 4; D-Tools off; Q-0640 row 120; AC-EZD-5605-8): while an Assistant
// preview is adjusted the tablet bar greys Duplicate, Copy and Paste; Undo, Redo, Delete, Select more and Select all
// stay as usual. Static markup, as SelectionLayer.edit.test.tsx.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import type { EditController, EditUi } from '../edit/edit-controller';
import { EditBar } from './EditBar';
import type { SelectionController } from './selection-controller';

const UI: EditUi = {
  canEdit: true,
  canUndo: true,
  canRedo: true,
  hasSelection: true,
  hasClip: true,
};
const selection = {
  getUi: () => ({ ids: ['a'], selectMore: false }),
  subscribe: () => () => {},
  setSelectMore: vi.fn(),
  selectAll: vi.fn(),
} as unknown as SelectionController;
const edit = { getUi: () => UI, subscribe: () => () => {} } as unknown as EditController;

const bar = (clipboardOff?: boolean) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <EditBar selection={selection} edit={edit} clipboardOff={clipboardOff} />
    </MessagesProvider>,
  );
const off = (html: string, id: string) =>
  /\sdisabled=""/.test(html.match(new RegExp(`<button[^>]*data-testid="${id}"[^>]*>`))![0]);
const IDS = [
  'edit-undo',
  'edit-redo',
  'edit-delete',
  'edit-duplicate',
  'edit-copy',
  'edit-paste',
  'select-more',
  'select-all',
];

describe('EZD-5605 edit bar during Adjust', () => {
  it('T18 Duplicate, Copy and Paste greyed; the rest as usual', () => {
    expect(IDS.map((id) => off(bar(true), id))).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(IDS.map((id) => off(bar(), id))).toEqual(IDS.map(() => false));
  });
});
