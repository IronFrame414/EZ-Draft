'use client';
// EZD-514 (S05 Controls "Framing known (not in mockup) | Inspector, when a ceiling is selected | Choose Unknown / New
// construction / Full demo / Enter locations. Enter locations: draw joist or beam lines with direction and spacing.
// Turns keep-clear checks on. | Edit model."; S05 Decision 5; Q-0769 "built from the written spec in the style of the
// nearest approved board"; Q-0561 length fields; vault/build/assumptions.md EZD-514): the Framing known section of a
// selected room's inspector on Ceiling or Both. The choice is a select like the beam inspector's; with framing known
// the member and spacing are set for the next line and Draw line turns the framing line tool on for this room. Each
// drawn line is listed with a Remove button. Without Edit model the choice and the list are read only.
import { useEffect, useState, useSyncExternalStore, type ReactElement } from 'react';
import {
  FRAMING_KNOWN,
  FRAMING_MEMBER_KINDS,
  formatLength,
  parseLength,
  type FramingMemberKind,
} from '@ezdraft/geometry';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import type { SurfaceSetting } from '../ceiling/surface';
import parts from '../ceiling/CeilingParts.module.css';
import type { ModelStore } from '../model/model-store';
import { framingOf, removeFramingLine, setFramingKnown } from '../tools/framing-edits';
import { DEFAULT_JOIST_SPACING_IN, type FramingDrawing } from '../tools/framing-tool';
import { sameId } from '../shared/ids';
import styles from './InspectorPanel.module.css';

export type FramingKnownProps = {
  store: Pick<ModelStore, 'getState' | 'subscribe' | 'applyEdit'>;
  roomId: string;
  canEdit: boolean;
  surface: Pick<SurfaceSetting, 'get' | 'setTool' | 'subscribe'>;
  /** The page's framing drawing from the RCP module, the one the framing line tool reads (one instance per page). */
  drawing: FramingDrawing;
};

const spacingText = (spacing: number | null): string =>
  spacing === null ? '' : formatLength(spacing, 16);

export function FramingKnownSection({
  store,
  roomId,
  canEdit,
  surface,
  drawing,
}: FramingKnownProps): ReactElement | null {
  const t = useT();
  const objects = useSyncExternalStore(
    store.subscribe,
    () => store.getState().objects,
    () => store.getState().objects,
  );
  const tool = useSyncExternalStore(
    surface.subscribe,
    () => surface.get().tool,
    () => surface.get().tool,
  );
  const target = useSyncExternalStore(drawing.subscribe, drawing.get, drawing.get);
  const [kind, setKind] = useState<FramingMemberKind>('joist');
  const [spacing, setSpacing] = useState(spacingText(DEFAULT_JOIST_SPACING_IN));
  const [error, setError] = useState<MessageKey | null>(null);
  const framing = framingOf(objects, roomId);
  const drawingHere =
    canEdit && tool === 'framing-line' && target.roomId !== null && sameId(target.roomId, roomId);

  // The tool draws on this room only: it goes off when this section goes (another selection).
  useEffect(
    () => () => {
      if (surface.get().tool === 'framing-line') surface.setTool(null);
    },
    [surface, roomId],
  );

  if (framing === null) return null;
  const known = framing.known;

  const onDraw = () => {
    if (drawingHere) {
      surface.setTool(null);
      return;
    }
    let next: number | null = null;
    if (spacing.trim() !== '') {
      const r = parseLength(spacing, 'positive');
      if (!r.ok) {
        setError(r.messageKey);
        return;
      }
      next = r.inches;
    }
    setError(null);
    drawing.setTarget(roomId, kind, next);
    surface.setTool('framing-line');
  };

  return (
    <div className={styles.section} data-testid="framing-known">
      <label className={styles.field}>
        <span className={styles.head}>{t('office.ceiling.framing.title')}</span>
        <select
          className={styles.select}
          data-testid="framing-known-choice"
          value={known}
          disabled={!canEdit}
          onChange={(e) => {
            const v = FRAMING_KNOWN.find((k) => k === e.target.value);
            if (v === undefined) return;
            const change = setFramingKnown(store.getState().objects, roomId, v);
            if (change !== null) store.applyEdit([change]);
            if (v === 'unknown' && drawingHere) surface.setTool(null);
          }}
        >
          {FRAMING_KNOWN.map((k) => (
            <option key={k} value={k}>
              {t(`office.ceiling.framing.known.${k}`)}
            </option>
          ))}
        </select>
      </label>
      {known === 'unknown' ? null : (
        <>
          {canEdit ? (
            <>
              <div className={styles.pair}>
                <label className={styles.field}>
                  {t('office.ceiling.framing.member')}
                  <select
                    className={styles.select}
                    data-testid="framing-member"
                    value={kind}
                    onChange={(e) => {
                      const v = FRAMING_MEMBER_KINDS.find((k) => k === e.target.value);
                      if (v !== undefined) setKind(v);
                    }}
                  >
                    {FRAMING_MEMBER_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {t(`office.ceiling.framing.member.${k}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  {t('office.ceiling.framing.spacing')}
                  <input
                    className={styles.input}
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={32}
                    data-testid="framing-spacing"
                    placeholder={t('office.ceiling.framing.single')}
                    aria-invalid={error !== null}
                    value={spacing}
                    onChange={(e) => setSpacing(e.target.value)}
                  />
                </label>
              </div>
              {error === null ? null : (
                <span className={styles.error} role="alert" data-testid="framing-spacing-error">
                  {t(error)}
                </span>
              )}
              <button
                type="button"
                className={`${parts.lightingButton} ${drawingHere ? parts.lightingOn : ''}`}
                data-testid="framing-draw"
                aria-pressed={drawingHere}
                onClick={onDraw}
              >
                <Icon name="draw" size={18} />
                {t('office.ceiling.framing.draw')}
              </button>
              {drawingHere ? (
                <p className={parts.hint} data-testid="framing-drawing-hint">
                  {t('office.ceiling.framing.drawing')}
                </p>
              ) : null}
            </>
          ) : null}
          {framing.lines.length === 0 ? (
            <p className={parts.hint} data-testid="framing-no-lines">
              {t('office.ceiling.framing.none')}
            </p>
          ) : (
            <div className={styles.layers} data-testid="framing-lines">
              {framing.lines.map((line, i) => (
                <div className={styles.row} key={i} data-testid="framing-line">
                  <span className={styles.mono}>
                    {t('office.ceiling.framing.line', {
                      member: t(`office.ceiling.framing.member.${line.kind}`),
                      spacing:
                        line.spacing === null
                          ? t('office.ceiling.framing.single')
                          : t('office.ceiling.framing.spacing_oc', {
                              spacing: formatLength(line.spacing, 16),
                            }),
                    })}
                  </span>
                  {canEdit ? (
                    <button
                      type="button"
                      className={styles.small}
                      data-testid="framing-line-remove"
                      aria-label={t('office.ceiling.framing.remove')}
                      title={t('office.ceiling.framing.remove')}
                      onClick={() => {
                        const change = removeFramingLine(store.getState().objects, roomId, i);
                        if (change !== null) store.applyEdit([change]);
                      }}
                    >
                      <Icon name="delete" size={16} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
