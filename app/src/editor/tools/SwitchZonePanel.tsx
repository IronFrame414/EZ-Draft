'use client';
// EZD-510 (S05 Controls "Switching zones | Left panel, Lighting | Draws switching zones and dimmers on the RCP (dashed
// accent lines). | Edit model."; S05 States "Locked / view-only: ... Rail tools other than Select disabled"; board
// S05Ceiling left panel "Lighting" with the full-width "Switching zones" button; AC-EZD-510-1, -2; Q-0769 built from
// the written spec in the board's style; vault/build/assumptions.md EZD-510): the left panel's Lighting section, whose
// button turns the Switching zones tool on and off, with the Dimmer choice for the next zone and the drawing hint
// while it is on; and the inspector of one selected zone, whose Dimmer box turns its dimmer mark on or off. Without
// Edit model and the lock the button and the boxes are disabled. Each change is one edit (one undo step).
import { useSyncExternalStore, type ReactElement } from 'react';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import type { SurfaceSetting } from '../ceiling/surface';
import styles from '../ceiling/CeilingParts.module.css';
import inspector from '../inspector/InspectorPanel.module.css';
import type { ModelStore } from '../model/model-store';
import { switchZoneOf, zoneDimmerChanges } from './switch-zone';
import { zoneDrawingFor, type ZoneDrawing } from './switch-zone-tool';

export function LightingSection({
  surface,
  drawing,
  canEdit,
}: {
  surface: Pick<SurfaceSetting, 'get' | 'setTool' | 'subscribe'>;
  drawing: Pick<ZoneDrawing, 'get' | 'setDimmer' | 'subscribe'>;
  canEdit: boolean;
}): ReactElement {
  const t = useT();
  const tool = useSyncExternalStore(
    surface.subscribe,
    () => surface.get().tool,
    () => surface.get().tool,
  );
  const dimmer = useSyncExternalStore(
    drawing.subscribe,
    () => drawing.get().dimmer,
    () => drawing.get().dimmer,
  );
  const on = canEdit && tool === 'switch-zone';
  return (
    <section className={styles.lighting} data-testid="ceiling-lighting">
      <span className={styles.lbl}>{t('office.ceiling.lighting.heading')}</span>
      <button
        type="button"
        className={`${styles.lightingButton} ${on ? styles.lightingOn : ''}`}
        data-testid="switching-zones"
        aria-pressed={on}
        disabled={!canEdit}
        onClick={() => surface.setTool(on ? null : 'switch-zone')}
      >
        <Icon name="tune" size={18} />
        {t('office.ceiling.zone.button')}
      </button>
      {on ? (
        <>
          <label className={inspector.check}>
            <input
              type="checkbox"
              data-testid="switching-zones-dimmer"
              checked={dimmer}
              onChange={(e) => drawing.setDimmer(e.target.checked)}
            />
            {t('office.ceiling.zone.dimmer')}
          </label>
          <p className={styles.hint} data-testid="switching-zones-hint">
            {t('office.ceiling.zone.hint')}
          </p>
        </>
      ) : null}
    </section>
  );
}

/** The Lighting section over the page's own zone drawing (11 Budgets: the editor entry names only the surface). */
export function Lighting({
  surface,
  canEdit,
}: {
  surface: SurfaceSetting;
  canEdit: boolean;
}): ReactElement {
  return <LightingSection surface={surface} drawing={zoneDrawingFor(surface)} canEdit={canEdit} />;
}

export function SwitchZoneInspector({
  store,
  zoneId,
  canEdit,
}: {
  store: Pick<ModelStore, 'getState' | 'subscribe' | 'applyEdit'>;
  zoneId: string;
  canEdit: boolean;
}): ReactElement | null {
  const t = useT();
  const objects = useSyncExternalStore(
    store.subscribe,
    () => store.getState().objects,
    () => store.getState().objects,
  );
  const zone = switchZoneOf(objects, zoneId);
  if (zone === null) return null;
  return (
    <div className={inspector.panel} data-testid="inspector" data-inspector-kind="switch_zone">
      <div className={inspector.header}>
        <div className={inspector.titleBlock}>
          <span className={inspector.title} data-testid="inspector-title">
            {t('office.ceiling.zone.title')}
          </span>
        </div>
        {canEdit ? (
          <span className={inspector.tag} data-testid="switch-zone-status">
            {t(`office.inspector.status.${zone.data.status}`)}
          </span>
        ) : (
          <span className={inspector.badge} data-testid="inspector-view-only">
            <Icon name="visibility" size={14} />
            {t('office.inspector.view_only')}
          </span>
        )}
      </div>
      <div className={inspector.section}>
        <label className={inspector.check}>
          <input
            type="checkbox"
            data-testid="switch-zone-dimmer"
            checked={zone.data.attributes.dimmer}
            disabled={!canEdit}
            onChange={(e) => {
              // EZD-605: the zone's switches follow its dimmer in the same undo step.
              const changes = zoneDimmerChanges(store.getState().objects, zoneId, e.target.checked);
              if (changes !== null) store.applyEdit(changes);
            }}
          />
          {t('office.ceiling.zone.dimmer')}
        </label>
      </div>
    </div>
  );
}
