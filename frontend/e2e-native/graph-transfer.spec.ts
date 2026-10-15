import { browser } from '@wdio/globals';
import { it } from 'mocha';
import { graphTransferScenario } from './scenarios/graphTransfer';
it('native graph input transfers and platform-modified movement retain independent owners',async()=>{
  const status = await browser.tauri.execute(({core})=>core.invoke('get_backend_status')) as {url:string};
  await graphTransferScenario(status.url,'native_drag_documents');
});
