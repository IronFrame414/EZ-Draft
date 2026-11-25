// EZD-1419 (AC-EZD-1419-1 "The project entry opens Field measure"; S17b Entry points; Q-0178 any staff member may be
// sent to re-measure). The card menu offers Field measure to a member with Send field measurement
// (vault/build/assumptions.md EZD-1419), so a member with that switch alone still gets the menu; its target is the
// phone screen /projects/<id>/field-measure (EZD-1415 route). The open menu and the tap are covered by
// e2e/field-measure-entry.spec.ts.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import type { ProjectSummary } from '../../lib/projects/projects';
import { catalogFor } from '../../server/messages/catalog';
import { elements } from '../../../test-harness/projects-markup';
import { ProjectCardWithMenu, fieldMeasureHref, type CardMenuConfig } from './ProjectCardMenu';

const P: ProjectSummary = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Kitchen remodel',
  clientName: null,
  address: '4 Card St',
  status: 'draft',
  openItems: 0,
  hasThumbnail: false,
  versionNo: null,
};
const api = {
  rename: async () => {},
  setStatus: async () => {},
  setArchived: async () => {},
  setComplete: async () => {},
  remove: async () => {},
};
const config = (canMeasure: boolean): CardMenuConfig => ({
  canEdit: false,
  canDelete: false,
  canMeasure,
  api,
  onChanged: () => {},
  onFailed: () => {},
});
const wrap = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {node}
    </MessagesProvider>,
  );

describe('EZD-1419 Field measure from the project card', () => {
  it('Send field measurement alone gives the card its menu; without it there is none', () => {
    expect(
      elements(
        wrap(<ProjectCardWithMenu project={P} config={config(true)} />),
        'project-card-menu',
      ),
    ).toHaveLength(1);
    expect(
      elements(
        wrap(<ProjectCardWithMenu project={P} config={config(false)} />),
        'project-card-menu',
      ),
    ).toHaveLength(0);
  });

  it("the entry opens the project's Field measure screen", () => {
    expect(fieldMeasureHref(P.id)).toBe(
      '/projects/44444444-4444-4444-8444-444444444444/field-measure',
    );
    expect(catalogFor('office', 'en')['office.projects.menu.field_measure']).toBe('Field measure');
  });
});
