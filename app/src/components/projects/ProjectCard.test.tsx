// EZD-117a U7 (vault/plans/EZD-117a.md section 4; AC-EZD-117a-4, -5). Expected values: Decided "Card" and
// "Strings" (status label, "{client} · {address}" or the address alone, "Working copy", "{count} to review" or
// "Nothing to review"), section 3 card testids and attributes, Q-0403 (empty thumbnail), Q-0500 via EZD-120c E1 (a card is an <a href="/projects/<id>"; no role, tabindex or click handler). Renders in the real office catalog.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ProjectSummary } from '../../lib/projects/projects';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { ProjectCard } from './ProjectCard';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';

const P3: ProjectSummary = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'charlie',
  clientName: 'acme',
  address: '3 Sort St',
  status: 'draft',
  openItems: 5,
  hasThumbnail: false,
};
const P1: ProjectSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'bravo',
  clientName: 'Zed Co',
  address: '1 Sort St',
  status: 'approved',
  openItems: 0,
  hasThumbnail: false,
};
const P2: ProjectSummary = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Alpha',
  clientName: null,
  address: '2 Sort St',
  status: 'draft',
  openItems: 2,
  hasThumbnail: false,
};

const render = (project: ProjectSummary) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <ProjectCard project={project} />
    </MessagesProvider>,
  );
const one = (html: string, id: string) => {
  const found = elements(html, id);
  expect(found).toHaveLength(1);
  return found[0];
};

describe('EZD-117a project card markup', () => {
  it('U7 a card shows name, status, place, version and open items, and is a link to the editor', () => {
    const html = render(P3);
    const card = one(html, 'project-card');
    expect(attr(card.attrs, 'data-project-id')).toBe(P3.id);
    expect(attr(card.attrs, 'data-status')).toBe('draft');
    expect(textOf(one(html, 'project-card-name').inner)).toBe('charlie');
    const pill = one(html, 'project-card-status');
    expect(textOf(pill.inner)).toBe('Draft');
    expect(attr(pill.attrs, 'data-status')).toBe('draft');
    expect(textOf(one(html, 'project-card-place').inner)).toBe('acme · 3 Sort St');
    expect(textOf(one(html, 'project-card-version').inner)).toBe('Working copy');
    const open = one(html, 'project-card-open');
    expect(textOf(open.inner)).toBe('5 to review');
    expect(attr(open.attrs, 'data-has-items')).toBe('true');
    expect(attr(open.attrs, 'data-open-items')).toBe('5');
    expect(one(html, 'project-card-thumb').inner).toBe('');

    expect(card.tag).toBe('a');
    expect(attr(card.attrs, 'href')).toBe(`/projects/${P3.id}`);
    expect(html).not.toMatch(/role=/i);
    expect(html).not.toMatch(/tabindex/i);
    expect(html).not.toMatch(/onclick/i);

    const p1 = render(P1);
    const open1 = one(p1, 'project-card-open');
    expect(textOf(open1.inner)).toBe('Nothing to review');
    expect(attr(open1.attrs, 'data-has-items')).toBe('false');
    expect(textOf(one(render(P2), 'project-card-place').inner)).toBe('2 Sort St');
  });
  // EZD-224 U5 (vault/plans/EZD-224.md section 4; Decided "Card image"; Q-0403; AC-EZD-224-2, -3).
  it('EZD-224 U5 a card with a thumbnail shows one lazy 220 x 128 image; without one the slot is empty', () => {
    const withThumb = render({ ...P3, hasThumbnail: true });
    expect(elements(withThumb, 'project-card-thumb-img')).toHaveLength(1);
    const img = one(withThumb, 'project-card-thumb-img');
    expect(img.tag).toBe('img');
    expect(attr(img.attrs, 'src')).toBe(`/api/projects/${P3.id}/thumbnail`);
    expect(attr(img.attrs, 'loading')).toBe('lazy');
    expect(attr(img.attrs, 'width')).toBe('220');
    expect(attr(img.attrs, 'height')).toBe('128');
    expect(attr(img.attrs, 'alt')).toBe('');
    expect(one(withThumb, 'project-card-thumb').inner).toContain('project-card-thumb-img');

    const without = render({ ...P3, hasThumbnail: false });
    expect(elements(without, 'project-card-thumb-img')).toHaveLength(0);
    expect(one(without, 'project-card-thumb').inner).toBe('');
  });
});
