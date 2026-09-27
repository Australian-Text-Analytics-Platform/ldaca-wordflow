import {
  useFrequencyState,
  defaultFrequencyDisplay,
  type FrequencyDisplay,
} from './frequencyState';
import { stopwordSource, type StopwordSource } from '../common/stopwords/stopwordData';
import * as api from '@/features/project/api';
import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { reportProjectError } from '@/features/project/projectErrors';
import { GREY, VIZ_PALETTE } from '../common/vizPalette';

export interface FrequencySettings {
  stopwordsEnabled: boolean;
  stopwordSource: StopwordSource | null;
  colors: Record<string, string>;
}

type Corpus = api.FrequencyAnalysisResult['result']['payload']['corpora'][number];
export const corpusColorKey = (source: api.DataTarget) => api.targetKey(source);

export function frequencySettings(
  value: api.Tab['settings'],
  corpora: Corpus[] = [],
): FrequencySettings {
  return {
    stopwordsEnabled:
      value.stopwordsEnabled === true && stopwordSource(value.stopwordSource) !== null,
    stopwordSource: stopwordSource(value.stopwordSource),
    colors: Object.fromEntries(
      (Array.isArray(value.colors)
        ? value.colors.flatMap((color, index) =>
            corpora[index] ? [[corpusColorKey(corpora[index].source), color]] : [],
          )
        : Object.entries(value.colors && typeof value.colors === 'object' ? value.colors : {})
      ).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === 'string' && typeof entry[1] === 'string',
      ),
    ),
  };
}

export function corpusColor(
  settings: FrequencySettings,
  source: api.DataTarget,
  fallback: string | null | undefined,
  index: number,
) {
  return (
    settings.colors[corpusColorKey(source)] ??
    fallback ??
    VIZ_PALETTE[index % VIZ_PALETTE.length] ??
    GREY
  );
}

/** Request and result controls share serialized, optimistic presentation updates. */
export function useFrequencySettings(
  base: string,
  tab: api.Tab,
  editing: boolean,
  corpora: Corpus[],
) {
  const cache = useQueryClient();
  const display = useFrequencyState(
    (state) => state.display[JSON.stringify([base, tab.id])] ?? defaultFrequencyDisplay,
  );
  const tabsKey = ['native', base, 'tabs', 'frequency'];
  const saveKey = ['native', base, 'tab-settings', tab.id];
  const pending = useMutationState({
    filters: { mutationKey: saveKey, status: 'pending' },
    select: (mutation) => mutation.state.variables as FrequencySettings,
  }).at(-1);
  const save = useMutation({
    mutationKey: saveKey,
    meta: { reportError: false },
    scope: { id: JSON.stringify(saveKey) },
    mutationFn: (next: FrequencySettings) => api.updateTab(base, tab.id, { settings: { ...next } }),
    onSuccess: (updated) =>
      cache.setQueryData<api.Tab[]>(tabsKey, (tabs) =>
        tabs?.map((item) =>
          item.id === updated.id ? { ...item, settings: updated.settings } : item,
        ),
      ),
  });
  const persist = async (patch: Partial<FrequencySettings>) => {
    if (editing) throw new Error('Finish table editing first.');
    const current =
      cache.getQueryData<api.Tab[]>(tabsKey)?.find((item) => item.id === tab.id) ?? tab;
    // Pending writes supply the optimistic overlay; committed query data remains authoritative.
    const latest = cache
      .getMutationCache()
      .findAll({ mutationKey: saveKey, status: 'pending' })
      .at(-1)?.state.variables as FrequencySettings | undefined;
    const next = { ...(latest ?? frequencySettings(current.settings, corpora)), ...patch };
    await save.mutateAsync(next);
  };
  return {
    settings: { ...(pending ?? frequencySettings(tab.settings, corpora)), ...display },
    persist,
    change: (patch: Partial<FrequencySettings & FrequencyDisplay>) => {
      const { colors, stopwordSource, stopwordsEnabled, ...local } = patch;
      if (Object.keys(local).length) useFrequencyState.getState().setDisplay(base, tab.id, local);
      if (colors !== undefined || stopwordSource !== undefined || stopwordsEnabled !== undefined)
        void persist({
          ...(colors !== undefined ? { colors } : {}),
          ...(stopwordSource !== undefined ? { stopwordSource } : {}),
          ...(stopwordsEnabled !== undefined ? { stopwordsEnabled } : {}),
        }).catch(reportProjectError);
    },
  };
}

export function exactCount(value: string): string {
  return BigInt(value).toLocaleString();
}

/** Normalized frequencies make colour show relative representation, independent of corpus size. */
export function juxtorpusColor(
  reference: number,
  study: number,
  referenceColor: string,
  studyColor: string,
): string {
  const share = reference + study > 0 ? reference / (reference + study) : 0.5;
  const component = (color: string, index: number) =>
    Number.parseInt(color.slice(index, index + 2), 16);
  return `#${[1, 3, 5]
    .map((index) =>
      Math.round(
        component(referenceColor, index) * share + component(studyColor, index) * (1 - share),
      )
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
