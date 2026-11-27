// EZD-708c (S06 Events emitted "sheet.updated (new) on Add to E2.0"): Add to E2.0 asks the server to log the event.
import { describe, expect, it, vi } from 'vitest';
import { notifyPanelSheet } from './panel-sheet-client';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const PANEL = '22222222-2222-4222-8222-222222222222';

describe('EZD-708c panel sheet event', () => {
  it('posts the sheet and the panel to the project route', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await notifyPanelSheet(PROJECT, { sheet: 'E2.0', panelId: PANEL }, fetchImpl)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(`/api/projects/${PROJECT}/panel-sheet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheet: 'E2.0', panelId: PANEL }),
    });
  });

  it('a refused or failed request is dropped', async () => {
    expect(await notifyPanelSheet(PROJECT, { sheet: 'E2.0', panelId: PANEL }, async () => new Response(null, { status: 403 }))).toBe(false);
    expect(
      await notifyPanelSheet(PROJECT, { sheet: 'E2.0', panelId: PANEL }, () => Promise.reject(new Error('offline'))),
    ).toBe(false);
  });
});
