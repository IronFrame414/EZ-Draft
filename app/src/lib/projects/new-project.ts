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

// EZD-739 (Q-0764; Q-0779): the scope tick boxes under Scope of work, in this order: Electrical, Plumbing,
// Mechanical and Reflected ceiling plan. Stored on the project (project.scope_trades); all unticked on a new
// project.
export const SCOPE_TRADES = ['electrical', 'plumbing', 'mechanical', 'rcp'] as const;
export type ScopeTrade = (typeof SCOPE_TRADES)[number];

export function isScopeTrade(v: unknown): v is ScopeTrade {
  return typeof v === 'string' && (SCOPE_TRADES as readonly string[]).includes(v);
}

// The ticked boxes in the fixed order, each once.
export function normalizeScopeTrades(trades: readonly ScopeTrade[]): ScopeTrade[] {
  return SCOPE_TRADES.filter((t) => trades.includes(t));
}

// Tick or untick one box.
export function toggleScopeTrade(
  trades: readonly ScopeTrade[],
  trade: ScopeTrade,
  ticked: boolean,
): ScopeTrade[] {
  return normalizeScopeTrades(ticked ? [...trades, trade] : trades.filter((t) => t !== trade));
}

export function sameScopeTrades(a: readonly ScopeTrade[], b: readonly ScopeTrade[]): boolean {
  const x = normalizeScopeTrades(a);
  const y = normalizeScopeTrades(b);
  return x.length === y.length && x.every((t, i) => t === y[i]);
}

export type NewProjectBody = {
  name: string;
  address: string;
  type: ProjectType;
  customerId: string | null;
  scopeOfWork: string;
  // EZD-739: the ticked scope boxes; absent is none ticked.
  scopeTrades?: ScopeTrade[];
  template?: TemplateBody | null;
  // EZD-301: present only for a project started from a file.
  source?: 'file';
};

export type NewProjectDraft = {
  name: string;
  nameEdited: boolean;
  address: string;
  type: ProjectType | null;
  customer: Customer | null;
  scopeOfWork: string;
  scopeTrades: ScopeTrade[];
};

export const EMPTY_NEW_PROJECT: NewProjectDraft = {
  name: '',
  nameEdited: false,
  address: '',
  type: null,
  customer: null,
  scopeOfWork: '',
  scopeTrades: [],
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
    d.scopeTrades.length > 0 ||
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
    scopeTrades: normalizeScopeTrades(d.scopeTrades),
  };
}
