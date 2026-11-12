// EZD-221b U5-U6 (vault/plans/EZD-221b.md sections 3, 4; AC-EZD-221-1, -2, -3, -7). Expected values: Q-0565 (sizes per
// template, Empty first), Q-0570 (Ceiling 8' 0", not per template; above 0, at most 200 ft), Q-0561 (`12 6` refused),
// EZD-221a U2 areas, G/length.ts:35-61.
import { describe, expect, it } from 'vitest';
import {
  blurSize,
  editSize,
  initialTemplateDraft,
  readTemplate,
  selectTemplate,
  showsRefusal,
  templateAreaText,
} from './template-draft';

describe('EZD-221b template draft', () => {
  it('EZD-221b U5 draft steps: Empty first, sizes per template, Ceiling kept, area grouped', () => {
    const d0 = initialTemplateDraft();
    const frozen = JSON.stringify(d0);
    const d1 = selectTemplate(d0, 'l_kitchen');
    const d2 = editSize(d1, 'ceilingHeight', "9'");
    const d3 = blurSize(editSize(d2, 'width', "12'"), 'width');
    const d4 = selectTemplate(d3, 'galley_kitchen');
    const d5 = selectTemplate(d4, null);

    expect(d0.key).toBeNull();
    expect(d0.text).toEqual({ width: '', length: '', ceilingHeight: '8\' 0"' });
    expect(d0.blurred).toEqual({ width: false, length: false, ceilingHeight: false });
    expect(JSON.stringify(d0)).toBe(frozen);

    expect(d1.key).toBe('l_kitchen');
    expect(d1.text).toEqual({ width: '11\' 9 1/2"', length: '14\' 0"', ceilingHeight: '8\' 0"' });
    expect(d2.text.ceilingHeight).toBe("9'");
    expect(d3.blurred.width).toBe(true);

    expect(d4.key).toBe('galley_kitchen');
    expect(d4.text).toEqual({ width: '8\' 0"', length: '14\' 0"', ceilingHeight: "9'" });
    expect(d4.blurred.width).toBe(false);

    expect(d5.key).toBeNull();
    expect(d5.text).toEqual(d4.text);
    expect(JSON.stringify(d0)).toBe(frozen);

    expect(templateAreaText(d1)).toBe('165');
    expect(templateAreaText(d4)).toBe('112');
    expect(templateAreaText(selectTemplate(d0, 'bath_5x8'))).toBe('40');
    expect(templateAreaText(selectTemplate(d0, 'primary_bath'))).toBe('120');
    expect(templateAreaText(editSize(editSize(d1, 'width', "200'"), 'length', "200'"))).toBe(
      '40,000',
    );
    expect(templateAreaText(editSize(d1, 'width', 'x'))).toBeNull();
    expect(templateAreaText(d5)).toBeNull();
  });

  it('EZD-221b U6 read and refusal: what is sent, which fields are refused, and when the error shows', () => {
    const d0 = initialTemplateDraft();
    const d1 = selectTemplate(d0, 'l_kitchen');

    expect(readTemplate(editSize(d0, 'width', 'junk'))).toEqual({ ok: true, template: null });
    expect(readTemplate(d1)).toEqual({
      ok: true,
      template: { key: 'l_kitchen', width: 141.5, length: 168, ceilingHeight: 96 },
    });
    expect(readTemplate(editSize(d1, 'width', '12 6'))).toEqual({ ok: false, refused: ['width'] });
    expect(readTemplate(editSize(d1, 'length', '0'))).toEqual({ ok: false, refused: ['length'] });
    expect(readTemplate(editSize(d1, 'ceilingHeight', '200\' 1/16"'))).toEqual({
      ok: false,
      refused: ['ceilingHeight'],
    });
    expect(readTemplate(editSize(d1, 'ceilingHeight', "200'"))).toEqual({
      ok: true,
      template: { key: 'l_kitchen', width: 141.5, length: 168, ceilingHeight: 2400 },
    });
    expect(readTemplate(editSize(editSize(d1, 'width', ''), 'length', 'x'))).toEqual({
      ok: false,
      refused: ['width', 'length'],
    });

    const bad = editSize(d1, 'width', '12 6');
    expect(showsRefusal(bad)).toBe(false);
    const blurred = blurSize(bad, 'width');
    expect(showsRefusal(blurred)).toBe(true);
    expect(showsRefusal(editSize(blurred, 'width', "12'"))).toBe(false);
    expect(showsRefusal(blurSize(editSize(d0, 'width', 'junk'), 'width'))).toBe(false);
  });
});
