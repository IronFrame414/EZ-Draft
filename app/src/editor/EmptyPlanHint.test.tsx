// EZD-221b U11 (vault/plans/EZD-221b.md section 4; AC-EZD-221-4). Expected values: S03 States "Empty"; Q-0591 (a);
// plan section 6 (hint wording). Rendered in the real office catalog, English, as SaveStatus.test.tsx does.
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../lib/messages';
import type { ObjectValue } from '../lib/outbox/model-api';
import { catalogFor } from '../server/messages/catalog';
import { elements, textOf } from '../../test-harness/projects-markup';
import { EmptyPlanHint, hasNoWalls } from './EmptyPlanHint';
import { createModelStore } from './model/model-store';

const make = (type: string): ObjectValue => ({
  type,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data: {},
});
const objects = (...types: string[]) =>
  new Map<string, ObjectValue>(types.map((t, i) => [`id-${i}`, make(t)]));

const render = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {ui}
    </MessagesProvider>,
  );

describe('EZD-221b empty plan hint', () => {
  it('EZD-221b U11 hint: only with no wall, and only for a user who can edit', () => {
    expect(hasNoWalls(objects('floor'))).toBe(true);
    expect(hasNoWalls(objects('floor', 'room'))).toBe(true);
    expect(hasNoWalls(objects('floor', 'wall'))).toBe(false);

    const hint = (types: string[], canEdit: boolean) =>
      render(
        <EmptyPlanHint
          store={createModelStore({ objects: objects(...types) })}
          canEdit={canEdit}
        />,
      );
    const shown = elements(hint(['floor'], true), 'plan-empty-hint');
    expect(shown).toHaveLength(1);
    expect(textOf(shown[0].inner)).toBe('Draw walls with Wall (W) or Room rectangle (R).');
    const bare = (html: string) => html.replace(/^<div[^>]*><\/div>$/, '');
    expect(bare(hint(['floor', 'wall'], true))).toBe('');
    expect(bare(hint(['floor'], false))).toBe('');
  });
});
