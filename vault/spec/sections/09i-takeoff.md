# Calculations and rules: takeoff
<!-- Moved word for word from vault/spec/sections/09-calculations-and-rules.md lines 168-191 (Q-0218). Check: node --test scripts/spec/split.test.mjs -->

**Takeoff rules**

Formulas (Round 26, Claude). Every number named here is a Defaults value the owner can change; quantities round up to whole units.

| Quantity | Formula | Defaults used |
| --- | --- | --- |
| Floor tile | Room floor area less the footprint of base cabinets and tubs, x (1 + waste). Boxes = SF / the catalog item's coverage per box | Waste by pattern; 10 SF per box when the item has none |
| Wall tile | Area of each wall face marked for tile to its set height, less openings, x (1 + waste). A tile shower adds its walls, niche faces, bench and curb | Waste by pattern |
| Drywall | (Both faces of new walls + new ceiling area + patches marked on existing walls) x (1 + waste) / sheet area | Sheet 4 x 8 (32 SF); waste 10% |
| Paint | Wall area of rooms with new work, less openings over 20 SF, plus ceilings marked for paint. Gallons = SF x coats / coverage | 2 coats; 350 SF per gallon |
| Base trim | Room perimeter less door widths, x (1 + waste) | Waste 10% |
| Casing | Per opening: 2 x height + width, each side that is trimmed | none |
| Countertops | SF per piece and exposed edge LF, as on screen 04b | none |
| Cabinets, fixtures, devices | Counts by code or size, by type and by device type | none |
| Wire | Per circuit: the path along walls from the panel to the first device and on to each next device, plus the rise from each device height to the ceiling and back down, x (1 + slack) | Slack 15% |
| ACT tile | Count of grid cells in the laid-out grid, full and cut, x (1 + waste) | Waste 5% |
| ACT mains | Room dimension across the mains / main spacing, rounded up, x run length / 12 ft pieces | Mains at 4 ft |
| ACT cross tees | 4 ft tees at 2 ft on center between mains; for a 2 x 2 grid, one 2 ft tee per 4 ft tee | none |
| ACT wall angle | Room perimeter / 12 ft pieces | none |
| Hanger wire | One per 4 ft along each main | 4 ft spacing |

- Quantities: floor and wall tile SF with waste, drywall sheets, paint SF, trim LF, countertop SF and edge LF, cabinet count by size, fixture and device counts, estimated wire runs, ACT tiles, mains, cross tees, wall angle, hanger wire.
- Waste factor default per material, adjusted by pattern (straight, diagonal, herringbone), editable per project.
- Tile: layout preview (pattern, start point, visible cuts on elevations and 3D) and quantities in SF and boxes; no cut list in v1.
