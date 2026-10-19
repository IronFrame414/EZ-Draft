import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { TOKENS } from '../../../styles/tokens';
import { ICON_NAMES } from '../../../components/icon/icon-names.generated';
import { Icon } from '../../../components/icon/Icon';
import styles from './page.module.css';

const SPECIMEN_TEXT = '0123456789 12\' 6 1/2" · á é í ó ú ü ñ ¿ ¡ × ° …';

const SPECIMENS = [
  { font: 'sans', weight: 400 },
  { font: 'sans', weight: 500 },
  { font: 'sans', weight: 600 },
  { font: 'mono', weight: 400 },
  { font: 'mono', weight: 500 },
] as const;

const FRAME_HEIGHT = ['--ez-header-height', '--ez-status-bar-height'];

function sampleFor(token: (typeof TOKENS)[number]) {
  const v = `var(${token.name})`;
  switch (token.group) {
    case 'color':
    case 'status': {
      const swatch = <div className={styles.swatch} style={{ background: v }} />;
      if (token.name === '--ez-amber' || token.name === '--ez-green') {
        return (
          <>
            {swatch}
            <div
              className={styles.textSample}
              style={{ color: v, background: `var(${token.name}-tint)` }}
            >
              Sample text
            </div>
          </>
        );
      }
      return swatch;
    }
    case 'radius':
      return (
        <div className={`${styles.swatch} ${styles.frameSample}`} style={{ borderRadius: v }} />
      );
    case 'shadow':
      return <div className={styles.swatch} style={{ boxShadow: v }} />;
    case 'frame': {
      const style: CSSProperties = FRAME_HEIGHT.includes(token.name) ? { height: v } : { width: v };
      const cls = FRAME_HEIGHT.includes(token.name) ? styles.heightSample : styles.widthSample;
      return <div className={`${cls} ${styles.frameSample}`} style={style} />;
    }
  }
}

export default function Page() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return (
    <main className={styles.page}>
      <div className={styles.specimens}>
        {SPECIMENS.map((s) => (
          <div
            key={`${s.font}-${s.weight}`}
            data-font={s.font}
            data-weight={s.weight}
            style={{
              fontFamily: s.font === 'sans' ? 'var(--ez-font-sans)' : 'var(--ez-font-mono)',
              fontWeight: s.weight,
            }}
          >
            {SPECIMEN_TEXT}
          </div>
        ))}
      </div>
      <div className={styles.grid}>
        {TOKENS.map((token) => (
          <div
            key={token.name}
            className={styles.token}
            data-token={token.name}
            data-value={token.value}
          >
            <span className={styles.name}>{token.name}</span>
            <span className={styles.value}>{token.value}</span>
            {sampleFor(token)}
          </div>
        ))}
      </div>
      <div className={styles.grid}>
        {ICON_NAMES.map((name) => (
          <div key={name} className={styles.icon} data-icon={name}>
            <Icon name={name} size={20} />
            <span className={styles.name}>{name}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
