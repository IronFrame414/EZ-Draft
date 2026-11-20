'use client';

// EZD-127 (04 Header card "N to review" pill; phase-01 EZD-127 "hidden at 0 ... never counted across tables on page
// load"): the editor's review pill and list. On open the editor reads the project's stored count (the same
// project.open_items_count the Projects card shows); the pill opens the list, which reads the open items then and
// takes the fresh count with them. Shown to every viewer of the project (View projects), not only editors.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ReviewList, type ReviewListState } from '../../components/shell/ReviewList';
import { ReviewPill } from '../../components/shell/ReviewPill';
import { reviewHttpApi, type ReviewApi } from './review-api';

export type EditorReviewProps = { projectId: string; api?: ReviewApi };

const defaultApi = reviewHttpApi();

export function EditorReview({
  projectId,
  api = defaultApi,
}: EditorReviewProps): ReactElement | null {
  const [count, setCount] = useState(0);
  const [list, setList] = useState<ReviewListState | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const listId = useId();
  const loadRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void api.summary(projectId, false, controller.signal).then((s) => {
      if (s !== null && !controller.signal.aborted) setCount(s.count);
    });
    return () => controller.abort();
  }, [api, projectId]);

  useEffect(() => () => loadRef.current?.abort(), []);

  const loadList = useCallback(() => {
    loadRef.current?.abort();
    const controller = new AbortController();
    loadRef.current = controller;
    setList({ kind: 'loading' });
    void api.summary(projectId, true, controller.signal).then((s) => {
      if (controller.signal.aborted) return;
      if (s === null || s.groups === undefined) {
        setList({ kind: 'failed' });
        return;
      }
      setCount(s.count);
      setList(s.count > 0 ? { kind: 'ready', groups: s.groups } : null);
    });
  }, [api, projectId]);

  const close = useCallback(() => {
    loadRef.current?.abort();
    setList(null);
  }, []);

  const toggle = useCallback(() => {
    if (list === null) loadList();
    else close();
  }, [list, loadList, close]);

  if (count <= 0) return null;
  return (
    <>
      <ReviewPill
        ref={anchorRef}
        count={count}
        open={list !== null}
        onToggle={toggle}
        listId={listId}
      />
      {list !== null ? (
        <ReviewList
          state={list}
          anchorRef={anchorRef}
          id={listId}
          onClose={close}
          onRetry={loadList}
        />
      ) : null}
    </>
  );
}
