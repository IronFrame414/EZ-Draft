'use client';

// EZD-129 (Q-0202; Q-0397; boards S01bForeman, S01bForemanStates and their approved wording; AC-EZD-129-3): the
// New project wizard's Foreman, optional, in the Project settings column. The company's active members from
// GET /api/projects/foremen, loaded once when step 2 opens, by name; "No foreman" clears the pick. When the
// picked person's access is Listed, the line under the field says Create adds the project to their list (an
// All projects person already sees every project, so no line). With nobody else on the team the field reads
// "No active members yet" with the Settings · Users hint: the creator is always an active member, so one
// candidate means nobody else.
import { Popover } from 'radix-ui';
import { useEffect, useState, type ReactElement } from 'react';
import { useT } from '../../lib/messages';
import { initialsFor } from '../../lib/users/initials';
import { foremanGetsListed, foremanName, type ForemanCandidate } from '../../lib/users/scope';
import touch from '../../styles/touch.module.css';
import { Icon } from '../icon/Icon';
import { InlineError, Skeleton } from '../states';
import styles from './NewProject.module.css';

export type ForemanPickerProps = {
  value: ForemanCandidate | null;
  onChange: (f: ForemanCandidate | null) => void;
  disabled?: boolean;
};

type Loaded = { status: 'loading' | 'ready' | 'error'; members: ForemanCandidate[] };

export function ForemanPicker({ value, onChange, disabled }: ForemanPickerProps): ReactElement {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading', members: [] });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/projects/foremen', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (res.status !== 200) throw new Error('foremen_load_failed');
        const data = (await res.json()) as { members: ForemanCandidate[] };
        setLoaded({ status: 'ready', members: data.members });
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setLoaded({ status: 'error', members: [] });
      });
    return () => ctrl.abort();
  }, [attempt]);

  const pick = (f: ForemanCandidate | null) => {
    setOpen(false);
    onChange(f);
  };

  const empty = loaded.status === 'ready' && loaded.members.length <= 1;

  return (
    <div data-testid="new-project-foreman-field" className={styles.field}>
      <span className={styles.labelRow}>
        <span id="new-project-foreman-label">{t('office.new_project.foreman')}</span>
        <span className={styles.optional}>{t('office.new_project.foreman_optional')}</span>
      </span>
      {loaded.status === 'loading' ? (
        <div data-testid="new-project-foreman-loading">
          <Skeleton height="38px" />
        </div>
      ) : loaded.status === 'error' ? (
        <div data-testid="new-project-foreman-load-error">
          <InlineError
            message="office.new_project.foreman_load_failed"
            onRetry={() => {
              setLoaded({ status: 'loading', members: [] });
              setAttempt((n) => n + 1);
            }}
          />
        </div>
      ) : empty ? (
        <>
          <button
            type="button"
            data-testid="new-project-foreman"
            aria-labelledby="new-project-foreman-label"
            disabled
            className={`${styles.input} ${styles.trigger} ${touch.target}`}
          >
            <span className={`${styles.triggerText} ${styles.placeholder}`}>
              {t('office.new_project.foreman_empty')}
            </span>
            <span className={styles.chevron}>
              <Icon name="expand_more" size={18} />
            </span>
          </button>
          <span data-testid="new-project-foreman-empty-hint" className={styles.hint}>
            {t('office.new_project.foreman_empty_hint')}
          </span>
        </>
      ) : (
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              data-testid="new-project-foreman"
              aria-labelledby="new-project-foreman-label"
              disabled={disabled}
              className={`${styles.input} ${styles.trigger} ${touch.target}`}
            >
              <span className={styles.triggerText}>
                {value !== null ? (
                  <>
                    <span className={styles.avatar}>{initialsFor(value.name, value.email)}</span>
                    <span>{foremanName(value)}</span>
                  </>
                ) : (
                  <span className={styles.placeholder}>
                    {t('office.new_project.foreman_placeholder')}
                  </span>
                )}
              </span>
              <span className={styles.chevron}>
                <Icon name="expand_more" size={18} />
              </span>
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content data-testid="new-project-foreman-menu" className={styles.menu}>
              <p className={styles.menuHeading}>{t('office.new_project.foreman_heading')}</p>
              {loaded.members.map((m) => (
                <button
                  key={m.membershipId}
                  type="button"
                  data-testid="new-project-foreman-option"
                  data-membership-id={m.membershipId}
                  aria-pressed={value?.membershipId === m.membershipId}
                  className={`${styles.option} ${touch.target}`}
                  onClick={() => pick(m)}
                >
                  <span className={styles.avatar}>{initialsFor(m.name, m.email)}</span>
                  <span>{foremanName(m)}</span>
                </button>
              ))}
              <button
                type="button"
                data-testid="new-project-foreman-none"
                className={`${styles.option} ${touch.target}`}
                onClick={() => pick(null)}
              >
                <Icon name="close" size={18} />
                {t('office.new_project.foreman_none')}
              </button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
      {loaded.status === 'ready' && !empty && foremanGetsListed(value) && value !== null ? (
        <span data-testid="new-project-foreman-listed" className={styles.hint}>
          {t('office.new_project.foreman_listed', { name: foremanName(value) })}
        </span>
      ) : null}
    </div>
  );
}
