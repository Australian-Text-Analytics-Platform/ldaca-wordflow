import { useMutation, useQuery } from '@tanstack/react-query';
import * as api from '@/features/project/api';
import {
  createStopwordTable,
  readStopwords,
  saveStopwords,
  stopwordQuery,
  writableStopwords,
  type StopwordSource,
} from './stopwordData';

/** Live words use the ordinary data refresh boundary; the host owns its selection. */
export function useStopwords({
  base,
  selected,
  inputs,
  active,
  onSelect,
}: {
  base: string;
  selected: StopwordSource | null;
  inputs: StopwordSource[];
  active: boolean;
  onSelect: (selected: StopwordSource) => Promise<void>;
}) {
  const words = useQuery(stopwordQuery(base, selected, active));
  async function prepare(captured: StopwordSource | null, parents: StopwordSource[]) {
    const next = await writableStopwords(base, captured, parents);
    if (captured === null || !api.sameTarget(next.source, captured.source)) {
      await onSelect(next);
    }
    return next;
  }
  const create = useMutation({
    mutationFn: async () => {
      const next = await createStopwordTable(base, structuredClone(inputs));
      await onSelect(next);
    },
  });
  const edit = useMutation({
    mutationFn: async () => {
      const parents = structuredClone(inputs);
      const target = await prepare(structuredClone(selected), parents);
      return {
        target,
        inputs: parents,
        words: await readStopwords(base, target),
      };
    },
  });
  const add = useMutation({
    mutationFn: async (token: string) => {
      const target = await prepare(structuredClone(selected), structuredClone(inputs));
      await saveStopwords(base, target, [], [token]);
      await onSelect(target);
    },
  });
  return { words, create, edit, add };
}
