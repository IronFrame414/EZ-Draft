'use client';

// EZD-401 (S09 Layout "category nav column ... product grid", States; S04 line picker; AC-EZD-401-1): the
// read-only catalog picker. The category column lists every S09 category with its item count; the active
// category's items are listed by line (a line heading with its count, then the items: code, name, W × D × H).
// No prices, search, filters or Add product: the full Catalog screen is phase 16. `onPick`, when given, makes
// each item a button.
import { useCallback, useMemo, useState } from 'react';
import {
  CATEGORY_LABELS,
  groupCatalog,
  sizeText,
  type CatalogCategory,
  type CatalogItem,
} from '../../lib/catalog/catalog';
import { useT } from '../../lib/messages';
import { AsyncView } from '../states/AsyncView';
import { Skeleton, SkeletonGroup } from '../states/Skeleton';
import styles from './CatalogPicker.module.css';

type ViewProps = {
  items: readonly CatalogItem[];
  onPick?: (item: CatalogItem) => void;
  initialCategory?: CatalogCategory;
};

export function CatalogPickerView({ items, onPick, initialCategory }: ViewProps) {
  const t = useT();
  const groups = useMemo(() => groupCatalog(items), [items]);
  const [active, setActive] = useState<CatalogCategory>(
    initialCategory ?? groups.find((g) => g.count > 0)?.category ?? groups[0]!.category,
  );
  const group = groups.find((g) => g.category === active)!;

  return (
    <div className={styles.picker} data-testid="catalog-picker">
      <nav className={styles.nav} aria-label={t('office.catalog.categories')}>
        {groups.map((g) => (
          <button
            key={g.category}
            type="button"
            className={g.category === active ? `${styles.category} ${styles.on}` : styles.category}
            aria-pressed={g.category === active}
            data-testid={`catalog-category-${g.category}`}
            onClick={() => setActive(g.category)}
          >
            <span>{t(CATEGORY_LABELS[g.category])}</span>
            <span className={styles.count}>{g.count}</span>
          </button>
        ))}
      </nav>
      <div className={styles.main}>
        {group.count === 0 ? (
          <p className={styles.empty}>{t('office.catalog.empty')}</p>
        ) : (
          group.lines.map((l) => (
            <section
              key={l.line ?? ''}
              className={styles.line}
              data-testid="catalog-line"
              data-line={l.line ?? ''}
            >
              {l.line !== null ? (
                <h3 className={styles.lineHead}>
                  <span>{t('office.catalog.line', { line: l.line })}</span>
                  <span className={styles.count}>{l.items.length}</span>
                </h3>
              ) : null}
              <ul className={styles.items}>
                {l.items.map((item) => (
                  <li key={item.id}>
                    <ItemRow item={item} onPick={onPick} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function ItemRow({ item, onPick }: { item: CatalogItem; onPick?: (item: CatalogItem) => void }) {
  const size = sizeText(item);
  const body = (
    <>
      {item.model !== null ? <span className={styles.code}>{item.model}</span> : null}
      <span className={styles.name}>{item.name}</span>
      {size !== null ? <span className={styles.size}>{size}</span> : null}
    </>
  );
  if (onPick === undefined) {
    return (
      <div className={styles.item} data-testid="catalog-item">
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`${styles.item} ${styles.pickable}`}
      data-testid="catalog-item"
      onClick={() => onPick(item)}
    >
      {body}
    </button>
  );
}

// Loads GET /api/catalog, then shows the view.
export function CatalogPicker(props: Omit<ViewProps, 'items'>) {
  const load = useCallback(async (signal: AbortSignal) => {
    const res = await fetch('/api/catalog', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    });
    if (res.status !== 200) throw new Error('catalog_load_failed');
    const data = (await res.json()) as { items: CatalogItem[] };
    return data.items;
  }, []);
  return (
    <AsyncView
      load={load}
      skeleton={
        <SkeletonGroup count={4}>
          <Skeleton height="32px" />
        </SkeletonGroup>
      }
      errorMessage="office.catalog.load_failed"
    >
      {(items) => <CatalogPickerView items={items} {...props} />}
    </AsyncView>
  );
}
