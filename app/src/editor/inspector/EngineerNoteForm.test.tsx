// EZD-215 (AC-EZD-215-4, -6, -3; phase-02.md:33 "engineer name and what was approved, required ... plus an optional
// PDF or image"; Q-0708 "Only the tick clears the warning, and it can be ticked only when the name and approval text
// are filled"; 09q Bearing rows 5, 6; S03:146 "without Edit model, view-only"; Q-0704 "the engineer letter needs its own
// source_file kind"). Markup through renderToStaticMarkup in the real office catalog, English, as PinPanel.test.tsx.
// The upload goes to EZD-132's in-memory TUS server and stubbed app routes (CLAUDE.md rule 5).
import { CURRENT_SCHEMA_VERSION, engineerRequired, type EngineerNoteData } from '@ezdraft/geometry';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { createFakeTus } from '../../../test-utils/storage/fake-tus';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { createModelStore } from '../model/model-store';
import { withWalls, baseObjects, F1, uid } from '../tools/test-utils/fixtures';
import { checkEngineerLetter, engineerLetterChange, engineerNoteChange } from './EngineerNoteForm';
import { InspectorPanel } from './InspectorPanel';
import { uploadPinPhoto } from './pin-photo';

const P = '11111111-1111-4111-8111-111111111111';
const FILE = '00000001-0000-4000-8000-000000000000';
const NOTE = uid(900);
const WALL = uid(1);

function noteValue(a: Partial<EngineerNoteData['attributes']> = {}): ObjectValue {
  return {
    type: 'engineer_note',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: {
      geometry: { start: { x: 0, y: 0 }, end: { x: 144, y: 0 } },
      status: 'existing',
      level: F1,
      attributes: {
        wallId: WALL,
        action: 'delete',
        engineerName: '',
        approvedText: '',
        fileId: null,
        letterOnFile: false,
        ...a,
      },
    },
  };
}

const withNote = (a: Partial<EngineerNoteData['attributes']> = {}) =>
  new Map(baseObjects()).set(NOTE, noteValue(a));

function render(
  ids: string[],
  objects: Map<string, ObjectValue>,
  o: { canEdit: boolean; projectId?: string },
) {
  const store = createModelStore({ objects });
  const ui = { ids, selectMore: false };
  const selection = { getUi: () => ui, subscribe: () => () => {}, onDoubleClick: () => () => {} };
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <InspectorPanel
        store={store}
        selection={selection}
        canEdit={o.canEdit}
        drawing={null}
        {...(o.projectId === undefined ? {} : { projectId: o.projectId })}
      />
    </MessagesProvider>,
  ).replace(/&#x27;/g, "'");
}

const dataOf = (v: ObjectValue | null) => v!.data as unknown as EngineerNoteData;

describe('EZD-215 engineer note save rules', () => {
  it('AC-4, 09q row 5: Save refuses an empty engineer name or approval text', () => {
    const objects = withNote();
    expect(
      engineerNoteChange(objects, NOTE, {
        engineerName: ' ',
        approvedText: 'Header',
        letterOnFile: false,
      }),
    ).toEqual({ ok: false, reason: 'name_required' });
    expect(
      engineerNoteChange(objects, NOTE, {
        engineerName: 'A. Engineer',
        approvedText: '',
        letterOnFile: true,
      }),
    ).toEqual({ ok: false, reason: 'approved_required' });
    expect(
      engineerNoteChange(objects, uid(999), {
        engineerName: 'A',
        approvedText: 'B',
        letterOnFile: false,
      }),
    ).toEqual({ ok: false, reason: 'not_found' });
  });

  it('Q-0708, 09q row 6: name and approval without the tick leave the warning on; the tick clears it', () => {
    const objects = withNote();
    const filled = engineerNoteChange(objects, NOTE, {
      engineerName: ' A. Engineer ',
      approvedText: 'Header 2-2x12',
      letterOnFile: false,
    });
    if (!filled.ok) throw new Error(filled.reason);
    const d = dataOf(filled.change.value);
    expect(d.attributes.engineerName).toBe('A. Engineer');
    expect(engineerRequired(d)).toBe(true);
    const ticked = engineerNoteChange(objects, NOTE, {
      engineerName: 'A. Engineer',
      approvedText: 'Header 2-2x12',
      letterOnFile: true,
    });
    if (!ticked.ok) throw new Error(ticked.reason);
    expect(engineerRequired(dataOf(ticked.change.value))).toBe(false);
    // The wall, the action and the line are kept as they were raised.
    expect(dataOf(ticked.change.value).attributes.wallId).toBe(WALL);
    expect(dataOf(ticked.change.value).geometry).toEqual(dataOf(noteValue()).geometry);
  });

  it('AC-4 the letter takes a PDF or an image; any other file is refused', () => {
    expect(checkEngineerLetter('letter.pdf', 10)).toEqual({
      ok: true,
      contentType: 'application/pdf',
    });
    expect(checkEngineerLetter('letter.JPG', 10)).toEqual({ ok: true, contentType: 'image/jpeg' });
    expect(checkEngineerLetter('letter.png', 10)).toEqual({ ok: true, contentType: 'image/png' });
    expect(checkEngineerLetter('letter.heic', 10)).toEqual({ ok: true, contentType: 'image/heic' });
    expect(checkEngineerLetter('letter.dxf', 10)).toEqual({ ok: false, reason: 'not_letter' });
    expect(checkEngineerLetter('letter.docx', 10)).toEqual({ ok: false, reason: 'not_letter' });
    expect(checkEngineerLetter('letter.pdf', 0)).toEqual({ ok: false, reason: 'empty' });
  });

  it('AC-4 the letter goes through the EZD-132 upload as kind engineer_letter, then the note takes its id', async () => {
    const calls: { path: string; body: unknown }[] = [];
    const tus = createFakeTus();
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.startsWith('/api/')) {
        calls.push({
          path: url,
          body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null,
        });
        if (url === `/api/projects/${P}/source-files`)
          return Response.json(
            {
              sourceFile: { id: FILE },
              upload: {
                bucket: 'sources',
                path: `t/${P}/${FILE}`,
                token: 'tok',
                url: 'https://storage.test/sign/1',
              },
            },
            { status: 201 },
          );
        if (url.endsWith('/complete')) return Response.json({ sourceFile: {} }, { status: 200 });
        return new Response(null, { status: 404 });
      }
      return tus.fetchImpl(input, init);
    };
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3]);
    const id = await uploadPinPhoto(
      P,
      { name: 'letter.pdf', blob: new Blob([pdf]), contentType: 'application/pdf' },
      { current: null },
      { fetchImpl, kind: 'engineer_letter' },
    );
    expect(id).toBe(FILE);
    expect(calls[0]).toEqual({
      path: `/api/projects/${P}/source-files`,
      body: {
        kind: 'engineer_letter',
        originalName: 'letter.pdf',
        contentType: 'application/pdf',
        size: 7,
      },
    });
    expect(calls[1]!.path).toBe(`/api/source-files/${FILE}/complete`);
    const c = engineerLetterChange(withNote(), NOTE, id);
    expect(dataOf(c!.value).attributes.fileId).toBe(FILE);
    expect(engineerRequired(dataOf(c!.value))).toBe(true);
  });
});

describe('EZD-215 engineer note inspector', () => {
  it('AC-4 with Edit model the form is offered; the tick waits for both texts', () => {
    const html = render([NOTE], withNote(), { canEdit: true, projectId: P });
    expect(attr(elements(html, 'inspector')[0]!.attrs, 'data-inspector-kind')).toBe(
      'engineer_note',
    );
    expect(textOf(elements(html, 'inspector-title')[0]!.inner)).toBe('Engineer note');
    expect(textOf(elements(html, 'inspector-subtitle')[0]!.inner)).toBe('Bearing wall removed');
    expect(textOf(elements(html, 'engineer-required')[0]!.inner)).toBe('Engineer required');
    expect(elements(html, 'engineer-name')).toHaveLength(1);
    expect(elements(html, 'engineer-approved')).toHaveLength(1);
    expect(elements(html, 'engineer-on-file')[0]!.attrs).toContain('disabled');
    expect(textOf(elements(html, 'engineer-letter-attach')[0]!.inner)).toBe('Attach letter');
    expect(attr(elements(html, 'engineer-letter-input')[0]!.attrs, 'accept')).toBe(
      '.pdf,.jpg,.jpeg,.png,.heic,application/pdf,image/jpeg,image/png,image/heic',
    );
    expect(elements(html, 'inspector-view-only')).toHaveLength(0);
  });

  it('Q-0708 a filled note offers the tick; a ticked note shows the letter on file and no warning', () => {
    const filled = render(
      [NOTE],
      withNote({ engineerName: 'A. Engineer', approvedText: 'Header 2-2x12', fileId: FILE }),
      { canEdit: true, projectId: P },
    );
    expect(elements(filled, 'engineer-on-file')[0]!.attrs).not.toContain('disabled');
    expect(elements(filled, 'engineer-required')).toHaveLength(1);
    expect(textOf(elements(filled, 'engineer-letter-state')[0]!.inner)).toBe('Letter attached.');
    const ticked = render(
      [NOTE],
      withNote({ engineerName: 'A. Engineer', approvedText: 'Header 2-2x12', letterOnFile: true }),
      { canEdit: true, projectId: P },
    );
    expect(elements(ticked, 'engineer-required')).toHaveLength(0);
    expect(textOf(elements(ticked, 'engineer-cleared')[0]!.inner)).toBe('Engineer letter on file');
  });

  it('AC-6 without Edit model the form is not offered and the warning is visible', () => {
    const html = render([NOTE], withNote(), { canEdit: false, projectId: P });
    expect(elements(html, 'engineer-required')).toHaveLength(1);
    expect(elements(html, 'engineer-form')).toHaveLength(0);
    expect(elements(html, 'engineer-save')).toHaveLength(0);
    expect(elements(html, 'engineer-letter-attach')).toHaveLength(0);
    expect(elements(html, 'inspector-view-only')).toHaveLength(1);
  });

  it('AC-3, AC-6 a wall with an open note shows Engineer required with or without Edit model', () => {
    const objects = withWalls(
      withNote(),
      1,
      [
        { x: 0, y: 0 },
        { x: 144, y: 0 },
      ],
      false,
    );
    for (const canEdit of [true, false]) {
      const html = render([WALL], objects, { canEdit });
      expect(textOf(elements(html, 'inspector-engineer-required')[0]!.inner)).toContain(
        'Engineer required',
      );
    }
    const cleared = withWalls(
      withNote({ engineerName: 'A', approvedText: 'B', letterOnFile: true }),
      1,
      [
        { x: 0, y: 0 },
        { x: 144, y: 0 },
      ],
      false,
    );
    expect(
      elements(render([WALL], cleared, { canEdit: true }), 'inspector-engineer-required'),
    ).toHaveLength(0);
  });
});
