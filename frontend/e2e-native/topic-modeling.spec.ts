import { browser } from '@wdio/globals';
import { it } from 'mocha';
import { topicModelingScenario } from './scenarios/topicModeling';
it('native imported-file joint Topic Modelling preview, full Run and publication',async function(){
  this.timeout(300000);
  const {url}=await browser.tauri.execute(({core})=>core.invoke('get_backend_status') as Promise<{url:string}>);
  await topicModelingScenario(url,'native_topic');
});
