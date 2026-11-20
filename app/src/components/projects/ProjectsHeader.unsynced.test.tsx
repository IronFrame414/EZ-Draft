// EZD-134 (03b Architecture rule 10 "The Projects page ... warn when this device holds unsynced changes";
// AC-EZD-134-2): the header shows the warning while this person's queued count is above 0, and not at 0 or when
// the count is unknown. The count hook, the avatar menu and the bell are stubs.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { ProjectsHeader } from './ProjectsHeader';

const h = vi.hoisted(() => ({ queued: null as number | null }));

vi.mock('../outbox/OutboxDrain', () => ({ useQueuedCount: () => h.queued }));
vi.mock('../account/AvatarMenu', async () => {
  const { createElement } = await import('react');
  return { AvatarMenu: () => createElement('span', { 'data-testid': 'avatar-menu-trigger' }) };
});
vi.mock('../notifications/NotificationBell', async () => {
  const { createElement } = await import('react');
  return { NotificationBell: () => createElement('button', { 'data-testid': 'notification-bell' }) };
});

const render = () =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <ProjectsHeader
        account={{ initials: 'PO', name: 'Pat Owner', email: 'pat@example.test', showSettings: true }}
        search={{ query: '', onQuery: () => {}, onClear: () => {} }}
      />
    </MessagesProvider>,
  );

describe('EZD-134 projects header unsynced warning', () => {
  it('shows while edits are queued on this device', () => {
    h.queued = 2;
    const html = render();
    expect(html).toContain('data-testid="projects-unsynced"');
    expect(html).toContain('Some changes are saved only on this device.');
  });

  it('absent with nothing queued or an unknown count', () => {
    for (const q of [0, null]) {
      h.queued = q;
      expect(render()).not.toContain('projects-unsynced');
    }
  });
});
