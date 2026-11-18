// EZD-314 (S01 States "Import in progress: card shows \"Importing\" in place of the open-items indicator";
// AC-EZD-314-5): a card whose project has an import in progress shows Importing where the open items are, and no
// open-items indicator; without one it shows the open items as before. Renders in the real office catalog.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ProjectSummary } from '../../lib/projects/projects';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { ProjectCard } from './ProjectCard';
import { elements, textOf } from '../../../test-harness/projects-markup';

const P: ProjectSummary = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Kitchen remodel',
  clientName: null,
  address: '3 Sort St',
  status: 'draft',
  openItems: 5,
  hasThumbnail: false,
};

const render = (project: ProjectSummary) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <ProjectCard project={project} />
    </MessagesProvider>,
  );

describe('EZD-314 project card Importing', () => {
  it('AC-EZD-314-5: shows Importing in place of the open-items indicator', () => {
    const html = render({ ...P, importing: true });
    const shown = elements(html, 'project-card-importing');
    expect(shown).toHaveLength(1);
    expect(textOf(shown[0].inner)).toBe('Importing');
    expect(elements(html, 'project-card-open')).toHaveLength(0);
  });

  it('without an import in progress it shows the open items', () => {
    for (const importing of [false, undefined]) {
      const html = render({ ...P, importing });
      expect(elements(html, 'project-card-importing')).toHaveLength(0);
      expect(textOf(elements(html, 'project-card-open')[0].inner)).toBe('5 to review');
    }
  });
});
