# EZD-1611b fixture: one kitchen, worked by hand

`counts.model.json` is the model; `counts.expected.json` holds the settings and the expected lines, in the same order
as below (JSON takes no comments, so the arithmetic for each line is here). Every number is worked by hand from the
formulas table (09i Takeoff rules) and the rows of vault/build/assumptions/EZD-1611b.md, never from running the code.

Settings: countertop waste 10%, wire slack 15%. 1 SF = 144 sq in, 1 LF = 12 in. SF and LF round up to 0.1; wire
totals round up to whole feet. Count lines (EA) have no waste; their total is their count.

## Model

- Kitchen: inside faces 0..240 x 0..144 (20' x 12'), no ceiling set, so its ceiling is flat at the 96" wall height.
- Walls 4 1/2" thick, centred, 96" high, all Existing: south (-2.25,-2.25)-(242.25,-2.25), east
  (242.25,-2.25)-(242.25,146.25), north, west, joined at their ends. A short Existing wall (120,60)-(120,100) stands in
  the room joined to nothing.
- Cabinet run on the north face, start (0,144), along +x. Base row: B36, B36, SB36, F3 (filler), " b36" (code typed
  lower case with a space), B15 (Existing), B18 (Demo), EP24 end panel; all New unless named. Upper row: W3030, W3030.
- Countertops: A "Back wall" (0,144)-(96,144)-(96,118.5)-(0,118.5), edges wall, exposed, exposed, wall; B "Island"
  (150,40)-(222,40)-(222,76)-(150,76), edges exposed, exposed, seating, exposed; C Existing.
- Fixtures: New sink (90,132), New bar sink (186,58), New dishwasher, New refrigerator, Existing range, Demo toilet
  outside the room.
- Devices: receptacles R1 (132,1) at 16" and R2 (228,1) with no height on circuit "Kitchen counter" (space 1, no stored
  order), a Demo receptacle between them on that circuit; switch S1 (239,72) at 48" and receptacle R3 (122.5,72) at
  16" on circuit "Island" (space 3, stored order S1, R3; model order R3, S1); two New recessed lights; an Existing
  smoke detector; an Existing receptacle on the Existing circuit "Old receptacles"; a New receptacle at (300,50),
  outside every room.
- Panel A (Existing) at (12,1), no height in the model: 60" (assumptions EZD-1611b).

## Kitchen

1. Countertop A: 96 x 25.5 = 2,448 sq in = **17 SF**; x 1.10 = **18.7 SF**.
2. Countertop B: 72 x 36 = 2,592 sq in = **18 SF**; x 1.10 = **19.8 SF**. C is Existing: no line.
3. Edge A: the two exposed edges 25.5 + 96 = 121.5" = 10.125 -> **10.2 LF**.
4. Edge B: all four edges are exposed (seating counts), 2 x (72 + 36) = 216" = **18 LF**.
5. Cabinet B36: B36, B36 and " b36" (trimmed, upper case) = **3**. B15 Existing and B18 Demo are left out; the end
   panel is not a box or filler.
6. Cabinet F3: **1**.
7. Cabinet SB36: **1**.
8. Cabinet W3030: **2**. Codes sort as EZD-409's schedule: B36, F3, SB36, W3030.
9. Fixture sink: **2**. The range is Existing.
10. Fixture refrigerator: **1**.
11. Fixture dishwasher: **1**. Kinds in the fixture list's order: sink, refrigerator, dishwasher.
12. Device recessed light: **2**.
13. Device duplex receptacle: R1, R2, R3 = **3** (the Demo one and the Existing one are left out; the one at
    (300,50) is in no room).
14. Device single switch: **1**. Kinds in the device list's order. The smoke detector is Existing.
15. Wire "Kitchen counter" (the settled example): no stored order, so model order R1, R2 (Demo left out). Every point
    is taken to the south wall line y = -2.25: panel x = 12, R1 x = 132, R2 x = 228. Legs 120 + 96 = 216". Rise:
    panel (96 - 60) = 36; R1 2 x (96 - 16) = 160; R2 has no height, a receptacle reads 16": 160. 216 + 356 = 572" =
    47.67 -> **47.7 LF**; x 1.15 = 54.82 -> **55 LF**.
16. Wire "Island": stored order S1, R3. Panel to S1: S1 is taken to the east wall line x = 242.25 at y = 72; along
    the south wall from x = 12 to the corner, 230.25, then up the east wall from y = -2.25 to 72, 74.25: 304.5" (the
    other way round is 481.5"). S1 to R3: R3 is taken to the short wall, which joins no other, so the straight
    distance (239,72)-(122.5,72) = 116.5". Rise: 36 + 2 x (96 - 48) + 2 x (96 - 16) = 36 + 96 + 160 = 292. 304.5 +
    116.5 + 292 = 713" = 59.42 -> **59.5 LF**; x 1.15 = 68.33 -> **69 LF**. The Existing circuit gives no line.

## Not in a room

17. Device duplex receptacle: the New one at (300,50) = **1**.
