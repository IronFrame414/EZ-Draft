// EZD-015a · U1, U2, U3, U8, U9, U14, U18 (vault/plans/EZD-015a.md Section 4).
// Sources: S01 States (count 6, Retry, Offline); plan Decided rows; EZD-026a catalog; R26 R17.
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { en } from '../../server/messages/catalogs/en';
import { es } from '../../server/messages/catalogs/es';
import touch from '../../styles/touch.module.css';
import styles from './Skeleton.module.css';
import buttonStyles from './StateButton.module.css';
import { Skeleton, SkeletonGroup } from './Skeleton';
import { StateButton } from './StateButton';
import { InlineError } from './InlineError';
import { OfflineBanner, OfflineBannerView } from './OfflineBanner';
import { AsyncView } from './AsyncView';
import { ToastList } from './ToastList';
import toastStyles from './Toast.module.css';
import { StateHost } from './StateHost';
import { ToastProvider, useToast } from './ToastProvider';
import { ConfirmProvider, useConfirm } from './ConfirmProvider';
import type { Toast } from './toast-store';

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const dev = catalogFor('dev', 'en');
const wrap = (ui: ReactElement, messages: object = dev, language: 'en' | 'es' = 'en') =>
  renderToStaticMarkup(
    <MessagesProvider language={language} messages={messages as typeof dev}>
      {ui}
    </MessagesProvider>,
  );
const text = (html: string) => decode(html);
const E = en as unknown as Record<string, string>;
const S = es as unknown as Record<string, string>;
const count = (html: string, needle: string) => html.split(needle).length - 1;
const classes = (tag: string) => (/class="([^"]*)"/.exec(tag)?.[1] ?? '').split(' ');

describe('EZD-015a state components markup', () => {
  it('U1 Skeleton markup @smoke', () => {
    const a = renderToStaticMarkup(
      <SkeletonGroup count={6}>
        <Skeleton />
      </SkeletonGroup>,
    );
    expect(count(a, 'data-skeleton-group=""')).toBe(1);
    expect(a).toContain('aria-busy="true"');
    const tags = a.match(/<[^>]*\sdata-skeleton=""[^>]*>/g) ?? [];
    expect(tags.length).toBe(6);
    expect((a.match(/\sdata-skeleton=""/g) ?? []).length).toBe(6);
    for (const tag of tags) {
      expect(tag).toContain('aria-hidden="true"');
      expect(tag).toContain('style="width:100%;height:14px"');
      expect(classes(tag)).toContain(styles.md);
    }
    expect(a.replace(/<[^>]*>/g, '')).toBe('');
    const b = renderToStaticMarkup(<Skeleton width="50%" height="20px" radius="lg" />);
    expect(b).toContain('style="width:50%;height:20px"');
    expect(classes(b)).toContain(styles.skeleton);
    expect(classes(b)).toContain(styles.lg);
  });

  it('U2 InlineError markup', () => {
    const fn = vi.fn();
    const withRetry = text(wrap(<InlineError message="dev.messages.sample" onRetry={fn} />));
    expect(withRetry).toContain('role="alert"');
    expect(withRetry).toContain('data-state="error"');
    expect(withRetry).toContain(E['dev.messages.sample']);
    expect(withRetry).toContain('<use href="/icons/sprite.svg#error">');
    expect(count(withRetry, '<button')).toBe(1);
    expect(withRetry).toContain('type="button"');
    expect(withRetry).toContain(`>${E['common.retry']}</button>`);
    expect(E['common.retry']).toBe('Retry');
    const without = text(wrap(<InlineError message="dev.messages.sample" />));
    expect(count(without, '<button')).toBe(0);
    const params = text(
      wrap(<InlineError message="dev.messages.greeting" params={{ name: 'Ana' }} />),
    );
    expect(params).toContain('Hello, Ana');
  });

  it('EZD-015a done when: the offline banner shows its text', () => {
    const view = text(wrap(<OfflineBannerView />));
    expect(view).toContain('role="status"');
    expect(view).toContain('data-state="offline"');
    expect(view).toContain(E['common.offline']);
    expect(E['common.offline']).toBe('Offline');
    expect(view).toContain('<use href="/icons/sprite.svg#cloud_off">');
    const custom = text(
      wrap(<OfflineBannerView message="dev.messages.greeting" params={{ name: 'Ana' }} />),
    );
    expect(custom).toContain('Hello, Ana');
    expect(renderToStaticMarkup(<OfflineBanner />)).toBe('');
  });

  it('U8 strings go through t()', () => {
    const messages = { ...dev, 'common.retry': 'RETRY-T', 'common.offline': 'OFFLINE-T' };
    const err = text(
      wrap(<InlineError message="dev.messages.sample" onRetry={() => {}} />, messages),
    );
    expect(err).toContain('RETRY-T');
    expect(err).not.toContain('Retry');
    const off = text(wrap(<OfflineBannerView />, messages));
    expect(off).toContain('OFFLINE-T');
    expect(off).not.toContain('Offline');
  });

  it('U9 field, client and office surfaces', () => {
    const keys = ['common.retry', 'common.offline', 'common.cancel', 'common.close'];
    const cats: Record<string, unknown>[] = [
      catalogFor('field', 'en'),
      catalogFor('field', 'es'),
      catalogFor('client', 'en'),
      catalogFor('office', 'en'),
    ];
    for (const c of cats) for (const k of keys) expect(c[k], k).toBeTruthy();
    const html = text(
      wrap(
        <InlineError message="error.db_unavailable" onRetry={() => {}} />,
        catalogFor('field', 'es'),
        'es',
      ),
    );
    expect(html).toContain('lang="es"');
    expect(html).toContain(`>${S['common.retry']}</button>`);
  });

  it('EZD-015a done when: the skeleton shows while a promise is pending', () => {
    // U14: real useAsync, no mock. Effects do not run in a static render.
    const load = vi.fn(() => new Promise<never>(() => {}));
    const html = wrap(
      <AsyncView load={load} skeleton={<i data-sk="" />} errorMessage="dev.messages.sample">
        {() => <b data-ok="" />}
      </AsyncView>,
    );
    expect(html).toContain('data-sk');
    expect(html).not.toContain('data-ok');
    expect(html).not.toContain('role="alert"');
    expect(load).toHaveBeenCalledTimes(0);
  });

  it('U18 StateButton classes', () => {
    const one = renderToStaticMarkup(<StateButton>x</StateButton>);
    expect(one).toBe(
      `<button type="button" class="${buttonStyles.button} ${buttonStyles.secondary} ${touch.target}">x</button>`,
    );
    const two = renderToStaticMarkup(
      <StateButton variant="danger" compact className="extra">
        x
      </StateButton>,
    );
    expect(classes(two).join(' ')).toBe(
      `${buttonStyles.button} ${buttonStyles.danger} ${buttonStyles.compact} ${touch.target} extra`,
    );
    expect(two).not.toContain('compact=');
    const three = renderToStaticMarkup(<StateButton variant="icon" aria-label="z" />);
    expect(classes(three).join(' ')).toBe(
      `${buttonStyles.button} ${buttonStyles.icon} ${touch.target}`,
    );
    expect(three).toContain('aria-label="z"');
    expect(three).not.toContain('compact=');
  });
});

describe('EZD-015b toast and confirm markup', () => {
  const noop = () => {};
  const plain: Toast = {
    id: '1',
    message: 'dev.messages.greeting',
    params: { name: 'Ana' },
    tone: 'neutral',
    action: null,
    duration: 5000,
  };
  const withAction: Toast = {
    id: '2',
    message: 'dev.messages.sample',
    tone: 'neutral',
    action: { label: 'common.retry', onPress: noop },
    duration: null,
  };
  const toastTags = (html: string) => html.split('data-toast=""').slice(1);

  it('U8b toast strings go through t()', () => {
    const messages = { ...dev, 'common.close': 'CLOSE-T', 'common.retry': 'RETRY-T' };
    const html = text(
      wrap(<ToastList toasts={[withAction]} onDismiss={noop} onAction={noop} />, messages),
    );
    expect(html).toContain('aria-label="CLOSE-T"');
    expect(html).toContain('title="CLOSE-T"');
    expect(html).toContain('>RETRY-T</button>');
    expect(html).not.toContain('Close');
    expect(html).not.toContain('Retry');
  });

  it('U19 ToastList markup', () => {
    const empty = text(wrap(<ToastList toasts={[]} onDismiss={noop} onAction={noop} />));
    expect(count(empty, 'data-toast-viewport=""')).toBe(1);
    expect(empty).toContain('role="status"');
    expect(empty).toContain('aria-live="polite"');
    expect(count(empty, 'data-toast=""')).toBe(0);
    const html = text(
      wrap(<ToastList toasts={[plain, withAction]} onDismiss={noop} onAction={noop} />),
    );
    expect(classes(/<div[^>]*data-toast-viewport=""[^>]*>/.exec(html)?.[0] ?? '')).toContain(
      toastStyles.viewport,
    );
    const parts = toastTags(html);
    expect(parts.length).toBe(2);
    expect(parts[0]).toContain('Hello, Ana');
    expect(count(parts[0], '<button')).toBe(1);
    expect(count(parts[1], '<button')).toBe(2);
    const btns = parts[1].match(/<button[^>]*>/g) ?? [];
    expect(parts[1]).toContain('>Retry</button>');
    expect(classes(btns[0] ?? '').join(' ')).toBe(
      `${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.compact} ${touch.target}`,
    );
    expect(classes(btns[1] ?? '').join(' ')).toBe(
      `${buttonStyles.button} ${buttonStyles.icon} ${touch.target}`,
    );
    expect(btns[1]).toContain('aria-label="Close"');
    expect(btns[1]).toContain('title="Close"');
    expect(parts[1]).toContain('<use href="/icons/sprite.svg#close"');
  });

  it('U21 providers', () => {
    const ToastProbe = () => {
      useToast();
      return null;
    };
    const ConfirmProbe = () => {
      useConfirm();
      return null;
    };
    expect(() => renderToStaticMarkup(<ToastProbe />)).toThrow(/ToastProvider/);
    expect(() => renderToStaticMarkup(<ConfirmProbe />)).toThrow(/ConfirmProvider/);
    const Probe = () => {
      useToast();
      useConfirm();
      return <i data-probe="" />;
    };
    const html = wrap(
      <StateHost>
        <Probe />
      </StateHost>,
    );
    expect(html).toContain('data-probe');
    expect(count(html, 'data-toast-viewport=""')).toBe(1);
    expect(html).not.toContain('data-toast=""');
    expect(html).not.toContain('data-confirm');
    // the separate providers are exported too
    expect(typeof ToastProvider).toBe('function');
    expect(typeof ConfirmProvider).toBe('function');
  });
});
