'use client';
// EZD-213b (board S03dWallSelected; D-Edit layers, D-Focus Length, D-View only), EZD-214 (Status), EZD-215
// (Engineer required), EZD-213c (Resolve the gap, last): the wall inspector. EZD-1915: moved out of
// InspectorPanel.tsx unchanged.
import { WALL_MATERIALS, type WallLayer } from '@ezdraft/geometry';
import { Icon } from '../../../components/icon/Icon';
import { useT } from '../../../lib/messages';
import { layerEdit } from '../inspector-input';
import type { InspectorView } from '../inspector-view';
import { ResolveGap } from '../ResolveGap';
import styles from '../InspectorPanel.module.css';
import {
  ControlErrorLine,
  Header,
  LengthField,
  MAX_TEXT_LENGTH,
  SEPARATOR,
  StatusSection,
  TextBox,
  layerLine,
  layerRowsReadOnly,
  lengthText,
  one,
  useControlCommit,
} from './SharedFields';
import type { InspectorContentProps } from './types';

type WallView = Extract<InspectorView, { kind: 'wall' }>;

export function WallPanel(props: InspectorContentProps & { view: WallView }) {
  const { view, canEdit, onCommit } = props;
  const t = useT();
  const f = view.fields;
  const { error, run, commit } = useControlCommit(onCommit);
  const title =
    view.number === null
      ? t('office.conflicts.object.wall_unnumbered')
      : t('office.conflicts.object.wall', { number: view.number });
  const subtitle =
    view.rooms.length > 0 ? view.rooms.join(SEPARATOR) : t('office.inspector.no_room');
  const editing = props.layersEditing && canEdit;
  const status = t(`office.inspector.status.${f.status}`);
  const statusShared = one(f.status);

  return (
    <div className={styles.panel} data-testid="inspector" data-inspector-kind="wall">
      <Header title={title} subtitle={subtitle} canEdit={canEdit} />
      {view.engineerRequired.length > 0 ? (
        <div className={styles.flag} data-testid="inspector-engineer-required" role="status">
          <span className={styles.flagTitle}>
            <Icon name="error" size={18} />
            {t('office.engineer.required')}
          </span>
          {canEdit ? (
            <span className={`${styles.hint} ${styles.flagHint}`}>
              {t('office.engineer.wall_hint')}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className={styles.grid3}>
        <TextBox
          testId="inspector-length"
          label={t('office.inspector.field.length')}
          shared={one(f.length)}
          canEdit={canEdit}
          onText={lengthText('wallLength', onCommit)}
          inputRef={props.lengthRef}
        />
        <TextBox
          testId="inspector-thickness"
          label={t('office.inspector.field.thickness')}
          shared={one(f.thickness)}
          canEdit={canEdit}
          onText={lengthText('wallThickness', onCommit)}
        />
        <TextBox
          testId="inspector-height"
          label={t('office.inspector.field.height')}
          shared={one(f.height)}
          canEdit={canEdit}
          onText={lengthText('wallHeight', onCommit)}
        />
      </div>
      {canEdit ? (
        <>
          <div className={styles.section}>
            <div className={styles.headRow}>
              <span className={styles.head}>{t('office.inspector.field.layers')}</span>
              <button
                type="button"
                className={styles.small}
                aria-pressed={editing}
                data-testid="inspector-edit-layers"
                onClick={props.onToggleLayers}
              >
                {t('office.inspector.field.edit_layers')}
              </button>
            </div>
            <div className={styles.layers} data-testid="inspector-layers">
              {editing
                ? f.layers.map((r, i) => (
                    <div key={i} className={styles.row} data-testid={`inspector-layer-${i}`}>
                      <select
                        className={styles.select}
                        aria-label={t('office.inspector.field.layers')}
                        data-testid={`inspector-layer-${i}-material`}
                        value={r.material}
                        onChange={(e) =>
                          run(`inspector-layer-${i}`, () =>
                            props.onLayerMaterial(i, e.target.value as WallLayer['material']),
                          )
                        }
                      >
                        {WALL_MATERIALS.map((m) => (
                          <option key={m} value={m}>
                            {t(`office.inspector.material.${m}`)}
                          </option>
                        ))}
                      </select>
                      <LengthField
                        testId={`inspector-layer-${i}-thickness`}
                        label={t(`office.inspector.material.${r.material}`)}
                        value={r.thickness}
                        mixed={false}
                        onText={(text) => {
                          const p = layerEdit(i, r.material, text);
                          return p.ok ? onCommit([p.edit]) : p.messageKey;
                        }}
                        maxLength={MAX_TEXT_LENGTH}
                      />
                      <ControlErrorLine error={error} testId={`inspector-layer-${i}`} />
                    </div>
                  ))
                : layerRowsReadOnly(t, f.layers)}
              <div className={`${styles.row} ${styles.total}`} data-testid="inspector-layers-total">
                <span>{t('office.inspector.field.total')}</span>{' '}
                <span className={styles.mono}>{f.total}</span>
              </div>
            </div>
          </div>
          <StatusSection status={statusShared} canEdit commit={commit} error={error} />
          <div className={styles.section}>
            <label className={styles.check}>
              <input
                type="checkbox"
                data-testid="inspector-bearing"
                checked={f.bearing}
                onChange={(e) =>
                  commit('inspector-bearing', [{ field: 'wallBearing', value: e.target.checked }])
                }
              />
              {t('office.inspector.field.bearing')}
            </label>
            <ControlErrorLine error={error} testId="inspector-bearing" />
          </div>
        </>
      ) : (
        <>
          <div className={styles.section}>
            <span className={styles.head}>{t('office.inspector.field.layers')}</span>
            <span className={styles.layerLine} data-testid="inspector-layers">
              {layerLine(t, f.layers)}
            </span>
          </div>
          <div className={`${styles.section} ${styles.side}`}>
            <div className={styles.field}>
              <span>{t('office.inspector.field.status')}</span>
              <span className={styles.plain} data-testid="inspector-status">
                {status}
              </span>
            </div>
            <div className={styles.field}>
              <span>{t('office.inspector.field.bearing')}</span>
              <span className={styles.plain} data-testid="inspector-bearing">
                {t(f.bearing ? 'office.inspector.yes' : 'office.inspector.no')}
              </span>
            </div>
          </div>
        </>
      )}
      {props.gap != null ? <ResolveGap {...props.gap} /> : null}
    </div>
  );
}
