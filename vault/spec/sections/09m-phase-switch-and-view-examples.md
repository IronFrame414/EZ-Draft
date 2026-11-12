# Worked examples · phase switch, snap, scale, zoom, dimensions and text (phase 6)

Added by spec-check 6 (Q-0664). The rules are in decisions 03-data-model, 05-screens and 09-calculations-and-rules, rows Q-0664. Lengths are in inches unless marked; display rounding follows 03g and 09j. Room area examples are 09j (Room area rows 1 to 10), linear display at 1/2" is 03g rows 6 to 9 and 09j rows 10 to 12 and 15, and 1/2" snapping is 09j (Snapping rows 7 and 8); they are not repeated here.

## Phase switch and status (EZD-214)

| # | Case | Existing view | Proposed view |
| --- | --- | --- | --- |
| 1 | Wall stored before phase 6 (status Existing, Q-0558) | Shown | Shown |
| 2 | Door drawn while the view is Proposed (status New) | Hidden | Shown |
| 3 | Wall drawn while the view is Existing (status Existing) | Shown | Shown |
| 4 | Existing wall set to Demo | Shown | Hidden |
| 5 | Case 2 with the New eye turned off in Layers | Hidden | Hidden (eye overrides) |
| 6 | Case 4 with the Demo eye turned on while in Proposed | Shown | Shown (eye overrides) |
| 7 | New project, never toggled | View is Existing (phase_default existing) | not applicable |

## Snap increment (EZD-219)

| # | Increment | Raw point along the line | Snapped |
| --- | --- | --- | --- |
| 1 | 1/16" (finest, the storage grain) | 37.3 | 37 5/16" (37.3125) |
| 2 | 1/16" | 0.02 | 0" (zero) |
| 3 | 1/4" | 37.3 | 37 1/4" |
| 4 | 1" | 37.5 (exactly halfway) | 38" (half up) |
| 5 | 12" (coarsest) | 37.3 | 36" |
| 6 | 12" | 42 (exactly halfway) | 48" (half up) |

## Plan display scale and 100% zoom (EZD-219)

Screen pixels per model inch at 100% = 96 × scale ÷ 12, where scale is the paper inches per foot.

| # | Scale | Px per model inch at 100% | A 10' wall at 100% |
| --- | --- | --- | --- |
| 1 | 1/8" = 1'-0" (smallest) | 1 | 120 px |
| 2 | 1/4" = 1'-0" | 2 | 240 px |
| 3 | 1/2" = 1'-0" (default) | 4 | 480 px |
| 4 | 3/16" = 1'-0" | 1.5 | 180 px |
| 5 | 1" = 1'-0" (largest) | 8 | 960 px |

## Typed zoom (EZD-219)

| # | Typed | Result |
| --- | --- | --- |
| 1 | 5 | 5% (minimum) |
| 2 | 1600 | 1600% (maximum) |
| 3 | 4 | 5% (clamped) |
| 4 | 2000 | 1600% (clamped) |
| 5 | 33.3 | 33% (whole percent) |
| 6 | 0 | 5% (clamped) |
| 7 | empty or abc | Refused; the zoom stays as it was |

## Dimensions (EZD-216)

| # | Case | Shown |
| --- | --- | --- |
| 1 | Two points 0" apart (within 1/64", 03g) | Nothing placed |
| 2 | Two points 150" apart | 12' 6" |
| 3 | Two points 2400" apart (200 ft) | 200' 0" |
| 4 | Two points 3000" apart (above 200 ft; no limit for dimensions) | 250' 0" |
| 5 | Angular, walls at 90° | 90° |
| 6 | Angular, 87.5° (halfway) | 88° (half up) |
| 7 | Angular, 0.4° | 0° |
| 8 | Auto room dimension, room 141 1/2" × 168" inside (board S03) | 11' 9 1/2" and 14' 0" |

## Text paper size on screen (EZD-216)

Screen height = paper height × 96 px × zoom (zoom 1 = 100%).

| # | Paper size | Zoom | Screen height |
| --- | --- | --- | --- |
| 1 | 3/32" (note, smallest) | 100% | 9 px |
| 2 | 3/32" | 200% | 18 px |
| 3 | 3/32" | 50% | 4.5 px |
| 4 | 1/8" (label, dimension text) | 100% | 12 px |
| 5 | 1/4" (largest) | 1600% | 384 px |

## Thumbnail (EZD-224)

| # | Case | Result |
| --- | --- | --- |
| 1 | Empty model at a checkpoint | No image; card keeps its empty slot |
| 2 | Small plan; quality 80 gives 12,000 bytes | Stored at quality 80 |
| 3 | Benchmark project (3,000 objects, the maximum); quality 80 gives 52,000 bytes, 70 gives 44,000, 60 gives 38,000 | Stored at quality 60 (first under 40,960 bytes) |
| 4 | 20 autosaves, no checkpoint | No image written |
| 5 | Server checkpoint at lock timeout (no browser canvas) | preview_path null; project.thumbnail_path unchanged |

## Benchmark run (EZD-237)

Budget: a frame every 16 ms on desktop and 33 ms on the iPad; no frame over 100 ms (11 Budgets).

| # | Step results | Within budget |
| --- | --- | --- |
| 1 | Desktop pan: 180 frames, mean 6, p95 12, max 40, over100 0 | Yes |
| 2 | iPad drag: mean 30, p95 33, max 90, over100 0 | Yes (at the iPad budget) |
| 3 | iPad zoom: max 140, over100 1 | No: one frame over 100 ms |
| 4 | Safari, memory not exposed | memory recorded as null; the run is still written |
