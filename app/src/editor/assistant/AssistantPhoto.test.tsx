// EZD-5603b T12-T14 (vault/plans/EZD-5603b.md section 3 V1-V4, section 4 and section 6 wording; AC-EZD-5603-6, -11,
// -12). Static markup in the office MessagesProvider; attribute order is not assumed. Wording is the approved
// A1-A5 (S03dSelectedObjects-wording.md:28-32) and the section 6 proposals; the order of the prompt area is
// Decided "Panel layout" (problem box above the composer, A3 note last; Q-0638 gap 13).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { PHOTO_ACCEPT } from '../../lib/assistant/photo-rules';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import { AssistantPanelView } from './AssistantPanel';
import { PhotoButton, PhotoNote, PhotoProblemBox, PhotoThumb } from './AssistantPhoto';
import type { AssistantEntry, AssistantUi } from './assistant-ui';

const render = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {ui}
    </MessagesProvider>,
  );
const noop = () => {};

const A3 =
  'A photo goes to Anthropic only with the prompt you attach it to. Client name, address and prices are never sent.';
const A4 = "EZ Draft can't use that file. Attach a JPG, PNG, HEIC or WebP photo.";
const A5 = 'That photo is over 20 MB. Attach a smaller one.';
const UNREADABLE = "EZ Draft couldn't read that photo. Attach another one.";

type El = { open: string; inner: string; outer: string };
function els(html: string, id: string): El[] {
  const out: El[] = [];
  const re = new RegExp(`<([a-z0-9]+)\\b[^>]*data-testid="${id}"[^>]*>`, 'g');
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const name = m[1]!;
    const from = re.lastIndex;
    if (m[0].endsWith('/>') || name === 'img' || name === 'input') {
      out.push({ open: m[0], inner: '', outer: m[0] });
      continue;
    }
    let depth = 1;
    const tags = new RegExp(`<(/?)${name}\\b[^>]*>`, 'g');
    tags.lastIndex = from;
    for (let t = tags.exec(html); t; t = tags.exec(html)) {
      if (t[1] === '/') depth -= 1;
      else if (!t[0].endsWith('/>')) depth += 1;
      if (depth === 0) {
        out.push({
          open: m[0],
          inner: html.slice(from, t.index),
          outer: html.slice(m.index, tags.lastIndex),
        });
        break;
      }
    }
  }
  return out;
}
const decode = (s: string) =>
  s
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
const text = (s: string) => decode(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const classes = (open: string) =>
  (/class="([^"]*)"/.exec(open)?.[1] ?? '').split(' ').filter((c) => c.length > 0);

const view = (ui: Partial<AssistantUi> = {}) =>
  render(
    <AssistantPanelView
      ui={{
        open: true,
        keyState: 'present',
        entries: [],
        draft: '',
        model: 'sonnet',
        phase: 'idle',
        profileOpen: false,
        photo: null,
        photoProblem: null,
        photoPreparing: false,
        ...ui,
      }}
      onClose={noop}
      onDraft={noop}
      onModel={noop}
      onSend={noop}
      onOpenProfile={noop}
      onRetryKey={noop}
      onAttachPhoto={noop}
      onRemovePhoto={noop}
    />,
  );

describe('EZD-5603b AssistantPhoto', () => {
  it('T12 the Photo control and the note', () => {
    const html = render(<PhotoButton disabled={false} onPick={noop} />);
    const button = els(html, 'assistant-photo')[0]!;
    expect(button.open).toContain('aria-label="Attach a photo"');
    expect(text(button.outer)).toContain('Photo');
    expect(button.outer).toContain('#ez-icon-add_photo_alternate');
    expect(classes(button.open)).toContain(touch.target);
    const input = els(html, 'assistant-photo-input')[0]!;
    expect(input.open).toMatch(/\shidden(=""|\s|>)/);
    expect(input.open).toContain(`accept="${PHOTO_ACCEPT}"`);
    expect(input.open).not.toContain('multiple');
    expect(input.open).toContain('type="file"');

    const note = els(render(<PhotoNote />), 'assistant-photo-note')[0]!;
    expect(text(note.outer)).toBe(A3);
  });

  it('T13 the thumb: image, name, size and Remove photo; the preparing line; disabled remove', () => {
    const photo = { url: 'blob:x', name: 'island-before.jpg', bytes: 2_400_000 };
    const html = render(
      <PhotoThumb photo={photo} preparing={false} removeDisabled={false} onRemove={noop} />,
    );
    const img = els(html, 'assistant-photo-image')[0]!;
    expect(img.open).toContain('src="blob:x"');
    expect(img.open).toContain('alt="Attached photo"');
    expect(text(els(html, 'assistant-photo-name')[0]!.outer)).toBe('island-before.jpg');
    expect(text(els(html, 'assistant-photo-size')[0]!.outer)).toBe('2.4 MB');
    const remove = els(html, 'assistant-photo-remove')[0]!;
    expect(remove.open).toContain('aria-label="Remove photo"');
    expect(classes(remove.open)).toContain(touch.hitArea);
    expect(remove.open).not.toContain('disabled');

    const preparing = render(
      <PhotoThumb photo={null} preparing removeDisabled={false} onRemove={noop} />,
    );
    expect(text(els(preparing, 'assistant-photo-preparing')[0]!.outer)).toBe('Preparing the photo…');
    expect(els(preparing, 'assistant-photo-remove')).toHaveLength(0);

    const locked = render(
      <PhotoThumb photo={photo} preparing={false} removeDisabled onRemove={noop} />,
    );
    expect(els(locked, 'assistant-photo-remove')[0]!.open).toContain('disabled=""');

    // Inside the provider, PhotoThumb adds nothing to the provider's own empty wrapper.
    expect(
      render(<PhotoThumb photo={null} preparing={false} removeDisabled={false} onRemove={noop} />),
    ).toBe(render(<></>));
  });

  it('T14 problem boxes, No key, the bubble photo, and the order of the prompt area', () => {
    for (const [problem, line] of [
      ['type', A4],
      ['size', A5],
      ['unreadable', UNREADABLE],
    ] as const) {
      const box = els(render(<PhotoProblemBox problem={problem} />), 'assistant-photo-error')[0]!;
      expect(box.open, problem).toContain('role="alert"');
      expect(text(box.outer), problem).toContain(line);
    }

    const noKey = view({ keyState: 'none' });
    expect(els(noKey, 'assistant-photo')[0]!.open).toContain('disabled=""');
    expect(els(noKey, 'assistant-photo-note')).toHaveLength(0);

    const entry: AssistantEntry = {
      kind: 'reply',
      id: 1,
      prompt: 'p1',
      message: 'm1',
      model: 'sonnet',
      costMicroUsd: 20000,
      sessionMicroUsd: 20000,
      photoUrl: 'blob:y',
    };
    const bubble = els(view({ entries: [entry] }), 'assistant-bubble-photo')[0]!;
    expect(bubble.open).toContain('src="blob:y"');
    expect(bubble.open).toContain('alt="Attached photo"');

    const html = view({
      photoProblem: 'size',
      photo: { url: 'blob:z', name: 'a.jpg', bytes: 2_400_000 },
    });
    const at = (id: string) => html.indexOf(`data-testid="${id}"`);
    const order = [
      'assistant-photo-error',
      'assistant-photo-thumb',
      'assistant-prompt',
      'assistant-photo',
      'assistant-model',
      'assistant-send',
      'assistant-photo-note',
    ].map(at);
    for (const n of order) expect(n).toBeGreaterThanOrEqual(0);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
