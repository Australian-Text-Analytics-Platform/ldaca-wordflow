import { browser } from '@wdio/globals';
import { it } from 'mocha';
import {
  frequencyRecoveryScenario,
  frequencyInitialTabScenario,
  frequencyStopwordsScenario,
  frequencyComparisonScenario,
  frequencyContinuousListScenario,
  frequencyLocalLanguageScenario,
  frequencyPersistenceScenario,
} from './scenarios/frequency';

async function backendUrl() {
  return (
    await browser.tauri.execute(
      ({ core }) => core.invoke('get_backend_status') as Promise<{ url: string }>,
    )
  ).url;
}

it('native Frequency opens with one automatic tab and reuses it after navigation and reload', async () => {
  await frequencyInitialTabScenario(await backendUrl());
});

it('native Frequency saves exact results and preserves requests across reload and failed reruns', async () => {
  await frequencyPersistenceScenario(await backendUrl(), 'native_frequency');
});

it('native Frequency scrolls through complete ranked lists with stable bars and bounded rendering', async () => {
  await frequencyContinuousListScenario(await backendUrl(), 'native_ranked');
});

it('native Frequency compares corpora and keeps independent saved tabs in light and dark themes', async () => {
  await frequencyComparisonScenario(await backendUrl(), 'native_comparison');
});

it('native Frequency loads its actual offline language model inside the WebView', async () => {
  await frequencyLocalLanguageScenario(await backendUrl(), 'native_language');
});

it('native Frequency uses reusable stopword Data Blocks with atomic edits and live filtering', async () => {
  await frequencyStopwordsScenario(await backendUrl(), 'native_stopwords');
});

it('native Frequency recovers broken saved results through Retry and Rerun', async () => {
  await frequencyRecoveryScenario(await backendUrl(), 'native_recovery');
});
