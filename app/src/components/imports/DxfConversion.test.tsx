// EZD-306 (S01 DXF: conversion choice "Convert all, convert some layers (layer checklist), or keep as reference
// only"; R26 R25 layers mapped to walls, doors and windows; Q-0760 built from the written spec). Radix is mocked as in
// EZD-015b's ConfirmDialog test so the dialog renders in place. Rendered in the real office catalog, English.
// Expected: the three choices in the spec's order with "Convert all" chosen first, one row per layer with the role
// its name suggests, and under "Convert all" every layer checked and fixed.
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('radix-ui', async () => {
  const React = await import('react');
  type P = Record<string, unknown> & { children?: ReactNode };
  const part = (tag: string) => {
    const Part = (props: P) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(props)) {
        if (k === 'className' || k === 'lang' || k.startsWith('data-')) out[k] = v;
      }
      return React.createElement(tag, out, props.children);
    };
    return Part;
  };
  const pass = (props: P) => React.createElement(React.Fragment, null, props.children);
  return {
    Dialog: {
      Root: pass,
      Portal: pass,
      Overlay: part('div'),
      Content: part('div'),
      Title: part('h2'),
      Description: part('p'),
    },
  };
});

import { elements, textOf } from '../../../test-harness/projects-markup';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { DxfConversionDialog } from './DxfConversion';

const render = (layers: string[]) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <DxfConversionDialog name="plan.dxf" layers={layers} onDone={() => {}} />
    </MessagesProvider>,
  );

const inputs = (html: string, testId: string) =>
  [...html.matchAll(new RegExp(`<input[^>]*data-testid="${testId}"[^>]*>`, 'g'))].map((m) => m[0]);

describe('EZD-306 DXF conversion choice dialog', () => {
  it('offers the three choices, Convert all first and chosen', () => {
    const html = render(['WALLS', 'DOORS']);
    expect(textOf(elements(html, 'dxf-conversion')[0].inner)).toContain('Convert plan.dxf');
    const labels = [...html.matchAll(/<label[^>]*>(.*?)<\/label>/g)].map((m) => textOf(m[1]));
    expect(labels).toEqual(['Convert all', 'Convert some layers', 'Keep as reference only']);
    expect(inputs(html, 'dxf-conversion-all')[0]).toContain('checked');
    expect(inputs(html, 'dxf-conversion-some')[0]).not.toContain('checked');
  });

  it('lists each layer with the role its name suggests; under Convert all every layer is checked', () => {
    const html = render(['DOORS', 'A-FURN', 'WALLS', 'WINDOWS']);
    const rows = elements(html, 'dxf-layer');
    expect(rows.map((r) => /data-layer="([^"]*)"/.exec(r.attrs)?.[1])).toEqual([
      'DOORS',
      'A-FURN',
      'WALLS',
      'WINDOWS',
    ]);
    const selected = elements(html, 'dxf-layer-role').map(
      (s) => /<option[^>]*selected=""[^>]*>([^<]*)</.exec(s.inner)?.[1],
    );
    expect(selected).toEqual(['Doors', 'Walls', 'Walls', 'Windows']);
    for (const box of inputs(html, 'dxf-layer-check')) {
      expect(box).toContain('checked');
      expect(box).toContain('disabled');
    }
    expect(elements(html, 'dxf-conversion-hint')).toHaveLength(0);
    expect(textOf(elements(html, 'dxf-conversion-continue')[0].inner)).toBe('Continue');
  });
});
