'use client';

// EZD-107 (S15 Role card; board S15k and its states "Viewing a preset", "Delete not allowed", "Saving", "Save
// failed"; Q-0695 decisions 03 row 35; AC-EZD-107-3): the role panel, in the inspector's place. A preset opens
// read-only with "New role from <Role>" and Close. A custom role opens for editing: name, the one-line rule,
// the 37 switches, the unsaved line, Delete (offered only when nobody holds the role; otherwise disabled with
// the reason), Cancel and Save. The draft lives in UsersPanel, so the page's unsaved-edits prompt covers it.
import { useT } from '../../../lib/messages';
import {
  ROLE_NAME_MAX,
  roleEdits,
  toggleKey,
  type RoleDraft,
  type RoleSummary,
} from '../../../lib/roles/roles';
import type { MessageKey } from '../../../server/messages/catalog';
import touch from '../../../styles/touch.module.css';
import { Icon } from '../../icon/Icon';
import { StateButton } from '../../states/StateButton';
import { PermissionSwitches } from './PermissionSwitches';
import styles from './Roles.module.css';
import userStyles from './Users.module.css';

export type RoleNameError = { kind: 'blank' } | { kind: 'taken'; name: string };

export type RolePanelProps = {
  role: RoleSummary;
  saved: RoleDraft;
  draft: RoleDraft;
  onDraft: (d: RoleDraft) => void;
  onClose: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => void;
  onNewFrom: () => void;
  saving: boolean;
  failed: boolean;
  nameError: RoleNameError | null;
  error: MessageKey | null;
  online: boolean;
};

export function RolePanel(p: RolePanelProps) {
  const t = useT();
  const { role, draft } = p;
  const preset = role.preset !== null;
  const edits = preset ? 0 : roleEdits(p.saved, draft);
  const locked = !p.online || p.saving;
  return (
    <aside
      data-testid="role-panel"
      data-role-id={role.id}
      aria-label={t('office.roles.panel_label')}
      className={userStyles.inspector}
    >
      <div data-testid="role-panel-head" className={userStyles.inspectorHead}>
        <span className={styles.panelIcon} aria-hidden="true">
          <Icon name={preset ? 'lock' : 'badge'} size={20} />
        </span>
        <div className={userStyles.inspectorText}>
          <span data-testid="role-panel-name" className={userStyles.inspectorName}>
            {role.name}
          </span>
          <span data-testid="role-panel-sub" className={userStyles.inspectorSub}>
            {preset
              ? t('office.roles.preset_sub')
              : `${t('office.roles.custom_sub')} · ${t('office.roles.holders', { count: role.holders })}`}
          </span>
        </div>
        <button
          type="button"
          data-testid="role-panel-close"
          aria-label={t('common.close')}
          className={`${userStyles.close} ${touch.target}`}
          onClick={p.onClose}
        >
          <Icon name="close" size={20} />
        </button>
      </div>
      <div className={userStyles.inspectorScroll}>
        {preset ? (
          <p data-testid="role-preset-note" className={styles.rule}>
            <Icon name="lock" size={14} />
            {t('office.roles.preset_note')}
          </p>
        ) : (
          <div className={userStyles.field}>
            <label className={userStyles.label} htmlFor="role-panel-name-input">
              {t('office.roles.name')}
            </label>
            <input
              id="role-panel-name-input"
              data-testid="role-name"
              className={`${styles.input}${p.nameError ? ` ${styles.inputBad}` : ''}`}
              maxLength={ROLE_NAME_MAX}
              value={draft.name}
              readOnly={locked}
              aria-invalid={p.nameError !== null}
              onChange={(e) => p.onDraft({ ...draft, name: e.target.value })}
            />
            {p.nameError ? (
              <p data-testid="role-name-error" role="alert" className={styles.fieldError}>
                {p.nameError.kind === 'blank'
                  ? t('office.roles.name_blank')
                  : t('office.roles.name_taken', { name: p.nameError.name })}
              </p>
            ) : null}
            <p data-testid="role-rule" className={styles.rule}>
              <Icon name="info" size={14} />
              {t('office.roles.rule')}
            </p>
          </div>
        )}
        <PermissionSwitches
          granted={preset ? role.defaultPermissions : draft.granted}
          disabled={preset || locked}
          onToggle={(key) => {
            if (preset) return;
            p.onDraft({ ...draft, granted: toggleKey(draft.granted, key) });
          }}
        />
      </div>
      <div data-testid="role-panel-footer" className={userStyles.inspectorFoot}>
        {preset ? (
          <div className={styles.footRow}>
            <StateButton
              data-testid="role-new-from"
              disabled={!p.online}
              className={styles.footSpacer}
              onClick={p.onNewFrom}
            >
              <Icon name="add" size={16} />
              {t('office.roles.new_from', { role: role.name })}
            </StateButton>
            <StateButton data-testid="role-close" onClick={p.onClose}>
              {t('office.roles.close')}
            </StateButton>
          </div>
        ) : (
          <>
            {!p.online ? (
              <p data-testid="role-offline" role="status" className={userStyles.offline}>
                {t('office.users.offline')}
              </p>
            ) : null}
            {edits > 0 ? (
              <p data-testid="role-unsaved" className={userStyles.unsaved}>
                <span className={userStyles.unsavedDot} aria-hidden="true" />
                {t('office.roles.unsaved', { count: edits })}
              </p>
            ) : null}
            {role.holders > 0 ? (
              <p data-testid="role-cant-delete" className={styles.cantDelete}>
                <Icon name="block" size={14} />
                {t('office.roles.cant_delete', { count: role.holders })}
              </p>
            ) : null}
            {p.failed ? (
              <p data-testid="role-save-error" role="alert" className={styles.fieldError}>
                {t('office.roles.save_failed')}
              </p>
            ) : null}
            {p.error !== null ? (
              <p data-testid="role-error" role="alert" className={styles.fieldError}>
                {t(p.error)}
              </p>
            ) : null}
            <div className={styles.footRow}>
              <StateButton
                data-testid="role-delete"
                variant="danger"
                disabled={role.holders > 0 || locked}
                onClick={p.onDelete}
              >
                <Icon name="delete" size={16} />
                {t('office.roles.delete')}
              </StateButton>
              <span className={styles.footSpacer} />
              <StateButton data-testid="role-cancel" disabled={p.saving} onClick={p.onCancel}>
                {t('office.roles.cancel')}
              </StateButton>
              <StateButton
                data-testid="role-save"
                variant="primary"
                disabled={locked || edits === 0}
                onClick={p.onSave}
              >
                {t(
                  p.saving
                    ? 'office.roles.saving'
                    : p.failed
                      ? 'office.roles.try_again'
                      : 'office.roles.save',
                )}
              </StateButton>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
