import { it } from 'mocha';
import { exportScenario } from './scenarios/export';

it('native Export imports real files, inspects definitions and retains local choices across navigation',async function () {
  this.timeout(180000);
  await exportScenario(async () => { /* Native file installation is covered by shell tests and Computer QA. */ });
});
