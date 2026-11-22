// EZD-1401 (11 Budgets "editor before its lazy parts 500 KB"; 11 rule 7; EZD-215 precedent): the beam spacing pill
// (EZD-505) shows only on the Ceiling or Both view, which the user picks, so it loads when that view is first shown
// and leaves room in the editor's first download for the offline cache and icon.
export { BeamSpacingPill } from '../../editor/tools/BeamSpacingPill';
// EZD-222 (11 Budgets; same precedent): the Beam tool's placement, used only on the Ceiling or Both view, comes with it.
export { placeBeamSet } from '../../editor/tools/beam-edits';
// EZD-510 (11 Budgets): the Beam tool's click receiver comes with it too.
export { beamReceiver } from '../../editor/tools/beam-receiver';
