// EZD-234 Build (11 rule 7): the Fixtures part of the layer, the utilities-to-move card after appliances are moved,
// loaded through the Fixtures lazy module on first use and showing nothing until the code is there (a failed load
// is tried again the next time it is drawn). EZD-1985 (Q-0809 (a)): the Fixtures choice panel docks in the inspector
// place (ProjectEditor), no longer over the plan.
import { lazyPart } from '../../shared/lazy-part';
import { fixturesModule } from '../fixtures-module';
import type { LayerPart, LayerPartProps } from './types';

const LazyUtilitiesToMove = lazyPart(fixturesModule, 'UtilitiesToMove');

function UtilitiesPart({ ui, controller }: LayerPartProps) {
  if (ui.utilities === null) return null;
  return <LazyUtilitiesToMove moved={ui.utilities} onClose={controller.dismissUtilities} />;
}

export const part: LayerPart = { id: 'fixtures', order: 40, Layer: UtilitiesPart };
