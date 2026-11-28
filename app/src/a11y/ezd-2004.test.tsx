// EZD-2004 (AC-EZD-2004-1, AC-EZD-2004-2, AC-EZD-2004-3; vault/plans/audit-a11y-ipad-2026-11-27.md A11, A12, A14, A19, A28, A29): the spoken
// names and markup the audit asks for, from static markup (the unit tests have no DOM; the keyboard paths and focus
// are in e2e/ezd-2004-keyboard-screen-reader.spec.ts). Expected text is the wording recorded for Josh in
// vault/build/assumptions/EZD-2004.md (English and Spanish), and the lengths are the geometry's 1/16" display
// (packages/geometry length.test.ts T14: 150.5 is 12' 6 1/2"; 123.3125 is 10' 3 5/16"; 0.625 is 5/8").
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessagesProvider } from '../lib/messages';
import { catalogFor } from '../server/messages/catalog';
import { createT } from '../lib/messages/t';
import type { Message } from '../lib/messages/types';
import type { MessageKey } from '../server/messages/catalog';
import { Keypad } from '../field-measure/Keypad';
import { ShapeCanvas } from '../field-measure/ShapeCanvas';
import { ReadyBody, type ImportReviewData } from '../editor/import-review/ImportReview';
import type { ReviewItem } from '../lib/imports/review';
import { InlineDialog, isInsideInlineDialog } from './InlineDialog';
import { spokenLength } from './spoken-length';
import { startLongPress } from './long-press';
import { PickerMenu } from '../components/projects/CustomerPicker';
import { defaultSheetSet } from '../lib/sheets/sheet-set';
import { createSheetsScreen } from '../lazy/sheets-screen/sheets-screen-store';
import { SheetsPanel } from '../lazy/sheets-screen/SheetsPanel';

const field = (ui: ReactElement, language: 'en' | 'es' = 'en') =>
  renderToStaticMarkup(
    <MessagesProvider language={language} messages={catalogFor('field', language)}>
      {ui}
    </MessagesProvider>,
  );
const office = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {ui}
    </MessagesProvider>,
  );
const labelOf = (html: string, attr: string) =>
  html.match(new RegExp(`<button[^>]*${attr}[^>]*>`))?.[0].match(/aria-label="([^"]*)"/)?.[1];

describe('EZD-2004 A12 keypad keys have spoken names', () => {
  it('AC-EZD-2004-2: feet, inches and space are named in English and Spanish; digits and fractions read as they are', () => {
    const en = field(<Keypad disabled={false} onKey={() => {}} onNext={() => {}} />);
    expect(labelOf(en, 'data-key="&#x27;"')).toBe('Feet');
    expect(labelOf(en, 'data-key="&quot;"')).toBe('Inches');
    expect(labelOf(en, 'data-key="sp"')).toBe('Space');
    expect(labelOf(en, 'data-key="back"')).toBe('Backspace');
    expect(labelOf(en, 'data-key="7"')).toBeUndefined();
    expect(labelOf(en, 'data-key="1/2"')).toBeUndefined();
    const es = field(<Keypad disabled={false} onKey={() => {}} onNext={() => {}} />, 'es');
    expect(labelOf(es, 'data-key="&#x27;"')).toBe('Pies');
    expect(labelOf(es, 'data-key="&quot;"')).toBe('Pulgadas');
    expect(labelOf(es, 'data-key="sp"')).toBe('Espacio');
  });
});

describe('EZD-2004 A11 wall buttons say their length', () => {
  it('AC-EZD-2004-2: spokenLength reads the marks as words in English and Spanish', () => {
    const en = createT('en', catalogFor('field', 'en') as Readonly<Record<MessageKey, Message>>);
    const es = createT('es', catalogFor('field', 'es') as Readonly<Record<MessageKey, Message>>);
    expect(spokenLength(150.5, en)).toBe('12 feet 6 1/2 inches');
    expect(spokenLength(123.3125, en)).toBe('10 feet 3 5/16 inches');
    expect(spokenLength(0.625, en)).toBe('5/8 inches');
    expect(spokenLength(150.5, es)).toBe('12 pies 6 1/2 pulgadas');
  });

  it('a measured wall has its length in its name; a wall not measured is named by its letter', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const canvas = (language: 'en' | 'es') =>
      field(
        <ShapeCanvas
          corners={square}
          closed
          freeMode={false}
          lengths={[150.5, null, null, null]}
          selected={0}
          editable
          onSelect={() => {}}
          onTap={() => {}}
        />,
        language,
      );
    const en = canvas('en');
    expect(labelOf(en, 'data-wall="A"')).toBe('Wall A, 12 feet 6 1/2 inches');
    expect(labelOf(en, 'data-wall="B"')).toBe('Wall B');
    const es = canvas('es');
    expect(labelOf(es, 'data-wall="A"')).toBe('Pared A, 12 pies 6 1/2 pulgadas');
    expect(labelOf(es, 'data-wall="B"')).toBe('Pared B');
  });
});

describe("EZD-2004 A14 the field wrapper says the user's language", () => {
  afterEach(() => {
    vi.doUnmock('../server/messages/request-language');
    vi.resetModules();
  });

  const layout = async (read: () => Promise<string>) => {
    vi.resetModules();
    vi.doMock('../server/messages/request-language', () => ({ getRequestLanguage: read }));
    const { default: FieldLayout } = await import('../app/(field)/layout');
    return renderToStaticMarkup((await FieldLayout({ children: <i data-c="" /> })) as ReactElement);
  };

  it('AC-EZD-2004-2: a Spanish crew member gets lang="es"; English stays "en"', async () => {
    expect(await layout(async () => 'es')).toMatch(/<div data-entry="field" lang="es"/);
    expect(await layout(async () => 'en')).toMatch(/<div data-entry="field" lang="en"/);
  });

  it('signed out (no user to read) it is English', async () => {
    const html = await layout(async () => {
      throw new Error('not_signed_in');
    });
    expect(html).toMatch(/<div data-entry="field" lang="en"/);
    expect(html).toContain('data-c');
  });
});

describe('EZD-2004 A28 InlineDialog', () => {
  it('is a modal Radix dialog drawn in place, named by its label, with the marker the screens check', () => {
    const html = office(
      <section data-testid="host">
        <InlineDialog
          onClose={() => {}}
          aria-label="Cabinet schedule"
          className="layer"
          data-testid="d"
        >
          <button type="button">Close</button>
        </InlineDialog>
      </section>,
    );
    const open = html.match(/<div[^>]*data-testid="d"[^>]*>/)?.[0] ?? '';
    expect(open).toContain('role="dialog"');
    expect(open).toContain('aria-modal="true"');
    expect(open).toContain('aria-label="Cabinet schedule"');
    expect(open).toContain('data-inline-dialog=""');
    expect(open).toContain('class="layer"');
    // Drawn where it sits (no portal): inside its host.
    expect(html).toMatch(/<section data-testid="host">.*data-testid="d"/s);
  });

  it('a non-modal one (the conflict list) is not aria-modal', () => {
    const html = office(
      <InlineDialog onClose={() => {}} modal={false} aria-label="Changes not saved" data-testid="d">
        <p>x</p>
      </InlineDialog>,
    );
    expect(html.match(/<div[^>]*data-testid="d"[^>]*>/)?.[0]).not.toContain('aria-modal');
  });

  it('isInsideInlineDialog finds the marker on an ancestor', () => {
    // No DOM here: a stand-in Element whose closest() answers for the marker.
    class FakeElement {
      constructor(private inside: boolean) {}
      closest(sel: string) {
        return sel === '[data-inline-dialog]' && this.inside ? this : null;
      }
    }
    vi.stubGlobal('Element', FakeElement);
    try {
      expect(isInsideInlineDialog(new FakeElement(true) as unknown as Element)).toBe(true);
      expect(isInsideInlineDialog(new FakeElement(false) as unknown as Element)).toBe(false);
      expect(isInsideInlineDialog(null)).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('EZD-2004 A29 the import review row says its state', () => {
  const wall = (id: string, n: number, c: number): ReviewItem => ({
    id,
    type: 'wall',
    number: n,
    side: 'south',
    confidence: c,
    geometry: { start: { x: 0, y: 0 }, end: { x: 144, y: 0 } },
    thickness: 4.5,
  });
  const review = (over: Partial<ImportReviewData>): ImportReviewData => ({
    jobId: 'j',
    projectId: 'p',
    projectName: 'Family room',
    status: 'ready',
    files: [{ name: 'family-room.dxf', kind: 'polycam_dxf' }],
    failedFile: null,
    items: [wall('w1', 1, 60), wall('w2', 2, 60), wall('w3', 3, 60)],
    meshUrl: null,
    cutoff: 80,
    ...over,
  });

  it('To check, Accepted and Rejected are in the row, hidden from sight, and the dot is hidden from screen readers', () => {
    const html = office(
      <ReadyBody
        review={review({ decisions: { w2: 'accepted', w3: 'rejected' } })}
        initialMode="by_room"
      />,
    );
    const states = [...html.matchAll(/data-testid="import-review-row-state">([^<]*)</g)].map(
      (m) => m[1],
    );
    expect(states).toContain('To check');
    expect(states).toContain('Accepted');
    expect(states).toContain('Rejected');
    const rows = [...html.matchAll(/data-testid="import-review-row"[\s\S]*?<\/button>/g)].map(
      (m) => m[0],
    );
    expect(rows.length).toBe(3);
    for (const row of rows) expect(row).toMatch(/<span class="[^"]*dot[^"]*" aria-hidden="true">/);
  });
});

describe('EZD-2004 A19 finger hold', () => {
  type Listener = (e: { pointerId: number; clientX: number; clientY: number }) => void;
  const fakeWindow = () => {
    const on = new Map<string, Set<Listener>>();
    const w = {
      addEventListener: (type: string, fn: Listener) => {
        if (!on.has(type)) on.set(type, new Set());
        on.get(type)!.add(fn);
      },
      removeEventListener: (type: string, fn: Listener) => on.get(type)?.delete(fn),
      fire: (type: string, e: { pointerId: number; clientX: number; clientY: number }) =>
        [...(on.get(type) ?? [])].forEach((fn) => fn(e)),
      count: () => [...on.values()].reduce((n, s) => n + s.size, 0),
    };
    vi.stubGlobal('window', w);
    return w;
  };
  const OPTS = { ms: 500, slop: 10 };
  const start = { pointerId: 3, clientX: 100, clientY: 100 };

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('held still for 500 ms it fires once, where the finger is, and stops listening', () => {
    vi.useFakeTimers();
    const w = fakeWindow();
    const hold = vi.fn();
    startLongPress(start, hold, OPTS);
    w.fire('pointermove', { pointerId: 3, clientX: 104, clientY: 103 });
    vi.advanceTimersByTime(499);
    expect(hold).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(hold).toHaveBeenCalledWith(104, 103);
    expect(w.count()).toBe(0);
  });

  it('lifting, moving more than 10 px, a second finger or stop() before 500 ms opens nothing', () => {
    vi.useFakeTimers();
    const w = fakeWindow();
    const cases: ((stop: () => void) => void)[] = [
      () => w.fire('pointerup', { pointerId: 3, clientX: 100, clientY: 100 }),
      () => w.fire('pointercancel', { pointerId: 3, clientX: 100, clientY: 100 }),
      () => w.fire('pointermove', { pointerId: 3, clientX: 111, clientY: 100 }),
      () => w.fire('pointerdown', { pointerId: 4, clientX: 300, clientY: 300 }),
      (stop) => stop(),
    ];
    for (const end of cases) {
      const hold = vi.fn();
      const stop = startLongPress(start, hold, OPTS);
      vi.advanceTimersByTime(200);
      end(stop);
      vi.advanceTimersByTime(1000);
      expect(hold).not.toHaveBeenCalled();
      expect(w.count()).toBe(0);
    }
  });

  it('another finger moving or lifting does not stop it', () => {
    vi.useFakeTimers();
    const w = fakeWindow();
    const hold = vi.fn();
    startLongPress(start, hold, OPTS);
    w.fire('pointermove', { pointerId: 9, clientX: 400, clientY: 400 });
    w.fire('pointerup', { pointerId: 9, clientX: 400, clientY: 400 });
    vi.advanceTimersByTime(500);
    expect(hold).toHaveBeenCalledTimes(1);
  });
});

describe('EZD-2004 A29 a sheet row says its state', () => {
  it('each row carries the legend text of its dot, hidden from sight', async () => {
    const sheets = defaultSheetSet(['rcp']);
    const screen = createSheetsScreen(
      '00000000-0000-4000-8000-000000000001',
      async () =>
        new Response(
          JSON.stringify({
            sets: [
              {
                id: null,
                kind: 'permit',
                size: '24x36',
                keyPlacement: 'every_sheet',
                lastIssuedVersionId: null,
                sheets,
              },
            ],
          }),
          { status: 200 },
        ),
    );
    await screen.load();
    const html = office(<SheetsPanel screen={screen} canEdit={false} />);
    const rows = [...html.matchAll(/data-testid="sheet-row-[^"]+"[\s\S]*?<\/button>/g)].map(
      (m) => m[0],
    );
    expect(rows.length).toBe(sheets.length);
    for (const row of rows)
      expect(row).toMatch(/data-testid="sheet-row-state">(Ready to issue|Needs approval)</);
  });
});

describe('EZD-2004 A30 the New project customer search is named', () => {
  it('the search box has the placeholder text as its name', () => {
    const html = office(<PickerMenu value={null} onPick={() => {}} />);
    const input =
      html.match(/<input[^>]*data-testid="new-project-customer-search"[^>]*>/)?.[0] ?? '';
    expect(input).toContain('placeholder="Search customers"');
    expect(input).toContain('aria-label="Search customers"');
  });
});
