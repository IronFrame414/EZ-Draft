// EZD-118 U1 (vault/plans/EZD-118.md section 4; AC-EZD-118-2, -3, -7). Expected values: Decided "Default name",
// "`canCreateProject`", "`isDraftEdited`", "`toCreateBody`" (EMPTY shape, name follows the type until typed in,
// valid = trimmed name, address and type, body trimmed, invalid draft gives null).
import { describe, expect, it } from 'vitest';
import type { Customer } from '../customers/customers';
import {
  EMPTY_NEW_PROJECT,
  applyType,
  canCreateProject,
  editName,
  isDraftEdited,
  toCreateBody,
  type NewProjectDraft,
} from './new-project';

const CUSTOMER: Customer = {
  id: 'c1',
  name: 'Ann Lee',
  email: 'ann@example.test',
  phone: null,
  address: null,
  archivedAt: null,
};

describe('EZD-118 new project draft helpers', () => {
  it('U1 helpers: empty draft, default name, typed name kept, valid, edited and request body', () => {
    expect(EMPTY_NEW_PROJECT).toEqual({
      name: '',
      nameEdited: false,
      address: '',
      type: null,
      customer: null,
      scopeOfWork: '',
      scopeTrades: [],
    });

    const bath = applyType(EMPTY_NEW_PROJECT, 'bath', 'Bath remodel');
    expect(bath.name).toBe('Bath remodel');
    expect(bath.type).toBe('bath');
    expect(bath.nameEdited).toBe(false);

    const typed = editName(bath, 'Smith bath');
    expect(typed.name).toBe('Smith bath');
    expect(typed.nameEdited).toBe(true);
    const kitchen = applyType(typed, 'kitchen', 'Kitchen remodel');
    expect(kitchen.name).toBe('Smith bath');
    expect(kitchen.type).toBe('kitchen');

    expect(
      canCreateProject({ ...EMPTY_NEW_PROJECT, name: '  ', address: '1 Main', type: 'bath' }),
    ).toBe(false);

    expect(isDraftEdited(EMPTY_NEW_PROJECT)).toBe(false);
    const withAddress: NewProjectDraft = { ...EMPTY_NEW_PROJECT, address: 'x' };
    expect(isDraftEdited(withAddress)).toBe(true);
    expect(isDraftEdited({ ...withAddress, address: '' })).toBe(false);

    const valid: NewProjectDraft = {
      name: '  A  ',
      nameEdited: true,
      address: '  A  ',
      type: 'kitchen',
      customer: CUSTOMER,
      scopeOfWork: '  A  ',
      scopeTrades: [],
    };
    expect(toCreateBody(valid)).toEqual({
      name: 'A',
      address: 'A',
      type: 'kitchen',
      customerId: 'c1',
      scopeOfWork: 'A',
      scopeTrades: [],
    });
    expect(toCreateBody(EMPTY_NEW_PROJECT)).toBeNull();
  });

  it('EZD-643 (Q-0765): the optional permit application date is sent when given and marks the draft edited', () => {
    const d: NewProjectDraft = {
      ...EMPTY_NEW_PROJECT,
      name: 'Bath',
      address: '1 Oak',
      type: 'bath',
    };
    expect(toCreateBody(d)).not.toHaveProperty('permitApplicationDate');
    expect(toCreateBody({ ...d, permitApplicationDate: '2027-01-04' })).toMatchObject({
      permitApplicationDate: '2027-01-04',
    });
    expect(isDraftEdited({ ...EMPTY_NEW_PROJECT, permitApplicationDate: '2027-01-04' })).toBe(true);
  });
});
