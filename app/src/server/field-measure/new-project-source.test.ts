// EZD-1422 (S01 Input source "Field measure creates the project and sends the Foreman a link to 17b"; phase-14 row
// "The Foreman is picked in the wizard"): the New project body with source field_measure needs the Foreman, starts
// with no template, and is passed on as source field_measure (project.created's source).
import { describe, expect, it } from 'vitest';
import { parseNewProject } from '../projects/projects';

const base = {
  name: 'Kitchen remodel',
  address: '12 Oak Ave',
  type: 'kitchen',
  customerId: null,
  scopeOfWork: '',
};
const FOREMAN = '11111111-1111-4111-8111-111111111111';

describe('EZD-1422 parseNewProject source field_measure', () => {
  it('takes source field_measure with a Foreman', () => {
    expect(parseNewProject({ ...base, source: 'field_measure', foremanId: FOREMAN })).toEqual({
      name: 'Kitchen remodel',
      address: '12 Oak Ave',
      type: 'kitchen',
      customerId: null,
      scopeOfWork: null,
      template: null,
      foremanId: FOREMAN,
      source: 'field_measure',
    });
  });

  it('refuses field_measure without a Foreman or with a template', () => {
    expect(parseNewProject({ ...base, source: 'field_measure' })).toBeNull();
    expect(parseNewProject({ ...base, source: 'field_measure', foremanId: null })).toBeNull();
    expect(
      parseNewProject({
        ...base,
        source: 'field_measure',
        foremanId: FOREMAN,
        template: { key: 'galley_kitchen', width: 96, length: 168, ceilingHeight: 96 },
      }),
    ).toBeNull();
  });
});
