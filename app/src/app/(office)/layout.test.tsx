// EZD-120d U7 (vault/plans/EZD-120d.md section 4, Decided "Layout"; AC-EZD-120d-3). The office layout loads the
// outbox actor: a rejected load is reported once (location `office.outbox_actor`) and the page still shows with
// no actor; a loaded actor goes to `OutboxDrain`. The actor loader, the error report and OutboxDrain are stubs.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../server/outbox/actor', () => ({ loadOutboxActor: vi.fn() }));
vi.mock('../../server/errors/report', () => ({ reportError: vi.fn(async () => ({})) }));
vi.mock('../../components/outbox/OutboxDrain', () => ({
  OutboxDrain: vi.fn(({ children }: { children: unknown }) => children),
}));

import { OutboxDrain } from '../../components/outbox/OutboxDrain';
import { reportError } from '../../server/errors/report';
import { loadOutboxActor } from '../../server/outbox/actor';
import OfficeLayout from './layout';

const load = vi.mocked(loadOutboxActor);
const report = vi.mocked(reportError);
const drain = vi.mocked(OutboxDrain);

const render = async () =>
  renderToStaticMarkup((await OfficeLayout({ children: <i data-testid="kid" /> })) as ReactElement);

afterEach(() => {
  load.mockReset();
  report.mockClear();
  drain.mockClear();
});

describe('EZD-120d office layout', () => {
  it('U7 reports a failed actor load once and still shows the page', async () => {
    const error = new Error('actor failed');
    load.mockRejectedValue(error);
    const html = await render();
    expect(html).toContain('data-testid="kid"');
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(error, {
      source: 'function',
      location: 'office.outbox_actor',
    });
    expect(drain.mock.calls[0][0].actor).toBeNull();
  });

  it('U7 gives the loaded actor to OutboxDrain', async () => {
    const actor = { appUserId: 'u1', tenantId: 't1', membershipId: 'm1' };
    load.mockResolvedValue(actor);
    const html = await render();
    expect(html).toContain('data-testid="kid"');
    expect(report).not.toHaveBeenCalled();
    expect(drain.mock.calls[0][0].actor).toEqual(actor);
  });
});
