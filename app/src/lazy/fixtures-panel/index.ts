// EZD-234 Build (11 rule 7; EZD-120c B11 editor route budget): the Fixtures panel, the utilities-to-move card,
// placing and the utilities-to-move list, loaded through `fixturesModule` when the Fixtures tool is first turned on
// or a moved fixture's list is first needed.
export { utilitiesToMove } from '../../editor/tools/fixture-geometry';
export {
  DEFAULT_FIXTURE_CHOICE,
  fixtureChoice,
  placeFixture,
  utilityChoice,
} from '../../editor/tools/fixture-tool';
export { FixturesPanel, UtilitiesToMove } from './FixturesPanel';
export type { FixturesPanelProps, UtilitiesToMoveProps } from './FixturesPanel';
// EZD-233 (R26; AC-EZD-233-2): placing a saved group from the Saved section.
export { placeSavedGroup } from '../../editor/edit/arrange-changes';
