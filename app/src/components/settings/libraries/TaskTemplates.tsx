'use client';

// EZD-1408 (S15h Tab: Field task templates; Drag handle on phase row; Decisions 2; mockup S15hLibraries): one
// template per room type (Kitchen, Bath, Laundry, Other). The left list picks the room type; the middle column
// lists its phases, each with its starter tasks, to add, rename, delete and reorder (drag the handle, or focus it
// and press the up and down arrow keys). The inspector holds the name, the room type, the phase sequence with
// Reset to default sequence, and Save. A room type with no saved template shows the default sequence; Save adds
// it. Offline the tab is read-only.
import { useCallback, useState, type DragEvent, type KeyboardEvent } from 'react';
import {
  ROOM_TYPES,
  checkTemplatePhases,
  defaultPhases,
  movePhase,
  newPhaseId,
  type RoomType,
  type TemplatePhase,
} from '../../../lib/field-tasks/templates';
import { checkLibraryDraft, type LibraryItem } from '../../../lib/libraries/libraries';
import { useT } from '../../../lib/messages';
import type { MessageKey } from '../../../server/messages/catalog';
import { Icon } from '../../icon/Icon';
import type { IconName } from '../../icon/icon-names.generated';
import { AsyncView } from '../../states/AsyncView';
import { Skeleton, SkeletonGroup } from '../../states/Skeleton';
import { StateButton } from '../../states/StateButton';
import styles from './Libraries.module.css';

const ROOM_ICON: Record<RoomType, IconName> = {
  kitchen: 'kitchen',
  bath: 'wash',
  laundry: 'mode_fan',
  other: 'category',
};

const roomTypeLabel = (r: RoomType): MessageKey => `office.left_panel.room_type.${r}`;

const taskCount = (phases: readonly TemplatePhase[]) =>
  phases.reduce((n, p) => n + p.tasks.length, 0);

export type TaskTemplatesProps = { online: boolean; query: string };

export function TaskTemplates({ online, query }: TaskTemplatesProps) {
  const t = useT();
  const [tick, setTick] = useState(0);
  const [roomType, setRoomType] = useState<RoomType>('kitchen');

  const load = useCallback(
    async (signal: AbortSignal): Promise<LibraryItem[]> => {
      const res = await fetch('/api/settings/libraries?kind=task_template', {
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
      });
      if (res.status !== 200) throw new Error('libraries_load_failed');
      const data = (await res.json()) as { items: LibraryItem[] };
      return data.items;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick reloads the tab after a save
    [tick],
  );

  return (
    <AsyncView
      load={load}
      skeleton={
        <SkeletonGroup count={4}>
          <Skeleton height="48px" />
        </SkeletonGroup>
      }
      errorMessage="office.libraries.load_failed"
    >
      {(items: LibraryItem[]) => {
        const saved = (r: RoomType) => items.find((i) => i.template?.roomType === r) ?? null;
        const nameOf = (r: RoomType) => saved(r)?.name ?? t(roomTypeLabel(r));
        const phasesOf = (r: RoomType) => saved(r)?.template?.phases ?? defaultPhases();
        const q = query.trim().toLowerCase();
        const shown = ROOM_TYPES.filter((r) => q === '' || nameOf(r).toLowerCase().includes(q));
        if (shown.length === 0) {
          return (
            <div data-testid="libraries-no-match" className={styles.empty}>
              {t('office.libraries.no_match', { query: query.trim() })}
            </div>
          );
        }
        const current = saved(roomType);
        return (
          <TemplateEditor
            key={`${roomType}-${current?.updatedAt ?? 'default'}`}
            roomType={roomType}
            item={current}
            name={nameOf(roomType)}
            phases={phasesOf(roomType)}
            online={online}
            onSaved={() => setTick((n) => n + 1)}
            list={
              <div className={styles.ttRooms}>
                <span className={styles.ttHead}>
                  {t('office.libraries.templates.by_room_type')}
                </span>
                <ul className={styles.list}>
                  {shown.map((r) => {
                    const ps = phasesOf(r);
                    const on = r === roomType;
                    return (
                      <li key={r}>
                        <button
                          type="button"
                          data-testid="template-room"
                          data-room-type={r}
                          aria-pressed={on}
                          className={on ? `${styles.ttRoom} ${styles.rowOn}` : styles.ttRoom}
                          onClick={() => setRoomType(r)}
                        >
                          <Icon name={ROOM_ICON[r]} size={19} />
                          <span className={styles.ttRoomText}>
                            <span className={styles.ttRoomName}>{nameOf(r)}</span>
                            <span data-testid="template-room-summary" className={styles.ttMuted}>
                              {t('office.libraries.templates.summary', {
                                phases: t('office.libraries.templates.phases', {
                                  count: ps.length,
                                }),
                                tasks: t('office.libraries.templates.tasks', {
                                  count: taskCount(ps),
                                }),
                              })}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className={styles.ttFootnote}>{t('office.libraries.templates.footnote')}</p>
              </div>
            }
          />
        );
      }}
    </AsyncView>
  );
}

type EditorProps = {
  roomType: RoomType;
  item: LibraryItem | null;
  name: string;
  phases: TemplatePhase[];
  online: boolean;
  onSaved: () => void;
  list: React.ReactNode;
};

function TemplateEditor({
  roomType,
  item,
  name: name0,
  phases: phases0,
  online,
  onSaved,
  list,
}: EditorProps) {
  const t = useT();
  const [name, setName] = useState(name0);
  const [phases, setPhases] = useState<TemplatePhase[]>(phases0);
  const [open, setOpen] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [problem, setProblem] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const readOnly = !online;

  const edit = (next: TemplatePhase[]) => {
    setPhases(next);
    setProblem(null);
  };
  const setPhase = (i: number, patch: Partial<TemplatePhase>) =>
    edit(phases.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const move = (from: number, to: number) => edit(movePhase(phases, from, to));

  const addPhase = () => {
    const id = newPhaseId(phases);
    edit([...phases, { id, name: '', tasks: [] }]);
    setOpen(id);
  };

  const onHandleKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const to = e.key === 'ArrowUp' ? i - 1 : i + 1;
    if (to < 0 || to >= phases.length) return;
    move(i, to);
    // Keep the focus on the moved phase's handle.
    const id = phases[i].id;
    requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>(`[data-handle-for="${id}"]`)?.focus(),
    );
  };

  const onDrop = (e: DragEvent, to: number) => {
    e.preventDefault();
    if (dragFrom !== null && dragFrom !== to) move(dragFrom, to);
    setDragFrom(null);
  };

  const save = async () => {
    const code = checkLibraryDraft({ name, meaning: null }) ?? checkTemplatePhases(phases);
    if (code !== null) {
      setProblem(`error.${code}` as MessageKey);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const body = { name, phases };
      const res = await fetch(
        item === null ? '/api/settings/libraries' : `/api/settings/libraries/${item.id}`,
        {
          method: item === null ? 'POST' : 'PATCH',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(item === null ? { kind: 'task_template', roomType, ...body } : body),
        },
      );
      const json = (await res.json().catch(() => null)) as {
        item?: LibraryItem;
        error?: { code?: string };
      } | null;
      if ((res.status === 200 || res.status === 201) && json?.item) {
        onSaved();
        return;
      }
      const errCode = json?.error?.code ?? '';
      setProblem(
        errCode.startsWith('task_template_') || errCode.startsWith('library_name_')
          ? (`error.${errCode}` as MessageKey)
          : 'office.libraries.save_failed',
      );
    } catch {
      setProblem('office.libraries.save_failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="task-templates" className={styles.columns}>
      <div data-testid="libraries-body" role="tabpanel" className={styles.ttBody}>
        {list}
        <div className={styles.ttPhases}>
          <div className={styles.ttPhasesHead}>
            <span className={styles.ttHead}>{t('office.libraries.templates.phases_head')}</span>
            {readOnly ? null : (
              <button
                type="button"
                data-testid="template-add-phase"
                className={styles.ttLink}
                onClick={addPhase}
              >
                <Icon name="add" size={15} />
                {t('office.libraries.templates.add_phase')}
              </button>
            )}
          </div>
          <ol data-testid="template-phases" className={styles.ttPhaseList}>
            {phases.map((p, i) => {
              const isOpen = open === p.id;
              return (
                <li
                  key={p.id}
                  data-testid="template-phase"
                  data-phase-id={p.id}
                  className={isOpen ? `${styles.ttPhase} ${styles.ttPhaseOpen}` : styles.ttPhase}
                  draggable={!readOnly}
                  onDragStart={(e) => {
                    setDragFrom(i);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', p.id);
                  }}
                  onDragOver={(e) => {
                    if (dragFrom !== null) e.preventDefault();
                  }}
                  onDrop={(e) => onDrop(e, i)}
                  onDragEnd={() => setDragFrom(null)}
                >
                  <div className={styles.ttPhaseRow}>
                    <button
                      type="button"
                      data-testid="template-phase-handle"
                      data-handle-for={p.id}
                      className={styles.ttHandle}
                      aria-label={t('office.libraries.templates.move_phase', {
                        name: p.name || String(i + 1),
                      })}
                      disabled={readOnly}
                      onKeyDown={(e) => onHandleKey(e, i)}
                    >
                      <Icon name="open_with" size={16} />
                    </button>
                    <span className={isOpen ? `${styles.ttNum} ${styles.ttNumOn}` : styles.ttNum}>
                      {i + 1}
                    </span>
                    <input
                      data-testid="template-phase-name"
                      className={styles.ttPhaseName}
                      aria-label={t('office.libraries.templates.phase_name')}
                      value={p.name}
                      readOnly={readOnly}
                      autoFocus={p.name === '' && isOpen}
                      onChange={(e) => setPhase(i, { name: e.target.value })}
                    />
                    <span className={styles.ttCount}>
                      {t('office.libraries.templates.tasks', { count: p.tasks.length })}
                    </span>
                    {readOnly ? null : (
                      <button
                        type="button"
                        data-testid="template-phase-delete"
                        className={styles.ttIconButton}
                        aria-label={t('office.libraries.templates.delete_phase', {
                          name: p.name || String(i + 1),
                        })}
                        onClick={() => edit(phases.filter((_, j) => j !== i))}
                      >
                        <Icon name="delete" size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      data-testid="template-phase-toggle"
                      className={styles.ttIconButton}
                      aria-expanded={isOpen}
                      aria-label={t('office.libraries.templates.show_tasks', {
                        name: p.name || String(i + 1),
                      })}
                      onClick={() => setOpen(isOpen ? null : p.id)}
                    >
                      <Icon name={isOpen ? 'expand_less' : 'expand_more'} size={18} />
                    </button>
                  </div>
                  {isOpen ? (
                    <div className={styles.ttTasks}>
                      {p.tasks.map((task, k) => (
                        <div key={k} className={styles.ttTask}>
                          <input
                            data-testid="template-task"
                            className={styles.ttTaskInput}
                            aria-label={t('office.libraries.templates.task_text')}
                            value={task}
                            readOnly={readOnly}
                            autoFocus={task === ''}
                            onChange={(e) =>
                              setPhase(i, {
                                tasks: p.tasks.map((x, m) => (m === k ? e.target.value : x)),
                              })
                            }
                          />
                          {readOnly ? null : (
                            <button
                              type="button"
                              data-testid="template-task-delete"
                              className={styles.ttIconButton}
                              aria-label={t('office.libraries.templates.delete_task')}
                              onClick={() =>
                                setPhase(i, { tasks: p.tasks.filter((_, m) => m !== k) })
                              }
                            >
                              <Icon name="close" size={15} />
                            </button>
                          )}
                        </div>
                      ))}
                      {readOnly ? null : (
                        <button
                          type="button"
                          data-testid="template-add-task"
                          className={styles.ttLink}
                          onClick={() => setPhase(i, { tasks: [...p.tasks, ''] })}
                        >
                          <Icon name="add" size={15} />
                          {t('office.libraries.templates.add_task')}
                        </button>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <aside data-testid="library-inspector" className={styles.inspector}>
        <form
          data-testid="template-form"
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className={styles.inspectorHead}>
            <h2 data-testid="library-inspector-title" className={styles.inspectorTitle}>
              {name0}
            </h2>
            <span className={styles.inspectorKind}>{t('office.libraries.kind.task_template')}</span>
          </div>
          <label className={styles.field}>
            {t('office.libraries.field_name')}
            <input
              data-testid="template-field-name"
              className={styles.input}
              value={name}
              readOnly={readOnly}
              onChange={(e) => {
                setName(e.target.value);
                setProblem(null);
              }}
            />
          </label>
          <label className={styles.field}>
            {t('office.libraries.field_room_type')}
            <select
              data-testid="template-field-room-type"
              className={styles.input}
              value={roomType}
              disabled
            >
              {ROOM_TYPES.map((r) => (
                <option key={r} value={r}>
                  {t(roomTypeLabel(r))}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.field}>
            {t('office.libraries.templates.sequence')}
            <ol data-testid="template-sequence" className={styles.ttSequence}>
              {phases.map((p, i) => (
                <li key={p.id} className={styles.ttSequenceItem}>
                  <span data-testid="template-sequence-phase" className={styles.chip}>
                    {p.name}
                  </span>
                  {i < phases.length - 1 ? <Icon name="arrow_forward" size={14} /> : null}
                </li>
              ))}
            </ol>
            {readOnly ? null : (
              <button
                type="button"
                data-testid="template-reset"
                className={styles.ttLink}
                onClick={() => edit(defaultPhases())}
              >
                <Icon name="refresh" size={15} />
                {t('office.libraries.templates.reset')}
              </button>
            )}
          </div>
          {problem !== null ? (
            <p data-testid="library-form-error" role="alert" className={styles.error}>
              {t(problem)}
            </p>
          ) : null}
          <p className={styles.ttMuted}>
            <Icon name="lock_open" size={15} />
            {t('office.libraries.templates.lock_note')}
          </p>
          <div className={styles.actions}>
            <StateButton
              data-testid="template-save"
              variant="primary"
              type="submit"
              disabled={readOnly || busy}
            >
              {t('office.libraries.save')}
            </StateButton>
          </div>
        </form>
      </aside>
    </div>
  );
}
