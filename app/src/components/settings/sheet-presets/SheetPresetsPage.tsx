'use client';

// EZD-712 (S15c; board S15cSubmittal; ARCH Settings shell and Unsaved edits page contracts): Settings > Sheet
// presets. The main card lists the company's submittal profiles (the default first, marked Default; archived
// rows muted) with a row menu (Set as default, Duplicate, Archive or Restore, Delete); New profile copies the
// default. The inspector edits the EZD-712 fields: department name, submittal type, permit sheet size (fixed
// 24x36), electrical signature, file naming template with its tokens, stamp box size and position, and shows the
// PDF output line. File split, max size, revision naming, flatten, bookmarks, resubmittal, minimum scale and
// export unsigned are EZD-713; required notes wait for the notes library (EZD-714) (assumptions EZD-712).
// Offline: read-only.
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { useT } from '../../../lib/messages';
import { useOnline } from '../../../lib/network';
import {
  changedFields,
  checkFields,
  checkNamingTemplate,
  exampleName,
  fieldsOf,
  NAMING_TOKENS,
  SIGNERS,
  signerLabel,
  sortProfiles,
  STAMP_POSITIONS,
  stampPositionLabel,
  SUBMITTAL_TYPES,
  submittalTypeLabel,
  type ProfileFields,
  type Signer,
  type StampPosition,
  type SubmittalProfile,
} from '../../../lib/submittal-profiles/profiles';
import touch from '../../../styles/touch.module.css';
import { Icon } from '../../icon/Icon';
import { Menu, MenuItem } from '../../menu/Menu';
import { useConfirm } from '../../states/ConfirmProvider';
import { InlineError } from '../../states/InlineError';
import { OfflineBanner } from '../../states/OfflineBanner';
import { StateButton } from '../../states/StateButton';
import { SettingsMain, useSettingsStatus, type SettingsStatusEntry } from '../SettingsShell';
import { useLeaveCheck, useUnsavedChanges } from '../unsaved-changes';
import styles from './SheetPresets.module.css';

const API = '/api/settings/sheet-presets';
const LITERAL_TOKENS = { address: '{address}', rev: '{rev}' };

const positionShort: Record<StampPosition, string> = {
  bottom_right: 'BR',
  bottom_left: 'BL',
  top_right: 'TR',
  top_left: 'TL',
};

type Pending = { mode: 'new' } | { mode: 'duplicate'; source: SubmittalProfile };

export function SheetPresetsPage({
  initial,
  fetchImpl,
}: {
  initial: readonly SubmittalProfile[];
  fetchImpl?: typeof fetch;
}) {
  const t = useT();
  const router = useRouter();
  const online = useOnline();
  const ask = useConfirm();
  const leaveCheck = useLeaveCheck();
  const readOnly = !online;
  const doFetch = fetchImpl ?? fetch;

  const [profiles, setProfiles] = useState<SubmittalProfile[]>(() => sortProfiles(initial));
  const [selectedId, setSelectedId] = useState<string | null>(
    () => initial.find((p) => p.isDefault)?.id ?? initial[0]?.id ?? null,
  );
  const selected = profiles.find((p) => p.id === selectedId) ?? null;
  const [form, setForm] = useState<ProfileFields | null>(() =>
    selected ? fieldsOf(selected) : null,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<
    'office.sheet_presets.save_failed' | 'office.sheet_presets.name_taken' | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [newName, setNewName] = useState('');
  const [newError, setNewError] = useState<string | null>(null);
  // Bumped on Discard and on every profile switch so the stamp size inputs show the saved values again.
  const [resetKey, setResetKey] = useState(0);

  const changes = selected && form ? changedFields(selected, form) : null;
  const dirty = changes !== null;
  const problems = selected && form ? checkFields(form, selected.revisionNaming) : [];

  const replace = useCallback((p: SubmittalProfile) => {
    setProfiles((list) => sortProfiles(list.map((x) => (x.id === p.id ? p : x))));
  }, []);

  const save = useCallback(async (): Promise<boolean> => {
    if (!selected || changes === null) return true;
    if (problems.length > 0) return false;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await doFetch(`${API}/${selected.id}`, {
        method: 'PATCH',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fields: changes }),
      });
      if (res.status === 200) {
        const body = (await res.json()) as { profile: SubmittalProfile };
        replace(body.profile);
        setForm(fieldsOf(body.profile));
        router.refresh();
        return true;
      }
      setSaveError(
        res.status === 409 ? 'office.sheet_presets.name_taken' : 'office.sheet_presets.save_failed',
      );
      return false;
    } catch {
      setSaveError('office.sheet_presets.save_failed');
      return false;
    } finally {
      setSaving(false);
    }
  }, [selected, changes, problems.length, doFetch, replace, router]);

  useUnsavedChanges(dirty, save);

  const select = useCallback(
    async (id: string) => {
      if (id === selectedId) return;
      if (!(await leaveCheck())) return;
      const next = profiles.find((p) => p.id === id) ?? null;
      setSelectedId(id);
      setForm(next ? fieldsOf(next) : null);
      setSaveError(null);
      setResetKey((k) => k + 1);
    },
    [selectedId, leaveCheck, profiles],
  );

  // Set as default, Archive or Restore: one PATCH, the list re-read from the answer.
  const act = useCallback(
    async (p: SubmittalProfile, body: { setDefault: true } | { archived: boolean }) => {
      setActionError(null);
      try {
        const res = await doFetch(`${API}/${p.id}`, {
          method: 'PATCH',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.status !== 200) throw new Error(String(res.status));
        const list = await doFetch(API, { cache: 'no-store', credentials: 'same-origin' });
        if (list.status !== 200) throw new Error(String(list.status));
        const next = ((await list.json()) as { profiles: SubmittalProfile[] }).profiles;
        setProfiles(sortProfiles(next));
        router.refresh();
      } catch {
        setActionError('office.sheet_presets.action_failed');
      }
    },
    [doFetch, router],
  );

  const remove = useCallback(
    async (p: SubmittalProfile) => {
      const choice = await ask({
        title: 'office.sheet_presets.delete_title',
        message: 'office.sheet_presets.delete_message',
        params: { name: p.department },
        confirmLabel: 'office.sheet_presets.menu.delete',
        tone: 'danger',
      });
      if (choice !== 'confirm') return;
      setActionError(null);
      try {
        const res = await doFetch(`${API}/${p.id}`, {
          method: 'DELETE',
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (res.status !== 200) throw new Error(String(res.status));
        setProfiles((list) => list.filter((x) => x.id !== p.id));
        if (selectedId === p.id) {
          const def = profiles.find((x) => x.isDefault) ?? null;
          setSelectedId(def?.id ?? null);
          setForm(def ? fieldsOf(def) : null);
        }
        router.refresh();
      } catch {
        setActionError('office.sheet_presets.action_failed');
      }
    },
    [ask, doFetch, profiles, router, selectedId],
  );

  const startNew = (p: Pending) => {
    setPending(p);
    setNewName(
      p.mode === 'duplicate'
        ? t('office.sheet_presets.copy_name', { name: p.source.department })
        : '',
    );
    setNewError(null);
  };

  const create = useCallback(async () => {
    if (pending === null) return;
    const name = newName.trim();
    if (name.length === 0) {
      setNewError('office.sheet_presets.name_required');
      return;
    }
    if (!(await leaveCheck())) return;
    setNewError(null);
    try {
      const res = await doFetch(API, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          department: name,
          ...(pending.mode === 'duplicate' ? { sourceId: pending.source.id } : {}),
        }),
      });
      if (res.status === 201) {
        const body = (await res.json()) as { profile: SubmittalProfile };
        setProfiles((list) => sortProfiles([...list, body.profile]));
        setSelectedId(body.profile.id);
        setForm(fieldsOf(body.profile));
        setPending(null);
        router.refresh();
        return;
      }
      setNewError(
        res.status === 409
          ? 'office.sheet_presets.name_taken'
          : 'office.sheet_presets.action_failed',
      );
    } catch {
      setNewError('office.sheet_presets.action_failed');
    }
  }, [pending, newName, leaveCheck, doFetch, router]);

  const def = profiles.find((p) => p.isDefault) ?? null;
  const active = profiles.filter((p) => !p.archived).length;
  const statusItems = useMemo<readonly SettingsStatusEntry[]>(
    () => [
      {
        id: 'profiles',
        label: 'office.sheet_presets.status_profiles',
        value: t('office.sheet_presets.status_profiles_value', {
          active,
          archived: profiles.length - active,
        }),
      },
      { id: 'default', label: 'office.sheet_presets.status_default', value: def?.department ?? '' },
      {
        id: 'size',
        label: 'office.sheet_presets.status_size',
        value: t('office.sheet_presets.sheet_size_value'),
      },
    ],
    [t, active, profiles.length, def?.department],
  );
  useSettingsStatus(statusItems);

  const newButton = (
    <StateButton
      variant="primary"
      data-testid="sheet-presets-new"
      disabled={readOnly}
      onClick={() => startNew({ mode: 'new' })}
    >
      <Icon name="add" size={18} />
      {t('office.sheet_presets.new_profile')}
    </StateButton>
  );

  const chips = (p: SubmittalProfile) => [
    t(submittalTypeLabel(p.submittalType)),
    '24x36',
    p.namingTemplate,
    `${p.stampBoxWidthIn}"x${p.stampBoxHeightIn}" ${positionShort[p.stampBoxPosition]}`,
  ];

  return (
    <>
      <SettingsMain
        section="sheet_presets"
        title="office.settings.section.sheet_presets"
        subtitle="office.sheet_presets.subtitle"
        actions={newButton}
        flush
      >
        <div data-testid="sheet-presets" className={styles.body}>
          {online ? null : (
            <div data-testid="sheet-presets-offline">
              <OfflineBanner message="office.sheet_presets.offline" />
            </div>
          )}
          {actionError ? (
            <p data-testid="sheet-presets-action-error" role="alert" className={styles.error}>
              {t('office.sheet_presets.action_failed')}
            </p>
          ) : null}
          <div className={styles.listHead}>
            <span className={styles.listTitle}>
              {t('office.sheet_presets.profiles')}{' '}
              <span className={styles.count}>{profiles.length}</span>
            </span>
            <span className={styles.muted}>{t('office.sheet_presets.copy_note')}</span>
          </div>
          {pending ? (
            <form
              data-testid="sheet-presets-new-form"
              className={styles.newForm}
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <label className={styles.field}>
                <span className={styles.label}>{t('office.sheet_presets.name_label')}</span>
                <input
                  data-testid="sheet-presets-new-name"
                  className={styles.input}
                  value={newName}
                  maxLength={200}
                  autoFocus
                  onChange={(e) => setNewName(e.target.value)}
                />
              </label>
              <div className={styles.newActions}>
                <StateButton variant="secondary" type="button" onClick={() => setPending(null)}>
                  {t('common.cancel')}
                </StateButton>
                <StateButton
                  variant="primary"
                  type="submit"
                  data-testid="sheet-presets-create"
                  disabled={readOnly}
                >
                  {t('office.sheet_presets.create')}
                </StateButton>
              </div>
              {newError ? (
                <p data-testid="sheet-presets-new-error" role="alert" className={styles.error}>
                  {t(newError as 'office.sheet_presets.name_taken')}
                </p>
              ) : null}
            </form>
          ) : null}
          {profiles.length === 0 ? (
            <p data-testid="sheet-presets-empty" className={styles.empty}>
              {t('office.sheet_presets.empty')}
            </p>
          ) : (
            <ul className={styles.list} data-testid="sheet-presets-list">
              {profiles.map((p) => (
                <li
                  key={p.id}
                  data-testid="sheet-presets-row"
                  data-profile-id={p.id}
                  data-default={p.isDefault ? 'true' : undefined}
                  data-archived={p.archived ? 'true' : undefined}
                  data-selected={p.id === selectedId ? 'true' : undefined}
                  className={styles.row}
                >
                  <button
                    type="button"
                    className={`${styles.rowMain} ${touch.target}`}
                    aria-pressed={p.id === selectedId}
                    onClick={() => void select(p.id)}
                  >
                    <Icon name="domain" size={22} />
                    <span className={styles.rowText}>
                      <span className={styles.rowName}>
                        <span data-testid="sheet-presets-row-name">{p.department}</span>
                        {p.isDefault ? (
                          <span data-testid="sheet-presets-default-badge" className={styles.badge}>
                            {t('office.sheet_presets.default_badge')}
                          </span>
                        ) : null}
                        {p.archived ? (
                          <span className={styles.badgeMuted}>
                            {t('office.sheet_presets.archived_badge')}
                          </span>
                        ) : null}
                      </span>
                      <span className={styles.chips}>
                        {chips(p).map((c, i) => (
                          <span key={i} className={styles.chip}>
                            {c}
                          </span>
                        ))}
                      </span>
                    </span>
                    <span className={styles.usage}>
                      {p.projectCount > 0
                        ? t('office.sheet_presets.projects', { count: p.projectCount })
                        : t('office.sheet_presets.not_used')}
                    </span>
                  </button>
                  {readOnly ? null : (
                    <Menu
                      label={t('office.sheet_presets.more', { name: p.department })}
                      trigger={<Icon name="more_horiz" size={20} />}
                      triggerClassName={`${styles.more} ${touch.target}`}
                      triggerTestId="sheet-presets-more"
                      contentClassName={styles.menu}
                      contentTestId="sheet-presets-menu"
                      anchorSelector="li"
                    >
                      {p.isDefault ? (
                        <span className={styles.menuNote}>
                          {t('office.sheet_presets.menu.set_default')} ·{' '}
                          {t('office.sheet_presets.menu.current')}
                        </span>
                      ) : p.archived ? null : (
                        <MenuItem
                          testId="sheet-presets-menu-default"
                          className={`${styles.menuItem} ${touch.target}`}
                          onSelect={() => void act(p, { setDefault: true })}
                        >
                          {t('office.sheet_presets.menu.set_default')}
                        </MenuItem>
                      )}
                      <MenuItem
                        testId="sheet-presets-menu-duplicate"
                        className={`${styles.menuItem} ${touch.target}`}
                        onSelect={() => startNew({ mode: 'duplicate', source: p })}
                      >
                        {t('office.sheet_presets.menu.duplicate')}
                      </MenuItem>
                      {p.isDefault ? null : (
                        <MenuItem
                          testId="sheet-presets-menu-archive"
                          className={`${styles.menuItem} ${touch.target}`}
                          onSelect={() => void act(p, { archived: !p.archived })}
                        >
                          {t(
                            p.archived
                              ? 'office.sheet_presets.menu.restore'
                              : 'office.sheet_presets.menu.archive',
                          )}
                        </MenuItem>
                      )}
                      {p.isDefault ? (
                        <span className={styles.menuNote}>
                          {t('office.sheet_presets.menu.delete')} ·{' '}
                          {t('office.sheet_presets.menu.delete_default')}
                        </span>
                      ) : (
                        <MenuItem
                          testId="sheet-presets-menu-delete"
                          className={`${styles.menuItem} ${touch.target}`}
                          onSelect={() => void remove(p)}
                        >
                          {t('office.sheet_presets.menu.delete')}
                        </MenuItem>
                      )}
                    </Menu>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className={styles.note}>
            <Icon name="info" size={14} />
            {t('office.sheet_presets.project_note')}
          </p>
        </div>
      </SettingsMain>
      <ProfileInspector
        profile={selected}
        form={form}
        resetKey={resetKey}
        setForm={setForm}
        readOnly={readOnly}
        dirty={dirty}
        saving={saving}
        problems={problems}
        saveError={saveError}
        onSave={() => void save()}
        onDiscard={() => {
          if (selected) setForm(fieldsOf(selected));
          setSaveError(null);
          setResetKey((k) => k + 1);
        }}
        onClose={() =>
          void (async () => {
            if (!(await leaveCheck())) return;
            setSelectedId(null);
            setForm(null);
          })()
        }
      />
    </>
  );
}

function ProfileInspector({
  profile,
  form,
  resetKey,
  setForm,
  readOnly,
  dirty,
  saving,
  problems,
  saveError,
  onSave,
  onDiscard,
  onClose,
}: {
  profile: SubmittalProfile | null;
  form: ProfileFields | null;
  resetKey: number;
  setForm: (f: ProfileFields) => void;
  readOnly: boolean;
  dirty: boolean;
  saving: boolean;
  problems: readonly string[];
  saveError: 'office.sheet_presets.save_failed' | 'office.sheet_presets.name_taken' | null;
  onSave: () => void;
  onDiscard: () => void;
  onClose: () => void;
}) {
  const t = useT();
  if (profile === null || form === null) {
    return (
      <aside
        data-testid="sheet-presets-inspector"
        aria-label={t('office.sheet_presets.inspector_label')}
        className={styles.inspector}
      >
        <p data-testid="sheet-presets-inspector-empty" className={styles.inspectorEmpty}>
          {t('office.sheet_presets.inspector_empty')}
        </p>
      </aside>
    );
  }
  const set = <K extends keyof ProfileFields>(k: K, v: ProfileFields[K]) =>
    setForm({ ...form, [k]: v });
  const naming = checkNamingTemplate(form.namingTemplate, profile.revisionNaming);
  const sub = [
    profile.projectCount > 0
      ? t('office.sheet_presets.used_by', { count: profile.projectCount })
      : t('office.sheet_presets.not_used'),
    ...(profile.isDefault ? [t('office.sheet_presets.company_default')] : []),
  ].join(' · ');
  const num = (v: string) => (v.trim() === '' ? NaN : Number(v));

  return (
    <aside
      data-testid="sheet-presets-inspector"
      aria-label={t('office.sheet_presets.inspector_label')}
      className={styles.inspector}
    >
      <div className={styles.inspectorHead}>
        <div className={styles.inspectorText}>
          <span className={styles.inspectorName}>
            <span data-testid="sheet-presets-inspector-name">{profile.department}</span>
            {profile.isDefault ? (
              <span className={styles.badge}>{t('office.sheet_presets.default_badge')}</span>
            ) : null}
          </span>
          <span data-testid="sheet-presets-inspector-sub" className={styles.inspectorSub}>
            {sub}
          </span>
        </div>
        <button
          type="button"
          aria-label={t('common.close')}
          className={`${styles.close} ${touch.target}`}
          onClick={onClose}
        >
          <Icon name="close" size={20} />
        </button>
      </div>
      <div className={styles.inspectorScroll} data-testid="sheet-presets-form">
        <div className={styles.grid}>
          <label className={styles.field}>
            <span className={styles.label}>{t('office.sheet_presets.name_label')}</span>
            <input
              data-testid="sheet-presets-department"
              className={styles.input}
              value={form.department}
              maxLength={200}
              disabled={readOnly}
              onChange={(e) => set('department', e.target.value)}
            />
          </label>
          <div className={styles.field}>
            <span className={styles.label} id="sp-type">
              {t('office.sheet_presets.submittal_type')}
            </span>
            <div role="radiogroup" aria-labelledby="sp-type" className={styles.segment}>
              {SUBMITTAL_TYPES.map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={form.submittalType === v}
                  data-testid={`sheet-presets-type-${v}`}
                  className={styles.segmentItem}
                  disabled={readOnly}
                  onClick={() => set('submittalType', v)}
                >
                  {t(submittalTypeLabel(v))}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.field}>
            <span className={styles.label}>{t('office.sheet_presets.sheet_size')}</span>
            <span data-testid="sheet-presets-sheet-size" className={styles.locked}>
              {t('office.sheet_presets.sheet_size_value')}
              <Icon name="lock" size={14} />
            </span>
          </div>
          <label className={styles.field}>
            <span className={styles.label}>{t('office.sheet_presets.signature')}</span>
            <select
              data-testid="sheet-presets-signer"
              className={styles.input}
              value={form.signer}
              disabled={readOnly}
              onChange={(e) => set('signer', e.target.value as Signer)}
            >
              {(SIGNERS as readonly Signer[])
                .concat(form.signer === 'engineer' ? ['engineer'] : [])
                .map((s) => (
                  <option key={s} value={s}>
                    {t(signerLabel(s))}
                  </option>
                ))}
            </select>
          </label>
        </div>

        <h3 className={styles.section}>{t('office.sheet_presets.files')}</h3>
        <label className={styles.field}>
          <span className={styles.label}>{t('office.sheet_presets.naming')}</span>
          <input
            data-testid="sheet-presets-naming"
            className={`${styles.input} ${styles.mono}`}
            value={form.namingTemplate}
            maxLength={200}
            disabled={readOnly}
            aria-invalid={naming.error !== null}
            onChange={(e) => set('namingTemplate', e.target.value)}
          />
        </label>
        <div className={styles.tokens}>
          <span className={styles.muted}>{t('office.sheet_presets.insert')}</span>
          {NAMING_TOKENS.map((k) => (
            <button
              key={k}
              type="button"
              data-testid="sheet-presets-token"
              className={styles.token}
              disabled={readOnly}
              onClick={() =>
                set('namingTemplate', `${form.namingTemplate.trimEnd()} ${k}`.trimStart())
              }
            >
              {k}
            </button>
          ))}
        </div>
        {naming.error ? (
          <p data-testid="sheet-presets-naming-error" role="alert" className={styles.error}>
            {t(naming.error, LITERAL_TOKENS)}
          </p>
        ) : (
          <p
            data-testid="sheet-presets-naming-preview"
            className={`${styles.preview} ${styles.mono}`}
          >
            {exampleName(form.namingTemplate)}
          </p>
        )}
        {naming.warnRev ? (
          <p data-testid="sheet-presets-naming-warning" className={styles.warning}>
            {t('office.sheet_presets.naming_warn_rev', LITERAL_TOKENS)}
          </p>
        ) : null}

        <h3 className={styles.section}>{t('office.sheet_presets.output')}</h3>
        <p className={styles.muted} data-testid="sheet-presets-output">
          <Icon name="lock" size={14} /> {t('office.sheet_presets.output_value')}
        </p>
        <div className={styles.field}>
          <span className={styles.label}>{t('office.sheet_presets.stamp_box')}</span>
          <div className={styles.stampRow}>
            <input
              data-testid="sheet-presets-stamp-width"
              aria-label={t('office.sheet_presets.stamp_width')}
              className={`${styles.input} ${styles.small}`}
              inputMode="decimal"
              defaultValue={String(form.stampBoxWidthIn)}
              key={`w-${profile.id}-${resetKey}`}
              disabled={readOnly}
              onChange={(e) => set('stampBoxWidthIn', num(e.target.value))}
            />
            <span className={styles.muted}>x</span>
            <input
              data-testid="sheet-presets-stamp-height"
              aria-label={t('office.sheet_presets.stamp_height')}
              className={`${styles.input} ${styles.small}`}
              inputMode="decimal"
              defaultValue={String(form.stampBoxHeightIn)}
              key={`h-${profile.id}-${resetKey}`}
              disabled={readOnly}
              onChange={(e) => set('stampBoxHeightIn', num(e.target.value))}
            />
            <select
              data-testid="sheet-presets-stamp-position"
              aria-label={t('office.sheet_presets.stamp_position')}
              className={styles.input}
              value={form.stampBoxPosition}
              disabled={readOnly}
              onChange={(e) => set('stampBoxPosition', e.target.value as StampPosition)}
            >
              {STAMP_POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {t(stampPositionLabel(p))}
                </option>
              ))}
            </select>
          </div>
          {problems.includes('office.sheet_presets.stamp_invalid') ? (
            <p role="alert" className={styles.error}>
              {t('office.sheet_presets.stamp_invalid')}
            </p>
          ) : null}
          {problems.includes('office.sheet_presets.name_required') ? (
            <p role="alert" className={styles.error}>
              {t('office.sheet_presets.name_required')}
            </p>
          ) : null}
        </div>
      </div>
      {saveError ? (
        <div data-testid="sheet-presets-save-error" className={styles.saveError}>
          <InlineError
            message={saveError}
            onRetry={saveError === 'office.sheet_presets.save_failed' ? onSave : undefined}
          />
        </div>
      ) : null}
      <div className={styles.inspectorFoot}>
        <span className={styles.unsaved}>{dirty ? t('office.sheet_presets.unsaved') : ''}</span>
        <StateButton
          variant="secondary"
          data-testid="sheet-presets-discard"
          disabled={!dirty || saving}
          onClick={onDiscard}
        >
          {t('office.sheet_presets.discard')}
        </StateButton>
        <StateButton
          variant="primary"
          data-testid="sheet-presets-save"
          disabled={readOnly || saving || !dirty || problems.length > 0}
          onClick={onSave}
        >
          {t('office.sheet_presets.save')}
        </StateButton>
      </div>
    </aside>
  );
}

export function SheetPresetsLoadError() {
  const router = useRouter();
  return (
    <SettingsMain section="sheet_presets" title="office.settings.section.sheet_presets">
      <div data-testid="sheet-presets-load-error">
        <InlineError message="office.sheet_presets.load_failed" onRetry={() => router.refresh()} />
      </div>
    </SettingsMain>
  );
}
