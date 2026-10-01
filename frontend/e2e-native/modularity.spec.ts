import { browser, $ } from '@wdio/globals';
import { it } from 'mocha';
import { directInputsAndBuilder, explicitSavedRequestReset } from './scenarios/modularity';
async function base() {
  return (await browser.tauri.execute(({ core }) => core.invoke('get_backend_status') as Promise<{ url: string }>)).url;
}
it('native input destinations and one-way builder preserve tool drafts', async () => {
  // The embedded driver synthesizes neither dblclick nor keyboard button
  // activation. Native checks use pointer buttons; Chrome checks both gestures.
  await directInputsAndBuilder(await base(), async () => {
    await $('[data-id="mod_input"] [tabindex="0"]').execute(element => element.focus());
    const add = $('[aria-label="Add Data Block to selection"]');
    await add.waitForDisplayed();
    await add.waitForEnabled();
    await add.click();
  }, 'pointer');
});
it('native Frequency requires explicit reset and preserves saved JSON until Run', async () => {
  await explicitSavedRequestReset(await base());
});
