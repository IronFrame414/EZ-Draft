// EZD-015b · U20 (vault/plans/EZD-015b.md Section 4). Radix is mocked; sources: D-ConfirmDialog markup; P-V6.
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const rec = vi.hoisted(() => ({}) as Record<string, Record<string, unknown>>);

vi.mock('radix-ui', async () => {
  const React = await import('react');
  type P = Record<string, unknown> & { children?: ReactNode };
  const pick = (props: P) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      if (k === 'className' || k === 'lang' || k.startsWith('data-')) out[k] = v;
    }
    return out;
  };
  const part = (name: string, tag: string) => {
    const Part = (props: P) => {
      rec[name] = props;
      return React.createElement(
        tag,
        { ...pick(props), 'data-part': name.toLowerCase() },
        props.children,
      );
    };
    Part.displayName = name;
    return Part;
  };
  const pass = (name: string) => {
    const Pass = (props: P) => {
      rec[name] = props;
      return React.createElement(React.Fragment, null, props.children);
    };
    Pass.displayName = name;
    return Pass;
  };
  return {
    AlertDialog: {
      Root: pass('Root'),
      Portal: pass('Portal'),
      Overlay: part('Overlay', 'div'),
      Content: part('Content', 'div'),
      Title: part('Title', 'h2'),
      Description: part('Description', 'p'),
      Cancel: pass('Cancel'),
      Action: pass('Action'),
    },
  };
});

import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { es } from '../../server/messages/catalogs/es';
import touch from '../../styles/touch.module.css';
import buttonStyles from './StateButton.module.css';
import styles from './ConfirmDialog.module.css';
import { ConfirmDialog } from './ConfirmDialog';
import type { ConfirmRequest } from './confirm-controller';

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
const classesOf = (tag: string) => (/class="([^"]*)"/.exec(tag)?.[1] ?? '').split(' ');
const S = es as unknown as Record<string, string>;

const base: ConfirmRequest = {
  id: 1,
  title: 'dev.messages.sample',
  message: 'dev.messages.greeting',
  params: { name: 'Ana' },
  confirmLabel: 'common.retry',
  cancelLabel: 'common.cancel',
  tone: 'danger',
};

function render(request: ConfirmRequest, language: 'en' | 'es', onChoose = vi.fn()) {
  return decode(
    renderToStaticMarkup(
      <MessagesProvider language={language} messages={catalogFor('dev', language)}>
        <ConfirmDialog request={request} onChoose={onChoose} />
      </MessagesProvider>,
    ),
  );
}

describe('EZD-015b confirm dialog wiring', () => {
  it('U20 (a) markup, order and Radix props', () => {
    const onChoose = vi.fn();
    const html = render(base, 'en', onChoose);
    expect(rec.Root.open).toBe(true);
    const overlay = /<div[^>]*data-part="overlay"[^>]*>/.exec(html)?.[0] ?? '';
    expect(overlay).toContain('data-confirm-overlay=""');
    expect(classesOf(overlay)).toContain(styles.overlay);
    const content = /<div[^>]*data-part="content"[^>]*>/.exec(html)?.[0] ?? '';
    expect(content).toContain('data-confirm=""');
    expect(content).toContain('lang="en"');
    expect(classesOf(content)).toContain(styles.content);
    expect(/<h2[^>]*>([^<]*)<\/h2>/.exec(html)?.[1]).toBe('Sample message');
    expect(/<p[^>]*data-part="description"[^>]*>([^<]*)<\/p>/.exec(html)?.[1]).toBe('Hello, Ana');
    const buttons = html.match(/<button[^>]*>[^<]*<\/button>/g) ?? [];
    expect(buttons.length).toBe(2);
    expect(buttons[0]).toContain('>Cancel</button>');
    expect(classesOf(buttons[0] ?? '').join(' ')).toBe(
      `${buttonStyles.button} ${buttonStyles.secondary} ${touch.target}`,
    );
    expect(buttons[1]).toContain('>Retry</button>');
    expect(classesOf(buttons[1] ?? '').join(' ')).toBe(
      `${buttonStyles.button} ${buttonStyles.danger} ${touch.target}`,
    );
    expect(rec.Cancel.asChild).toBe(true);
    expect(rec.Action.asChild).toBe(true);
    expect('aria-describedby' in rec.Content).toBe(false);
  });

  it('EZD-015b U20 (b) choices reach onChoose', () => {
    const onChoose = vi.fn();
    render(base, 'en', onChoose);
    (rec.Action.onClick as () => void)();
    (rec.Root.onOpenChange as (o: boolean) => void)(false);
    (rec.Root.onOpenChange as (o: boolean) => void)(true);
    expect(onChoose.mock.calls).toEqual([['confirm'], ['cancel']]);
  });

  it('EZD-015b U20 (c) Spanish, no message, primary tone', () => {
    const html = render({ ...base, message: null, tone: 'primary' }, 'es');
    expect(html).not.toContain('data-part="description"');
    expect('aria-describedby' in rec.Content).toBe(true);
    expect(rec.Content['aria-describedby']).toBeUndefined();
    expect(html).toContain('lang="es"');
    expect(html).toContain(`>${S['common.cancel']}</button>`);
    const buttons = html.match(/<button[^>]*>[^<]*<\/button>/g) ?? [];
    expect(classesOf(buttons[1] ?? '')).toContain(buttonStyles.primary);
  });
});

// EZD-103b U9 (vault/plans/EZD-103b.md sections 1, 3, 4, step 4; AC-EZD-103-5; Q-0228): three buttons in
// the order Cancel, Discard, Save (Decided "Footer order"); rendered with the office catalog, since the
// file's `render` helper uses the dev catalog, which has no office. keys.
describe('EZD-103b confirm dialog discard button', () => {
  it('U9 three buttons: Cancel, Discard, Save', () => {
    const request: ConfirmRequest = {
      id: 1,
      title: 'office.settings.unsaved_title',
      message: null,
      confirmLabel: 'office.settings.unsaved_save',
      cancelLabel: 'common.cancel',
      discardLabel: 'office.settings.unsaved_discard',
      tone: 'primary',
    };
    const html = decode(
      renderToStaticMarkup(
        <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
          <ConfirmDialog request={request} onChoose={vi.fn()} />
        </MessagesProvider>,
      ),
    );
    expect(/<h2[^>]*>([^<]*)<\/h2>/.exec(html)?.[1]).toBe('Save your changes?');
    const buttons = html.match(/<button[^>]*>[^<]*<\/button>/g) ?? [];
    expect(buttons.map((b) => /<button[^>]*>([^<]*)<\/button>/.exec(b)?.[1])).toEqual([
      'Cancel',
      'Discard',
      'Save',
    ]);
    const discardTag = /<button[^>]*>/.exec(buttons[1] ?? '')?.[0] ?? '';
    expect(discardTag).toContain('data-confirm-discard=""');
    expect(classesOf(discardTag)).toEqual([
      buttonStyles.button,
      buttonStyles.secondary,
      touch.target,
    ]);
    expect(classesOf(buttons[2] ?? '')).toContain(buttonStyles.primary);
  });
});
