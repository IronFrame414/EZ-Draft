'use client';

// EZD-306 (S01 DXF: conversion choice "After upload, DXF only: Convert all, convert some layers (layer checklist),
// or keep as reference only"; R26 R25 "after the user maps layers to walls, doors and windows"; Q-0760 no board,
// built in the style of the Upload step): the conversion choice of one uploaded DXF drawing. Each layer row carries
// the role the detector reads it as; under "Convert some layers" only the checked layers are converted. Continue
// answers the layers to convert, none for "Keep as reference only". useDxfConversion gives the Upload step's hosts
// a chooseLayers for uploadAndStartImport and the dialog to render while it waits.
import { Dialog } from 'radix-ui';
import { useCallback, useRef, useState, type ReactElement } from 'react';
import {
  choiceComplete,
  chosenLayers,
  DXF_CONVERSIONS,
  DXF_LAYER_ROLES,
  initialChoice,
  type DxfChoiceState,
  type DxfLayerChoice,
  type DxfLayerRole,
} from '../../lib/imports/dxf-layers';
import { useT } from '../../lib/messages';
import shell from '../projects/NewProject.module.css';
import { StateButton } from '../states/StateButton';
import upload from './Upload.module.css';
import styles from './DxfConversion.module.css';

export type DxfConversionProps = {
  name: string;
  layers: readonly string[];
  onDone: (layers: DxfLayerChoice[]) => void;
};

export function DxfConversionDialog({ name, layers, onDone }: DxfConversionProps): ReactElement {
  const t = useT();
  const [state, setState] = useState<DxfChoiceState>(() => initialChoice(layers));
  const complete = choiceComplete(state);

  const setRow = (index: number, patch: { checked?: boolean; role?: DxfLayerRole }) =>
    setState((s) => ({
      ...s,
      rows: s.rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }));

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className={shell.overlay} />
        <Dialog.Content
          data-testid="dxf-conversion"
          lang={t.language}
          className={shell.content}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <div className={shell.header}>
            <div className={shell.headText}>
              <Dialog.Title className={shell.title}>{t('office.dxf.title', { name })}</Dialog.Title>
              <Dialog.Description className={shell.subtitle}>{t('office.dxf.sub')}</Dialog.Description>
            </div>
          </div>
          <div className={shell.body}>
            <fieldset className={styles.choices}>
              <legend className={styles.legend}>{t('office.dxf.choice_label')}</legend>
              {DXF_CONVERSIONS.map((c) => (
                <label
                  key={c}
                  className={
                    state.conversion === c ? `${styles.choice} ${styles.choiceOn}` : styles.choice
                  }
                >
                  <input
                    type="radio"
                    name="dxf-conversion"
                    data-testid={`dxf-conversion-${c}`}
                    value={c}
                    checked={state.conversion === c}
                    onChange={() => setState((s) => ({ ...s, conversion: c }))}
                  />
                  {t(`office.dxf.${c}`)}
                </label>
              ))}
            </fieldset>
            {state.conversion !== 'none' ? (
              <>
                <p className={styles.layersTitle}>{t('office.dxf.layers_title')}</p>
                <ul className={upload.list} data-testid="dxf-layers">
                  {state.rows.map((row, i) => (
                    <li
                      key={row.name}
                      className={styles.layerRow}
                      data-testid="dxf-layer"
                      data-layer={row.name}
                    >
                      <input
                        type="checkbox"
                        className={styles.check}
                        data-testid="dxf-layer-check"
                        aria-label={t('office.dxf.layer_check', { layer: row.name })}
                        checked={state.conversion === 'all' || row.checked}
                        disabled={state.conversion === 'all'}
                        onChange={(e) => setRow(i, { checked: e.target.checked })}
                      />
                      <span className={styles.layerName} title={row.name}>
                        {row.name}
                      </span>
                      <select
                        data-testid="dxf-layer-role"
                        aria-label={t('office.dxf.role_label', { layer: row.name })}
                        className={upload.tag}
                        value={row.role}
                        onChange={(e) => setRow(i, { role: e.target.value as DxfLayerRole })}
                      >
                        {DXF_LAYER_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {t(`office.dxf.role_${role}`)}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {!complete ? (
              <p data-testid="dxf-conversion-hint" role="status" className={shell.hint}>
                {t('office.dxf.pick_layer')}
              </p>
            ) : null}
          </div>
          <div className={shell.footer}>
            <span className={shell.spacer} />
            <StateButton
              data-testid="dxf-conversion-continue"
              variant="primary"
              className={shell.createButton}
              disabled={!complete}
              onClick={() => onDone(chosenLayers(state))}
            >
              {t('office.dxf.continue')}
            </StateButton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type Pending = { seq: number; name: string; layers: string[]; resolve: (layers: DxfLayerChoice[]) => void };

export function useDxfConversion(): {
  chooseLayers: (file: { name: string; layers: string[] }) => Promise<DxfLayerChoice[]>;
  dialog: ReactElement | null;
} {
  const [pending, setPending] = useState<Pending | null>(null);
  const seq = useRef(0);
  const chooseLayers = useCallback(
    (file: { name: string; layers: string[] }) =>
      new Promise<DxfLayerChoice[]>((resolve) => {
        seq.current += 1;
        setPending({ ...file, seq: seq.current, resolve });
      }),
    [],
  );
  const dialog = pending ? (
    <DxfConversionDialog
      key={pending.seq}
      name={pending.name}
      layers={pending.layers}
      onDone={(layers) => {
        setPending(null);
        pending.resolve(layers);
      }}
    />
  ) : null;
  return { chooseLayers, dialog };
}
