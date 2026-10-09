import type { ViewType } from '@/features/views/viewIds';
import type { ContextualHintDefinition, GuidedTourDefinition } from './types';

export const CONTEXTUAL_HINT_IDS = {
  // Shown once, in whichever analysis tool is opened first (issue 359).
  analysisTabs: {
    newTab: 'analysis-tabs.new-tab',
  },
  dataLoader: {
    workspace: 'data-loader.workspace',
    workspaceLoad: 'data-loader.workspace-load',
    activeWorkspace: 'data-loader.active-workspace',
    fileSources: 'data-loader.file-sources',
    addDataBlock: 'data-loader.add-data-block',
    dataBlocks: 'data-loader.data-blocks',
  },
  preprocessing: {
    inputs: 'preprocessing.inputs',
    filter: 'preprocessing.operation.filter',
    sample: 'preprocessing.operation.sample',
    join: 'preprocessing.operation.join',
    stack: 'preprocessing.operation.stack',
    preview: 'preprocessing.preview',
    createOutcome: 'preprocessing.outcome.create',
  },
  tokenFrequency: {
    inputs: 'token-frequency.inputs',
    run: 'token-frequency.run',
    results: 'token-frequency.results',
  },
  concordance: {
    inputs: 'concordance.inputs',
    search: 'concordance.search',
    previewResults: 'concordance.preview-results',
    runAllResults: 'concordance.run-all-results',
    addToWorkspace: 'concordance.add-to-workspace',
  },
  trends: {
    inputs: 'trends.inputs',
    run: 'trends.run',
    results: 'trends.results',
  },
  topicModeling: {
    inputs: 'topic-modeling.inputs',
    run: 'topic-modeling.run',
    results: 'topic-modeling.results',
    addToWorkspace: 'topic-modeling.add-to-workspace',
  },
  quotation: {
    inputs: 'quotation.inputs',
    engine: 'quotation.engine',
    previewResults: 'quotation.preview-results',
    runAllResults: 'quotation.run-all-results',
    addToWorkspace: 'quotation.add-to-workspace',
  },
  annotation: {
    source: 'annotation.source',
    codebook: 'annotation.codebook',
    mode: 'annotation.mode',
    manualStart: 'annotation.manual.start',
    manualResults: 'annotation.manual.results',
    aiSetup: 'annotation.ai.setup',
    aiAdvanced: 'annotation.ai.advanced',
    aiPreviewResults: 'annotation.ai.preview-results',
    aiRunAllResults: 'annotation.ai.run-all-results',
  },
  export: {
    inputs: 'export.inputs',
    format: 'export.format',
    dataBlockSuccess: 'export.data-block-success',
    workspaceSuccess: 'export.workspace-success',
  },
} as const;

const firstEnabled = (selector: string, fallback: string) => () =>
  document.querySelector<HTMLElement>(`${selector}:not(:disabled)`) ??
  document.querySelector<HTMLElement>(fallback);

const resolveAddDataBlockTarget = firstEnabled(
  '[data-guidance="add-data-block"]',
  '[data-guidance="file-library-toolbar"]',
);
const resolveLoadWorkspaceTarget = firstEnabled(
  '[data-guidance="load-workspace"]',
  '[data-guidance="workspace-manager"]',
);
const resolveAnnotationAiSetupTarget = () =>
  document.querySelector<HTMLElement>('[data-guidance="annotation-ai-provider-model"]') ??
  document.querySelector<HTMLElement>('[data-guidance="annotation-ai-settings-trigger"]');

export const contextualHintSequences: Readonly<Record<ViewType, readonly string[]>> = {
  'data-loader': Object.values(CONTEXTUAL_HINT_IDS.dataLoader),
  filter: Object.values(CONTEXTUAL_HINT_IDS.preprocessing),
  'token-frequency': [
    CONTEXTUAL_HINT_IDS.analysisTabs.newTab,
    ...Object.values(CONTEXTUAL_HINT_IDS.tokenFrequency),
  ],
  concordance: [
    CONTEXTUAL_HINT_IDS.analysisTabs.newTab,
    ...Object.values(CONTEXTUAL_HINT_IDS.concordance),
  ],
  analysis: [CONTEXTUAL_HINT_IDS.analysisTabs.newTab, ...Object.values(CONTEXTUAL_HINT_IDS.trends)],
  'topic-modeling': [
    CONTEXTUAL_HINT_IDS.analysisTabs.newTab,
    ...Object.values(CONTEXTUAL_HINT_IDS.topicModeling),
  ],
  quotation: [
    CONTEXTUAL_HINT_IDS.analysisTabs.newTab,
    ...Object.values(CONTEXTUAL_HINT_IDS.quotation),
  ],
  annotation: [
    CONTEXTUAL_HINT_IDS.analysisTabs.newTab,
    ...Object.values(CONTEXTUAL_HINT_IDS.annotation),
  ],
  export: Object.values(CONTEXTUAL_HINT_IDS.export),
};

const hint = (
  id: string,
  target: ContextualHintDefinition['target'],
  title: string,
  content: string,
  version = 1,
): ContextualHintDefinition => ({ id, version, target, placement: 'auto', title, content });

/** Canonical copy, version, target, and placement for every production Contextual Hint. */
export const contextualHintRegistry: readonly ContextualHintDefinition[] = [
  {
    ...hint(
      CONTEXTUAL_HINT_IDS.analysisTabs.newTab,
      '[data-guidance="new-tab"]',
      'Several analyses in one tool',
      'Click + to open another tab, so you can keep several analyses side by side in this tool.',
    ),
    settingsWalk: { label: 'Turn off tabs…', guide: 'multi-tab' },
  },
  hint(
    CONTEXTUAL_HINT_IDS.dataLoader.workspace,
    '[data-guidance="workspace-setup"]',
    'Create a home for your analysis',
    'A Project keeps related Data Blocks, Tabs, and analysis history together. Name a new Project here to begin.',
    2,
  ),
  hint(
    CONTEXTUAL_HINT_IDS.dataLoader.workspaceLoad,
    resolveLoadWorkspaceTarget,
    'Continue existing work',
    'Opening restores the Project’s Data Blocks, Tabs, and analysis history. Choose Open beside the Project you want to continue.',
    2,
  ),
  hint(
    CONTEXTUAL_HINT_IDS.dataLoader.activeWorkspace,
    '[data-guidance="active-workspace"]',
    'Keep this work together',
    'The active Project owns the Data Blocks and Analyses you create next. Use the Project manager when you need to switch.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.dataLoader.fileSources,
    '[data-guidance="file-sources"]',
    'Bring in source files',
    'Upload your own files, import sample data, or import from LDaCA. Choose a source to add files.',
    2,
  ),
  hint(
    CONTEXTUAL_HINT_IDS.dataLoader.addDataBlock,
    resolveAddDataBlockTarget,
    'Make a file analysis-ready',
    'Files stay outside the Project until you add them. Preview a file, then choose Add to make it a Data Block.',
    2,
  ),
  hint(
    CONTEXTUAL_HINT_IDS.dataLoader.dataBlocks,
    '[data-guidance="data-blocks"]',
    'Work from Data Blocks',
    'Data Blocks appear here and in the Project graph. Select one to inspect it, then open a tool to analyse or transform it.',
    2,
  ),

  hint(
    CONTEXTUAL_HINT_IDS.preprocessing.inputs,
    '[data-guidance="preprocessing-inputs"]',
    'Choose the data to prepare',
    'Join and Stack need two or more matching Data Blocks; the other tools need one. Add the Data Blocks to continue.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.preprocessing.filter,
    '[data-guidance="preprocessing-operation-filter"]',
    'Keep only the rows you need',
    'Build column conditions and combine them with AND or OR. Configure the conditions, then choose Preview.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.preprocessing.sample,
    '[data-guidance="preprocessing-operation-sample"]',
    'Test ideas on a smaller Data Block',
    'Choose a contiguous Slice or a reproducible Random sample; Sample always creates a new Data Block. Set the sample, then choose Preview.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.preprocessing.join,
    '[data-guidance="preprocessing-operation-join"]',
    'Bring related columns together',
    'Choose the matching column on each Data Block and the join type. Set the match, then choose Preview to check unmatched rows.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.preprocessing.stack,
    '[data-guidance="preprocessing-operation-stack"]',
    'Combine compatible rows',
    'Stack Data Blocks with the same columns, optionally removing exact duplicates. Fix any column differences, then choose Preview.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.preprocessing.preview,
    '[data-guidance="preprocessing-preview"]',
    'Check the transformation before applying',
    'Preview shows the result without changing the Project. Check the rows and columns, then choose Add to Project.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.preprocessing.createOutcome,
    '[data-guidance="data-blocks"]',
    'Your new Data Block is ready',
    'Add to Project added a new Data Block, linked back to its inputs. Select it in the sidebar or graph to inspect and continue.',
  ),

  hint(
    CONTEXTUAL_HINT_IDS.tokenFrequency.inputs,
    '[data-guidance="token-frequency-inputs"]',
    'Choose the text to count',
    'Add the Data Block or Data Blocks to analyse, then choose each text column and tokeniser model. Complete the source selection to continue.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.tokenFrequency.run,
    '[data-guidance="token-frequency-actions"]',
    'Count consistent tokens',
    'The tokeniser defines what counts as a token, while stop words remove terms you do not want counted. Check the settings, then choose Run.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.tokenFrequency.results,
    '[data-guidance="token-frequency-results"]',
    'Explore what stands out',
    'Cloud gives a visual impression, while List shows exact counts. Adjust the display, then use List when you need precise values.',
  ),

  hint(
    CONTEXTUAL_HINT_IDS.concordance.inputs,
    '[data-guidance="concordance-inputs"]',
    'Choose where to search',
    'Add the Data Block or Data Blocks to search, then choose each text column and tokeniser model. Complete the source selection to continue.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.concordance.search,
    '[data-guidance="concordance-actions"]',
    'Define the match and context',
    'Enter a search term, choose Text or Tokens mode, and set the surrounding context. Choose Preview for a page or Run for the complete search.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.concordance.previewResults,
    '[data-guidance="concordance-preview-results"]',
    'Inspect matches in context',
    'Preview retains the current source-document page and offers Table or Dispersion views. Check the matches, then refine the search or run the complete analysis.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.concordance.runAllResults,
    '[data-guidance="concordance-run-all-results"]',
    'Review the complete search',
    'Run stores an immutable Result for the whole search. Page through matches and documents, then choose the columns you want to keep.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.concordance.addToWorkspace,
    '[data-guidance="concordance-add-to-workspace"]',
    'Keep only what you need',
    'Add to Project creates new Data Blocks from selected Result columns without changing the Result. Name the outputs, then add them to the Project.',
  ),

  hint(
    CONTEXTUAL_HINT_IDS.trends.inputs,
    '[data-guidance="trends-inputs"]',
    'Choose an ordered Data Block',
    'Add one Data Block, then choose a time, number or category column for the horizontal axis.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.trends.run,
    '[data-guidance="trends-actions"]',
    'Shape the trend',
    'Set a Period for dates and times, or a Start and Step for numbers. Add up to three Group By columns, then choose Run.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.trends.results,
    '[data-guidance="trends-results"]',
    'Read change across the sequence',
    'The summary and chart show how documents are distributed across periods and groups. Adjust the chart or axis, select periods to inspect, then download the view you need.',
  ),

  hint(
    CONTEXTUAL_HINT_IDS.topicModeling.inputs,
    '[data-guidance="topic-modeling-inputs"]',
    'Choose text to model',
    'Add the Data Block or Data Blocks to model, then select each text column and sample size. Complete the source selection to continue.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.topicModeling.run,
    '[data-guidance="topic-modeling-actions"]',
    'Control what becomes a topic',
    'Segmentation, segment size, sampling, and the random seed shape the model. Check the settings, then choose Run.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.topicModeling.results,
    '[data-guidance="topic-modeling-results"]',
    'Explore patterns, not labels',
    'The bubbles and representative words describe the topics found; segments that fit no topic are marked No topic. Inspect source documents before naming or interpreting a topic.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.topicModeling.addToWorkspace,
    '[data-guidance="topic-modeling-add-to-workspace"]',
    'Add topic data for reuse',
    'Add to Project creates new Data Blocks from selected topic columns and names without changing the Result. Select what to keep, then add it to the Project.',
  ),

  hint(
    CONTEXTUAL_HINT_IDS.quotation.inputs,
    '[data-guidance="quotation-inputs"]',
    'Choose text with quoted speech',
    'Add one Data Block and select the text column to examine. Complete the source selection to continue.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.quotation.engine,
    '[data-guidance="quotation-actions"]',
    'Find quotations',
    'Choose Preview to find quotations on one page of documents, or Run for the complete extraction. Display context changes only what you review.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.quotation.previewResults,
    '[data-guidance="quotation-preview-results"]',
    'Validate the extracted speech',
    'Preview retains the current source-document page with quotation, speaker, verb, and context columns. Check the rows, then refine the settings or run the complete extraction.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.quotation.runAllResults,
    '[data-guidance="quotation-run-all-results"]',
    'Review every extracted quotation',
    'Run stores an immutable Result for the complete source. Page through documents and matches, then choose the columns you want to keep.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.quotation.addToWorkspace,
    '[data-guidance="quotation-add-to-workspace"]',
    'Keep reviewed quotations',
    'Add to Project creates new Data Blocks from selected Result columns without changing the Result. Name the output, then add it to the Project.',
  ),

  hint(
    CONTEXTUAL_HINT_IDS.annotation.source,
    '[data-guidance="annotation-source"]',
    'Choose text and where labels go',
    'Add one Annotation Data Block, choose its text column, and select or create the annotation column. Complete this source setup before choosing how to label it.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.annotation.codebook,
    '[data-guidance="annotation-codebook"]',
    'Define the allowed codes',
    'Choose or create a Codebook Data Block, then map its code and description columns. Review the code rows before starting annotation.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.annotation.mode,
    '[data-guidance="annotation-mode"]',
    'Choose how labels are produced',
    'Manual lets you label rows directly; AI uses a configured model with the same source and Codebook. Choose the mode that fits this task.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.annotation.manualStart,
    '[data-guidance="annotation-manual-start"]',
    'Start a focused manual review',
    'Start opens an editable table and writes each label directly to the annotation column as a Data Block Edit. Choose Start when the source and Codebook are ready.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.annotation.manualResults,
    '[data-guidance="annotation-manual-results"]',
    'Review and compare labels',
    'Changes save directly to the annotation column, while comparison and correction controls can check another column. Assign or correct the next label in the table.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.annotation.aiSetup,
    resolveAnnotationAiSetupTarget,
    'Configure an AI annotation run',
    'Expand AI settings to choose a provider and model; an Example Data Block is optional. Check the setup, then choose Preview before Run.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.annotation.aiAdvanced,
    '[data-guidance="annotation-ai-provider-model"]',
    'Tune only what the task needs',
    'Prompt and Wordflow processing controls can change cost and output. Each provider panel exposes only the sampling and reasoning controls supported by that provider; keep the defaults unless the task requires a deliberate adjustment.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.annotation.aiPreviewResults,
    '[data-guidance="annotation-ai-preview-results"]',
    'Check predictions before writing',
    'Preview shows predicted labels without writing them to the annotation column. Review differences, then add corrections or adjust the setup.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.annotation.aiRunAllResults,
    '[data-guidance="annotation-ai-run-all-results"]',
    'Review labels written by AI',
    'Run writes labels to the annotation column, and the review table reflects the current Data Block. Check differences and corrections before continuing with the labelled data.',
  ),

  hint(
    CONTEXTUAL_HINT_IDS.export.inputs,
    '[data-guidance="export-inputs"]',
    'Choose Data Blocks to take with you',
    'Add Data Blocks one by one or use Add all. Choose the Data Blocks you need to continue.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.export.format,
    '[data-guidance="export-actions"]',
    'Choose a portable table format',
    'Select the format required by the next tool; multiple Data Blocks are bundled in a ZIP. Choose a format, then export the selection.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.export.dataBlockSuccess,
    '[data-guidance="export-data-blocks"]',
    'Your Data Block export is ready',
    'One Data Block downloads directly, while multiple Data Blocks download as a ZIP in the chosen format. Open the download or pass it to the next tool.',
  ),
  hint(
    CONTEXTUAL_HINT_IDS.export.workspaceSuccess,
    '[data-guidance="export-workspace"]',
    'Your Project archive is ready',
    'The ZIP is a self-contained Project archive that can be imported later. Keep it as a backup, or import it in Data Loader to restore or move the Project.',
  ),
];

/** Guided Tours remain deliberate and replayable; this release defines none. */
export const guidedTourRegistry: readonly GuidedTourDefinition[] = [];
