import { browser } from '@wdio/globals';
import { it } from 'mocha';
import { baseUrl } from './fixtures';
import { graphTransferScenario } from '../e2e-native/scenarios/graphTransfer';
it('plain graph drag transfers inputs while the platform modifier moves nodes without double-click zoom',async()=>{
  await browser.url('/'); await graphTransferScenario(baseUrl,'drag_documents');
});
