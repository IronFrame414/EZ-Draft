'use client';
// EZD-213b (board S03dStates bulk; Mixed values, D-View only), EZD-214 (Status): the inspector for several walls or
// openings together. EZD-1915: moved out of InspectorPanel.tsx unchanged.
import type { ObjectStatus } from '@ezdraft/geometry';
import { useT } from '../../../lib/messages';
import type { BulkOpeningFields, BulkWallFields, InspectorView, Shared } from '../inspector-view';
import styles from '../InspectorPanel.module.css';
import {
  ControlErrorLine,
  Header,
  ImpactSection,
  RoughOpeningSection,
  StatusSection,
  TextBox,
  layerLine,
  layerRowsReadOnly,
  lengthText,
  one,
  useControlCommit,
} from './SharedFields';
import type { InspectorContentProps } from './types';

type BulkView = Extract<InspectorView, { kind: 'bulk' }>;

export function BulkPanel(props: InspectorContentProps & { view: BulkView }) {
  const { view, canEdit } = props;
  const t = useT();
  const title = t(`office.inspector.bulk_title.${view.noun}`, { count: view.count });
  const subtitle = t('office.inspector.bulk_subtitle', { count: view.count });
  return (
    <div className={styles.panel} data-testid="inspector" data-inspector-kind="bulk">
      <Header title={title} subtitle={subtitle} canEdit={canEdit} />
      {view.walls !== null ? (
        <BulkWalls walls={view.walls} canEdit={canEdit} onCommit={props.onCommit} />
      ) : null}
      {view.openings !== null ? (
        <BulkOpenings openings={view.openings} canEdit={canEdit} onCommit={props.onCommit} />
      ) : null}
      <BulkStatus status={view.status} canEdit={canEdit} onCommit={props.onCommit} />
    </div>
  );
}

function BulkStatus({
  status,
  canEdit,
  onCommit,
}: {
  status: Shared<ObjectStatus>;
  canEdit: boolean;
  onCommit: InspectorContentProps['onCommit'];
}) {
  const { error, commit } = useControlCommit(onCommit);
  return <StatusSection status={status} canEdit={canEdit} commit={commit} error={error} />;
}

function BulkWalls({
  walls,
  canEdit,
  onCommit,
}: {
  walls: BulkWallFields;
  canEdit: boolean;
  onCommit: InspectorContentProps['onCommit'];
}) {
  const t = useT();
  const { error, commit } = useControlCommit(onCommit);
  const mixed = t('office.inspector.mixed');
  const bearing = walls.bearing;
  return (
    <>
      <div className={styles.grid2}>
        <TextBox
          testId="inspector-thickness"
          label={t('office.inspector.field.thickness')}
          shared={walls.thickness}
          canEdit={canEdit}
          onText={lengthText('wallThickness', onCommit)}
        />
        <TextBox
          testId="inspector-height"
          label={t('office.inspector.field.height')}
          shared={walls.height}
          canEdit={canEdit}
          onText={lengthText('wallHeight', onCommit)}
        />
      </div>
      <div className={styles.section}>
        <span className={styles.head}>{t('office.inspector.field.layers')}</span>
        {walls.layers.mixed ? (
          <span
            className={`${styles.readOnly} ${styles.readOnlyMixed}`}
            data-testid="inspector-layers-mixed"
          >
            {mixed}
          </span>
        ) : canEdit ? (
          <div className={styles.layers} data-testid="inspector-layers">
            {layerRowsReadOnly(t, walls.layers.value)}
          </div>
        ) : (
          <span className={styles.layerLine} data-testid="inspector-layers">
            {layerLine(t, walls.layers.value)}
          </span>
        )}
      </div>
      {canEdit ? (
        <div className={styles.section}>
          <label className={styles.check}>
            <input
              type="checkbox"
              data-testid="inspector-bearing"
              aria-label={bearing.mixed ? t('office.inspector.bearing_mixed') : undefined}
              checked={bearing.mixed ? false : bearing.value}
              onChange={(e) =>
                commit('inspector-bearing', [{ field: 'wallBearing', value: e.target.checked }])
              }
            />
            {t('office.inspector.field.bearing')}
            {bearing.mixed ? (
              <span
                className={`${styles.hint} ${styles.mixed}`}
                data-testid="inspector-bearing-mixed"
              >
                {mixed}
              </span>
            ) : null}
          </label>
          <ControlErrorLine error={error} testId="inspector-bearing" />
        </div>
      ) : (
        <div className={styles.section}>
          <div className={styles.field}>
            <span>{t('office.inspector.field.bearing')}</span>
            <span className={styles.plain} data-testid="inspector-bearing">
              {bearing.mixed
                ? mixed
                : t(bearing.value ? 'office.inspector.yes' : 'office.inspector.no')}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

function BulkOpenings({
  openings,
  canEdit,
  onCommit,
}: {
  openings: BulkOpeningFields;
  canEdit: boolean;
  onCommit: InspectorContentProps['onCommit'];
}) {
  const t = useT();
  const { error, commit } = useControlCommit(onCommit);
  const ro: Shared<string> = openings.roughOpening.mixed
    ? { mixed: true }
    : one(t('office.inspector.rough_opening_value', openings.roughOpening.value));
  return (
    <>
      <div className={`${styles.section} ${styles.first} ${styles.flush}`}>
        <span className={styles.head}>{t('office.inspector.field.size')}</span>
        <div className={styles.pair}>
          <TextBox
            testId="inspector-width"
            label={t('office.inspector.field.width')}
            shared={openings.width}
            canEdit={canEdit}
            onText={lengthText('openingWidth', onCommit)}
          />
          <TextBox
            testId="inspector-opening-height"
            label={t('office.inspector.field.height')}
            shared={openings.height}
            canEdit={canEdit}
            onText={lengthText('openingHeight', onCommit)}
          />
        </div>
      </div>
      {openings.sillHeight !== null ? (
        <div className={styles.section}>
          <TextBox
            testId="inspector-sill"
            label={t('office.inspector.field.sill')}
            shared={openings.sillHeight}
            canEdit={canEdit}
            onText={lengthText('sillHeight', onCommit)}
            head
          />
        </div>
      ) : null}
      <RoughOpeningSection shared={ro} auto={false} canEdit={canEdit} onCommit={onCommit} />
      <ImpactSection
        impact={openings.impactRating}
        shutter={openings.shutterType}
        canEdit={canEdit}
        commit={commit}
        error={error}
      />
    </>
  );
}
