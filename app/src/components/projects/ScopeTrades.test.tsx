// EZD-739 (AC-EZD-739-1, -2; Q-0764; Q-0779; vault/build/assumptions.md EZD-739). Static markup. Expected values:
// four boxes in the order Electrical, Plumbing, Mechanical, Reflected ceiling plan (Q-0779 "a fourth scope tick
// box ... with Electrical, Plumbing and Mechanical"), unticked on a new project; Project settings shows the
// project's stored boxes; without Edit model (the scope text's right) the ticked ones show as text, as every
// other field does there (EZD-130 AC-3).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { MessagesProvider } from '../../lib/messages';
import type { ScopeTrade } from '../../lib/projects/new-project';
import { draftOf, type ProjectSettings } from '../../lib/projects/project-settings';
import { catalogFor } from '../../server/messages/catalog';
import { ProjectSettingsContent } from './ProjectSettingsDialog';
import { ScopeTrades } from './ScopeTrades';

const wrap = (node: React.ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {node}
    </MessagesProvider>,
  );

const boxes = (html: string, prefix: string) =>
  elements(html, `${prefix}-scope-trade`).map((el) => ({
    trade: attr(el.attrs, 'data-trade'),
    ticked: attr(el.attrs, 'checked') !== null,
    disabled: attr(el.attrs, 'disabled') !== null,
  }));

const labels = (html: string) =>
  [...html.matchAll(/data-testid="[a-z-]+-scope-trade".*?([^<>]+)<\/label>/g)].map((m) => m[1]);

const settings = (
  scopeTrades: ScopeTrade[] | undefined,
  details: boolean,
): ProjectSettings => ({
  project: {
    id: 'p1',
    name: 'Lee kitchen',
    address: '1 Oak St',
    type: 'kitchen',
    scopeOfWork: 'Demo',
    ...(scopeTrades ? { scopeTrades } : {}),
  },
  client: null,
  defaults: {},
  codeEdition: { own: null, effective: 'fbc9_nec2023' },
  can: { details, client: false, typeAndDefaults: details },
});

const renderSettings = (s: ProjectSettings) =>
  wrap(
    <ProjectSettingsContent
      load={{ status: 'ready', settings: s }}
      draft={draftOf(s)}
      holding={false}
      fields={{}}
      error={null}
      busy={false}
      online
      onDraft={() => {}}
      onRetry={() => {}}
      onSave={() => {}}
      onClose={() => {}}
    />,
  );

describe('EZD-739 scope tick boxes', () => {
  it('AC-1: the wizard shows the four boxes unticked, in order, with their labels', () => {
    const html = wrap(<ScopeTrades idPrefix="new-project" value={[]} onChange={() => {}} />);
    expect(boxes(html, 'new-project')).toEqual([
      { trade: 'electrical', ticked: false, disabled: false },
      { trade: 'plumbing', ticked: false, disabled: false },
      { trade: 'mechanical', ticked: false, disabled: false },
      { trade: 'rcp', ticked: false, disabled: false },
    ]);
    expect(labels(html)).toEqual(['Electrical', 'Plumbing', 'Mechanical', 'Reflected ceiling plan']);
  });

  it('AC-1: Project settings shows the four boxes unticked for a project with none ticked', () => {
    for (const stored of [undefined, [] as ScopeTrade[]]) {
      const html = renderSettings(settings(stored, true));
      expect(boxes(html, 'project-settings').map((b) => [b.trade, b.ticked])).toEqual([
        ['electrical', false],
        ['plumbing', false],
        ['mechanical', false],
        ['rcp', false],
      ]);
    }
  });

  it('AC-2: Project settings shows the stored boxes ticked', () => {
    const html = renderSettings(settings(['plumbing', 'rcp'], true));
    expect(boxes(html, 'project-settings')).toEqual([
      { trade: 'electrical', ticked: false, disabled: false },
      { trade: 'plumbing', ticked: true, disabled: false },
      { trade: 'mechanical', ticked: false, disabled: false },
      { trade: 'rcp', ticked: true, disabled: false },
    ]);
  });

  it('without Edit model the ticked boxes show as text, as the other fields do', () => {
    const html = renderSettings(settings(['electrical', 'rcp'], false));
    expect(boxes(html, 'project-settings')).toEqual([]);
    const [el] = elements(html, 'project-settings-scope-trades');
    expect(attr(el.attrs, 'data-readonly')).toBe('true');
    expect(textOf(el.inner)).toBe('Electrical, Reflected ceiling plan');
    const none = elements(renderSettings(settings([], false)), 'project-settings-scope-trades')[0];
    expect(textOf(none.inner)).toBe('—');
  });
});
