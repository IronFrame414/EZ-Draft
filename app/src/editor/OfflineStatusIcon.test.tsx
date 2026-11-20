// EZD-1401 (S17 Offline status icon "spinner while caching"; wording in vault/build/assumptions.md EZD-1401):
// the header icon's markup in the real office catalog, English. A static render runs no effects, so the page copy
// reads as not stored yet: a project being stored shows the spinner; nothing shows before the first store.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../lib/messages';
import { createProjectCache } from '../lib/pwa/project-cache';
import { catalogFor } from '../server/messages/catalog';
import { OfflineStatusIcon } from './OfflineStatusIcon';

const P = '00000000-0000-4000-8000-00000000000a';
const render = (cache: ReturnType<typeof createProjectCache>) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <OfflineStatusIcon cache={cache} projectId={P} queued={async () => []} sync={null} />
    </MessagesProvider>,
  );

describe('EZD-1401 offline status icon', () => {
  it('nothing before the project is stored', () => {
    expect(render(createProjectCache({ store: undefined, origin: 'https://x.example' }))).not.toContain('offline-icon');
  });

  it('a spinner with its label while the project is being stored', async () => {
    let release: () => void = () => {};
    const store = {
      open: async () =>
        ({
          put: () => new Promise<void>((r) => (release = r)),
          match: async () => undefined,
        }) as unknown as Cache,
    };
    const cache = createProjectCache({ store, origin: 'https://x.example' });
    const ok = new Response('{}', { status: 200 });
    Object.defineProperty(ok, 'type', { value: 'basic' });
    await cache.wrap(async () => ok)(`/api/projects/${P}/model`);
    await new Promise((r) => setTimeout(r, 0));
    expect(cache.get()).toBe('storing');
    const html = render(cache);
    expect(html).toContain('data-testid="offline-icon"');
    expect(html).toContain('data-state="caching"');
    expect(html).toContain('aria-label="Saving for offline use…"');
    release();
  });

  it('the three labels are in the office catalog', () => {
    const en = catalogFor('office', 'en') as Record<string, string>;
    expect(en['office.offline_icon.cached']).toBe('Saved on this device for offline use');
    expect(en['office.offline_icon.caching']).toBe('Saving for offline use…');
    expect(en['office.offline_icon.queued']).toBe('Offline. Changes waiting to sync: {n}');
  });
});
