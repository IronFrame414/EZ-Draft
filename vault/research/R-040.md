---
title: Verify four OSS repos at pinned commits (license, commit date, file facts)
scope: https://raw.githubusercontent.com/<owner>/<repo>/<sha>/<path>, https://api.github.com/repos/<owner>/<repo>/commits/<sha>, https://api.github.com/repos/<owner>/<repo>/git/trees/<sha>?recursive=1 for the four repos above only
ticket: EZD-201
---

# (A) laanlabs/openPlan3D @ 98f9cb467e4045c6abc5d9880ada1f03dff50c68

## LICENSE and commit
- License: MIT License. Copyright line: "Copyright (c) 2026 theLodgeStudio". Source: https://raw.githubusercontent.com/laanlabs/openPlan3D/98f9cb467e4045c6abc5d9880ada1f03dff50c68/LICENSE
- Commit date: author 2026-10-22 23:43:19 UTC, committer same. Message: "Merge pull request #124 from laanlabs/fix/vite-vitest-advisories". Source: https://api.github.com/repos/laanlabs/openPlan3D/commits/98f9cb467e4045c6abc5d9880ada1f03dff50c68
- Tree listing (https://api.github.com/repos/laanlabs/openPlan3D/git/trees/98f9cb467e4045c6abc5d9880ada1f03dff50c68?recursive=1) was truncated; each named file was fetched directly by raw URL and returned content, so each exists at this SHA.

## Files
| File | Exists | Exports | Imports from outside file | Units (evidence) | What it does |
|---|---|---|---|---|---|
| src/lib/utils/doorSymbol.ts | yes | `type DoorSymbolPart`; `function doorSymbol(wall: Wall, door: Pick<Door,'position'\|'width'\|'type'\|'swingDirection'\|'flipSide'>): DoorSymbolPart[]` | `import type { Door, Point, Wall } from '$lib/models/types';` | Not named in code. Comments say "plan coordinates (y down, like the editor canvas)"; fixed radii (r: 2.5). Likely pixels or plan units, inferred. | Builds plan-view door symbol parts (swing arc, leaf, panels, track, threshold, hinge). Used by SVG and DXF exporters. |
| src/lib/utils/planWallOutline.ts | yes | `function planWallOutlines(wall: Wall, openings: {position:number; width:number}[]): Point[][]` | `import type { Point, Wall } from '$lib/models/types';`; `import { planWallSpans } from './planOpening';` | Not named; uses wall.thickness/position/width directly (unit of Wall model not shown). | Builds closed wall outline polygons split at openings, offsetting centerline by half thickness with mitred corners. |
| src/lib/utils/roomDetection.ts | yes | `detectRooms(walls: Wall[]): Room[]`; `resolveRooms(floor, previousRooms=[]): Room[]`; `resolveRoomGeometry(floor, previousRooms=[]): RoomFace[]`; `getRoomPolygon(room: Room, walls: Wall[]): Point[]`; `roomCentroid(polygon: Point[]): Point`; `roomLabelPosition(room, polygon, holes=[]): Point` | `import type { Wall, Point, Room, Floor } from '$lib/models/types';`; `import { wallPathSpans } from './wallProfiles';`; `import { roomHoles, roomInteriorPoint } from './roomNesting';` | Centimetres (comment "Skip slivers under 0.1 m² (1000 cm²)"; "// cm² to m²", divide by 10000). Area in m². | Detects enclosed rooms by splitting walls and tracing faces; carries saved room metadata over by boundary identity; polygon/centroid/label helpers. All four named functions are exported. |
| src/lib/utils/canvasSymbolSvg.ts | yes | `canvasSymbolSvg(draw: (ctx: CanvasRenderingContext2D) => void): string` | `import { escapeXml } from './exportText';` | Pixels (SVG user units; default font '10px sans-serif'; angles radians converted to degrees). | Records Canvas-style drawing calls and emits SVG markup string. |
| src/lib/utils/canvasSymbolDxf.ts | yes | `export type SplineDrawing`; `export function canvasSymbolDxf(drawing: Drawing, draw: (ctx) => void)` | `import Drawing from 'dxf-writer';` | Pixels (font '10px sans-serif', parser /([\d.]+)px/); coordinates unitless; angles radians. | Records Canvas-style paths/text and writes them to a DXF drawing via dxf-writer, curves as weighted splines. |
| src/lib/utils/roomSlabGeometry.ts | yes | `createRoomSlabGeometry(polygon: Point[], thickness = 5, holes: Point[][] = []): ExtrudeGeometry \| null` | `import { ExtrudeGeometry, Shape, Path } from 'three';`; `import type { Point } from '$lib/models/types';` | Centimetres (doc comment "in centimetres"; default thickness 5). | Builds a Three.js extruded slab from room outline and holes; returns null on invalid input. |
| src/lib/utils/wallProfiles.ts | yes | `buildWallSegments(length, start, end, doors: Door[], windows: Window[]): WallSegment[]` (confirmed exported); also exports `openingOnWall`, `wallPathSpans`, `wallPathProfile`, `pathOpening`, `wallProfileSpans`, `roomCeilingHeight`, `doorPanelPose`, and interfaces `WallOpening`, `WallSegment` | `import { getWallStartHeight, getWallEndHeight, type Wall, type Door, type Window, type Point } from '$lib/models/types';` (only import) | Not stated. Defaults `d.height ?? 210`, `w.sillHeight ?? 90` imply centimetres (inference, not documented). | Computes door/window openings on straight and curved walls and splits wall faces into solid segments around openings; ceiling height and door-leaf pose helpers. |
| src/lib/utils/walkthroughMotion.ts | yes | `interface WalkthroughSettings`; `class WalkthroughMotion` (methods: active, startClock, stopClock, setKey, reset, advance) | `import { Euler, type Camera } from 'three';` | Timestamps in milliseconds (/1000); comments "800 gives 80 cm/s", "at most 0.001 cm" (cm). Scene unit inferred; code divides speeds by 10. | First-person walkthrough camera motion from keyboard state, frame-rate independent with acceleration and drag. |
| src/lib/utils/roomplanImport.ts | yes | `ORTHO_VERSION = 'v5'`; `RoomPlanImportOptions`; `roomPlanImportOptions(data)`; `importRoomPlan(jsonData, options?): Floor`; `importRoomPlanFloors(...): Floor[]`; `interchangeStateFromRoomPlan(...)`; `createProjectFromRoomPlan(jsonData, name, options?): Project`; `extractRoomJsonFromZip(zipFile: File): Promise<any>`; `DEFAULT_ROOMPLAN_OPTIONS`; re-exports `validateRoomPlan`, `isRoomPlanJson` | `import type {...} from '$lib/models/types';`; `import { INTERCHANGE_BLOCK_KEYS } from '$lib/models/types';`; `import { createDefaultProject, createDefaultFloor } from '$lib/stores/project';`; `import { detectRooms, getRoomPolygon } from '$lib/utils/roomDetection';`; `import { COLLAPSED_WALL_LENGTH, validateRoomPlan } from './roomplanValidation';`; `import { importedFurnitureCategory } from './furnitureCategories';`; `import { openingDropTarget } from './openingDrop';`; dynamic `await import('jszip')` | Input metres (header "RoomPlan coordinate system: Y-up, meters", x100 to cm); internal centimetres (header "Our coordinate system: 2D XY in centimeters"; mergeDistance cm, default 15); angles degrees. No feet/inches/pixels. | Converts Apple RoomPlan JSON into the app's Floor/Project model, with optional straightening/orthogonal snapping and corner merge. |

Note: this repo's utils import `$lib/models/types`, `$lib/stores/project` and `three` (roomSlabGeometry, walkthroughMotion); see per-row imports above.

# (B) Driven-Waterproofing-Solutions-Pty-Ltd/take-off @ 46079c8cb9686412ac101d96bae90e708447fa51

## LICENSE and commit
- License: MIT License. Copyright line: "Copyright (c) 2026 Driven Waterproofing Solutions Pty Ltd". Source: https://raw.githubusercontent.com/Driven-Waterproofing-Solutions-Pty-Ltd/take-off/46079c8cb9686412ac101d96bae90e708447fa51/LICENSE
- Commit date: author and committer 2026-10-16T18:11:23Z. Source: https://api.github.com/repos/Driven-Waterproofing-Solutions-Pty-Ltd/take-off/commits/46079c8cb9686412ac101d96bae90e708447fa51
- Tree listing: two exact `utils/` matches at repo root: `utils/geometry.ts` and `utils/math.ts` (https://api.github.com/repos/Driven-Waterproofing-Solutions-Pty-Ltd/take-off/git/trees/46079c8cb9686412ac101d96bae90e708447fa51?recursive=1). Both exist at root.
- Also present: `take-off-web/apps/web/src/utils/geometry.ts` and `take-off-web/apps/web/src/utils/math.ts` (different files, a near-identical older/parallel copy; not the path named in the brief). Their export lists match the root ones except as noted below.

## Files
**utils/geometry.ts** (exists; blob size 10370 bytes per tree)
- Exports (confirmed): `calculateDistance(p1,p2): number`, `calculatePolylineLength(points: Point[]): number`, `calculatePolygonArea(points: Point[]): number`, `isPointInPolygon`, `getScaledValue(pixels, pixelsPerUnit)`, `getScaledArea(pixelArea, pixelsPerUnit)`, `generateColor(index)`, `parseDimensionInput(input: string): number | null`, `PresetScale`, `PRESET_SCALES`, `getAreaUnitFromLinear`, `getVolumeUnitFromLinear`, `calculateArcPoints(start, end, bulge, segments=20): Point[]`, `calculateArcLength(start, end, bulge): number`. `convertLinearUnit` is also exported (per the first pass, not re-confirmed on the root file).
- Imports: `import { Point, Unit } from '../types';` (only import).
- Units: geometry functions use raw coordinates with no conversion (PDF points or pixels; comment says pointsPerUnit counts PDF points, 1/72 inch). parseDimensionInput returns decimal feet (`feet + inches/12`). Metric presets use metres ("We use Meters as base."). Inches are input only.
- What it does: distance, polyline and polygon length/area, arc geometry, plan scale presets and unit-label helpers, and a feet-inch parser.

**utils/math.ts** (exists; blob size 6673 bytes per tree)
- Exports (confirmed): `evaluateFormulaChecked(item, overrideQty?, formulaOverride?, extraVariables?): { value: number; ok: boolean }` (declared `export const`), `evaluateFormula(...)`: number, `toVariableName`, `isValidIdentifier`, `replaceLabelsWithVars`, `renameVariable`, `sanitizeFormula`, `convertValue(value, fromUnit, toUnit, type): number`.
- Imports: `import { TakeoffItem, Unit, ToolType } from "../types";` and `import { create, all } from 'mathjs';`
- Mathjs: `create(all)`, then `import`, `createUnit`, `evaluate`, `parse`, `simplify`, `derivative` are overridden to throw; the formula path uses the pre-override evaluate.
- Units: none converted. `convertValue` returns its input unchanged; comment "The Unit selection is treated as a label only, no mathematical conversion is performed automatically."
- `evaluateFormulaChecked` does not throw: returns `ok: false` when evaluation throws or yields a non-number/NaN/null/undefined; quantity-only (ok: true) when the formula is blank. Behaviour read from code by a model pass, not executed.

## parseDimensionInput (utils/geometry.ts) accepted formats
- Declaration: `export const parseDimensionInput = (input: string): number | null => {` (from the root-path file as read via the tool).
- Returns null for empty/whitespace input. Input is trimmed and lowercased. Feet/inch branch triggers when the string contains `'`, `"`, `ft` or `in`: feet from a regex, inches from the remainder. Whole, decimal and fraction forms (incl. "10 1/2") are accepted. A dash form ("10-6") is handled when no fraction slash is present. Otherwise plain decimal or fraction; null if not a number.
- Traces (read by a model pass from the code, NOT executed; check by running the function):
  - `12'6"` -> 12.5
  - `12' 6 1/2"` -> ~12.5417 (12 + 6.5/12)
  - `150"` -> 12.5 (feet = 0, inches 150/12)
  - `12.5'` -> 12.5
  - `10-6` -> 10.5 (dash branch, no feet/inch markers)
- Verbatim body: NOT obtained. The WebFetch tool cannot return raw source text beyond short quotes, so the function body could not be quoted in this report. The raw file is at https://raw.githubusercontent.com/Driven-Waterproofing-Solutions-Pty-Ltd/take-off/46079c8cb9686412ac101d96bae90e708447fa51/utils/geometry.ts and must be read directly to verify.

# (C) dobriai/footinch @ 72d3c18360c8f11b1375892ac7ce5a5d1f680033

## LICENSE and commit
- LICENSE: MISSING at this SHA. Tree listing (https://api.github.com/repos/dobriai/footinch/git/trees/72d3c18360c8f11b1375892ac7ce5a5d1f680033?recursive=1, not truncated) has no LICENSE of any case or path.
- package.json (https://raw.githubusercontent.com/dobriai/footinch/72d3c18360c8f11b1375892ac7ce5a5d1f680033/package.json): `"license": "MIT"`, `"author": "Ivan Dobrianov"`.
- Commit date: author and committer 2022-02-02T01:36:49Z. Source: https://api.github.com/repos/dobriai/footinch/commits/72d3c18360c8f11b1375892ac7ce5a5d1f680033

## Files
- lib/parse.js: exists. Exports (via `toExport`): `F`/`FEET` (returns feet, NaN on failure), `M`/`METERS` (returns metres), `METERS_PER_FOOT = 0.3048`, `noConflict()`. Imports: none (no require/import; checks for `exports`/`module` at runtime). Units: feet (`'` or `ft`), inches (`"` or `in`, divided by 12), SI prefixes incl. m, cm, mm, km; pixels not used. Does: parses length strings such as `7 11/16"` and `5cm` into feet or metres.
- lib/format.js: exists. Exports one object `format` (module.exports or root.format). Getters FEET/FT/F, METERS/M, KM, CM; targets IN/INCHES, DEC/DECIMAL, FRAC/FRACTIONAL, `noConflict()`. Imports: none. Units: feet, inches, metres, kilometres, centimetres; pixels not used. Does: formats numbers as feet-inch or decimal/fractional strings.

# (D) Liksu/to-inches @ 13a6502ed46a285cb7a02d2f2fb244fe61aa2234

## LICENSE and commit
- License: MIT License. Copyright line: "Copyright (c) 2024 Petro Borshchahivskyi". Source: https://raw.githubusercontent.com/Liksu/to-inches/13a6502ed46a285cb7a02d2f2fb244fe61aa2234/LICENSE
- Commit date: author and committer 2025-07-13T01:58:10Z. Source: https://api.github.com/repos/Liksu/to-inches/commits/13a6502ed46a285cb7a02d2f2fb244fe61aa2234

## Files
- src/to-inches.ts: exists. Exports: `export class Inch` (constructor(mm, options?); static `round`, `gcd`; fields minus, miles, yards, feet, inches, fraction; getters mm, precise, reminders; methods toString, toJSON, parts, items, html); `export function toInches(options: OptionParams): Formatter`; `export function toInches(mm: number, options?): Inch`; `export default toInches`. Imports: `import { Calculated, Formatter, FractionKey, Length, KeyInfo, Options, Sizes, ItemsData, Templates, OptionParams } from './interfaces'` and `import { DefaultOptions, InputMultiplayer, Order, RawDividers } from './constants'`. Units: input millimetres; outputs miles, yards, feet (mm/304.8), inches (mm/25.4), fractional inches. Metres and pixels not used. Does: converts a millimetre length to imperial units and formats it as string, HTML, parts or items. Note: InputMultiplayer lives in ./constants, not read, so the input-unit conversion is unverified.

# Limits of this check
- Every "Units" entry for openPlan3D is an inference from comments and constants, since no file names its unit system explicitly, except where a comment says so (noted).
- Commit dates are from the GitHub commits API at the SHA given.
- Nothing was executed; the parseDimensionInput traces are a read-through.
