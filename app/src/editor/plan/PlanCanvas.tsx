'use client';
// EZD-207a Build step 11 (vault/plans/EZD-207a.md Decided "PlanCanvas", "PlanInputSurface"; C7, C8; 11 rule 4;
// R-054): the plan's one <canvas> behind the frame and the input surface in the canvas region. Each renders once;
// sizes and pointers go to the controller without React state.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { PlanController } from './controller';
import styles from './PlanCanvas.module.css';

export function PlanCanvas({
  controller,
  onFailed,
}: {
  controller: PlanController;
  onFailed: () => void;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const onFailedRef = useRef(onFailed);
  const [state, setState] = useState<'starting' | 'ready'>('starting');

  useEffect(() => {
    onFailedRef.current = onFailed;
  });

  useEffect(() => {
    const div = ref.current;
    if (div === null) return;
    let live = true;
    // A fresh element per mount, so a second mount never reuses a lost context.
    const canvas = document.createElement('canvas');
    canvas.className = styles.canvas;
    div.appendChild(canvas);
    const observer = new ResizeObserver(() =>
      controller.setCanvasRect(div.getBoundingClientRect()),
    );
    observer.observe(div);
    controller.setCanvasRect(div.getBoundingClientRect());
    void controller.attachCanvas(canvas).then((result) => {
      if (!live) return;
      if (result === 'ready') setState('ready');
      else if (result === 'failed') onFailedRef.current();
    });
    return () => {
      live = false;
      observer.disconnect();
      controller.detachCanvas();
      canvas.remove();
    };
  }, [controller]);

  return (
    <div ref={ref} className={styles.fill} data-testid="plan-canvas" data-plan-state={state} />
  );
}

export function PlanInputSurface({ controller }: { controller: PlanController }): ReactElement {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const div = ref.current;
    if (div === null) return;
    controller.attachSurface(div);
    const observer = new ResizeObserver(() =>
      controller.setRegionRect(div.getBoundingClientRect()),
    );
    observer.observe(div);
    controller.setRegionRect(div.getBoundingClientRect());
    return () => {
      observer.disconnect();
      controller.attachSurface(null);
    };
  }, [controller]);

  return <div ref={ref} className={styles.surface} data-testid="plan-input" />;
}
