import { browser } from '@wdio/globals';
import { it } from 'mocha';
import { baseUrl } from './fixtures';
import {
  frequencyRecoveryScenario,
  frequencyInitialTabScenario,
  frequencyStopwordsScenario,
  frequencyComparisonScenario,
  frequencyContinuousListScenario,
  frequencyLocalLanguageScenario,
  frequencyPersistenceScenario,
} from '../e2e-native/scenarios/frequency';

it('Frequency opens with one automatic tab and reuses it after navigation and reload', async () => {
  await browser.url('/');
  await frequencyInitialTabScenario(baseUrl);
});

it('Frequency saves exact results, keeps artifacts private and retains the request after a failed rerun', async () => {
  await browser.url('/');
  await frequencyPersistenceScenario(baseUrl, 'browser_frequency');
});

it('Frequency scrolls through complete ranked lists with stable bars and bounded rendering', async () => {
  await browser.url('/');
  await frequencyContinuousListScenario(baseUrl, 'browser_ranked');
});

it('Frequency compares Reference and Study corpora and keeps named tabs independent', async () => {
  await browser.url('/');
  await frequencyComparisonScenario(baseUrl, 'browser_comparison');
});

it('Frequency recommends a tokenizer using the real bundled MediaPipe model without a task', async () => {
  await browser.url('/');
  await frequencyLocalLanguageScenario(baseUrl, 'browser_language');
});

it('browser Frequency uses reusable stopword Data Blocks with atomic edits and live filtering', async () => {
  await browser.url('/');
  await frequencyStopwordsScenario(baseUrl, 'browser_stopwords');
});

it('Frequency recovers broken saved results through Retry and Rerun', async () => {
  await browser.url('/');
  await frequencyRecoveryScenario(baseUrl, 'browser_recovery');
});
