// EZD-118 Build step 3 (vault/plans/EZD-118.md Decided "Default name", "`canCreateProject`", "`isDraftEdited`",
// "`toCreateBody`", "Input limits"; S01 New project wizard; AC-EZD-118-2, -3, -6, -7): the New project dialog's
// draft and its request body, shared by the browser and the server. No React, no zod, no Supabase.
import type { Customer } from '../customers/customers';
import type { TemplateBody } from './templates';

export const PROJECT_TYPES = ['kitchen', 'bath', 'whole_home_interior'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_NAME_MAX = 1000;
export const PROJECT_ADDRESS_MAX = 1000;
export const SCOPE_OF_WORK_MAX = 20000;

export type NewProjectBody = {
  name: string;
  address: string;
  type: ProjectType;
  customerId: string | null;
  scopeOfWork: string;
  template?: TemplateBody | null;
};

export type NewProjectDraft = {
  name: string;
  nameEdited: boolean;
  address: string;
  type: ProjectType | null;
  customer: Customer | null;
  scopeOfWork: string;
};

export const EMPTY_NEW_PROJECT: NewProjectDraft = {
  name: '',
  nameEdited: false,
  address: '',
  type: null,
  customer: null,
  scopeOfWork: '',
};

// The name follows the type ("<Type> remodel") until the user types in the name field.
export function applyType(d: NewProjectDraft, type: ProjectType, defaultName: string): NewProjectDraft {
  return d.nameEdited ? { ...d, type } : { ...d, type, name: defaultName };
}

export function editName(d: NewProjectDraft, name: string): NewProjectDraft {
  return { ...d, name, nameEdited: true };
}

export function canCreateProject(d: NewProjectDraft): boolean {
  return d.name.trim() !== '' && d.address.trim() !== '' && d.type !== null;
}

export function isDraftEdited(d: NewProjectDraft): boolean {
  return (
    d.name !== '' ||
    d.address !== '' ||
    d.scopeOfWork !== '' ||
    d.type !== null ||
    d.customer !== null
  );
}

export function toCreateBody(d: NewProjectDraft): NewProjectBody | null {
  if (!canCreateProject(d) || d.type === null) return null;
  return {
    name: d.name.trim(),
    address: d.address.trim(),
    type: d.type,
    customerId: d.customer?.id ?? null,
    scopeOfWork: d.scopeOfWork.trim(),
  };
}
