'use client';
// EZD-506 (S05 Controls "Section A-A preview: Inspector. Live section through the selected beams: adjoining height,
// beam height, ridge height. Read only."; board S05Ceiling "Section A-A" block; AC-EZD-506-1 "The preview updates
// when Height AFF changes"): the section drawn under the beam fields. It reads the same model snapshot as the
// fields, so every edit re-draws it. Scaled to fit the board's 330 x 140 box: the room fills x 60 to 270 (the stub
// left of it is the adjoining ceiling), the floor sits at y 128 and the highest line at y 20.
import { useMemo, type ReactElement } from 'react';
import {
  DETAIL_DISPLAY_DENOMINATOR,
  beamSetSection,
  formatLength,
  type SectionPoint,
} from '@ezdraft/geometry';
import { useT } from '../../lib/messages';
import type { Objects } from '../model/patches';
import { beamOf } from '../tools/beam-edits';
import { levelModelObjects } from './inspector-edits';
import styles from './BeamSection.module.css';

const VIEW_W = 330;
const VIEW_H = 140;
const ROOM_X0 = 60;
const ROOM_X1 = 270;
const FLOOR_Y = 128;
const TOP_Y = 20;

const feet = (inches: number) => formatLength(inches, DETAIL_DISPLAY_DENOMINATOR);
const n = (v: number) => String(Math.round(v * 10) / 10);

export function BeamSection({ objects, beamId }: { objects: Objects; beamId: string }): ReactElement | null {
  const t = useT();
  const section = useMemo(() => {
    const beam = beamOf(objects, beamId);
    if (beam === null) return null;
    return beamSetSection(beam.data, levelModelObjects(objects, beam.data.level));
  }, [objects, beamId]);
  if (section === null || section.width <= 0) return null;

  const tops = [
    ...section.profile.map((p) => p.z),
    ...section.beams.flat().map((p) => p.z),
    section.adjoining ?? 0,
  ];
  const maxZ = Math.max(...tops);
  const sx = (ROOM_X1 - ROOM_X0) / section.width;
  const sz = maxZ > 0 ? (FLOOR_Y - TOP_Y) / maxZ : 1;
  const X = (x: number) => ROOM_X0 + x * sx;
  const Y = (z: number) => FLOOR_Y - z * sz;
  const pts = (ps: SectionPoint[]) => ps.map((p) => `${n(X(p.x))},${n(Y(p.z))}`).join(' ');

  const top = section.ridge ?? section.ceiling ?? section.plate;
  const peak = section.profile.reduce((a, p) => (p.z > a.z ? p : a), section.profile[0]!);
  const firstBeam = section.beams[0];
  const beamBottom =
    firstBeam === undefined ? null : Math.min(...firstBeam.map((p) => p.z));

  return (
    <div className={styles.block} data-testid="beam-section">
      <span className={styles.heading}>{t('office.beam.section.title')}</span>
      <svg
        width={300}
        height={120}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={t('office.beam.section.aria')}
      >
        {section.adjoining === null ? null : (
          <line
            className={styles.adjoining}
            data-testid="beam-section-adjoining"
            x1={0}
            y1={n(Y(section.adjoining))}
            x2={ROOM_X0}
            y2={n(Y(section.adjoining))}
          />
        )}
        <polyline
          className={styles.profile}
          data-testid="beam-section-profile"
          points={pts(section.profile)}
        />
        {section.beams.map((b, i) => (
          <polygon key={i} className={styles.beam} data-testid="beam-section-beam" points={pts(b)} />
        ))}
        <line className={styles.floor} x1={0} y1={FLOOR_Y} x2={VIEW_W} y2={FLOOR_Y} />
        {section.adjoining === null ? null : (
          <text
            className={styles.label}
            data-testid="beam-section-adjoining-label"
            x={0}
            y={n(Y(section.adjoining) - 9)}
          >
            {t('office.beam.section.adjoining', { height: feet(section.adjoining) })}
          </text>
        )}
        {section.beamHeight === null ? null : (
          <text
            className={styles.label}
            data-testid="beam-section-beams-label"
            x={n((ROOM_X0 + ROOM_X1) / 2 - 35)}
            y={n(Math.min(FLOOR_Y - 6, Y(beamBottom ?? section.beamHeight) + 20))}
          >
            {t('office.beam.section.beams', { height: feet(section.beamHeight) })}
          </text>
        )}
        <text
          className={styles.label}
          data-testid={section.ridge === null ? 'beam-section-ceiling-label' : 'beam-section-ridge-label'}
          x={n(Math.min(VIEW_W - 90, X(peak.x) + 15))}
          y={n(Math.max(12, Y(top) + 2))}
        >
          {section.ridge === null
            ? t('office.beam.section.ceiling', { height: feet(top) })
            : t('office.beam.section.ridge', { height: feet(top) })}
        </text>
      </svg>
    </div>
  );
}
