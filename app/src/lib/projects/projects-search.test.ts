// EZD-117b U1 (vault/plans/EZD-117b.md section 4; AC-EZD-117b-1). Expected values: Decided "URLs" (117a's string
// plus `&q=` + encodeURIComponent(search) when search is non-empty, after any `&after=`; the counts URL gets
// `?q=` only when non-empty).
import { describe, expect, it } from 'vitest';
import { projectCountsUrl, projectsUrl } from './projects';

describe('EZD-117b project search urls', () => {
  it('U1 projectsUrl and projectCountsUrl add q only for a non-empty search', () => {
    expect(projectsUrl({ tab: 'draft', sort: 'edited', after: null, search: 'a b' })).toBe(
      '/api/projects?status=draft&sort=edited&q=a%20b',
    );
    expect(projectsUrl({ tab: 'draft', sort: 'edited', after: null, search: '' })).toBe(
      '/api/projects?status=draft&sort=edited',
    );
    expect(projectsUrl({ tab: 'draft', sort: 'edited', after: 'x', search: 'k' })).toBe(
      '/api/projects?status=draft&sort=edited&after=x&q=k',
    );
    expect(projectCountsUrl('')).toBe('/api/projects/counts');
    expect(projectCountsUrl('Oak&1')).toBe('/api/projects/counts?q=Oak%261');
  });
});
