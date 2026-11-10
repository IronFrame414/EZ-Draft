// EZD-217 L1 (vault/plans/EZD-217.md section 3 B1, B2, section 4; Decided "Keys wiring", "Bar"; Q-0633 G13;
// AC-EZD-217-9, -12, -16). No DOM environment here: the layer's hooks are captured by a mock of `react` while
// `capture` is set, and the window is an EventTarget; the bar is rendered to static markup.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import type { EditController, EditUi } from '../edit/edit-controller';
import { EditBar, SelectionLayer } from './SelectionLayer';
import type { SelectionController } from './selection-controller';

const hooks = vi.hoisted(() => ({
  capture: null as null | { effects: (() => void | (() => void))[] },
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: (fn: () => void | (() => void), deps?: unknown[]) => {
      if (hooks.capture) hooks.capture.effects.push(fn);
      else actual.useEffect(fn, deps);
    },
    useRef: (initial: unknown) => (hooks.capture ? { current: initial } : actual.useRef(initial)),
  };
});

function selectionFake() {
  return {
    getUi: vi.fn(() => ({ ids: [] as string[], selectMore: false })),
    getBox: vi.fn(() => null),
    subscribe: vi.fn(() => () => {}),
    onBox: vi.fn(() => () => {}),
    keyDown: vi.fn(() => false),
    selectTool: vi.fn(),
    selectAll: vi.fn(),
    setSelectMore: vi.fn(),
    select: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  };
}

const NONE: EditUi = {
  canEdit: false,
  canUndo: false,
  canRedo: false,
  hasSelection: false,
  hasClip: false,
};

function editFake(ui: EditUi = NONE) {
  const state = { ui };
  return {
    state,
    getUi: vi.fn(() => state.ui),
    subscribe: vi.fn(() => () => {}),
    keyDown: vi.fn(() => false),
    undo: vi.fn(),
    redo: vi.fn(),
    deleteSelection: vi.fn(),
    copy: vi.fn(),
    paste: vi.fn(),
    duplicate: vi.fn(),
    dispose: vi.fn(),
  };
}

function mountLayer(
  selection: ReturnType<typeof selectionFake>,
  edit: ReturnType<typeof editFake>,
) {
  const target = new EventTarget();
  vi.stubGlobal('window', target);
  hooks.capture = { effects: [] };
  SelectionLayer({
    selection: selection as unknown as SelectionController,
    edit: edit as unknown as EditController,
  });
  const effects = hooks.capture.effects;
  hooks.capture = null;
  const cleanups = effects.map((fn) => fn());
  return {
    press(key: string) {
      const e = new Event('keydown', { cancelable: true });
      Object.assign(e, { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });
      target.dispatchEvent(e);
      return e;
    },
    unmount() {
      for (const c of cleanups) if (typeof c === 'function') c();
    },
  };
}

function barHtml(selection: ReturnType<typeof selectionFake>, edit?: ReturnType<typeof editFake>) {
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <EditBar
        selection={selection as unknown as SelectionController}
        {...(edit ? { edit: edit as unknown as EditController } : {})}
      />
    </MessagesProvider>,
  );
}

const EDIT_IDS = /data-testid="edit-(?:undo|redo|delete|duplicate|copy|paste)"/g;
const count = (html: string) => (html.match(EDIT_IDS) ?? []).length;

afterEach(() => {
  hooks.capture = null;
  vi.unstubAllGlobals();
});

describe('EZD-217 selection layer and bar', () => {
  it('EZD-217 L1 the layer gives keys to edit first and shows the six buttons only to editors', () => {
    const selection = selectionFake();
    const edit = editFake();
    const layer = mountLayer(selection, edit);

    edit.keyDown.mockReturnValueOnce(true);
    const del = layer.press('Delete');
    expect(edit.keyDown).toHaveBeenCalledTimes(1);
    expect(selection.keyDown).not.toHaveBeenCalled();
    expect(del.defaultPrevented).toBe(true);

    edit.keyDown.mockReturnValueOnce(false);
    layer.press('Escape');
    expect(edit.keyDown).toHaveBeenCalledTimes(2);
    expect(selection.keyDown).toHaveBeenCalledTimes(1);
    expect(edit.keyDown.mock.invocationCallOrder[1]!).toBeLessThan(
      selection.keyDown.mock.invocationCallOrder[0]!,
    );
    layer.unmount();

    expect(count(barHtml(selectionFake()))).toBe(0);
    expect(count(barHtml(selectionFake(), editFake()))).toBe(0);

    const editor = editFake({ ...NONE, canEdit: true });
    const html = barHtml(selectionFake(), editor);
    expect(count(html)).toBe(6);
    for (const name of ['undo', 'redo', 'delete', 'duplicate', 'copy', 'paste']) {
      const at = html.indexOf(`data-testid="edit-${name}"`);
      const start = html.lastIndexOf('<button', at);
      const tag = html.slice(start, html.indexOf('>', at) + 1);
      expect(tag, name).toContain('disabled=""');
    }
  });
});
