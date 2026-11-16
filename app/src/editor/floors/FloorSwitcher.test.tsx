// EZD-6001 U16 (vault/plans/EZD-6001.md section 3, section 4; Decided D-Switcher; AC-EZD-6001-4; Q-0666 "a 'Floor'
// select at the left end of the bottom status bar"; section 6 wording). Static markup, as ZoomStack.test.tsx does.
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConfirmProvider } from '../../components/states/ConfirmProvider';
import { MessagesProvider } from '../../lib/messages';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { catalogFor } from '../../server/messages/catalog';
import { en } from '../../server/messages/catalogs/en';
import { es } from '../../server/messages/catalogs/es';
import touch from '../../styles/touch.module.css';
import { createModelStore } from '../model/model-store';
import { createFloorView } from './floors';
import { FloorSwitcher } from './FloorSwitcher';

const F1 = '00000000-0000-4000-8000-0000000000f1';
const F2 = '00000000-0000-4000-8000-0000000000f2';
const floor = (name: string, order: number): ObjectValue => ({
  type: 'floor',
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data: { name, order },
});

function render(canEdit: boolean): string {
  const store = createModelStore({
    objects: new Map([
      [F1, floor('Main', 1)],
      [F2, floor('Up', 2)],
    ]),
  });
  const floors = createFloorView();
  floors.setOpenFloor(F2);
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <ConfirmProvider>
        <FloorSwitcher store={store} floors={floors} canEdit={canEdit} />
      </ConfirmProvider>
    </MessagesProvider>,
  );
}

const tagOf = (html: string, testId: string) => {
  const at = html.indexOf(`data-testid="${testId}"`);
  if (at < 0) return null;
  const start = html.lastIndexOf('<', at);
  return html.slice(start, html.indexOf('>', at) + 1);
};

describe('EZD-6001 floor switcher', () => {
  it('EZD-6001 U16 the closed switcher shows the open floor, labelled Floor, touch-sized', () => {
    for (const canEdit of [true, false]) {
      const html = render(canEdit);
      const tag = tagOf(html, 'floor-switcher');
      expect(tag).not.toBeNull();
      expect(tag).toContain(`data-floor-id="${F2}"`);
      expect(tag).toContain('aria-expanded="false"');
      expect(tag).toContain('aria-label="Floor"');
      expect(tag).toContain('aria-haspopup="menu"');
      expect(tag).toContain(touch.hitArea);
      const afterTrigger = html.slice(html.indexOf('data-testid="floor-switcher"'));
      expect(afterTrigger.slice(afterTrigger.indexOf('>') + 1)).toMatch(/^<span[^>]*>Up<\/span>/);
      expect(html).not.toContain('data-testid="floor-list"');
      expect(html).not.toContain('data-testid="floor-add"');
    }
  });

  it('EZD-6001 U16 the floor messages are the plan wording, English only', () => {
    expect(en['office.floors.label']).toBe('Floor');
    expect(en['office.floors.default_name']).toBe('Floor {n}');
    expect(en['office.floors.add']).toBe('Add floor');
    expect(en['office.floors.rename']).toBe('Rename floor');
    expect(en['office.floors.delete']).toBe('Delete floor');
    expect(en['office.floors.last_floor']).toBe('A project needs at least one floor.');
    expect(en['office.floors.delete_title']).toBe('Delete {name}?');
    expect(Object.keys(es).some((k) => k.startsWith('office.floors.'))).toBe(false);
  });
});
