import { it } from 'mocha';
import { layoutScenario } from './scenarios/layout';
it('native starts at normal pane sizes and restores explicit responsive sizes within bounds', async () => {
  await layoutScenario('native');
});
