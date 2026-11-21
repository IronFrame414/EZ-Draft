'use client';

// EZD-131 (S15h Layout, Controls, States, Decisions 1; mockup S15hLibraries; AC-EZD-131-1): the Settings >
// Libraries tabs. Each tab lists its library_item kind (Details: detail records, which arrive with S10) and
// shows its empty state until its own ticket adds items. Search filters the current tab. The inspector shows
// the selected item: abbreviations are added, edited and deleted here; saved groups are renamed or deleted.
// EZD-714 (S15h Tab: Notes): notes are added, edited and deleted; the tab shows general notes and code notes
// for one project type at a time (All by default), in the order a set prints them. Offline the page is
// read-only.
// EZD-1408 (S15h Tab: Field task templates; Permissions): the Field task templates tab is its own editor
// (TaskTemplates). With Edit field tasks and no Libraries switch (onlyTemplates) it is the only tab.
import { useCallback, useState } from 'react';
import {
  CREATABLE_KINDS,
  EDITABLE_KINDS,
  LIBRARY_TABS,
  NOTE_GROUPS,
  NOTE_PROJECT_TYPES,
  checkLibraryDraft,
  checkNoteDraft,
  matchesSearch,
  notesFor,
  type LibraryCode,
  type LibraryItem,
  type LibraryKind,
  type LibraryTab,
  type LibraryTabId,
  type NoteFilter,
  type NoteGroup,
  type NoteProjectType,
} from '../../../lib/libraries/libraries';
import { useT } from '../../../lib/messages';
import { useOnline } from '../../../lib/network';
import type { MessageKey } from '../../../server/messages/catalog';
import { Icon } from '../../icon/Icon';
import { AsyncView } from '../../states/AsyncView';
import { useConfirm } from '../../states/ConfirmProvider';
import { Skeleton, SkeletonGroup } from '../../states/Skeleton';
import { StateButton } from '../../states/StateButton';
import styles from './Libraries.module.css';
import { TaskTemplates } from './TaskTemplates';

type Selection =
  { mode: 'none' } | { mode: 'new'; kind: 'abbreviation' | 'note' } | { mode: 'item'; id: string };

const projectTypeLabel = (p: NoteProjectType): MessageKey => `office.new_project.type_${p}`;

// Server codes the inspector shows under its fields; anything else is the generic save failure.
const FIELD_CODES: ReadonlySet<string> = new Set<LibraryCode | 'library_abbreviation_taken'>([
  'library_name_required',
  'library_name_too_long',
  'library_meaning_required',
  'library_meaning_too_long',
  'library_abbreviation_taken',
  'library_note_required',
  'library_note_too_long',
  'library_note_project_type_required',
]);

export type LibrariesPanelProps = { initialTab?: LibraryTabId; onlyTemplates?: boolean };

export function LibrariesPanel({
  initialTab = 'notes',
  onlyTemplates = false,
}: LibrariesPanelProps) {
  const t = useT();
  const online = useOnline();
  const [tabId, setTabId] = useState<LibraryTabId>(initialTab);
  const [q, setQ] = useState('');
  const [tick, setTick] = useState(0);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [selection, setSelection] = useState<Selection>({ mode: 'none' });
  const [noteFilter, setNoteFilter] = useState<NoteFilter>('all');
  const tabs = onlyTemplates ? LIBRARY_TABS.filter((x) => x.id === 'task_templates') : LIBRARY_TABS;
  const tab = tabs.find((x) => x.id === tabId) ?? tabs[0];
  const isTemplates = tab.id === 'task_templates';

  const load = useCallback(
    async (signal: AbortSignal): Promise<LibraryItem[]> => {
      if (tab.kind === null || tab.kind === 'task_template') {
        setItems([]);
        return [];
      }
      const res = await fetch(`/api/settings/libraries?kind=${tab.kind}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
      });
      if (res.status !== 200) throw new Error('libraries_load_failed');
      const data = (await res.json()) as { items: LibraryItem[] };
      setItems(data.items);
      return data.items;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick reloads the tab after a write
    [tab.kind, tick],
  );

  const openTab = (next: LibraryTab) => {
    setTabId(next.id);
    setQ('');
    setNoteFilter('all');
    setSelection({ mode: 'none' });
  };

  const term = q.trim();
  // Field task templates are one per room type, made by saving one (TaskTemplates); no Add button.
  const canCreate =
    tab.kind !== null && tab.kind !== 'task_template' && CREATABLE_KINDS.includes(tab.kind);
  const newKind: 'abbreviation' | 'note' = tab.kind === 'note' ? 'note' : 'abbreviation';
  const addLabel: MessageKey =
    newKind === 'note' ? 'office.libraries.add_note' : 'office.libraries.add_abbreviation';
  const startNew = () => setSelection({ mode: 'new', kind: newKind });

  const row = (item: LibraryItem) => {
    const on = selection.mode === 'item' && selection.id === item.id;
    return (
      <li key={item.id}>
        <button
          type="button"
          data-testid="library-row"
          data-item-id={item.id}
          aria-pressed={on}
          className={on ? `${styles.row} ${styles.rowOn}` : styles.row}
          onClick={() => setSelection({ mode: 'item', id: item.id })}
        >
          <span
            data-testid="library-row-name"
            className={item.kind === 'note' ? styles.rowNote : styles.rowName}
          >
            {item.name}
          </span>
          {item.meaning !== null ? (
            <span data-testid="library-row-meaning" className={styles.rowMeaning}>
              {item.meaning}
            </span>
          ) : null}
        </button>
      </li>
    );
  };

  // EZD-714: the Notes tab, general notes then code notes for the chosen project type.
  const notesBody = (shown: LibraryItem[]) => (
    <div data-testid="notes-body" className={styles.notes}>
      <div
        role="radiogroup"
        aria-label={t('office.libraries.notes_filter')}
        className={styles.chips}
      >
        {(['all', ...NOTE_PROJECT_TYPES] as NoteFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            data-testid="notes-filter"
            data-filter={f}
            aria-checked={noteFilter === f}
            className={noteFilter === f ? `${styles.chip} ${styles.chipOn}` : styles.chip}
            onClick={() => setNoteFilter(f)}
          >
            {f === 'all' ? t('office.libraries.notes_filter.all') : t(projectTypeLabel(f))}
          </button>
        ))}
      </div>
      {NOTE_GROUPS.map((g) => {
        const list = notesFor(shown, noteFilter, g);
        return (
          <section key={g} data-testid="notes-group" data-group={g} className={styles.group}>
            <h3 className={styles.groupHead}>
              {t(`office.libraries.notes_heading.${g}`)}
              <span className={styles.groupCount}>{list.length}</span>
            </h3>
            {list.length === 0 ? (
              <p className={styles.groupEmpty}>{t('office.libraries.notes_group_empty')}</p>
            ) : (
              <ul data-testid="libraries-list" className={styles.list}>
                {list.map(row)}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
  const selected =
    selection.mode === 'item' ? (items.find((i) => i.id === selection.id) ?? null) : null;

  const body = (data: LibraryItem[]) => {
    if (data.length === 0) {
      return (
        <div data-testid="libraries-empty" data-tab={tab.id} className={styles.empty}>
          {t(tab.empty)}
          {canCreate ? (
            <StateButton
              data-testid="libraries-empty-add"
              variant="primary"
              disabled={!online}
              onClick={startNew}
            >
              {t(addLabel)}
            </StateButton>
          ) : null}
        </div>
      );
    }
    const shown = data.filter((i) => matchesSearch(i, term));
    if (shown.length === 0) {
      return (
        <div data-testid="libraries-no-match" className={styles.empty}>
          {t('office.libraries.no_match', { query: term })}
        </div>
      );
    }
    if (tab.kind === 'note') return notesBody(shown);
    return (
      <ul data-testid="libraries-list" className={styles.list}>
        {shown.map(row)}
      </ul>
    );
  };

  const afterWrite = (next: Selection) => {
    setSelection(next);
    setTick((n) => n + 1);
  };

  return (
    <div data-testid="libraries-panel" className={styles.panel}>
      <div className={styles.head}>
        <div
          role="tablist"
          aria-label={t('office.settings.section.libraries')}
          className={styles.tabs}
        >
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              data-testid="libraries-tab"
              data-tab={x.id}
              aria-selected={x.id === tab.id}
              className={x.id === tab.id ? `${styles.tab} ${styles.tabOn}` : styles.tab}
              onClick={() => openTab(x)}
            >
              {t(x.label)}
            </button>
          ))}
        </div>
        <div className={styles.tools}>
          <label className={styles.search}>
            <Icon name="search" size={17} />
            <input
              data-testid="libraries-search"
              className={styles.searchInput}
              aria-label={t(tab.search)}
              placeholder={t(tab.search)}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          {canCreate ? (
            <StateButton
              data-testid="libraries-add"
              variant="primary"
              compact
              disabled={!online}
              onClick={startNew}
            >
              <Icon name="add" size={17} />
              {t(addLabel)}
            </StateButton>
          ) : null}
        </div>
      </div>
      {isTemplates ? (
        <TaskTemplates online={online} query={q} />
      ) : (
        <div className={styles.columns}>
          <div data-testid="libraries-body" role="tabpanel" className={styles.body}>
            <AsyncView
              key={tab.id}
              load={load}
              skeleton={
                <SkeletonGroup count={4}>
                  <Skeleton height="36px" />
                </SkeletonGroup>
              }
              errorMessage="office.libraries.load_failed"
            >
              {body}
            </AsyncView>
          </div>
          <aside data-testid="library-inspector" className={styles.inspector}>
            {selection.mode === 'new' ? (
              <ItemForm
                key={`new-${selection.kind}`}
                item={null}
                newKind={selection.kind}
                online={online}
                onCancel={() => setSelection({ mode: 'none' })}
                onSaved={(item) => afterWrite({ mode: 'item', id: item.id })}
                onDeleted={() => afterWrite({ mode: 'none' })}
              />
            ) : selected !== null ? (
              <ItemForm
                key={selected.id + selected.updatedAt}
                item={selected}
                newKind={newKind}
                online={online}
                onCancel={() => setSelection({ mode: 'none' })}
                onSaved={(item) => afterWrite({ mode: 'item', id: item.id })}
                onDeleted={() => afterWrite({ mode: 'none' })}
              />
            ) : (
              <p data-testid="library-inspector-empty" className={styles.inspectorEmpty}>
                {t('office.libraries.inspector_empty')}
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

type ItemFormProps = {
  // null: a new item of newKind.
  item: LibraryItem | null;
  newKind: 'abbreviation' | 'note';
  online: boolean;
  onCancel: () => void;
  onSaved: (item: LibraryItem) => void;
  onDeleted: () => void;
};

function ItemForm({ item, newKind, online, onCancel, onSaved, onDeleted }: ItemFormProps) {
  const t = useT();
  const ask = useConfirm();
  const kind: LibraryKind = item?.kind ?? newKind;
  const editable = EDITABLE_KINDS.includes(kind);
  const hasMeaning = kind === 'abbreviation';
  const isNote = kind === 'note';
  const [name, setName] = useState(item?.name ?? '');
  const [meaning, setMeaning] = useState(item?.meaning ?? '');
  const [group, setGroup] = useState<NoteGroup>(item?.note?.group ?? 'general');
  const [projectTypes, setProjectTypes] = useState<NoteProjectType[]>(
    item?.note?.projectTypes ?? [...NOTE_PROJECT_TYPES],
  );
  const [problem, setProblem] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const code = isNote
      ? checkNoteDraft(name, projectTypes)
      : checkLibraryDraft({ name, meaning: hasMeaning ? meaning : null });
    if (code !== null) {
      setProblem(`error.${code}` as MessageKey);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const body = isNote
        ? { text: name, group, projectTypes }
        : hasMeaning
          ? { name, meaning }
          : { name };
      const res = await fetch(
        item === null ? '/api/settings/libraries' : `/api/settings/libraries/${item.id}`,
        {
          method: item === null ? 'POST' : 'PATCH',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(item === null ? { kind, ...body } : body),
        },
      );
      const json = (await res.json().catch(() => null)) as {
        item?: LibraryItem;
        error?: { code?: string };
      } | null;
      if ((res.status === 200 || res.status === 201) && json?.item) {
        onSaved(json.item);
        return;
      }
      const errCode = json?.error?.code ?? '';
      setProblem(
        FIELD_CODES.has(errCode)
          ? (`error.${errCode}` as MessageKey)
          : 'office.libraries.save_failed',
      );
    } catch {
      setProblem('office.libraries.save_failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (item === null) return;
    const choice = await ask({
      title: 'office.libraries.delete_title',
      message: 'office.libraries.delete_message',
      params: { name: isNote ? t('office.libraries.this_note') : item.name },
      confirmLabel: 'office.libraries.delete',
      tone: 'danger',
    });
    if (choice !== 'confirm') return;
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/settings/libraries/${item.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (res.status === 200) {
        onDeleted();
        return;
      }
      setProblem('office.libraries.delete_failed');
    } catch {
      setProblem('office.libraries.delete_failed');
    } finally {
      setBusy(false);
    }
  };

  const title =
    item === null
      ? t(isNote ? 'office.libraries.new_note' : 'office.libraries.new_abbreviation')
      : isNote
        ? t(`office.libraries.note_group.${group}`)
        : item.name;
  const nameLabel = hasMeaning
    ? 'office.libraries.field_abbreviation'
    : 'office.libraries.field_name';
  const toggleType = (p: NoteProjectType) =>
    setProjectTypes((cur) =>
      cur.includes(p)
        ? cur.filter((x) => x !== p)
        : NOTE_PROJECT_TYPES.filter((x) => x === p || cur.includes(x)),
    );

  return (
    <form
      data-testid="library-form"
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className={styles.inspectorHead}>
        <h2 data-testid="library-inspector-title" className={styles.inspectorTitle}>
          {title}
        </h2>
        <span className={styles.inspectorKind}>{t(`office.libraries.kind.${kind}`)}</span>
      </div>
      {isNote ? (
        <>
          <label className={styles.field}>
            {t('office.libraries.field_note')}
            <textarea
              data-testid="library-field-note"
              className={`${styles.input} ${styles.textarea}`}
              value={name}
              rows={5}
              readOnly={!editable}
              autoFocus={item === null}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            {t('office.libraries.field_note_group')}
            <select
              data-testid="library-field-group"
              className={styles.input}
              value={group}
              disabled={!editable}
              onChange={(e) => setGroup(e.target.value as NoteGroup)}
            >
              {NOTE_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {t(`office.libraries.note_group.${g}`)}
                </option>
              ))}
            </select>
          </label>
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>{t('office.libraries.field_project_types')}</legend>
            {NOTE_PROJECT_TYPES.map((p) => (
              <label key={p} className={styles.check}>
                <input
                  type="checkbox"
                  data-testid="library-field-project-type"
                  data-type={p}
                  checked={projectTypes.includes(p)}
                  disabled={!editable}
                  onChange={() => toggleType(p)}
                />
                {t(projectTypeLabel(p))}
              </label>
            ))}
          </fieldset>
        </>
      ) : (
        <label className={styles.field}>
          {t(nameLabel)}
          <input
            data-testid="library-field-name"
            className={styles.input}
            value={name}
            readOnly={!editable}
            autoFocus={item === null}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      )}
      {hasMeaning ? (
        <label className={styles.field}>
          {t('office.libraries.field_meaning')}
          <input
            data-testid="library-field-meaning"
            className={styles.input}
            value={meaning}
            readOnly={!editable}
            onChange={(e) => setMeaning(e.target.value)}
          />
        </label>
      ) : null}
      {problem !== null ? (
        <p data-testid="library-form-error" role="alert" className={styles.error}>
          {t(problem)}
        </p>
      ) : null}
      {editable ? (
        <div className={styles.actions}>
          {item === null ? (
            <StateButton data-testid="library-cancel" onClick={onCancel} disabled={busy}>
              {t('office.libraries.cancel')}
            </StateButton>
          ) : (
            <StateButton
              data-testid="library-delete"
              variant="danger"
              disabled={!online || busy}
              onClick={() => void remove()}
            >
              {t('office.libraries.delete')}
            </StateButton>
          )}
          <StateButton
            data-testid="library-save"
            type="submit"
            variant="primary"
            disabled={!online || busy}
          >
            {t('office.libraries.save')}
          </StateButton>
        </div>
      ) : null}
    </form>
  );
}
