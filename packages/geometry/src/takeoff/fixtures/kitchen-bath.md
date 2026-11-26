# EZD-1611a fixture: kitchen and bath, worked by hand

`kitchen-bath.model.json` is the model; `kitchen-bath.expected.json` holds the settings and the expected lines, in
the same order as below (JSON takes no comments, so the arithmetic for each line is here). Every number is worked by
hand from the formulas table (09i Takeoff rules) and the settled rows of vault/build/assumptions/EZD-1611a.md, never
from running the code. The worked lines that file names are marked (settled).

Settings: tile waste 10%, straight +0%, herringbone +5%, drywall 10%, paint 5%, trim 10%; 10 SF per box; 4 x 8 sheet
(32 SF); 2 coats; 350 SF per gallon. 1 SF = 144 sq in, 1 LF = 12 in. SF and LF round up to 0.1; boxes, sheets and
gallons up to whole units. Gallons = SF x coats x (1 + paint waste) / coverage = total SF / 175.

## Model

- Walls 4 1/2" thick (drywall, stud, drywall), centred, 96" high; rooms have no ceiling set, so paint runs to the
  wall height.
- Kitchen: inside faces 0..144 x 0..120 (12' x 10' = 120 SF, perimeter 44'). Its east side is a **New** 10' wall
  (wall ...12, line 120" long, drywall both faces). Existing: a 3' x 7' door (36 x 84, 21 SF) on the west wall and a
  3' x 4' window (36 x 48, 12 SF) on the north wall. Two **New** base boxes on the north wall, 36" wide x 24" deep
  (2 x 6 SF = 12 SF).
- Bath: inside faces 148.5..208.5 x 0..96 (5' x 8' = 40 SF), west side the New wall's other face. **New** 36 x 80
  door (20 SF) on its south wall into the hall. **New** vanity box 30 x 21 (630 sq in). **New** tile: herringbone
  floor, straight wainscot on the south wall to 48". **New** tile shower 60 x 36 at the north end: walls on sides
  1, 2, 3 (36 + 60 + 36 = 132"), glass and curb on the front, one 12 x 24 niche, 4 x 4 curb, no bench.
- Hall: inside faces 148.5..208.5 x -40.5..-4.5 (5' x 3' = 15 SF), all existing; it has new work because its
  outline runs along the wall with the New bath door.

## Kitchen

1. Floor tile (settled): 120 SF - 12 SF = **108 SF**; 10 + 0 = 10% -> **118.8 SF**; 118.8 / 10 = 11.88 -> **12 boxes**.
2. Drywall (settled): the New 10' x 8' wall, both faces = **160 SF** (the kitchen is the first room along it);
   x 1.10 = **176 SF**; 176 / 32 = 5.5 -> **6 sheets**.
3. Paint walls (settled): 44' x 8' = 352 SF less the 3' x 7' door (21 SF, over 20) = **331 SF**; the window (12 SF)
   stays. x 1.05 = 347.55 -> **347.6 SF**; 331 x 2 x 1.05 / 350 = 1.99 -> **2 gal**.
4. Paint ceiling: **120 SF**; x 1.05 = **126 SF**; 126 / 175 = 0.72 -> **1 gal**.
5. Base trim (settled): 44 - 3 = **41 LF**; x 1.10 = **45.1 LF**.
   No casing: the door and window are existing.

## Bath

6. Floor tile: 5,760 - 630 = 5,130 sq in = 35.625 -> **35.7 SF**; 10 + 5 = 15% -> 40.97 -> **41 SF**;
   4.097 -> **5 boxes**.
7. Wall tile, wainscot: 60 x 48 = 2,880 less the door's part below 48" (36 x 48 = 1,728) = 1,152 sq in = **8 SF**;
   x 1.10 = **8.8 SF**; 0.88 -> **1 box**.
8. Wall tile, shower: walls 132 x 96 = 12,672; niche returns 2 x (12 + 24) x 3.5 = 252; curb 60 x (4 + 2 x 4) = 720;
   13,644 sq in = 94.75 -> **94.8 SF**; x 1.10 = 104.225 -> **104.3 SF**; 10.42 -> **11 boxes**.
   No drywall line: the New wall is counted in the kitchen and the bath is not New.
9. Paint walls: (60 + 96 + 60 + 96) x 96 = 29,952 sq in = **208 SF** (the 20 SF door is not over 20); x 1.05 =
   **218.4 SF**; 1.25 -> **2 gal**.
10. Paint ceiling: **40 SF**; **42 SF**; 0.24 -> **1 gal**.
11. Base trim: 312 - 36 = 276" = **23 LF**; x 1.10 = **25.3 LF**.
12. Casing (settled): the New 36 x 80 door has rooms on both faces, 2 x (2 x 80 + 36) = 392" = 32.67 -> **32.7 LF**,
    in the bath (the first room along it).

## Hall

13. Paint walls: (60 + 36 + 60 + 36) x 96 = 18,432 sq in = **128 SF**; x 1.05 = **134.4 SF**; 0.77 -> **1 gal**.
14. Paint ceiling: **15 SF**; x 1.05 = 15.75 -> **15.8 SF**; 0.09 -> **1 gal**.
15. Base trim: 192 - 36 = 156" = **13 LF**; x 1.10 = **14.3 LF**.
