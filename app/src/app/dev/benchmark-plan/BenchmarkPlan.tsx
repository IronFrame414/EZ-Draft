'use client';
// EZD-207c Build step 6 (vault/plans/EZD-207c.md D-Page client): the plan canvas on EZD-236's benchmark model,
// generated in the browser, with no database and no save.
import { useEffect, useState, type ReactElement } from 'react';
import { DeviceLayout } from '../../../components/device/DeviceLayout';
import { EditorPhoneNotice } from '../../../components/phone/EditorPhoneNotice';
import { EditorFrame } from '../../../components/shell/EditorFrame';
import { HeaderCard } from '../../../components/shell/HeaderCard';
import { StatusBar } from '../../../components/shell/StatusBar';
import { createModelStore } from '../../../editor/model/model-store';
import {
  createPlanController,
  type PlanCanvasHandle,
  type PlanController,
  type PlanStats,
} from '../../../editor/plan/controller';
import { createGlyphAtlas } from '../../../editor/plan/glyph-atlas-canvas';
import { PlanCanvas, PlanInputSurface } from '../../../editor/plan/PlanCanvas';
import { createR3fRoot, webglContextsCreated } from '../../../editor/plan/render-root';
import { benchmarkObjects } from './benchmark-objects';

export function BenchmarkPlan(): ReactElement {
  const [plan, setPlan] = useState<PlanController | null>(null);
  const [failed, setFailed] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const objects = benchmarkObjects();
    const store = createModelStore({ objects });
    const controller = createPlanController(
      { store },
      { createRoot: createR3fRoot, createAtlas: createGlyphAtlas },
    );
    const w = window as unknown as {
      __ezdraftPlan?: { handle: PlanCanvasHandle; stats(): PlanStats & { contexts: number } };
    };
    w.__ezdraftPlan = {
      handle: controller.handle,
      stats: () => ({ ...controller.stats(), contexts: webglContextsCreated() }),
    };
    // State is set from a microtask, not in the effect body (react-hooks/set-state-in-effect; as ProjectEditor does).
    let live = true;
    void Promise.resolve().then(() => {
      if (!live) return;
      setPlan(controller);
      setCount(objects.size);
    });
    return () => {
      live = false;
      delete w.__ezdraftPlan;
      controller.dispose();
    };
  }, []);

  return (
    <>
      {count !== null ? <span hidden data-benchmark-objects={count} /> : null}
      <DeviceLayout
        full={
          <EditorFrame
            header={<HeaderCard />}
            rail={null}
            backdrop={
              plan && !failed ? <PlanCanvas controller={plan} onFailed={() => setFailed(true)} /> : undefined
            }
            canvas={plan && !failed ? <PlanInputSurface controller={plan} /> : null}
            statusBar={<StatusBar />}
          />
        }
        phone={<EditorPhoneNotice />}
      />
    </>
  );
}
