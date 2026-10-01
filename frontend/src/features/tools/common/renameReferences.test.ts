import { reconcileProjectRenames } from '@/features/project/reconcileRenames';
import { expect, it } from 'vite-plus/test';
import { useConcordanceState } from '../concordance/concordanceState';
import { usePlotState } from '../plots/plotState';
import { analysisDraftKey } from './analysisDraftStore';
import { defaultAnalysisRequest } from './analysisRequest';
it('reconciles response and event delivery once without touching query text or another project', () => {
  const draft = {
    ...defaultAnalysisRequest('concordance'),
    inputs: [{ source: { schema: 'data', name: 'Corpus' }, column: 'text', tokenizer: null }],
    search: { ...defaultAnalysisRequest('concordance').search, query: 'text' },
  };
  useConcordanceState.setState({
    drafts: { [analysisDraftKey('one', 'tab')]: draft, [analysisDraftKey('two', 'tab')]: draft },
  });
  const rename = {
    type: 'column' as const,
    source: { schema: 'data', name: 'corpus' },
    before: 'text',
    after: 'content',
  };
  reconcileProjectRenames('one', [rename]);
  reconcileProjectRenames('one', [rename]);
  expect(
    useConcordanceState.getState().drafts[analysisDraftKey('one', 'tab')]?.inputs[0]?.column,
  ).toBe('content');
  expect(useConcordanceState.getState().drafts[analysisDraftKey('one', 'tab')]?.search.query).toBe(
    'text',
  );
  expect(useConcordanceState.getState().drafts[analysisDraftKey('two', 'tab')]).toBe(draft);
});
it('uses ordinary project/tab keys for plots and preserves a newer rename on delayed response', () => {
  const draft = { ...defaultAnalysisRequest('trends'), source: { schema: 'data', name: 'A' } };
  usePlotState.setState({ drafts: { [analysisDraftKey('one', 'plot')]: draft } });
  const first = { type: 'table' as const, source: { schema: 'data', name: 'A' }, name: 'B' };
  reconcileProjectRenames('one', [first]);
  reconcileProjectRenames('one', [
    { type: 'table', source: { schema: 'data', name: 'B' }, name: 'C' },
  ]);
  reconcileProjectRenames('one', [first]);
  expect(usePlotState.getState().drafts[analysisDraftKey('one', 'plot')]?.source.name).toBe('C');
});

it('ignores repeated delivery after a rename cycle using commit identities', () => {
  const draft = { ...defaultAnalysisRequest('trends'), source: { schema: 'data', name: 'A' } };
  usePlotState.setState({ drafts: { [analysisDraftKey('cycle', 'tab')]: draft } });
  const first = { type: 'table' as const, source: draft.source, name: 'B' };
  reconcileProjectRenames('cycle', [first], 'first');
  reconcileProjectRenames(
    'cycle',
    [{ type: 'table', source: { schema: 'data', name: 'B' }, name: 'A' }],
    'second',
  );
  reconcileProjectRenames('cycle', [first], 'first');
  expect(usePlotState.getState().drafts[analysisDraftKey('cycle', 'tab')]?.source.name).toBe('A');
});
