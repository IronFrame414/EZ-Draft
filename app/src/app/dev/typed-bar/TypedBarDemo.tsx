'use client';
// Stub-tool test page for the typed dimension bar (EZD-209). Dev only; EZD-210 mounts the layer with real tools.
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { EditorFrame, HeaderCard, StatusBar, ToolRail } from '../../../components/shell';
import {
  TURN_ANGLE_FIELD,
  WALL_LENGTH_FIELD,
  type TypedTool,
  type TypedValues,
} from '../../../editor/typed-entry/typed-entry';
import { TypedEntryLayer } from '../../../editor/typed-entry/TypedEntryLayer';
import styles from './page.module.css';

const STUB_TOOL: TypedTool = {
  id: 'stub',
  icon: 'straighten',
  fields: [WALL_LENGTH_FIELD, TURN_ANGLE_FIELD],
};
const noop = () => {};

export function TypedBarDemo({ canEdit }: { canEdit: boolean }) {
  const [tool, setTool] = useState<TypedTool | null>(STUB_TOOL);
  const [commits, setCommits] = useState<string[]>([]);
  const [lastValues, setLastValues] = useState<Record<string, number>>({});
  const [keyCount, setKeyCount] = useState(0);
  const cursor = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onKey = () => setKeyCount((n) => n + 1);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const store = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    cursor.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onCommit = (values: TypedValues) => {
    setCommits((list) => [...list, JSON.stringify(values)]);
    setLastValues((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(values)) if (v !== null) next[k] = v;
      return next;
    });
  };

  return (
    <EditorFrame
      header={<HeaderCard />}
      rail={<ToolRail top={[]} bottom={[]} activeId={null} onSelect={noop} />}
      leftPanelLabel="office.shell.left_panel"
      inspectorLabel="office.shell.inspector"
      statusBar={<StatusBar />}
      canvas={
        <>
          <div
            className={styles.stage}
            data-testid="typed-bar-stage"
            onPointerMove={store}
            onPointerDown={store}
          />
          <button
            type="button"
            className={styles.toggle}
            data-testid="stub-tool-toggle"
            onClick={() => setTool((t) => (t === null ? STUB_TOOL : null))}
          >
            Toggle tool
          </button>
          <ol className={styles.log} data-testid="stub-commits">
            {commits.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
          <span data-testid="stub-key-count">{keyCount}</span>
          <TypedEntryLayer
            tool={tool}
            canEdit={canEdit}
            lastValues={lastValues}
            getCursor={() => cursor.current}
            onCommit={onCommit}
          />
        </>
      }
    />
  );
}
