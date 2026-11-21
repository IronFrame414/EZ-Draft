'use client';
// EZD-507 (S05 Controls "Fixture type tag edit (not in mockup) | Inspector, on a light | Set type tag, lumens, color
// temperature, trim, catalog item. | Edit model."; vault/build/assumptions.md EZD-507): the inspector for one selected
// light or fan: its kind and status, and its Fixture type. Each change is one edit (one undo step); without Edit model every
// field is read only. The catalog item is picked from the lighting catalog (EZD-401 picker).
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import { CatalogPicker } from '../../components/catalog/CatalogPicker';
import { Icon } from '../../components/icon/Icon';
import type { CatalogItem } from '../../lib/catalog/catalog';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import type { ModelStore } from '../model/model-store';
import {
  fixtureTypeEdit,
  fixtureTypeView,
  type FixtureTypeEdit,
  type FixtureTypeField,
} from './ceiling-device-tool';
import styles from '../inspector/InspectorPanel.module.css';

export type DevicePanelProps = {
  store: Pick<ModelStore, 'getState' | 'subscribe' | 'applyEdit'>;
  deviceId: string;
  canEdit: boolean;
  // Tests pass their own; the page reads GET /api/catalog.
  loadCatalog?: () => Promise<CatalogItem[]>;
};

async function fetchCatalogItems(): Promise<CatalogItem[]> {
  const res = await fetch('/api/catalog', { cache: 'no-store', credentials: 'same-origin' });
  if (res.status !== 200) throw new Error('catalog_load_failed');
  return ((await res.json()) as { items: CatalogItem[] }).items;
}

function TypeText({
  field,
  label,
  value,
  disabled,
  onText,
}: {
  field: FixtureTypeField;
  label: MessageKey;
  value: string;
  disabled: boolean;
  onText: (field: FixtureTypeField, text: string) => MessageKey | null;
}): ReactElement {
  const t = useT();
  const testId = `device-${field}`;
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<MessageKey | null>(null);
  // A new value resets the draft and the error while rendering (react-hooks/set-state-in-effect).
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(value);
    setError(null);
  }
  const commit = () => {
    if (draft === value) {
      setError(null);
      return;
    }
    setError(onText(field, draft));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(value);
      setError(null);
    }
  };
  return (
    <label className={styles.field}>
      {t(label)}
      <input
        className={styles.input}
        type="text"
        autoComplete="off"
        spellCheck={false}
        maxLength={64}
        aria-invalid={error !== null}
        disabled={disabled}
        data-testid={testId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
      />
      {error === null ? null : (
        <span className={styles.error} role="alert" data-testid={`${testId}-error`}>
          {t(error)}
        </span>
      )}
    </label>
  );
}

export function DevicePanel({
  store,
  deviceId,
  canEdit,
  loadCatalog = fetchCatalogItems,
}: DevicePanelProps): ReactElement | null {
  const t = useT();
  const objects = useSyncExternalStore(
    store.subscribe,
    () => store.getState().objects,
    () => store.getState().objects,
  );
  const [picking, setPicking] = useState(false);
  const [refusal, setRefusal] = useState<MessageKey | null>(null);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  const view = fixtureTypeView(objects, deviceId);
  const itemId = view?.catalogItemId ?? null;
  const known = itemId === null || names.has(itemId);
  useEffect(() => {
    if (known) return;
    let live = true;
    loadCatalog().then(
      (items) => live && setNames(new Map(items.map((i) => [i.id, i.name]))),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [known, loadCatalog]);
  if (view === null) return null;

  const apply = (edit: FixtureTypeEdit): MessageKey | null => {
    const r = fixtureTypeEdit(store.getState().objects, deviceId, edit);
    if (!r.ok) return r.messageKey;
    store.applyEdit([r.change]);
    return null;
  };
  const onText = (field: FixtureTypeField, text: string) => apply({ field, text });
  const pickItem = (item: CatalogItem | null) => {
    if (item !== null) setNames((m) => new Map(m).set(item.id, item.name));
    setRefusal(apply({ field: 'catalogItemId', value: item?.id ?? null }));
    setPicking(false);
  };
  const itemText =
    itemId === null ? t('office.device.type.catalog_none') : (names.get(itemId) ?? itemId);

  return (
    <div className={styles.panel} data-testid="inspector" data-inspector-kind="device">
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <span className={styles.title} data-testid="inspector-title">
            {t(`office.fixtures.detail.${view.kind}` as MessageKey)}
          </span>
        </div>
        {canEdit ? (
          <span className={styles.tag} data-testid="device-status">
            {t(`office.inspector.status.${view.status}` as MessageKey)}
          </span>
        ) : (
          <span className={styles.badge} data-testid="inspector-view-only">
            <Icon name="visibility" size={14} />
            {t('office.inspector.view_only')}
          </span>
        )}
      </div>
      <div className={styles.section} data-testid="device-type">
        <span className={styles.head}>{t('office.device.type.heading')}</span>
        <div className={styles.grid2}>
          <TypeText
            field="typeTag"
            label="office.device.type.tag"
            value={view.typeTag}
            disabled={!canEdit}
            onText={onText}
          />
          <TypeText
            field="lumens"
            label="office.device.type.lumens"
            value={view.lumens}
            disabled={!canEdit}
            onText={onText}
          />
        </div>
        <div className={styles.grid2}>
          <TypeText
            field="colorTemp"
            label="office.device.type.color_temp"
            value={view.colorTemp}
            disabled={!canEdit}
            onText={onText}
          />
          <TypeText
            field="trim"
            label="office.device.type.trim"
            value={view.trim}
            disabled={!canEdit}
            onText={onText}
          />
        </div>
        <div className={styles.field}>
          {t('office.device.type.catalog')}
          <span data-testid="device-catalog">{itemText}</span>
          {canEdit ? (
            <span>
              <button
                type="button"
                className={styles.select}
                data-testid="device-catalog-pick"
                onClick={() => setPicking((p) => !p)}
              >
                {t('office.device.type.catalog_pick')}
              </button>
              {itemId === null ? null : (
                <button
                  type="button"
                  className={styles.select}
                  data-testid="device-catalog-clear"
                  onClick={() => pickItem(null)}
                >
                  {t('office.device.type.catalog_clear')}
                </button>
              )}
            </span>
          ) : null}
        </div>
        {picking && canEdit ? <CatalogPicker initialCategory="lighting" onPick={pickItem} /> : null}
        {refusal === null ? null : (
          <span className={styles.error} role="alert" data-testid="device-type-error">
            {t(refusal)}
          </span>
        )}
      </div>
    </div>
  );
}
