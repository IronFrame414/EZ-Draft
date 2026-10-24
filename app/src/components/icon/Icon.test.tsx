// EZD-010b · T10: Icon draws a sprite symbol (vault/plans/EZD-010b.md Step 4, section 4).
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Icon } from './Icon';

describe('EZD-010b Icon component', () => {
  it('T10 (a): markup is exactly the sprite reference at size 20', () => {
    expect(renderToStaticMarkup(<Icon name="expand_more" size={20} />)).toBe(
      '<svg width="20" height="20" aria-hidden="true" focusable="false" fill="currentColor"><use href="/icons/sprite.svg#expand_more"></use></svg>',
    );
  });

  it('T10 (b): size sets width and height', () => {
    const html = renderToStaticMarkup(<Icon name="expand_more" size={18} />);
    expect(html).toContain('width="18"');
    expect(html).toContain('height="18"');
  });

  it('T10 (c): a name outside IconName is a type error', () => {
    // @ts-expect-error not_an_icon is not in icons.json
    const el = <Icon name="not_an_icon" size={20} />;
    expect(el).toBeTruthy();
  });
});
