// EZD-1202 (11 rule 12 "the client link loads the copies"; 03c render preview_path (1600 px); vault/build/
// assumptions/EZD-1202.md Settled "Images at phone size, loaded lazily"): the client page's image. It takes only
// the signed link of a render's 1600 px preview copy (`previewSrc`), never the full-size output file, and loads
// lazily unless the caller marks it above the fold. Width and height are given so the page never jumps. First user:
// the Plans tab and render card (EZD-1205, EZD-1203).
import styles from './ClientImage.module.css';

export type ClientImageProps = {
  /** A signed link to the 1600 px preview copy (render.preview_path), never the full-size file. */
  previewSrc: string;
  alt: string;
  width: number;
  height: number;
  /** The first image the client sees: loaded at once. Every other image loads when scrolled near. */
  aboveFold?: boolean;
};

export function ClientImage({ previewSrc, alt, width, height, aboveFold = false }: ClientImageProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a 900 s signed Storage link to the preview copy
    <img
      className={styles.image}
      src={previewSrc}
      alt={alt}
      width={width}
      height={height}
      loading={aboveFold ? 'eager' : 'lazy'}
      decoding="async"
    />
  );
}
