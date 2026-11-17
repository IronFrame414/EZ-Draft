// EZD-306 (S01 DXF: conversion choice; R26 R25; S02 Decisions "lists only items from the layers chosen for
// conversion"). Two pieces:
// - listDxfLayers: the layer names the checklist offers, from a raw scan of the ENTITIES section's group 8 codes.
//   It is not the DXF parser (docs/architecture.md DXF "Where parsing runs: background jobs only"), so the layers
//   route may call it; it decodes as readDxf does (decodeDxf) and lists the same names readDxf reports for the
//   entities it reads.
// - layerMapFromChoice: the detector's layer map from the user's choice. The detector reads only layers named in
//   its map (detect.ts `on(role)`), so a layer left out yields no item.
import type { DxfLayerChoice } from '../../../lib/imports/dxf-layers';
import type { LayerMap } from './detect';
import { decodeDxf } from './read-dxf';

export function listDxfLayers(bytes: Uint8Array): string[] {
  const lines = decodeDxf(bytes).split(/\r?\n/);
  const layers = new Set<string>();
  let section: string | null = null;
  let expectName = false;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim();
    const value = lines[i + 1].trim();
    if (code === '0') {
      if (value === 'SECTION') {
        expectName = true;
        continue;
      }
      if (value === 'ENDSEC') section = null;
      expectName = false;
      continue;
    }
    if (expectName && code === '2') {
      section = value;
      expectName = false;
      continue;
    }
    if (section === 'ENTITIES' && code === '8') layers.add(value);
  }
  return [...layers].sort();
}

export function layerMapFromChoice(choices: readonly DxfLayerChoice[]): LayerMap {
  const map: LayerMap = { walls: [], doors: [], windows: [], rooms: [] };
  for (const c of choices) map[c.role].push(c.name);
  return map;
}
