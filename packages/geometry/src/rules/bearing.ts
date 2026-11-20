// EZD-215 (Q-0205; 09-calculations Q-0704, Q-0708; 03-data-model Q-0704, Q-0708; RC-015 test text; 09q Bearing
// warning): the one pure function every change path calls. It compares each change's before and after and answers
// the "Engineer required" warnings the change raises: a bearing wall deleted, set to Demo, given a new hosted opening
// or with an opening on it widened. One warning per wall per action; a change that already carries a new note for
// that wall and action raises no second one (so applying the same change set twice never doubles it).
// A new opening is an opening of status New (RC-015 "new-work"; vault/build/assumptions.md EZD-215).
import type { EngineerNoteAction, EngineerNoteData } from '../schema/engineer-note';
import type { ModelObject, Point } from '../schema';

type WallObject = Extract<ModelObject, { type: 'wall' }>;
type OpeningObject = Extract<ModelObject, { type: 'opening' }>;
type NoteObject = Extract<ModelObject, { type: 'engineer_note' }>;

// `after` null is a delete; an object that is not in `before` is an add.
export type RuleChange = { id: string; after: ModelObject | null };

export type BearingWarning = {
  wallId: string;
  action: EngineerNoteAction;
  // The wall's line at the time (before a delete, after a Demo or an opening).
  line: { start: Point; end: Point };
  level: string;
};

const lower = (id: string) => id.toLowerCase();

const isWall = (o: ModelObject | null | undefined): o is WallObject => o?.type === 'wall';
const isOpening = (o: ModelObject | null | undefined): o is OpeningObject => o?.type === 'opening';
const isNote = (o: ModelObject | null | undefined): o is NoteObject => o?.type === 'engineer_note';

const lineOf = (w: WallObject) => ({
  start: { ...w.data.geometry.start },
  end: { ...w.data.geometry.end },
});

// `before` is keyed by lower-case id and holds at least every changed id and the host wall of every changed opening.
export function bearingWarnings(
  before: ReadonlyMap<string, ModelObject>,
  changes: readonly RuleChange[],
): BearingWarning[] {
  const after = new Map<string, ModelObject | null>();
  for (const c of changes) after.set(lower(c.id), c.after);
  const wallAfter = (id: string): ModelObject | null | undefined => {
    const k = lower(id);
    return after.has(k) ? after.get(k) : before.get(k);
  };

  // Notes the change set itself adds, by wall and action.
  const carried = new Set<string>();
  for (const c of changes) {
    if (isNote(c.after) && !before.has(lower(c.id)))
      carried.add(`${lower(c.after.data.attributes.wallId)}|${c.after.data.attributes.action}`);
  }

  const out: BearingWarning[] = [];
  const raise = (wall: WallObject, action: EngineerNoteAction, from: WallObject) => {
    const key = `${lower(wall.id)}|${action}`;
    if (carried.has(key)) return;
    carried.add(key);
    out.push({ wallId: wall.id, action, line: lineOf(from), level: from.data.level });
  };

  for (const c of changes) {
    const was = before.get(lower(c.id));
    const now = c.after;
    if (isWall(was) && now === null) {
      if (was.data.attributes.bearing) raise(was, 'delete', was);
      continue;
    }
    if (isWall(now)) {
      if (
        isWall(was) &&
        now.data.attributes.bearing &&
        now.data.status === 'demo' &&
        was.data.status !== 'demo'
      )
        raise(now, 'demo', now);
      continue;
    }
    if (!isOpening(now) || now.data.status !== 'new') continue;
    const hostId = now.data.geometry.hostWallId;
    if (hostId === null) continue;
    const host = wallAfter(hostId);
    if (!isWall(host) || !host.data.attributes.bearing) continue;
    const prev = isOpening(was) ? was : null;
    const sameHost =
      prev !== null &&
      prev.data.status === 'new' &&
      prev.data.geometry.hostWallId !== null &&
      lower(prev.data.geometry.hostWallId) === lower(hostId);
    const widened =
      sameHost &&
      (now.data.attributes.width > prev.data.attributes.width ||
        now.data.attributes.roughOpening.width > prev.data.attributes.roughOpening.width);
    if (!sameHost || widened) raise(host, 'opening', host);
  }
  return out;
}

// The note a warning adds: name and approval text empty, no letter, not on file (Q-0708: the warning is on).
export function engineerNoteFor(w: BearingWarning): EngineerNoteData {
  return {
    geometry: { start: { ...w.line.start }, end: { ...w.line.end } },
    status: 'existing',
    level: w.level,
    attributes: {
      wallId: w.wallId,
      action: w.action,
      engineerName: '',
      approvedText: '',
      fileId: null,
      letterOnFile: false,
    },
  };
}

// Q-0708: only the "Engineer letter on file" tick clears the warning.
export const engineerRequired = (note: EngineerNoteData): boolean => !note.attributes.letterOnFile;

// Q-0708: the tick is allowed only when the engineer name and the approval text are both filled.
export const canMarkLetterOnFile = (a: { engineerName: string; approvedText: string }): boolean =>
  a.engineerName.trim() !== '' && a.approvedText.trim() !== '';
