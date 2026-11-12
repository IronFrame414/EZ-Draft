// EZD-5603a T14-T20 (vault/plans/EZD-5603a.md section 4 and section 6 wording; AC-EZD-5603-1, -2, -3, -4, -5, -9,
// -10, -12). Static markup in the office MessagesProvider; attribute order is not assumed. Wording is the approved
// S03c wording of plan section 6 (Q-0638 gap 13, Q-0656 (a)); the cost lines follow 09l.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import { AssistantPanelView } from './AssistantPanel';
import { ModelList } from './ModelPicker';
import type { AssistantEntry, AssistantUi } from './assistant-ui';

const render = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {ui}
    </MessagesProvider>,
  );

const noop = () => {};
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
        ...ui,
      }}
      onClose={noop}
      onDraft={noop}
      onModel={noop}
      onSend={noop}
      onOpenProfile={noop}
      onRetryKey={noop}
    />,
  );

type El = { open: string; inner: string; outer: string };
// Every element carrying data-testid="id", with its balanced inner markup.
function els(html: string, id: string): El[] {
  const out: El[] = [];
  const re = new RegExp(`<([a-z0-9]+)\\b[^>]*data-testid="${id}"[^>]*>`, 'g');
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const name = m[1]!;
    const from = re.lastIndex;
    let depth = 1;
    let end = from;
    const tags = new RegExp(`<(/?)${name}\\b[^>]*>`, 'g');
    tags.lastIndex = from;
    for (let t = tags.exec(html); t; t = tags.exec(html)) {
      if (t[1] === '/') depth -= 1;
      else if (!t[0].endsWith('/>')) depth += 1;
      if (depth === 0) {
        end = t.index;
        out.push({ open: m[0], inner: html.slice(from, end), outer: html.slice(m.index, tags.lastIndex) });
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
const failed = (id: number, over: Partial<Extract<AssistantEntry, { kind: 'failed' }>>) =>
  ({
    kind: 'failed',
    id,
    prompt: `prompt ${id}`,
    messageKey: 'office.assistant.send_failed',
    profileLink: false,
    costMicroUsd: null,
    sessionMicroUsd: null,
    ...over,
  }) as AssistantEntry;
const reply = (id: number, message: string, cost: number, session: number): AssistantEntry => ({
  kind: 'reply',
  id,
  prompt: `prompt ${id}`,
  message,
  model: 'sonnet',
  costMicroUsd: cost,
  sessionMicroUsd: session,
});

describe('EZD-5603a AssistantPanel', () => {
  it('T14 header, empty conversation, prompt area and touch classes', () => {
    const html = view();
    const panel = els(html, 'assistant-panel')[0]!;
    expect(panel).toBeDefined();
    const all = text(panel.outer);
    expect(all).toContain('Assistant');
    expect(all).toContain('Plan · runs on your Anthropic key');
    const close = els(html, 'assistant-close')[0]!;
    expect(close.open).toContain('aria-label="Close assistant"');
    const prompt = els(html, 'assistant-prompt')[0]!;
    expect(prompt.open).toContain('placeholder="Ask for a change to this drawing"');
    expect(prompt.open).toMatch(/maxlength="8000"/i);
    // The label "Prompt" must name this textarea: aria-label, a label whose `for` is its id, or a wrapping label.
    const promptId = /\sid="([^"]+)"/.exec(prompt.open)?.[1];
    const labels = [...html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)];
    const named =
      prompt.open.includes('aria-label="Prompt"') ||
      labels.some(
        (l) =>
          text(l[2]!.replace(prompt.outer, '')) === 'Prompt' &&
          (l[2]!.includes(prompt.open) ||
            (promptId !== undefined && new RegExp(`\\sfor="${promptId}"`).test(l[1]!))),
      );
    expect(named).toBe(true);
    const model = els(html, 'assistant-model')[0]!;
    expect(text(model.inner)).toBe('Sonnet 5.5');
    expect(model.open).toContain('aria-label="Model"');
    const send = els(html, 'assistant-send')[0]!;
    expect(send.open).toContain('aria-label="Send"');
    expect(els(html, 'assistant-user-bubble')).toHaveLength(0);
    expect(classes(send.open)).toContain(touch.target);
    expect(classes(model.open)).toContain(touch.target);
    expect(classes(close.open)).toContain(touch.hitArea);
  });

  it('T15 No key: the block and the disabled prompt area', () => {
    const html = view({ keyState: 'none' });
    const block = els(html, 'assistant-no-key')[0]!;
    expect(block).toBeDefined();
    const t = text(block.outer);
    expect(t).toContain('Add your Anthropic API key to use the assistant.');
    expect(t).toContain(
      'Paste it in My profile. Anthropic bills you directly for each prompt. Drawing by hand works as usual.',
    );
    expect(t).toContain('Open My profile');
    for (const id of ['assistant-prompt', 'assistant-model', 'assistant-send']) {
      expect(els(html, id)[0]!.open, id).toContain('disabled=""');
    }
  });

  it('T16 error boxes: role alert, line, link only when asked, cost line, user bubble', () => {
    const html = view({
      entries: [
        failed(1, { messageKey: 'error.assistant_out_of_credit', profileLink: true }),
        failed(2, { messageKey: 'error.assistant_key_refused', profileLink: true }),
        failed(3, { messageKey: 'error.assistant_busy', profileLink: false }),
        failed(4, {
          messageKey: 'error.assistant_invalid_reply',
          costMicroUsd: 20000,
          sessionMicroUsd: 20000,
        }),
      ],
    });
    const boxes = els(html, 'assistant-error');
    expect(boxes).toHaveLength(4);
    for (const b of boxes) expect(b.open).toContain('role="alert"');
    expect(text(boxes[0]!.outer)).toContain(
      'Your Anthropic account is out of credit. Nothing on the drawing changed. Add credit with Anthropic, then send again.',
    );
    expect(text(boxes[0]!.outer)).toContain('Open My profile');
    expect(text(boxes[1]!.outer)).toContain(
      "Anthropic didn't accept your API key. Nothing on the drawing changed. Check or replace it in My profile.",
    );
    expect(text(boxes[1]!.outer)).toContain('Open My profile');
    expect(text(boxes[2]!.outer)).toContain(
      'The assistant is still answering your last prompt. Wait for the answer, then send again.',
    );
    expect(els(boxes[2]!.outer, 'assistant-open-profile')).toHaveLength(0);
    expect(els(html, 'assistant-open-profile')).toHaveLength(2);
    expect(els(html, 'assistant-cost').map((c) => text(c.outer))).toEqual([
      'This prompt: about $0.02 · This session: $0.02',
    ]);
    expect(els(html, 'assistant-user-bubble').map((b) => text(b.outer))).toEqual([
      'prompt 1',
      'prompt 2',
      'prompt 3',
      'prompt 4',
    ]);
  });

  it('T17 a reply is plain text: no links, images, bold or buttons', () => {
    const message = '<a href="https://x.test">x</a> ![x](y) <img src="z"> **b**';
    const html = view({ entries: [reply(1, message, 20000, 20000)] });
    const body = els(html, 'assistant-reply-text')[0]!;
    expect(body.inner).toContain('&lt;a href=');
    expect(body.inner).toContain('![x](y)');
    expect(body.inner).toContain('**b**');
    const box = els(html, 'assistant-reply')[0]!;
    expect(box.inner).not.toContain('<a ');
    expect(box.inner).not.toContain('<img');
    expect(box.inner).not.toContain('<strong');
    expect(box.inner).not.toContain('<button');
  });

  it('T18 the model list: heading, two options in order, the current one selected with a check', () => {
    for (const current of ['sonnet', 'opus'] as const) {
      const html = render(<ModelList model={current} onPick={noop} />);
      const list = els(html, 'assistant-model-list')[0]!;
      expect(list.open).toContain('role="listbox"');
      expect(list.open).toContain('aria-label="Model"');
      expect(text(html)).toContain('Model · pick per prompt');
      const sonnet = els(html, 'assistant-model-sonnet')[0]!;
      const opus = els(html, 'assistant-model-opus')[0]!;
      expect(html.indexOf(sonnet.open)).toBeLessThan(html.indexOf(opus.open));
      const st = text(sonnet.outer);
      const ot = text(opus.outer);
      expect(st.indexOf('Claude Sonnet 5.5')).toBeGreaterThanOrEqual(0);
      expect(st.indexOf('about 2¢ a prompt')).toBeGreaterThan(st.indexOf('Claude Sonnet 5.5'));
      expect(ot.indexOf('Claude Opus 5.5')).toBeGreaterThanOrEqual(0);
      expect(ot.indexOf('about 4¢ a prompt')).toBeGreaterThan(ot.indexOf('Claude Opus 5.5'));
      const sel = { sonnet: current === 'sonnet', opus: current === 'opus' };
      for (const [name, o] of [['sonnet', sonnet], ['opus', opus]] as const) {
        expect(o.open, name).toContain(`aria-selected="${sel[name]}"`);
        expect(o.outer.includes('#ez-icon-check'), name).toBe(sel[name]);
        expect(classes(o.open), name).toContain(touch.target);
      }
    }
  });

  it('T19 the cost line carries the session total as of that answer', () => {
    const html = view({
      entries: [reply(1, 'one', 20000, 20000), reply(2, 'two', 20000, 40000)],
    });
    expect(els(html, 'assistant-cost').map((c) => text(c.outer))).toEqual([
      'This prompt: about $0.02 · This session: $0.02',
      'This prompt: about $0.02 · This session: $0.04',
    ]);
  });

  it('T20 waiting and key loading and key failed', () => {
    const waiting = view({
      phase: 'waiting',
      draft: 'add',
      entries: [{ kind: 'waiting', id: 1, prompt: 'add' }],
    });
    expect(text(els(waiting, 'assistant-waiting')[0]!.outer)).toBe('Waiting for the answer…');
    expect(els(waiting, 'assistant-send')[0]!.open).toContain('disabled=""');

    const loading = view({ keyState: 'loading' });
    expect(els(loading, 'assistant-key-loading')[0]!.outer).toContain('data-skeleton');

    const bad = view({ keyState: 'failed' });
    const box = els(bad, 'assistant-key-failed')[0]!;
    expect(text(box.outer)).toContain("Couldn't check your Anthropic key.");
    expect(box.outer).toContain('<button');
    expect(text(box.outer)).toContain('Retry');
  });
});
