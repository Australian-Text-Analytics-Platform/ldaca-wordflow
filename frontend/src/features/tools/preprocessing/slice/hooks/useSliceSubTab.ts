import type { ArrowColumn } from '@/lib/arrow/decodeArrowTable';
import { useState } from 'react';
import type { NodeMetadata } from '@/features/tools/common/nodeInputs/nodeMetadata';
import type { PreviewPagination, PreviewRow } from '../../types';
import {
  useNodePreviewWithRawFallback,
  type OperationPreviewFetcher,
} from '../../hooks/useNodePreviewWithRawFallback';
import {
  buildSlicePayload,
  deriveSliceFormModel,
  type SamplingMode,
  type SliceRequestPayload,
} from './sliceFormModel';

export interface SliceSubTabProps {
  previewEnabled?: boolean;
  projectBase: string | null;
  selectedNodeId: string | null;
  selectedNode: NodeMetadata | null;
  sliceNode: (nodeId: string, request: SliceRequestPayload) => Promise<{ table_name: string }>;
  slicePreview: OperationPreviewFetcher<SliceRequestPayload>;
  isLoading: {
    operations: boolean;
  };
  onAlert: (message: string) => void;
}

interface SliceHistory {
  nodeId?: string;
  nodeName: string;
  mode: SamplingMode;
  offset?: number;
  length?: number;
  sampleSize?: number;
  randomSeed?: number;
}

interface ScopedInlineError {
  signature: string;
  message: string;
}

interface ScopedSliceHistory {
  signature: string;
  result: SliceHistory;
}

interface SliceFormControllers {
  mode: SamplingMode;
  setMode: (value: SamplingMode) => void;
  offsetInput: string;
  setOffsetInput: (value: string) => void;
  lengthInput: string;
  setLengthInput: (value: string) => void;
  onLengthBlur: () => void;
  sampleSizeInput: string;
  setSampleSizeInput: (value: string) => void;
  sampleSizeHint: string | null;
  randomSeedInput: string;
  setRandomSeedInput: (value: string) => void;
  noRandomSeed: boolean;
  setNoRandomSeed: (value: boolean) => void;
  newNodeName: string;
  setNewNodeName: (value: string) => void;
  newNodeNamePlaceholder: string;
}

interface SliceFormValues {
  mode: SamplingMode;
  offsetInput: string;
  lengthInput: string;
  sampleSizeInput: string;
  randomSeedInput: string;
  noRandomSeed: boolean;
  newNodeName: string;
}

interface SlicePreviewConfig {
  columns: string[];
  schema?: ArrowColumn[];
  data: PreviewRow[];
  pagination: PreviewPagination | null;
  loading: boolean;
  error: string | null;
  ready: boolean;
  readyMessage: string;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export interface UseSliceSubTabResult {
  form: SliceFormControllers;
  summaries: {
    range: string;
    lastResult: string;
  };
  inlineError: string | null;
  hasSelection: boolean;
  isBusy: boolean;
  applyDisabled: boolean;
  applyDisabledReason: string | undefined;
  applySlice: () => Promise<void>;
  preview: SlicePreviewConfig;
  showActivityTag: boolean;
}

const PREVIEW_DEBOUNCE_MS = 400;
const DEFAULT_RANDOM_SEED = '0';
const DEFAULT_SLICE_FORM_VALUES: SliceFormValues = {
  mode: 'slice',
  offsetInput: '0',
  lengthInput: '',
  sampleSizeInput: '',
  randomSeedInput: DEFAULT_RANDOM_SEED,
  noRandomSeed: false,
  newNodeName: '',
};

/**
 * Owns Sample Rows tab state. `SliceSubTabContent` consumes this hook for form
 * controllers, preview fallback, validation messages, and apply behavior.
 * Used by `SliceSubTab` to own slice draft, preview, and apply state.
 * Flow: derive active node and schema, manage slice/sample inputs, request preview fallback
 * data, build request payloads, and apply the generated node.
 */
export const useSliceSubTab = (props: SliceSubTabProps): UseSliceSubTabResult => {
  const { projectBase, selectedNodeId, selectedNode, sliceNode, slicePreview, isLoading, onAlert } =
    props;

  const [formValues, setFormValues] = useState<SliceFormValues>(() => ({
    ...DEFAULT_SLICE_FORM_VALUES,
  }));
  const {
    mode,
    offsetInput,
    lengthInput,
    sampleSizeInput,
    randomSeedInput,
    noRandomSeed,
    newNodeName,
  } = formValues;
  const [inlineErrorState, setInlineErrorState] = useState<ScopedInlineError | null>(null);
  const isSlicing = isLoading.operations;
  const [lastResultState, setLastResultState] = useState<ScopedSliceHistory | null>(null);

  /**
   * Updates the local Sample Rows form without pulling in a form library for
   * simple string/boolean fields.
   * Called by: useSliceSubTab field controllers and blur handlers because the
   * hook owns the form state consumed by preview and apply payloads.
   */
  const setFormField = <Field extends keyof SliceFormValues>(
    field: Field,
    value: SliceFormValues[Field],
  ) => {
    setFormValues((current) =>
      Object.is(current[field], value) ? current : { ...current, [field]: value },
    );
  };

  /**
   * Adapts the segmented mode control to the local form state used by slice consumers.
   * Returned as `form.setMode` for `SliceSubTab`.
   */
  const setMode = (value: SamplingMode) => {
    setFormField('mode', value);
  };
  /**
   * Updates the zero-based offset input for preview and apply payload construction.
   * Returned as `form.setOffsetInput` for `SliceSubTab`.
   */
  const setOffsetInput = (value: string) => {
    setFormField('offsetInput', value);
  };
  /**
   * Updates the row-count input consumed by range validation and preview payloads.
   * Returned as `form.setLengthInput` for `SliceSubTab`.
   */
  const setLengthInput = (value: string) => {
    setFormField('lengthInput', value);
  };
  /**
   * Updates the sample-size input used by random sampling validation.
   * Returned as `form.setSampleSizeInput` for `SliceSubTab`.
   */
  const setSampleSizeInput = (value: string) => {
    setFormField('sampleSizeInput', value);
  };
  /**
   * Updates the optional random seed field passed to sampling requests.
   * Returned as `form.setRandomSeedInput` for `SliceSubTab`.
   */
  const setRandomSeedInput = (value: string) => {
    setFormField('randomSeedInput', value);
  };
  /**
   * Toggles seed omission so random samples can remain intentionally unseeded.
   * Returned as `form.setNoRandomSeed` for `SliceSubTab`.
   */
  const setNoRandomSeed = (value: boolean) => {
    setFormField('noRandomSeed', value);
  };
  /**
   * Updates the optional node name consumed when adding the sampled node.
   * Returned as `form.setNewNodeName` for `SliceSubTab`.
   */
  const setNewNodeName = (value: string) => {
    setFormField('newNodeName', value);
  };

  const activeNode = selectedNode;

  const selectedNodeLabel = (() => {
    if (!selectedNodeId) return '';
    return activeNode?.name ?? selectedNodeId;
  })();

  const sliceModel = deriveSliceFormModel({
    selectedNodeId,
    selectedNodeLabel,
    nodeRowCount: null,
    mode,
    offsetInput,
    lengthInput,
    sampleSizeInput,
    randomSeedInput,
    noRandomSeed,
  });
  const {
    offsetNumber,
    offsetValid,
    lengthNumber,
    lengthValid,
    lengthValue,
    sampleSizeValid,
    sampleSizeValue,
    sampleSizeHint,
    randomSeedValid,
    randomSeedValue,
    hasSelection,
    isFullShuffle,
    formSignature,
    resultSignature,
    autoNodeName,
    rangeSummary,
    previewReady,
    previewReadyMessage,
    operationPayload,
    applyDisabled,
    applyDisabledReason,
  } = sliceModel;
  const inlineError =
    inlineErrorState?.signature === formSignature ? inlineErrorState.message : null;
  const lastResult = lastResultState?.signature === resultSignature ? lastResultState.result : null;
  /**
   * Scopes inline errors to the current form values so stale errors disappear.
   * Called by blur validation and `applySlice` failure paths.
   */
  const setCurrentInlineError = (message: string | null) => {
    setInlineErrorState(message ? { signature: formSignature, message } : null);
  };

  const lastResultSummary = (() => {
    if (!lastResult) {
      return 'Adjust parameters and add to project to create a sampled data block.';
    }
    if (lastResult.mode === 'random_sample') {
      const sizeLabel =
        lastResult.sampleSize !== undefined && lastResult.sampleSize < 1
          ? `fraction ${String(lastResult.sampleSize)}`
          : `n=${String(lastResult.sampleSize)}`;
      if (lastResult.randomSeed === undefined) {
        return `Last random sample "${lastResult.nodeName}" (${sizeLabel}).`;
      }
      return `Last random sample "${lastResult.nodeName}" (${sizeLabel}, seed ${String(lastResult.randomSeed)}).`;
    }
    const lastOffset = lastResult.offset ?? 0;
    if (lastResult.length === undefined) {
      return `Last slice “${lastResult.nodeName}” (offset ${String(lastOffset)} → end).`;
    }
    if (lastResult.length === 0) {
      return `Last slice “${lastResult.nodeName}” (offset ${String(lastOffset)}, zero rows).`;
    }
    const endRow = lastOffset + lastResult.length - 1;
    return `Last slice “${lastResult.nodeName}” (rows ${String(lastOffset)}–${String(endRow)}).`;
  })();

  const {
    data: previewData,
    columns: previewColumns,
    schema: previewSchema,
    pagination: previewPagination,
    loading: previewLoading,
    error: previewError,
    page: previewPage,
    pageSize: previewPageSize,
    setPage: setPreviewPage,
    setPageSize: setPreviewPageSize,
  } = useNodePreviewWithRawFallback<SliceRequestPayload>({
    projectBase,
    nodeId: selectedNodeId,
    operationPayload,
    operationFetch: slicePreview,
    operation: 'slice',
    enabled: previewReady && props.previewEnabled !== false,
    debounceMs: PREVIEW_DEBOUNCE_MS,
  });

  const currentPreviewPage = previewPagination?.page ?? previewPage;

  /**
   * Clamps slice length after editing so preview/apply receives a valid range.
   * Returned as `form.onLengthBlur` for the length input.
   */
  const handleLengthBlur = () => {
    if (lengthInput.trim().length === 0) return;
    if (lengthNumber === null || !Number.isInteger(lengthNumber)) return;
    if (lengthNumber < 1) {
      setFormField('lengthInput', '1');
    }
  };

  /**
   * Validates and applies the current slice/sample as a new project node.
   * Returned to `SliceSubTab` as `applySlice` for the Apply button.
   * Steps: build the payload, call the slice operation, refresh schema, update applied
   * snapshot state, and surface success/failure through alerts.
   */
  const applySlice = async () => {
    if (!selectedNodeId) {
      setCurrentInlineError('Select a data block to sample.');
      return;
    }
    if (mode === 'slice') {
      if (!offsetValid) {
        setCurrentInlineError('Offset must be a non-negative integer.');
        return;
      }
      if (!lengthValid) {
        setCurrentInlineError('Length is required – enter a non-negative integer.');
        return;
      }
    } else {
      if (!sampleSizeValid) {
        setCurrentInlineError('Enter a fraction (0–1) or an integer row count (≥ 1).');
        return;
      }
      if (!randomSeedValid) {
        setCurrentInlineError('Random seed must be a non-negative integer.');
        return;
      }
    }

    const payload = buildSlicePayload({
      mode,
      offset: offsetNumber,
      lengthValue,
      sampleSizeValue,
      randomSeedValue,
      isFullShuffle,
    });
    const requestedName = newNodeName.trim() || autoNodeName;
    if (requestedName) {
      payload.name = requestedName;
    }

    setCurrentInlineError(null);
    try {
      const response = await sliceNode(selectedNodeId, payload);
      const responseName =
        response.table_name.trim() ||
        requestedName ||
        `${selectedNodeLabel || selectedNodeId}_${mode === 'slice' ? 'sliced' : isFullShuffle ? 'shuffled' : 'sampled'}`;
      const resultNodeId = response.table_name;
      setLastResultState({
        signature: resultSignature,
        result: {
          nodeId: resultNodeId,
          nodeName: responseName,
          mode,
          offset: mode === 'slice' ? offsetNumber : undefined,
          length: mode === 'slice' ? lengthValue : undefined,
          sampleSize: mode === 'random_sample' ? sampleSizeValue : undefined,
          randomSeed: mode === 'random_sample' ? randomSeedValue : undefined,
        },
      });
    } catch (error) {
      const operationLabel = mode === 'slice' ? 'Slice' : 'Random sample';
      const message = error instanceof Error ? error.message : `${operationLabel} operation failed`;
      onAlert(`${operationLabel} failed: ${message}`);
    }
  };

  return {
    form: {
      mode,
      setMode,
      offsetInput,
      setOffsetInput,
      lengthInput,
      setLengthInput,
      onLengthBlur: handleLengthBlur,
      sampleSizeInput,
      setSampleSizeInput,
      sampleSizeHint,
      randomSeedInput,
      setRandomSeedInput,
      noRandomSeed,
      setNoRandomSeed,
      newNodeName,
      setNewNodeName,
      newNodeNamePlaceholder: autoNodeName,
    },
    summaries: {
      range: rangeSummary,
      lastResult: lastResultSummary,
    },
    inlineError,
    hasSelection,
    isBusy: isSlicing,
    applyDisabled,
    applyDisabledReason,
    applySlice,
    preview: {
      columns: previewColumns,
      schema: previewSchema,
      data: previewData,
      pagination: previewPagination,
      loading: previewLoading,
      error: previewError,
      ready: previewReady,
      readyMessage: previewReadyMessage,
      page: currentPreviewPage,
      pageSize: previewPageSize,
      onPageChange: setPreviewPage,
      onPageSizeChange: setPreviewPageSize,
    },
    showActivityTag: isSlicing,
  };
};
