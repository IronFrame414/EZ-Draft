// EZD-306 (S01 DXF: conversion choice "Convert all, convert some layers (layer checklist), or keep as reference
// only"; R26 R25 layers mapped to walls, doors and windows). Expected: "all" converts every layer, "some" only the
// checked ones, "none" nothing; "some" with nothing checked cannot continue; each layer starts with the role its
// name suggests (the synthetic room's layer names WALLS, DOORS, WINDOWS, ROOMS).
import { describe, expect, it } from 'vitest';
import { choiceComplete, chosenLayers, guessLayerRole, initialChoice } from './dxf-layers';

const LAYERS = ['DOORS', 'ROOMS', 'WALLS', 'WINDOWS', 'A-FURN'];

describe('EZD-306 DXF conversion choice', () => {
  it('each layer starts with the role its name suggests, and only those start checked', () => {
    expect(LAYERS.map(guessLayerRole)).toEqual(['doors', 'rooms', 'walls', 'windows', 'walls']);
    expect(initialChoice(LAYERS).rows.map((r) => r.checked)).toEqual([true, true, true, true, false]);
    expect(initialChoice(LAYERS).conversion).toBe('all');
  });

  it('Convert all converts every layer with its role', () => {
    expect(chosenLayers(initialChoice(LAYERS))).toEqual([
      { name: 'DOORS', role: 'doors' },
      { name: 'ROOMS', role: 'rooms' },
      { name: 'WALLS', role: 'walls' },
      { name: 'WINDOWS', role: 'windows' },
      { name: 'A-FURN', role: 'walls' },
    ]);
  });

  it('Convert some layers converts only the two checked layers', () => {
    const base = initialChoice(LAYERS);
    const state = {
      conversion: 'some' as const,
      rows: base.rows.map((r) => ({ ...r, checked: r.name === 'WALLS' || r.name === 'DOORS' })),
    };
    expect(chosenLayers(state)).toEqual([
      { name: 'DOORS', role: 'doors' },
      { name: 'WALLS', role: 'walls' },
    ]);
    expect(choiceComplete(state)).toBe(true);
  });

  it('Keep as reference only converts nothing; some with none checked cannot continue', () => {
    const base = initialChoice(LAYERS);
    expect(chosenLayers({ ...base, conversion: 'none' })).toEqual([]);
    const none = { conversion: 'some' as const, rows: base.rows.map((r) => ({ ...r, checked: false })) };
    expect(choiceComplete(none)).toBe(false);
    expect(choiceComplete({ ...none, conversion: 'none' })).toBe(true);
  });
});
