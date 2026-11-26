'use client';
// EZD-1409 (S17 Tab: Tasks "Task list grouped by trade phase"; Task row checkbox "Marks task done; records user and
// time. Hidden without Check off tasks. Queued offline"; "add photo: Attaches a photo to the task. Photo notes";
// "edit text: Edits the task text. Edit field tasks; online only"; Permissions "Controls the user lacks are hidden";
// Q-0781: no board for the Tasks tab, built in the style of S17Field; vault/build/assumptions/EZD-1409.md): the
// Tasks tab's content. The parent queues the actions (FieldPackScreen); this shows the groups and rows.
import { useId, useRef, useState, type ReactElement } from 'react';
import { Icon } from '../components/icon/Icon';
import { useT } from '../lib/messages';
import type { Language } from '../lib/messages/types';
import { doneTime, groupTasks, taskText } from './tasks-view';
import type { FieldPackTask } from './types';
import styles from './FieldPack.module.css';

export type PhotoResult = 'ok' | 'type' | 'size' | 'failed';

export type TaskActions = {
  canCheck: boolean;
  canEdit: boolean;
  online: boolean;
  check(taskId: string): void;
  addPhoto(taskId: string, file: File): Promise<PhotoResult>;
  // True when saved.
  edit(taskId: string, text: string): Promise<boolean>;
};

export function TasksPanel({
  tasks,
  room,
  language,
  canPhoto,
  actions,
}: {
  tasks: readonly FieldPackTask[];
  room: string;
  language: Language;
  canPhoto: boolean;
  actions: TaskActions | null;
}): ReactElement {
  const t = useT();
  const groups = groupTasks(tasks, room);
  if (groups.length === 0) {
    return (
      <p className={styles.tasksEmpty} data-testid="tasks-empty">
        {t('field.tasks.empty')}
      </p>
    );
  }
  return (
    <div className={styles.tasks} data-testid="tasks">
      {groups.map((g) => (
        <section key={g.phase} className={styles.phase} data-phase={g.phase} aria-label={g.phase}>
          <h2 className={styles.phaseName}>{g.phase}</h2>
          <ul className={styles.taskList}>
            {g.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                language={language}
                canPhoto={canPhoto}
                actions={actions}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TaskRow({
  task,
  language,
  canPhoto,
  actions,
}: {
  task: FieldPackTask;
  language: Language;
  canPhoto: boolean;
  actions: TaskActions | null;
}): ReactElement {
  const t = useT();
  const id = useId();
  const file = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const text = taskText(task, language);
  const done = task.done;

  const startEdit = () => {
    if (actions === null) return;
    if (!actions.online) {
      setMessage(t('field.tasks.edit_offline'));
      return;
    }
    setMessage(null);
    setEditing(text);
  };

  const save = async () => {
    if (actions === null || editing === null) return;
    if (!actions.online) {
      setMessage(t('field.tasks.edit_offline'));
      return;
    }
    const value = editing.trim();
    if (value === '') {
      setMessage(t('field.tasks.edit_empty'));
      return;
    }
    setSaving(true);
    const ok = await actions.edit(task.id, value);
    setSaving(false);
    if (ok) {
      setEditing(null);
      setMessage(null);
    } else {
      setMessage(t('field.tasks.edit_failed'));
    }
  };

  const pickPhoto = async (f: File | undefined) => {
    if (actions === null || f === undefined) return;
    const r = await actions.addPhoto(task.id, f);
    setMessage(
      r === 'type'
        ? t('field.tasks.photo_type')
        : r === 'size'
          ? t('field.tasks.photo_size')
          : r === 'failed'
            ? t('field.tasks.photo_failed')
            : null,
    );
  };

  return (
    <li className={styles.task} data-task={task.id} data-done={done !== null}>
      <div className={styles.taskMain}>
        {actions?.canCheck ? (
          <input
            id={`${id}-check`}
            type="checkbox"
            className={styles.taskCheck}
            checked={done !== null}
            disabled={done !== null}
            aria-label={t('field.tasks.check', { task: text })}
            onChange={() => actions.check(task.id)}
          />
        ) : done !== null ? (
          <span className={styles.taskDoneIcon} aria-hidden="true">
            <Icon name="check_circle" size={20} />
          </span>
        ) : null}
        <div className={styles.taskBody}>
          {editing === null ? (
            <p className={done !== null ? `${styles.taskText} ${styles.taskTextDone}` : styles.taskText}>
              {text}
            </p>
          ) : (
            <div className={styles.taskEdit}>
              <textarea
                className={styles.taskEditBox}
                aria-label={t('field.tasks.text_label')}
                value={editing}
                maxLength={1000}
                rows={3}
                onChange={(e) => setEditing(e.target.value)}
              />
              <div className={styles.taskEditActions}>
                <button
                  type="button"
                  className={styles.taskButton}
                  onClick={() => {
                    setEditing(null);
                    setMessage(null);
                  }}
                >
                  {t('field.tasks.cancel')}
                </button>
                <button
                  type="button"
                  className={`${styles.taskButton} ${styles.taskButtonPrimary}`}
                  disabled={saving}
                  onClick={() => void save()}
                >
                  {t('field.tasks.save')}
                </button>
              </div>
            </div>
          )}
          {done !== null ? (
            <p className={styles.taskMeta} data-testid="task-done">
              {done.by
                ? t('field.tasks.done_by', { name: done.by, date: doneTime(done.at, language) })
                : t('field.tasks.done_at', { date: doneTime(done.at, language) })}
            </p>
          ) : null}
          {task.photos > 0 ? (
            <p className={styles.taskMeta} data-testid="task-photos">
              {t('field.tasks.photos', { count: task.photos })}
            </p>
          ) : null}
          {message !== null ? (
            <p className={styles.taskMessage} role="status">
              {message}
            </p>
          ) : null}
        </div>
      </div>
      {editing === null && actions !== null && (canPhoto || actions.canEdit) ? (
        <div className={styles.taskActions}>
          {canPhoto ? (
            <>
              <button type="button" className={styles.taskButton} onClick={() => file.current?.click()}>
                <Icon name="photo_camera" size={18} />
                {t('field.tasks.add_photo')}
              </button>
              <input
                ref={file}
                type="file"
                accept="image/jpeg,image/png"
                capture="environment"
                hidden
                data-testid="task-photo-input"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  void pickPhoto(f);
                }}
              />
            </>
          ) : null}
          {actions.canEdit ? (
            <button type="button" className={styles.taskButton} onClick={startEdit}>
              <Icon name="edit" size={18} />
              {t('field.tasks.edit')}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
