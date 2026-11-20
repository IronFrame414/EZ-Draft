# Calculations and rules: Manual J load calculation
<!-- Added 2026-11-20 for Q-0778. Filled in from a cited source before EZD-740 to EZD-742 build (CLAUDE.md rule 2). -->

**Decided (Q-0778)**

- EZ Draft runs the residential heating and cooling load calculation by ACCA Manual J, 8th edition, the method FBC-EC R403.7.1 names for equipment sizing (catalog EN-037, M-023, M-072).
- Inputs come from the model: conditioned rooms and their areas and heights, the envelope (walls, ceilings or roofs, floors, doors), windows with their size, U-factor, SHGC, shading and the direction they face (the project needs a north direction), infiltration, duct location, occupants and internal gains, and the outdoor and indoor design conditions for Palm Beach County.
- Outputs: room-by-room and whole-house heating load and sensible and latent cooling loads. They fill the project's stored Manual J load, which the EZD-732 capacity check reads (total capacity at least the load and at most 1.15 times it; latent capacity at least the latent load; EN-037 to EN-039).
- The report (design conditions, inputs, room loads, totals, the selected equipment and the sizing check) prints on the mechanical sheets after the layout sheets (Q-0763, EZD-742).

**To be filled in from a cited source before the tickets build**

- The exact input list and how each input is entered (EZD-740).
- The calculation steps and the table values they use, and the Palm Beach County design conditions (EZD-741).
- One worked example house with every input and every expected room and whole-house load, and the rounding (AC-EZD-741-1).
