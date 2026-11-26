// EZD-716 (S13 Controls "Issue checklist row: Shows gate or warning status with detail; link (Review / Open) to fix.
// Green check, amber warning, red gate"; S13 Validation "Issue gates (Round 12): code check reviewed (warnings fixed or
// noted), no red/orphan flags (e.g. "not on a wall"), title block complete"; phase-07 EZD-716 row; Q-0205; Q-0234;
// AC-EZD-716-1 "An orphan 'Not on a wall' flag blocks Issue"): the issue checklist. Pure: the browser shows it and the
// server (server/sheets/issue-checklist.ts) works it out, so the Issue step (EZD-717) refuses with the same answer.
// - orphanFlags: the model's red flags. An opening with no host wall, or whose host wall is gone or no longer under
//   it, is "Not on a wall" (as the inspector and the plan drawing read it); a cabinet run off its host wall
//   (cabinetRunHostProblem, EZD-410); a hosted ceiling item off every ceiling (offCeilingIds, EZD-515).
// - issueChecklist: the rows in board order and whether Issue is blocked (any red gate).
import {
  cabinetRunHostProblem,
  offCeilingIds,
  openingOnWall,
  type ModelObject,
  type WallObject,
} from '@ezdraft/geometry';
import type { TitleBlockField } from '../title-block/title-block';

export type OrphanFlagKind = 'not_on_wall' | 'off_ceiling';
export type OrphanFlag = { objectId: string; kind: OrphanFlagKind };

const lower = (s: string) => s.toLowerCase();

export function orphanFlags(objects: readonly ModelObject[]): OrphanFlag[] {
  const walls = new Map<string, WallObject>();
  for (const o of objects) if (o.type === 'wall') walls.set(lower(o.id), o);
  const out: OrphanFlag[] = [];
  for (const o of objects) {
    if (o.type === 'opening') {
      const hostId = o.data.geometry.hostWallId;
      const host = hostId === null ? undefined : walls.get(lower(hostId));
      if (host === undefined || !openingOnWall(o, host)) out.push({ objectId: o.id, kind: 'not_on_wall' });
    } else if (o.type === 'cabinet_run') {
      if (cabinetRunHostProblem(o, objects) !== null) out.push({ objectId: o.id, kind: 'not_on_wall' });
    }
  }
  for (const id of offCeilingIds(objects)) out.push({ objectId: id, kind: 'off_ceiling' });
  return out;
}

// Q-0205: an "Engineer required" warning stays on the checklist until "Engineer letter on file" is ticked.
export function engineerLettersMissing(objects: readonly ModelObject[]): number {
  return objects.filter((o) => o.type === 'engineer_note' && !o.data.attributes.letterOnFile).length;
}

export type CodeCheckFacts =
  // No run yet, or the model changed after the last one: Issue runs it (S13 "Issuing runs the code check
  // automatically"), so this warns and does not hold Issue (assumptions EZD-716).
  | { state: 'not_run' }
  | { state: 'stale'; at: string }
  | { state: 'run'; at: string; open: number; accepted: number };

export type LoadCalcFacts =
  | { state: 'none' }
  | { state: 'error' }
  | { state: 'done'; edition: string; serviceAmps: number | null; pass: boolean | null };

export type IssueFacts = {
  // The set's sheet numbers (permit set), for "on N sheets" and whether E2.0 is in it.
  sheets: readonly string[];
  titleBlockMissing: readonly TitleBlockField[];
  codeCheck: CodeCheckFacts;
  orphans: readonly OrphanFlag[];
  // Null while not worked out: the load calc is read from the live model in the browser (editor/electrical), so the
  // server's answer leaves it out and the Sheets screen adds it.
  loadCalc: LoadCalcFacts | null;
  engineerLettersMissing: number;
  rendersAwaiting: number;
};

// What the server reads for the checklist: every fact but the load calc, with the project's code edition for it.
export type ProjectIssueFacts = Omit<IssueFacts, 'loadCalc'> & { edition: string };

export const CHECKLIST_ROWS = [
  'title_block',
  'code_check',
  'orphan_flags',
  'load_calc',
  'engineer_letter',
  'renders',
] as const;
export type ChecklistRowId = (typeof CHECKLIST_ROWS)[number];

// pass: green check; warning: amber, never holds Issue; gate: red, holds Issue.
export type RowStatus = 'pass' | 'warning' | 'gate';

export type ChecklistRow = {
  id: ChecklistRowId;
  status: RowStatus;
  // Values the row's detail line reads (its wording is the screen's).
  detail: Record<string, string | number | readonly string[]>;
  // Review: the open code warnings, accepted with a note here; Open: the page or view that fixes it.
  link: 'review' | 'open' | null;
};

export type IssueChecklist = { rows: ChecklistRow[]; blocked: boolean; gates: ChecklistRowId[] };

export const LOAD_CALC_SHEET = 'E2.0';

export function issueChecklist(f: IssueFacts): IssueChecklist {
  const rows: ChecklistRow[] = [];
  rows.push(
    f.titleBlockMissing.length === 0
      ? { id: 'title_block', status: 'pass', detail: {}, link: null }
      : { id: 'title_block', status: 'gate', detail: { missing: [...f.titleBlockMissing] }, link: 'open' },
  );

  const c = f.codeCheck;
  if (c.state === 'run')
    rows.push({
      id: 'code_check',
      status: c.open > 0 ? 'gate' : 'pass',
      detail: { at: c.at, open: c.open, accepted: c.accepted },
      link: c.open > 0 || c.accepted > 0 ? 'review' : null,
    });
  else rows.push({ id: 'code_check', status: 'warning', detail: c.state === 'stale' ? { at: c.at } : {}, link: 'review' });

  rows.push({
    id: 'orphan_flags',
    status: f.orphans.length > 0 ? 'gate' : 'pass',
    detail: { open: f.orphans.length, sheets: f.sheets.length },
    link: f.orphans.length > 0 ? 'open' : null,
  });

  // Phase-07 EZD-716: "Load calc complete" only when the set contains E2.0.
  if (f.loadCalc !== null && f.sheets.includes(LOAD_CALC_SHEET)) {
    const l = f.loadCalc;
    const done = l.state === 'done' && l.pass !== false;
    rows.push({
      id: 'load_calc',
      status: done ? 'pass' : 'gate',
      detail:
        l.state === 'done'
          ? { state: l.pass === false ? 'over' : 'done', edition: l.edition, service: l.serviceAmps ?? '' }
          : { state: l.state },
      link: done ? null : 'open',
    });
  }

  if (f.engineerLettersMissing > 0)
    rows.push({ id: 'engineer_letter', status: 'warning', detail: { count: f.engineerLettersMissing }, link: 'open' });

  if (f.rendersAwaiting > 0)
    rows.push({ id: 'renders', status: 'warning', detail: { count: f.rendersAwaiting }, link: null });

  const gates = rows.filter((r) => r.status === 'gate').map((r) => r.id);
  return { rows, blocked: gates.length > 0, gates };
}
