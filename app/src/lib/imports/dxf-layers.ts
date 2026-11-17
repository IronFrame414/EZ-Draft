// EZD-306 (S01 DXF: conversion choice "Convert all, convert some layers (layer checklist), or keep as reference
// only"; R26 R25 "A non-Polycam DXF layer is converted with the same detector as Polycam imports, after the user
// maps layers to walls, doors and windows"; S02 Decisions "This screen lists only items from the layers chosen for
// conversion"): the conversion choice of one DXF drawing, shared by the browser and the server. A converted layer
// carries the role the detector reads it as; a layer left out is not converted. No React, no Supabase.

export const DXF_CONVERSIONS = ['all', 'some', 'none'] as const;
export type DxfConversion = (typeof DXF_CONVERSIONS)[number];

// The detector's layer roles (server/jobs/polycam-dxf/detect.ts LayerRole), in its order.
export const DXF_LAYER_ROLES = ['walls', 'doors', 'windows', 'rooms'] as const;
export type DxfLayerRole = (typeof DXF_LAYER_ROLES)[number];

export type DxfLayerChoice = { name: string; role: DxfLayerRole };

// A DXF layer name is at most 255 characters (AutoCAD symbol table names); a drawing's list is bounded.
export const DXF_LAYER_NAME_MAX = 255;
export const DXF_LAYERS_MAX = 2000;

const KEYWORDS: Record<DxfLayerRole, RegExp> = {
  walls: /wall/i,
  doors: /door/i,
  windows: /window|glaz/i,
  rooms: /room|space|floor|area/i,
};

// The role a layer starts with in the checklist: the one its name suggests, else walls. The user can change it.
export function guessLayerRole(name: string): DxfLayerRole {
  for (const role of DXF_LAYER_ROLES) if (KEYWORDS[role].test(name)) return role;
  return 'walls';
}

// Whether a layer starts checked under "Convert some layers": only when its name suggests a role.
export function suggestsRole(name: string): boolean {
  return DXF_LAYER_ROLES.some((role) => KEYWORDS[role].test(name));
}

export type DxfLayerRow = { name: string; checked: boolean; role: DxfLayerRole };

export type DxfChoiceState = { conversion: DxfConversion; rows: DxfLayerRow[] };

export function initialChoice(layers: readonly string[]): DxfChoiceState {
  return {
    conversion: 'all',
    rows: layers.map((name) => ({ name, checked: suggestsRole(name), role: guessLayerRole(name) })),
  };
}

// The layers to convert: every layer for "all", the checked ones for "some", none for "none". An empty list
// means the drawing stays a reference only.
export function chosenLayers(state: DxfChoiceState): DxfLayerChoice[] {
  if (state.conversion === 'none') return [];
  return state.rows
    .filter((r) => state.conversion === 'all' || r.checked)
    .map((r) => ({ name: r.name, role: r.role }));
}

// Continue is allowed unless "some" is chosen with no layer checked.
export function choiceComplete(state: DxfChoiceState): boolean {
  return state.conversion !== 'some' || state.rows.some((r) => r.checked);
}
