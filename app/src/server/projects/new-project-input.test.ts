// EZD-118 U2 (vault/plans/EZD-118.md section 4; AC-EZD-118-3, -6). Expected values: Decided "`parseNewProject`"
// (strict object; strings trimmed; blank name or address, an unknown key, a type outside the three, a
// customerId that is not a uuid, name or address over 1000 and scope over 20000 characters all give null;
// a blank scope is stored as null) and Q-0452 (the limits).
import { describe, expect, it } from 'vitest';
import { parseNewProject } from './projects';

const UUID = '33333333-3333-4333-8333-333333333333';
const valid = {
  name: '  Kitchen remodel ',
  address: ' 12 Oak Ave  ',
  type: 'kitchen',
  customerId: null,
  scopeOfWork: '  ',
};

describe('EZD-118 parseNewProject', () => {
  it('U2 parse: trims, nulls a blank scope, refuses everything else', () => {
    expect(parseNewProject(valid)).toEqual({
      name: 'Kitchen remodel',
      address: '12 Oak Ave',
      type: 'kitchen',
      customerId: null,
      scopeOfWork: null,
      template: null,
    });
    expect(parseNewProject({ ...valid, customerId: UUID, scopeOfWork: ' Demo ' })).toEqual({
      name: 'Kitchen remodel',
      address: '12 Oak Ave',
      type: 'kitchen',
      customerId: UUID,
      scopeOfWork: 'Demo',
      template: null,
    });

    expect(parseNewProject({ ...valid, name: '   ' })).toBeNull();
    expect(parseNewProject({ ...valid, foo: 1 })).toBeNull();
    expect(parseNewProject({ ...valid, type: 'garage' })).toBeNull();
    expect(parseNewProject({ ...valid, customerId: 'abc' })).toBeNull();
    expect(parseNewProject({ ...valid, name: 'a'.repeat(1001) })).toBeNull();
    expect(parseNewProject({ ...valid, scopeOfWork: 'a'.repeat(20001) })).toBeNull();
    expect(parseNewProject(null)).toBeNull();

    expect(parseNewProject({ ...valid, name: 'a'.repeat(1000) })).toMatchObject({
      name: 'a'.repeat(1000),
    });
  });
});
