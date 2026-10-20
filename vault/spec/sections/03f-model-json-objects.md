# Data model: objects inside model_json
<!-- Moved word for word from vault/spec/sections/03-data-model.md lines 104-116 (Q-0218). Check: node --test scripts/spec/split.test.mjs -->

**Objects inside model\_json**

Every object has: `id`, `type`, `geometry`, `status` (existing / demo / new), `level`, `attributes`. Types:

- Walls (thickness, layers, height, top edge cut to ceiling, bearing flag), openings (door, window: size, swing, rough opening, sill height, impact rating), rooms (name, floor finish, ceiling type, ceiling heights by point or pitch).
- Ceiling objects: beams (faux or structural look, W × H, length, spacing or count, direction, follow slope or level at height, finish, end detail), soffits, trays, coffers, crown, ACT grid (2×2/2×4, direction, start point), access panels, attic hatch.
- Cabinets as individual boxes: code, width, depth, height, type, face layout, hinge side, finished ends, catalog item. Also fillers (scribe allowance), end and decorative panels, appliance panels, toe kick, light rail, crown, valance, corner treatments, open shelves.
- Countertop pieces, seams, cutouts (sink, cooktop).
- Fixtures and appliances with utility points (electric V/A, gas, water, drain). Custom tile showers (Round 3): curb (height, width), niche (size, height, count), bench, glass (fixed panel, door, swing), pan slope, drain type (center or linear) and location. Grab-bar blocking: wall objects with height, length and location that print on the plan, elevations and field pack (Round 3).
- Electrical: receptacles (GFCI/AFCI, height, circuit), switches (3-way, dimmer), lights (type tag), fans, detectors, low voltage (data, TV, doorbell, speakers, cameras, Wi-Fi APs), circuits, homeruns, switch legs, panel.
- HVAC: supply diffusers, returns, exhaust fans.
- Existing-condition pins: damage/moisture (photo), protect, lead flag, plumbing, gas, water heater. Also existing HVAC supply and return registers, smoke/CO detectors, electrical panel and devices, attic access, soffits and chases, and per room the floor level, flooring and transitions (Rounds 1 and 2).
- Annotation: dimensions, text, keynotes, callouts, section/elevation/detail markers, revision clouds, saved groups.
