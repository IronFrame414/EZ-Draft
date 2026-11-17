// EZD-130 (P128 section 3 "For dependents"; glossary 00i "Project switcher"; Q-0698): the switcher's Project
// settings item comes after Back to projects, only when the panel is given `onSettings`; the session switcher's
// save updates the open session and tells the editor (AC-EZD-130-6).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { elements, textOf } from '../../../test-harness/projects-markup';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { en } from '../../server/messages/catalogs/en';
import type { EditorSession } from '../editor-session';
import { ProjectSwitcherPanel, sessionSwitcher } from './ProjectSwitcher';
import type { SwitcherState } from './switcher-store';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {} }) }));

const state: SwitcherState = {
  open: true,
  query: '',
  mode: 'recent',
  term: '',
  list: { status: 'ready', items: [] },
  leaving: { status: 'idle' },
};
const store = {
  setQuery: () => {},
  retryList: () => {},
  pick: async () => {},
  backToProjects: async () => {},
  retryLeave: async () => {},
};

const render = (onSettings?: () => void) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <ProjectSwitcherPanel state={state} store={store} panelId="sw1" onSettings={onSettings} />
    </MessagesProvider>,
  );

describe('EZD-130 Project settings in the project switcher', () => {
  it('shows Project settings after Back to projects only with onSettings', () => {
    expect(elements(render(), 'project-switcher-settings')).toHaveLength(0);
    const html = render(() => {});
    const item = elements(html, 'project-switcher-settings');
    expect(item).toHaveLength(1);
    expect(textOf(item[0].inner)).toBe(en['office.project_settings.menu_item']);
    expect(en['office.project_settings.menu_item']).toBe('Project settings');
    expect(html.indexOf('project-switcher-back')).toBeLessThan(html.indexOf('project-switcher-settings'));
  });

  it('a save puts the new name and client in the session, re-reads the defaults and tells listeners (AC-6)', () => {
    const refresh = vi.fn(async () => {});
    const session = {
      model: {
        project: { id: '11111111-1111-4111-8111-111111111111', name: 'bravo', clientName: 'Zed Co' },
        lockEpoch: 3,
      },
      lock: { holding: true },
      defaults: { refresh },
    } as unknown as EditorSession;
    const sw = sessionSwitcher(session, async () => null);
    expect(sw.settings()).toEqual({
      projectId: '11111111-1111-4111-8111-111111111111',
      holding: true,
      lockEpoch: 3,
    });
    const seen = vi.fn();
    const off = sw.onSaved(seen);
    sw.saved({
      project: { id: 'p', name: 'Bravo kitchen', address: 'a', type: 'kitchen', scopeOfWork: '' },
      client: null,
      defaults: {},
      can: { details: true, client: false, typeAndDefaults: true },
    });
    expect(session.model.project.name).toBe('Bravo kitchen');
    expect(session.model.project.clientName).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    sw.saved({
      project: { id: 'p', name: 'X', address: 'a', type: 'kitchen', scopeOfWork: '' },
      client: { id: 'c', name: 'Ann Lee' },
      defaults: {},
      can: { details: true, client: false, typeAndDefaults: true },
    });
    expect(seen).toHaveBeenCalledTimes(1);
    expect(session.model.project.clientName).toBe('Ann Lee');
    sw.store.dispose();
  });
});
