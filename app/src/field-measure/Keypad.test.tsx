// EZD-1416 (S17b Keypad "digits, ', ", 1/2, 1/4, 1/8, 1/16, space, backspace"; Next wall; board S17bFieldMeasure
// key order; Q-0759 no laser wording). The typed text must read as a length by Q-0561 (parseLength), so the key
// sequences below are checked against the inches they stand for: 10' 4 1/2" = 124.5", 7' 3" = 87".
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseLength } from '@ezdraft/geometry';
import { MessagesProvider } from '../lib/messages';
import { catalogFor } from '../server/messages/catalog';
import { applyKey, Keypad, KEYPAD_ROWS, MAX_KEYPAD_TEXT, type KeypadKey } from './Keypad';

const type = (keys: KeypadKey[], from = '') => keys.reduce(applyKey, from);

describe('EZD-1416 keypad text', () => {
  it("1 0 ' 4 1/2 types 10' 4 1/2, which reads as 124.5\"", () => {
    const text = type(['1', '0', "'", '4', '1/2']);
    expect(text).toBe("10' 4 1/2");
    expect(parseLength(text, 'wall_room')).toEqual({ ok: true, inches: 124.5 });
  });

  it("7 ' sp 3 \" types 7' 3\", which reads as 87\"", () => {
    const text = type(['7', "'", 'sp', '3', '"']);
    expect(text).toBe(`7' 3"`);
    expect(parseLength(text, 'wall_room')).toEqual({ ok: true, inches: 87 });
  });

  it('a fraction after a foot mark or on its own; a fraction after a space gets no second space', () => {
    expect(type(['9', "'", '1/4'])).toBe("9' 1/4");
    expect(type(['1/16'])).toBe('1/16');
    expect(type(['4', 'sp', '1/8'])).toBe('4 1/8');
    expect(parseLength(type(['4', 'sp', '1/8', '"']), 'wall_room')).toEqual({ ok: true, inches: 4.125 });
  });

  it('a space is never first or doubled; a mark drops the space before it', () => {
    expect(type(['sp'])).toBe('');
    expect(type(['5', 'sp', 'sp'])).toBe('5 ');
    expect(type(['5', 'sp', "'"])).toBe("5'");
  });

  it('backspace removes one character; on empty text it does nothing', () => {
    expect(type(['back'], "10' 4 1/2")).toBe("10' 4 1/");
    expect(type(['back'])).toBe('');
  });

  it('the text stops growing at the longest the keypad builds', () => {
    const full = '1'.repeat(MAX_KEYPAD_TEXT);
    expect(applyKey(full, '2')).toBe(full);
  });
});

describe('EZD-1416 keypad', () => {
  const render = (disabled: boolean, language: 'en' | 'es' = 'en') =>
    renderToStaticMarkup(
      <MessagesProvider language={language} messages={catalogFor('field', language)}>
        <Keypad disabled={disabled} onKey={() => undefined} onNext={() => undefined} />
      </MessagesProvider>,
    );

  it('shows the board keys in order and Next wall last', () => {
    const html = render(false);
    const keys = [...html.matchAll(/data-key="([^"]+)"/g)].map((m) => m[1]);
    expect(keys).toHaveLength(KEYPAD_ROWS.flat().length + 1);
    expect(keys).toEqual(
      ['1', '2', '3', "'", '&quot;', '4', '5', '6', '1/2', '1/4', '7', '8', '9', '1/8', '1/16']
        .concat(['back', '0', 'sp', 'next'])
        .map((k) => (k === "'" ? '&#x27;' : k)),
    );
    expect(html).toContain('Next wall</button>');
    expect(html).toContain('sp</button>');
    expect(html).toContain('aria-label="Backspace"');
    expect(html).not.toMatch(/laser/i);
    expect(html).not.toContain('disabled');
  });

  it('disabled keys when nothing can be typed', () => {
    const html = render(true);
    expect(html.match(/<button[^>]*disabled/g)).toHaveLength(19);
  });

  it('Spanish users get the Spanish key names', () => {
    const html = render(false, 'es');
    expect(html).toContain('Siguiente pared</button>');
  });
});
