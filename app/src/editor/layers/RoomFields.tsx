'use client';
// EZD-729 (11 Budgets "editor before its lazy parts 500 KB"; ARCH Entry points and lazy modules; EZD-234 and EZD-227
// precedent): the Rooms tab's fields for the room selected alone, moved out of LeftPanel.tsx into the lazy
// `room-fields` module, loaded when the Rooms tab is opened; it now makes its own room edit.
// EZD-229 (AC-EZD-229-1, -3, -5; Q-0704 05-screens "Room photos come with EZD-229, in the Rooms tab, using EZD-220's
// attach piece"; 09q Floor level, Transitions; vault/build/assumptions.md EZD-229): the fields also show the floor
// level (any signed length, refused with the length message when it is not one), the room's transitions to the rooms
// next to it, and its photos, attached through the pin photo upload with the same file checks.
// EZD-733 (phase-07 EZD-733; S19 "Tile pattern select | Straight / diagonal / herringbone"; Q-0769 no board, in the
// style of these fields; vault/build/assumptions.md EZD-733): the room's floor tile: Add floor tile, then pattern, tile
// size, joint and the start point from the room's left and bottom edges. The plan draws the pieces and their cuts.
import {
  CEILING_TYPES,
  parseLength,
  ROOM_TYPES,
  TILE_PATTERNS,
  type TilePattern,
} from '@ezdraft/geometry';
import { formatInches } from '../../lib/catalog/catalog';
import { parseSignedLength } from './floor-transitions';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from 'react';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import {
  checkPinPhoto,
  fetchPhotoLink,
  PinPhotoError,
  uploadPinPhoto,
} from '../inspector/pin-photo';
import { pinUploadOf, type PinUploadState as Upload } from '../inspector/pin-uploads';
import type { ModelStore } from '../model/model-store';
import {
  floorTileAddChange,
  floorTileChange,
  floorTileRow,
  roomAttributeChange,
  type FloorTileEdit,
  type RoomField,
  type RoomRow,
} from './rooms';
import {
  floorLevelText,
  roomFloorAndPhotos,
  roomFloorLevelChange,
  roomPhotoChange,
  roomTransitionRows,
} from './room-transitions';
import styles from './LeftPanel.module.css';
import photoStyles from '../inspector/PinPanel.module.css';

// The file chooser's filter, as the pin photo's (PinPanel.tsx).
const ACCEPT = '.jpg,.jpeg,.png,.heic,image/jpeg,image/png,image/heic';

// A text field that commits on Enter or blur and goes back on Escape (P213b D-Length field).
function RoomText({
  testId,
  label,
  value,
  onCommit,
}: {
  testId: string;
  label: string;
  value: string;
  onCommit: (text: string) => boolean | void;
}) {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(value);
  }
  const commit = () => {
    if (draft === value) return;
    // A refused text stays in the box so it can be fixed (EZD-229).
    if (onCommit(draft) === false) return;
    setDraft(value);
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(value);
    }
  };
  return (
    <input
      className={styles.input}
      type="text"
      autoComplete="off"
      spellCheck={false}
      maxLength={120}
      aria-label={label}
      data-testid={testId}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={commit}
    />
  );
}

// EZD-229: one photo's thumbnail from a short-lived link signed from its file row.
function RoomPhoto({
  fileId,
  alt,
  fetchImpl,
}: {
  fileId: string;
  alt: string;
  fetchImpl?: typeof fetch;
}) {
  const t = useT();
  const [url, setUrl] = useState<string | null | 'loading'>('loading');
  useEffect(() => {
    let live = true;
    void fetchPhotoLink(fileId, fetchImpl ? { fetchImpl } : {}).then((u) => {
      if (live) setUrl(u);
    });
    return () => {
      live = false;
    };
  }, [fileId, fetchImpl]);
  if (url === 'loading')
    return (
      <p className={styles.plain} data-testid="room-photo-loading">
        {t('office.pin.photo_loading')}
      </p>
    );
  if (url === null)
    return (
      <p className={styles.plain} data-testid="room-photo-unshown">
        {t('office.pin.photo_unshown')}
      </p>
    );
  // A signed Storage link, not a Next image route.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={photoStyles.thumb} src={url} alt={alt} data-testid="room-photo-thumb" />;
}

// EZD-229 (AC-EZD-229-5): the room's photos and, with Edit model and a project, Add photo. A JPEG, PNG or HEIC file
// uploads as a source_file of kind photo and the room takes its id once the upload has finished; another type is
// refused with the pin's message; a failed upload shows Retry.
function RoomPhotos({
  row,
  photos,
  canEdit,
  store,
  projectId,
  fetchImpl,
  retryDelaysMs,
}: {
  row: RoomRow;
  photos: string[];
  canEdit: boolean;
  store: Pick<ModelStore, 'getState' | 'applyEdit'>;
  projectId?: string;
  fetchImpl?: typeof fetch;
  retryDelaysMs?: readonly number[];
}) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<Upload>(() => pinUploadOf(row.id).state);
  const mayAttach = canEdit && projectId !== undefined;
  const show = (s: Upload) => {
    pinUploadOf(row.id).state = s;
    setUpload(s);
  };
  const send = async () => {
    const p = pinUploadOf(row.id);
    if (p.file === null || projectId === undefined) return;
    show({ kind: 'uploading' });
    try {
      const fileId = await uploadPinPhoto(projectId, p.file, p.attempt, {
        ...(fetchImpl ? { fetchImpl } : {}),
        ...(retryDelaysMs ? { retryDelaysMs } : {}),
      });
      const change = roomPhotoChange(store.getState().objects, row.id, fileId);
      if (change !== null) store.applyEdit([change]);
      p.attempt.current = null;
      p.file = null;
      show({ kind: 'idle' });
    } catch (e) {
      show({ kind: 'failed', code: e instanceof PinPhotoError ? e.code : 'upload_failed' });
    }
  };
  const choose = (file: File | undefined) => {
    if (file === undefined) return;
    const check = checkPinPhoto(file.name, file.size);
    if (!check.ok) {
      show({ kind: 'refused', reason: check.reason });
      return;
    }
    const p = pinUploadOf(row.id);
    p.file = { name: file.name, blob: file, contentType: check.contentType };
    p.attempt.current = null;
    void send();
  };
  return (
    <div className={styles.field} data-testid="room-photos">
      <span>{t('office.left_panel.field.photos')}</span>
      {photos.length === 0 ? (
        <span className={styles.plain} data-testid="room-photos-none">
          {t('office.left_panel.no_photos')}
        </span>
      ) : (
        photos.map((id) => (
          <RoomPhoto
            key={id}
            fileId={id}
            alt={t('office.left_panel.photo_alt', { room: row.name })}
            {...(fetchImpl ? { fetchImpl } : {})}
          />
        ))
      )}
      {upload.kind === 'uploading' ? (
        <span className={styles.plain} data-testid="room-photo-uploading">
          {t('office.pin.uploading')}
        </span>
      ) : null}
      {upload.kind === 'failed' ? (
        <div className={photoStyles.failed} data-testid="room-photo-failed" role="alert">
          <span>
            {t(
              upload.code === 'not_authorized'
                ? 'error.not_authorized'
                : 'office.left_panel.photo_failed',
            )}
          </span>
          {mayAttach && upload.code === 'upload_failed' ? (
            <button
              type="button"
              className={photoStyles.button}
              data-testid="room-photo-retry"
              onClick={() => void send()}
            >
              {t('office.pin.retry')}
            </button>
          ) : null}
        </div>
      ) : null}
      {upload.kind === 'refused' ? (
        <p className={photoStyles.error} data-testid="room-photo-refused" role="alert">
          {t(
            upload.reason === 'not_photo'
              ? 'office.pin.not_photo'
              : upload.reason === 'too_large'
                ? 'office.pin.too_large'
                : 'office.pin.empty',
          )}
        </p>
      ) : null}
      {mayAttach ? (
        <>
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            hidden
            data-testid="room-photo-input"
            onChange={(e) => {
              choose(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className={photoStyles.button}
            data-testid="room-photo-add"
            disabled={upload.kind === 'uploading'}
            onClick={() => input.current?.click()}
          >
            <Icon name="add_photo_alternate" size={16} />
            {t('office.left_panel.add_photo')}
          </button>
        </>
      ) : null}
    </div>
  );
}

const inchText = (n: number) => `${formatInches(n)}"`;

const TILE_PATTERN_KEYS = {
  straight: 'office.cabinets.tile.pattern.straight',
  diagonal: 'office.cabinets.tile.pattern.diagonal',
  herringbone: 'office.cabinets.tile.pattern.herringbone',
} as const satisfies Record<TilePattern, MessageKey>;

// EZD-733: the floor tile fields; read only without Edit model.
function FloorTile({
  row,
  canEdit,
  store,
}: {
  row: RoomRow;
  canEdit: boolean;
  store: Pick<ModelStore, 'getState' | 'applyEdit'>;
}) {
  const t = useT();
  const [refused, setRefused] = useState(false);
  const tile = floorTileRow(store.getState().objects, row.id);
  const edit = (e: FloorTileEdit): boolean => {
    if (!canEdit) return false;
    const change = floorTileChange(store.getState().objects, row.id, e);
    if (change !== null) store.applyEdit([change]);
    return true;
  };
  const length = (
    testId: string,
    key: MessageKey,
    value: number,
    zero: boolean,
    set: (n: number) => FloorTileEdit,
  ) => (
    <label className={styles.field}>
      <span>{t(key)}</span>
      {canEdit ? (
        <RoomText
          testId={testId}
          label={t(key)}
          value={inchText(value)}
          onCommit={(v) => {
            const r = parseLength(v, zero ? 'other' : 'positive');
            const ok = r.ok && r.inches >= 0;
            setRefused(!ok);
            if (!ok) return false;
            edit(set(r.inches));
          }}
        />
      ) : (
        <span className={styles.plain} data-testid={testId}>
          {inchText(value)}
        </span>
      )}
    </label>
  );
  if (tile === null) {
    return (
      <div className={styles.field} data-testid="room-floor-tile">
        <span>{t('office.left_panel.field.floor_tile')}</span>
        {canEdit ? (
          <button
            type="button"
            className={photoStyles.button}
            data-testid="room-floor-tile-add"
            onClick={() => {
              const change = floorTileAddChange(store.getState().objects, row.id, () =>
                crypto.randomUUID(),
              );
              if (change !== null) store.applyEdit([change]);
            }}
          >
            {t('office.left_panel.add_floor_tile')}
          </button>
        ) : (
          <span className={styles.plain} data-testid="room-floor-tile-none">
            {t('office.left_panel.no_floor_tile')}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className={styles.fields} data-testid="room-floor-tile" data-tile-id={tile.id}>
      <label className={styles.field}>
        <span>{t('office.left_panel.floor_tile.pattern')}</span>
        {canEdit ? (
          <select
            className={styles.select}
            data-testid="room-floor-tile-pattern"
            value={tile.pattern}
            onChange={(e) => edit({ pattern: e.target.value as TilePattern })}
          >
            {TILE_PATTERNS.map((p) => (
              <option key={p} value={p}>
                {t(TILE_PATTERN_KEYS[p])}
              </option>
            ))}
          </select>
        ) : (
          <span className={styles.plain} data-testid="room-floor-tile-pattern">
            {t(TILE_PATTERN_KEYS[tile.pattern])}
          </span>
        )}
      </label>
      {length(
        'room-floor-tile-width',
        'office.left_panel.floor_tile.width',
        tile.tileWidth,
        false,
        (n) => ({
          tileWidth: n,
        }),
      )}
      {length(
        'room-floor-tile-height',
        'office.left_panel.floor_tile.height',
        tile.tileHeight,
        false,
        (n) => ({
          tileHeight: n,
        }),
      )}
      {length(
        'room-floor-tile-joint',
        'office.left_panel.floor_tile.joint',
        tile.joint,
        true,
        (n) => ({
          joint: n,
        }),
      )}
      {length(
        'room-floor-tile-start-left',
        'office.left_panel.floor_tile.start_left',
        tile.fromLeft,
        true,
        (n) => ({
          fromLeft: n,
        }),
      )}
      {length(
        'room-floor-tile-start-bottom',
        'office.left_panel.floor_tile.start_bottom',
        tile.fromBottom,
        true,
        (n) => ({ fromBottom: n }),
      )}
      {refused ? (
        <p className={photoStyles.error} data-testid="room-floor-tile-refused" role="alert">
          {t('office.length.refused')}
        </p>
      ) : null}
    </div>
  );
}

export function RoomFields({
  row,
  canEdit,
  store,
  projectId,
  fetchImpl,
  retryDelaysMs,
}: {
  row: RoomRow;
  canEdit: boolean;
  store: Pick<ModelStore, 'getState' | 'applyEdit'>;
  // EZD-229: without a project id there is nowhere to send a photo, so Add photo is not offered.
  projectId?: string;
  fetchImpl?: typeof fetch;
  retryDelaysMs?: readonly number[];
}) {
  const t = useT();
  const [levelRefused, setLevelRefused] = useState(false);
  const transitions = roomTransitionRows(store.getState().objects, row.id);
  const { floorLevel, photos } = roomFloorAndPhotos(store.getState().objects, row.id);
  // One field edit is one model edit (EZD-218).
  const onEdit = (field: RoomField, value: string | null) => {
    if (!canEdit) return;
    const change = roomAttributeChange(store.getState().objects, row.id, field, value);
    if (change !== null) store.applyEdit([change]);
  };
  const typeText = (v: RoomRow['roomType']) =>
    v === null ? t('office.left_panel.not_set') : t(`office.left_panel.room_type.${v}`);
  const ceilingText = (v: RoomRow['ceilingType']) =>
    v === null ? t('office.left_panel.not_set') : t(`office.left_panel.ceiling_type.${v}`);
  const field = (key: MessageKey, testId: string, edit: ReactElement, plain: string) => (
    <label className={styles.field}>
      <span>{t(key)}</span>
      {canEdit ? (
        edit
      ) : (
        <span className={styles.plain} data-testid={testId}>
          {plain}
        </span>
      )}
    </label>
  );
  return (
    <div className={styles.fields} data-testid="room-fields" data-room-id={row.id}>
      {field(
        'office.left_panel.field.name',
        'room-name',
        <RoomText
          testId="room-name"
          label={t('office.left_panel.field.name')}
          value={row.name}
          onCommit={(v) => onEdit('name', v)}
        />,
        row.name,
      )}
      {field(
        'office.left_panel.field.room_type',
        'room-type',
        <select
          className={styles.select}
          data-testid="room-type"
          value={row.roomType ?? ''}
          onChange={(e) => onEdit('roomType', e.target.value === '' ? null : e.target.value)}
        >
          <option value="">{t('office.left_panel.not_set')}</option>
          {ROOM_TYPES.map((v) => (
            <option key={v} value={v}>
              {t(`office.left_panel.room_type.${v}`)}
            </option>
          ))}
        </select>,
        typeText(row.roomType),
      )}
      <div className={styles.field}>
        <span>{t('office.left_panel.field.area')}</span>
        <span className={styles.plain} data-testid="room-area">
          {t('office.left_panel.area', { area: row.areaSqFt })}
        </span>
      </div>
      {field(
        'office.left_panel.field.floor_finish',
        'room-floor-finish',
        <RoomText
          testId="room-floor-finish"
          label={t('office.left_panel.field.floor_finish')}
          value={row.floorFinish}
          onCommit={(v) => onEdit('floorFinish', v)}
        />,
        row.floorFinish === '' ? t('office.left_panel.not_set') : row.floorFinish,
      )}
      {field(
        'office.left_panel.field.floor_level',
        'room-floor-level',
        <RoomText
          testId="room-floor-level"
          label={t('office.left_panel.field.floor_level')}
          value={floorLevelText(floorLevel)}
          onCommit={(v) => {
            const ok = parseSignedLength(v).ok;
            setLevelRefused(!ok);
            if (!ok) return false;
            const change = roomFloorLevelChange(store.getState().objects, row.id, v);
            if (change !== null) store.applyEdit([change]);
          }}
        />,
        floorLevelText(floorLevel),
      )}
      {levelRefused ? (
        <p className={photoStyles.error} data-testid="room-floor-level-refused" role="alert">
          {t('office.length.refused')}
        </p>
      ) : null}
      <div className={styles.field} data-testid="room-transitions">
        <span>{t('office.left_panel.field.transitions')}</span>
        {transitions.length === 0 ? (
          <span className={styles.plain} data-testid="room-transition-none">
            {t('office.left_panel.no_transitions')}
          </span>
        ) : (
          transitions.map((tr, i) => (
            <span
              key={`${tr.otherRoomId}-${i}`}
              className={styles.plain}
              data-testid="room-transition"
            >
              {tr.step === null
                ? t('office.left_panel.transition_finish', { room: tr.otherRoomName })
                : t('office.left_panel.transition_step', {
                    room: tr.otherRoomName,
                    step: tr.step,
                  })}
            </span>
          ))
        )}
      </div>
      {field(
        'office.left_panel.field.ceiling_type',
        'room-ceiling-type',
        <select
          className={styles.select}
          data-testid="room-ceiling-type"
          value={row.ceilingType ?? ''}
          onChange={(e) => onEdit('ceilingType', e.target.value === '' ? null : e.target.value)}
        >
          <option value="">{t('office.left_panel.not_set')}</option>
          {CEILING_TYPES.map((v) => (
            <option key={v} value={v}>
              {t(`office.left_panel.ceiling_type.${v}`)}
            </option>
          ))}
        </select>,
        ceilingText(row.ceilingType),
      )}
      <FloorTile row={row} canEdit={canEdit} store={store} />
      <RoomPhotos
        row={row}
        photos={photos}
        canEdit={canEdit}
        store={store}
        {...(projectId !== undefined ? { projectId } : {})}
        {...(fetchImpl ? { fetchImpl } : {})}
        {...(retryDelaysMs ? { retryDelaysMs } : {})}
      />
    </div>
  );
}
