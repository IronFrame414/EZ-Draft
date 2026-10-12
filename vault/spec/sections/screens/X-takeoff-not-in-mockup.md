### Takeoff (not in mockup)

**Purpose:** Quantities from the model by room and trade, with waste factors, for CSV export and later push to EZ Binder. (not in mockup)

**Entry points:** Takeoff screen in the plan doc screen list; header Export (CSV). Entry control not in any mockup. (not in mockup)

**Permissions:** View: View projects. Unit costs and totals: See company costs. Edit project waste factors: Edit model (defaults set by owner under Defaults). CSV: Export. (not in mockup)

**Layout:** Standard editor shell; left panel group by Room / Trade; main table; inspector with waste factors and line source. (not in mockup; layout proposed, needs design)

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Group by Room / Trade (not in mockup) | Top of table | Regroups lines. | Plan doc §8. |
| Line row (not in mockup) | Table | Shows item, qty, unit, waste, total qty; click highlights source objects on plan. |  |
| Waste factor input per material (not in mockup) | Inspector | Default per material; adjusted by pattern (straight, diagonal, herringbone); editable per project. | Round 7. |
| Tile pattern select (not in mockup) | Inspector | Straight / diagonal / herringbone. | Affects waste. |
| Export CSV (not in mockup) | Header or table | Material list CSV. | Export permission. |
| Push to EZ Binder estimate (not in mockup) | Table | v2 only. | Plan doc scope: v2. |

**Data shown:** (not in mockup) floor and wall tile SF and boxes; drywall sheets; paint SF; LF trim and countertop; countertop area and exposed edge LF (Round 23); cabinet count by size and cabinet schedule (Round 21); fixture and device counts; estimated wire runs; ACT tiles, mains, cross tees, wall angle, hanger wire (Round 16); cost per option as structured data (option, item, qty, unit cost, total), internal only (Round 6).

**States:** (not in mockup) empty model; recomputing after change; stale vs current model version; offline.

**Validation & warnings:** (not in mockup) waste factor required per material; no separate cut list in v1.

**Events emitted:** takeoff.updated (line items by room and trade).

**Decisions:**

1. Takeoff opens from a Takeoff item in the header Export menu and a Takeoff tab in the left panel on the Plan view; layout as above (left: Room / Trade grouping, main: table, inspector: waste factors and line source). Needs a mockup before build. (Claude)
2. Company waste factor defaults are set by the owner under Defaults (Round 24); per-project overrides need Edit model and the edit lock. (Claude)
3. Takeoff recomputes in the browser from the working copy while the Takeoff panel is open; a snapshot is stored with every sent version (Version N or Rev N). (Claude)
4. The CSV includes cost columns only when the exporting user has See company costs; otherwise quantities only. (Claude)
