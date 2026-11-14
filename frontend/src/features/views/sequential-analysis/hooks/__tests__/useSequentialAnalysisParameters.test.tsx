import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  basicSequentialParameters,
  deriveSequentialParameterValues,
  readSequentialServerParams,
  useSequentialAnalysisParameters,
} from '../useSequentialAnalysisParameters';

describe('sequential analysis parameter helpers', () => {
  it('derives numeric request values from editable input strings', () => {
    const values = deriveSequentialParameterValues(
      {
        frequency: 'daily',
        groupByColumns: ['speaker', '', 'region'],
        numericOriginInput: ' 1900 ',
        numericIntervalInput: '10',
        customIntervalValueInput: '30',
        customIntervalUnit: 'minutes',
        referenceNodeId: '',
        referenceTextColumn: 'text',
        referenceTokenizerModel: 'native:plain_words_en',
      },
      'numeric',
    );

    expect(values.numericOriginValue).toBe(1900);
    expect(values.numericIntervalValue).toBe(10);
    expect(values.currentSequentialParams).toEqual({
      frequency: 'daily',
      group_by_columns: ['region', 'speaker'],
      column_type: 'numeric',
      numeric_origin: 1900,
      numeric_interval: 10,
      custom_interval_value: null,
      custom_interval_unit: null,
      // No reference: its column and tokeniser are not sent.
      reference_node_id: null,
      reference_text_column: null,
      reference_tokenizer_model: null,
    });
  });

  it('sends the reference with its text column and tokeniser', () => {
    const values = deriveSequentialParameterValues(
      {
        frequency: 'yearly',
        groupByColumns: ['term'],
        numericOriginInput: '',
        numericIntervalInput: '1',
        customIntervalValueInput: '1',
        customIntervalUnit: 'minutes',
        referenceNodeId: 'corpus',
        referenceTextColumn: 'text',
        referenceTokenizerModel: ' native:plain_words_en ',
      },
      'datetime',
    );
    expect(values.currentSequentialParams).toMatchObject({
      reference_node_id: 'corpus',
      reference_text_column: 'text',
      reference_tokenizer_model: 'native:plain_words_en',
    });
    const rowsOnly = deriveSequentialParameterValues(
      {
        frequency: 'yearly',
        groupByColumns: [],
        numericOriginInput: '',
        numericIntervalInput: '1',
        customIntervalValueInput: '1',
        customIntervalUnit: 'minutes',
        referenceNodeId: 'corpus',
        referenceTextColumn: '',
        referenceTokenizerModel: 'native:plain_words_en',
      },
      'datetime',
    );
    expect(rowsOnly.currentSequentialParams).toMatchObject({
      reference_node_id: 'corpus',
      reference_text_column: null,
      reference_tokenizer_model: null,
    });
  });

  it('sends no reference in Basic, whatever the hidden draft holds, and keeps the rest', () => {
    const draft = {
      frequency: 'yearly' as const,
      groupByColumns: ['term'],
      numericOriginInput: '',
      numericIntervalInput: '1',
      customIntervalValueInput: '1',
      customIntervalUnit: 'minutes' as const,
      referenceNodeId: 'corpus',
      referenceTextColumn: 'text',
      referenceTokenizerModel: 'native:plain_words_en',
    };
    const basic = basicSequentialParameters(draft);
    expect(basic).toEqual({
      ...draft,
      referenceNodeId: '',
      referenceTextColumn: '',
      referenceTokenizerModel: '',
    });
    expect(deriveSequentialParameterValues(basic, 'datetime').currentSequentialParams).toEqual({
      ...deriveSequentialParameterValues(draft, 'datetime').currentSequentialParams,
      reference_node_id: null,
      reference_text_column: null,
      reference_tokenizer_model: null,
    });
    // The draft itself is untouched, so Advanced brings the reference back.
    expect(draft.referenceNodeId).toBe('corpus');
  });

  it('derives custom datetime interval values only for custom datetime runs', () => {
    const values = deriveSequentialParameterValues(
      {
        frequency: 'custom',
        groupByColumns: [],
        numericOriginInput: '',
        numericIntervalInput: '1',
        customIntervalValueInput: '15',
        customIntervalUnit: 'minutes',
        referenceNodeId: '',
        referenceTextColumn: '',
        referenceTokenizerModel: '',
      },
      'datetime',
    );

    expect(values.isCustomDatetime).toBe(true);
    expect(values.customIntervalValue).toBe(15);
    expect(values.customIntervalUnitValue).toBe('minutes');
    expect(values.currentSequentialParams.custom_interval_value).toBe(15);
  });

  it('normalizes stored server request params for rerun comparison', () => {
    expect(
      readSequentialServerParams({
        frequency: 'custom',
        group_by_columns: ['speaker', ''],
        column_type: 'datetime',
        custom_interval_value: 2,
        custom_interval_unit: 'hours',
      }),
    ).toEqual({
      frequency: 'custom',
      group_by_columns: ['speaker'],
      column_type: 'datetime',
      numeric_origin: null,
      numeric_interval: null,
      custom_interval_value: 2,
      custom_interval_unit: 'hours',
      reference_node_id: null,
      reference_text_column: null,
      reference_tokenizer_model: null,
    });
  });
});

describe('useSequentialAnalysisParameters', () => {
  it('caps group-by slots at three and updates slots immutably', () => {
    const { result } = renderHook(() => useSequentialAnalysisParameters());

    act(() => {
      result.current.addGroupByColumn();
      result.current.addGroupByColumn();
      result.current.addGroupByColumn();
      result.current.addGroupByColumn();
      result.current.changeGroupByColumn(1, 'speaker');
    });

    expect(result.current.groupByColumns).toEqual(['', 'speaker', '']);

    act(() => {
      result.current.removeGroupByColumn(0);
    });

    expect(result.current.groupByColumns).toEqual(['speaker', '']);
  });

  it('restores numeric request parameters into editable form state', () => {
    const { result } = renderHook(() => useSequentialAnalysisParameters());
    let hydrated: ReturnType<typeof result.current.applyHydratedRequest> | undefined;

    act(() => {
      hydrated = result.current.applyHydratedRequest({
        node_id: 'node-1',
        time_column: 'year',
        column_type: 'numeric',
        numeric_origin: 1800,
        numeric_interval: 25,
        group_by_columns: ['region'],
        frequency: 'monthly',
      });
    });

    expect(result.current.timeColumn).toBe('year');
    expect(result.current.groupByColumns).toEqual(['region']);
    expect(result.current.numericOriginInput).toBe('1800');
    expect(result.current.numericIntervalInput).toBe('25');
    expect(hydrated?.nodeId).toBe('node-1');
    expect(hydrated?.hydratedParams).toMatchObject({
      timeColumn: 'year',
      columnType: 'numeric',
      numericOrigin: 1800,
      numericInterval: 25,
      referenceNodeId: null,
    });
  });

  it('restores the reference Data Block, text column and tokeniser', () => {
    const { result } = renderHook(() => useSequentialAnalysisParameters());

    act(() => {
      result.current.applyHydratedRequest({
        node_id: 'matches',
        time_column: 'year',
        reference_node_id: 'corpus',
        reference_text_column: 'text',
        reference_tokenizer_model: 'native:plain_words_en',
      });
    });

    expect(result.current.referenceNodeId).toBe('corpus');
    expect(result.current.referenceTextColumn).toBe('text');
    expect(result.current.referenceTokenizerModel).toBe('native:plain_words_en');

    // A new text column means a new tokeniser; none means rows only.
    act(() => {
      result.current.setReferenceTextColumn('body');
    });
    expect(result.current.referenceTokenizerModel).toBe('');
    act(() => {
      result.current.setReference('');
    });
    expect(result.current.referenceNodeId).toBe('');
  });

  it('hydrates selection from the canonical node_id request field', () => {
    const { result } = renderHook(() => useSequentialAnalysisParameters());
    let hydrated: ReturnType<typeof result.current.applyHydratedRequest> | undefined;

    act(() => {
      hydrated = result.current.applyHydratedRequest({
        node_id: 'current-node',
        time_column: 'year',
      });
    });

    expect(hydrated?.nodeId).toBe('current-node');
  });
});
