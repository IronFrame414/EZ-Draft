// EZD-1202 (Settled "Images at phone size, loaded lazily"; 11 rule 12; 03c render preview_path 1600 px): the client
// image loads lazily unless marked above the fold, and shows the preview link it is given.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClientImage } from './ClientImage';

const PREVIEW = 'https://storage.example.test/renders/t/p/r-1600.webp?token=x';

describe('EZD-1202 client image', () => {
  it('loads lazily by default, with its size set and the preview copy as its source', () => {
    const html = renderToStaticMarkup(<ClientImage previewSrc={PREVIEW} alt="Kitchen" width={1600} height={1000} />);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain('width="1600"');
    expect(html).toContain('height="1000"');
    expect(html).toContain(`src="${PREVIEW.replace(/&/g, '&amp;')}"`);
  });

  it('an image above the fold loads at once', () => {
    const html = renderToStaticMarkup(
      <ClientImage previewSrc={PREVIEW} alt="Kitchen" width={1600} height={1000} aboveFold />,
    );
    expect(html).toContain('loading="eager"');
    expect(html).not.toContain('loading="lazy"');
  });
});
