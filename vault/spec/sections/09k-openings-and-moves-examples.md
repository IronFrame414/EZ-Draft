# Calculations and rules: openings and moves, worked examples

Added by spec-check 5 (Q-0630; phase-auditor, settled rows 2 and 40). Row 40 named 09j; existing section files are not edited (PROCESS section 5 step 5), so the table is here. Statements come from the decisions named; 03g holds the comparison and rounding rule and 09j the walls, rooms and lengths.

**12' × 10' room, explicit 36" door, 144" wall**

| Case | Input | Result |
| --- | --- | --- |
| Offset | 36" | Other side 72" (6' 0") |
| Offset, zero | 0" | Other side 108" (9' 0") |
| Offset, maximum | 108" / 108 1/16" | Other side 0" / refused |
| Offset, rounding | 36.03" / 36.03125" | Stores 36 / stores 36.0625, shows 3' 0", other side 71.9375 shows 6' 0" |
| Exact fit | 36" door on 36" wall, offset 0" / 36 1/16" door | Accepted / refused |
| Tee | Partition centered at 60" (east face 62.25"), offset 24" | Other side 21.75", shows 1' 10" (halfway up) |
| Chip display | 46.75 / 46.6 / 0 | 3' 11" / 3' 10 1/2" / 0" |
| Chip typed | Door chip 24" / 109" | Other side 84" (7' 0") / refused |
| Chip, partition | West face at 57.75" (shows 4' 10"), type 60" | Faces 60" and 64.5"; rooms 50 SF and 66 SF (66.25) |
| Typed move | 1/64" | Rounds to 0", nothing changes |
| Typed move | 6 1/32" east | Moves 6.0625", walls show 12' 6", 125 SF |
| Typed move, smallest | 11' 11 15/16" west | Walls 1/16", area 0.05, shows 0 SF |
| Typed move, maximum | 188' east / 188' 0 1/16" | Walls 200', 2,000 SF / refused |
| Typed length | 12' to 12' 6" | end moves, 125 SF, start-corner offsets unchanged |
| Door resize | 36" to 32" at offset 36" / 109" / 0" | Other side 76" / refused / refused |
| Thickness | 6 1/2" / 3 1/2" / 1" / 1 1/16" | Stud 5 1/2" / 2 1/2" / refused / 1/16" |
| Partition 6 1/2" | Line at 60" | West 56.75" = 47 SF; east 80.75" = 67 SF |
| On a wall | Wall moved 1/64" / 0.0157" / 6" | Not flagged / flagged / flagged |
| Partial overhang | Wall now 132"; door at 100" to 136" / 96" to 132" | Flagged / not flagged |
