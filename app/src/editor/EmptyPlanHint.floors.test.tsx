// EZD-6001 U12 (vault/plans/EZD-6001.md section 4; Decided D-Hint; AC-EZD-6001-1; Q-0591 (a) "over a plan with no
// walls"; Q-0509): with the floor view, the hint is for the open floor.
import { CURRENT_SCHEMA_VERSION, createWallData } from '@ezdraft/geometry';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../lib/messages';
import type { ObjectValue } from '../lib/outbox/model-api';
import { catalogFor } from '../server/messages/catalog';
import { EmptyPlanHint, hasNoWallsOn } from './EmptyPlanHint';
import { createFloorView } from './floors/floors';
import { createModelStore } from './model/model-store';

const F1 = '00000000-0000-4000-8000-0000000000f1';
const F2 = '00000000-0000-4000-8000-0000000000f2';
const W1 = '00000000-0000-4000-8000-000000000011';

const floor = (name: string, order: number): ObjectValue => ({
  type: 'floor',
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data: { name, order },
});
const made = createWallData({ start: { x: 0, y: 0 }, end: { x: 120, y: 0 }, level: F1 });
if (!made.ok) throw new Error('wall fixture');
const objects = new Map<string, ObjectValue>([
  [F1, floor('Floor 1', 1)],
  [F2, floor('Floor 2', 2)],
  [
    W1,
    {
      type: 'wall',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: made.data as unknown as Record<string, unknown>,
    },
  ],
]);

describe('EZD-6001 empty plan hint per floor', () => {
  it('EZD-6001 U12 the hint shows over a floor with no walls', () => {
    expect(hasNoWallsOn(objects, F2)).toBe(true);
    expect(hasNoWallsOn(objects, F1)).toBe(false);
    expect(hasNoWallsOn(objects, F1.toUpperCase())).toBe(false);
    expect(hasNoWallsOn(objects, null)).toBe(true);
    const floors = createFloorView();
    const render = () =>
      renderToStaticMarkup(
        <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
          <EmptyPlanHint store={createModelStore({ objects })} canEdit floors={floors} />
        </MessagesProvider>,
      );
    expect(render()).not.toContain('data-testid="plan-empty-hint"');
    floors.setOpenFloor(F2);
    expect(render()).toContain('data-testid="plan-empty-hint"');
  });
});
