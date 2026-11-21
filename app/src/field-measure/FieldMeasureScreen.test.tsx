// EZD-1415 (S17b Layout "room chips (Building outline plus each room, + Room), shape picker, shape canvas with
// lettered walls, active wall field and ceiling height field, hint line with walls done"; AC-EZD-1415-1). Static
// markup, as the other component tests (no DOM environment); taps are covered by e2e/field-measure-shapes.spec.ts.
// Expected text is the board's (S17bFieldMeasure): "Field measure", the five tile names, "Wall C" style labels,
// "Ceiling at wall", the hint line and "n / m".
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessagesProvider } from '../lib/messages';
import { catalogFor } from '../server/messages/catalog';
import { FieldMeasureScreen } from './FieldMeasureScreen';
import { emptyRoom, initialRooms, withShape, type FieldRoom } from './rooms';

function render(
  rooms: FieldRoom[],
  canEdit = true,
  language: 'en' | 'es' = 'en',
  tolerance?: number,
): string {
  return renderToStaticMarkup(
    <MessagesProvider language={language} messages={catalogFor('field', language)}>
      <FieldMeasureScreen
        projectId="00000000-0000-4000-8000-000000000001"
        projectName="Hendricks residence"
        initialRooms={rooms}
        canEdit={canEdit}
        tolerance={tolerance}
      />
    </MessagesProvider>,
  );
}

const attrs = (html: string, attr: string) => html.match(new RegExp(`<[^>]*${attr}[^>]*>`, 'g')) ?? [];

describe('EZD-1415 Field measure screen', () => {
  it('a new session: the Building chip, + Room, five shapes and Pick a shape', () => {
    const html = render(initialRooms());
    expect(html).toContain('Field measure');
    expect(html).toContain('Hendricks residence');
    expect(html).toMatch(/data-room="building"[^>]*>Building</);
    expect(attrs(html, 'data-add-room')).toHaveLength(1);
    for (const label of ['Rectangle', 'L-shape', 'T-shape', 'U-shape', 'Walls']) {
      expect(html).toContain(`${label}</button>`);
    }
    expect(attrs(html, 'aria-pressed="true"').filter((t) => t.includes('data-shape'))).toHaveLength(0);
    expect(html).toContain('Pick a shape');
    expect(html).toContain('Ceiling at wall');
    expect(html).toContain('0 / 0');
    expect(attrs(html, 'data-wall=')).toHaveLength(0);
  });

  it('AC-EZD-1415-1: an L-shaped room shows six lettered walls A to F, wall A selected', () => {
    const building = initialRooms()[0] as FieldRoom;
    const html = render([withShape(building, 'l')]);
    const walls = attrs(html, 'data-wall=');
    expect(walls.map((t) => /data-wall="([A-Z]+)"/.exec(t)?.[1])).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(walls.map((t) => /aria-label="([^"]+)"/.exec(t)?.[1])).toEqual([
      'Wall A',
      'Wall B',
      'Wall C',
      'Wall D',
      'Wall E',
      'Wall F',
    ]);
    expect(walls.filter((t) => t.includes('aria-pressed="true"'))).toHaveLength(1);
    expect(walls[0]).toContain('aria-pressed="true"');
    expect(attrs(html, 'data-shape="l"')[0]).toContain('aria-pressed="true"');
    expect(html).toMatch(/data-field="wall"[^>]*>.*Wall A</);
    expect(html).toContain('Tap a wall or Next. Openings and details go on desktop.');
    expect(html).toContain('0 / 6');
    expect(html).toContain('data-walls="6"');
  });

  it('rooms after the Building show their names; T and U shapes have eight walls', () => {
    const rooms = [
      initialRooms()[0] as FieldRoom,
      withShape(emptyRoom('r1', 'room', 'Kitchen'), 't'),
      withShape(emptyRoom('r2', 'room', 'Laundry'), 'u'),
    ];
    const html = render(rooms);
    expect(html).toMatch(/data-room="r1"[^>]*>Kitchen</);
    expect(html).toMatch(/data-room="r2"[^>]*>Laundry</);
    expect(attrs(html, 'data-room="building"')[0]).toContain('aria-pressed="true"');
    expect(withShape(rooms[1] as FieldRoom, 't').lengths).toHaveLength(8);
    expect(withShape(rooms[2] as FieldRoom, 'u').lengths).toHaveLength(8);
  });

  it('a saved ceiling shows as a length', () => {
    const building = { ...withShape(initialRooms()[0] as FieldRoom, 'rectangle'), ceiling: 108 };
    const html = render([building]);
    expect(html).toContain(`value="9&#x27; 0&quot;"`);
  });

  it('view only (no Send field measurement): no + Room, shapes and ceiling disabled, walls still selectable', () => {
    const html = render([withShape(initialRooms()[0] as FieldRoom, 'l')], false);
    expect(attrs(html, 'data-add-room')).toHaveLength(0);
    for (const tile of attrs(html, 'data-shape=')) expect(tile).toContain('disabled');
    expect(attrs(html, 'data-wall=').every((t) => !t.includes('disabled'))).toBe(true);
    expect(html).toMatch(/<input[^>]*disabled/);
  });

  it('Spanish users get the Spanish field text', () => {
    const html = render([withShape(initialRooms()[0] as FieldRoom, 'l')], true, 'es');
    expect(html).toContain('Edificio');
    expect(html).toContain('aria-label="Pared A"');
  });
});

// EZD-1416 (AC-EZD-1416-1, AC-EZD-1416-2; S17b Auto-fill wall, Closure check). The board's L-shaped Family room
// (S17bFieldMeasure): A 18' 2" = 218", B 9' 0 1/2" = 108.5", C 10' 4 1/2" = 124.5", D 7' 3" = 87",
// F 16' 3 1/2" = 195.5". E = A - C = 93.5" = 7' 9 1/2"; B + D = F, so the room closes. Typing taps are covered by
// e2e/field-measure-keypad.spec.ts.
describe('EZD-1416 Field measure keypad and closure', () => {
  const lRoom = (lengths: (number | null)[]): FieldRoom => ({
    ...withShape(initialRooms()[0] as FieldRoom, 'l'),
    lengths,
  });
  const closureTag = (html: string) => attrs(html, 'data-testid="closure"')[0] ?? '';

  it('AC-EZD-1416-1: five of six walls typed, wall E fills itself (grey) and the room closes, 6 / 6', () => {
    const html = render([lRoom([218, 108.5, 124.5, 87, null, 195.5])]);
    expect(html).toMatch(/data-length="E"[^>]*data-auto=""[^>]*>7&#x27; 9 1\/2&quot;</);
    expect(closureTag(html)).toContain('data-closure="closes"');
    expect(html).toMatch(/data-testid="closure"[^>]*>.*Closes</);
    expect(html).toContain('6 / 6');
  });

  it('AC-EZD-1416-2: a 1" error shows Off by 1" in amber (over the 1/2" tolerance)', () => {
    const html = render([lRoom([218, 108.5, 124.5, 87, null, 196.5])]);
    expect(closureTag(html)).toContain('data-closure="off"');
    expect(closureTag(html)).toContain('data-over-tolerance="true"');
    expect(html).toMatch(/data-testid="closure"[^>]*>.*Off by 1&quot;</);
  });

  it('within the company tolerance the gap still shows, not amber', () => {
    const html = render([lRoom([218, 108.5, 124.5, 87, null, 196.5])], true, 'en', 2);
    expect(closureTag(html)).toContain('data-over-tolerance="false"');
    expect(html).toMatch(/data-testid="closure"[^>]*>.*Off by 1&quot;</);
  });

  it('two walls left: the badge says which wall fills in and that wall shows a grey dash', () => {
    const html = render([lRoom([218, 108.5, null, 87, null, 195.5])]);
    expect(closureTag(html)).toContain('data-closure="pending"');
    expect(html).toContain('E fills in when the room closes');
    expect(html).toMatch(/data-length="E"[^>]*>—</);
    expect(html).toContain('4 / 6');
  });

  it('the keypad shows for Send field measurement and not view only; no laser wording (Q-0759)', () => {
    const shaped = [withShape(initialRooms()[0] as FieldRoom, 'l')];
    const html = render(shaped);
    expect(attrs(html, 'data-testid="keypad"')).toHaveLength(1);
    expect(html).toContain('Next wall</button>');
    expect(html).not.toMatch(/laser/i);
    expect(attrs(render(shaped, false), 'data-testid="keypad"')).toHaveLength(0);
  });

  it('Spanish: Cierra and the Spanish fill-in line', () => {
    expect(render([lRoom([218, 108.5, 124.5, 87, null, 195.5])], true, 'es')).toContain('Cierra');
    expect(render([lRoom([218, 108.5, null, 87, null, 195.5])], true, 'es')).toContain(
      'E se completa cuando el cuarto cierra',
    );
  });
});
