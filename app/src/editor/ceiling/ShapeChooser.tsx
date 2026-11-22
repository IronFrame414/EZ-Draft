'use client';
// EZD-513 (S05 Controls "Soffit, tray, coffer | Ceiling rail | Draws a soffit, tray, coffer or crown"; S05 Validation
// "Typed heights: invalid format shows inline error, value not applied"; vault/build/assumptions.md EZD-513): while the
// Soffit, tray, coffer tool is on, a card over the canvas's left edge (the EZD-507 device chooser's card) picks what
// the next outline is and its size: a soffit's drop, a tray's rise, a coffer's depth or a crown's size, typed in the
// usual length formats. A refused size shows inline and is not applied.
import { useState, useSyncExternalStore, type ReactElement } from 'react';
import { formatLength, parseLength } from '@ezdraft/geometry';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import { SHAPE_KINDS, type ShapeKind } from './ceiling-shapes';
import { shapeDrawingFor, type ShapeDrawing } from './shape-tool';
import type { SurfaceSetting } from './surface';
import styles from './ShapeChooser.module.css';

const kindKey = (kind: ShapeKind) => `office.ceiling.shape.${kind}` as MessageKey;
const sizeKey = (kind: ShapeKind) => `office.ceiling.shape.size.${kind}` as MessageKey;

export function ShapeChooserCard({
  drawing,
}: {
  drawing: Pick<ShapeDrawing, 'get' | 'setKind' | 'setDepth' | 'subscribe'>;
}): ReactElement {
  const t = useT();
  const state = useSyncExternalStore(drawing.subscribe, drawing.get, drawing.get);
  const depth = state.depths[state.kind];
  // The typed text, per kind; null shows the kind's current size.
  const [typed, setTyped] = useState<{ kind: ShapeKind; text: string; refused: boolean } | null>(
    null,
  );
  const shown = typed !== null && typed.kind === state.kind ? typed : null;
  const apply = () => {
    if (shown === null) return;
    const r = parseLength(shown.text, 'positive');
    if (!r.ok) {
      setTyped({ ...shown, refused: true });
      return;
    }
    drawing.setDepth(state.kind, r.inches);
    setTyped(null);
  };
  return (
    <div
      className={styles.panel}
      data-testid="ceiling-shape-chooser"
      role="group"
      aria-label={t('office.ceiling.shape.chooser')}
    >
      <h2 className={styles.heading}>{t('office.ceiling.tool.soffit')}</h2>
      <div className={styles.kinds}>
        {SHAPE_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className={`${styles.kind} ${touch.hitArea}`}
            aria-pressed={k === state.kind}
            data-testid={`ceiling-shape-${k}`}
            onClick={() => drawing.setKind(k)}
          >
            {t(kindKey(k))}
          </button>
        ))}
      </div>
      <label className={styles.field}>
        {t(sizeKey(state.kind))}
        <input
          className={styles.input}
          data-testid="ceiling-shape-size"
          value={shown?.text ?? formatLength(depth, 16)}
          aria-invalid={shown?.refused === true}
          onChange={(e) => setTyped({ kind: state.kind, text: e.target.value, refused: false })}
          onBlur={apply}
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply();
          }}
        />
        {shown?.refused === true ? (
          <span className={styles.error} role="alert" data-testid="ceiling-shape-size-error">
            {t('office.length.refused')}
          </span>
        ) : null}
      </label>
      <p className={styles.hint}>{t('office.ceiling.shape.hint')}</p>
    </div>
  );
}

/** The card over the page's own outline drawing, shown only while the Soffit, tray, coffer tool is on. */
export function ShapeChooser({
  surface,
}: {
  surface: Pick<SurfaceSetting, 'get' | 'subscribe'>;
}): ReactElement | null {
  const tool = useSyncExternalStore(
    surface.subscribe,
    () => surface.get().tool,
    () => surface.get().tool,
  );
  if (tool !== 'soffit') return null;
  return <ShapeChooserCard drawing={shapeDrawingFor(surface)} />;
}
