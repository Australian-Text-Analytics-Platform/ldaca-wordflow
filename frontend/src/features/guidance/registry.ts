import type { ToolId } from '@/features/tools/toolIds';
export type HintStage = 'setup' | 'action' | 'results' | 'followup';
export interface WorkflowHint {
  id: string;
  version: number;
  stage: HintStage;
  title: string;
  body: string;
}
// Teaching sequence follows the archived guidance, with current tools and actions.
const lessons: Record<Exclude<ToolId, 'annotation'>, [string, string, string, string]> = {
  'data-loader': [
    'Use the files tab for your own files, Samples to try the app, or LDaCA to browse research collections.',
    'Click Import beside a file to add a copy of its data to this project. Importing it again adds another copy. Drop a file onto the graph to upload and import it in one step.',
    'Each imported dataset becomes a Data Block in Explorer and the Project Graph. Select a Data Block to see its rows and columns.',
    'Choose Preprocessing to filter or reshape your data, or choose an analysis tool. Save the project to keep your work.',
  ],
  filter: [
    'Choose how to change your data. Most operations start with Add data block to choose a dataset. Join needs two datasets; Stack combines several.',
    'Review the settings and preview, then click Create Data Block to keep the output separately. Find and SQL have their own apply actions and can change existing data.',
    'Check that the preview contains the rows and columns you expect. Most operations keep your original data unchanged.',
    'Give the new Data Block a useful name before creating it. Then choose it in an analysis or another preprocessing step to continue your work.',
  ],
  'token-frequency': [
    'Add a dataset, or two to compare. Choose the column containing text and a tokenizer—the rule used to split text into words or other units.',
    'Click Run to count the words or other units in your text. When comparing two datasets, choose which one is your study corpus—the main dataset.',
    'See which words occur most often in the table and charts. Filters change what you see without changing the saved counts.',
    'Download the results, or use a term’s context action to see its surrounding text in Concordance.',
  ],
  concordance: [
    'Add one or two datasets and choose their text columns. Enter the word or phrase you want to find.',
    'Click Preview to try the search on one page of matches. Click Run to search the whole dataset and save the results in this project.',
    'Read each match with its left and right context. Search options control case, punctuation and whole-word matching.',
    'Use the result controls to keep matching passages or their full documents as a new Data Block, or download the results.',
  ],
  plots: [
    'Choose a chart type, add a Data Block, then choose the columns it needs. The controls change to match your chosen chart.',
    'Click Run to build the chart from your selected data and settings. Its saved results stay with this analysis tab.',
    'Inspect the chart and adjust its display options. Changes to input settings require a new run.',
    'Download the chart or its data using the result controls.',
  ],
  'topic-modeling': [
    'Add one or two text datasets. Choose how to split topic words, then an embedding model—the model used to group text by meaning.',
    'Click Preview to try topic grouping on a sample. Run uses all rows and saves the results. If you change the data or settings, train again.',
    'Explore each topic’s words and documents. Preview results are temporary; results from Run are saved with the project.',
    'Use the result controls to create Data Blocks from a full run or download the results. To keep a preview’s findings, first click Run to process all rows.',
  ],
  quotation: [
    'Add a Data Block and choose the column containing text. This tool finds English quotations; it downloads its language model the first time you use it.',
    'Click Preview to try quotation detection on one page. Run processes all rows and saves the results.',
    'Review detected quotations and their context. Display and filter controls help inspect the saved output.',
    'Use the result controls to create a Data Block of quotations or their full documents, or download the results.',
  ],
  export: [
    'Choose Data files for use in other apps, or Wordflow project to reopen your work later.',
    'Click Export to download your selection. For data files, choose a format first. For a Wordflow project, review Project contents first.',
    'Check which Data Blocks will be included. If a View relies on data outside your selection, the export stores a copy of its rows as a Table so the file can reopen on its own.',
    'Open the exported .wfpj project file to continue working, or use the downloaded data files in another app. Your original project stays open.',
  ],
};
const titles: Record<ToolId, [string, string, string, string]> = {
  'data-loader': [
    'Choose a data source',
    'Import into your project',
    'Find your Data Blocks',
    'Continue with your data',
  ],
  filter: [
    'Choose an operation and inputs',
    'Apply your transformation',
    'Check the preview',
    'Keep your transformed data',
  ],
  'token-frequency': [
    'Choose text and word splitting',
    'Count words in your text',
    'Explore token frequencies',
    'Download or inspect context',
  ],
  concordance: [
    'Choose text and a search',
    'Preview or run the search',
    'Read matches in context',
    'Keep or download matches',
  ],
  plots: [
    'Choose a plot and its inputs',
    'Build the plot',
    'Inspect the chart',
    'Download your plot',
  ],
  'topic-modeling': [
    'Prepare your topic model',
    'Preview before a full run',
    'Explore topics and documents',
    'Keep full-run outputs',
  ],
  quotation: [
    'Set up quotation detection',
    'Preview or extract quotations',
    'Review detected quotations',
    'Keep or download quotations',
  ],
  annotation: [
    'Choose what to annotate',
    'Start labeling your text',
    'Review and compare labels',
    'Continue with annotated data',
  ],
  export: [
    'Choose what to export',
    'Export your selection',
    'Check what the export includes',
    'Use your exported files',
  ],
};
export function hintsFor(
  tool: ToolId,
  annotationMode: 'manual' | 'ai' = 'manual',
  hasFileLibrary = true,
): WorkflowHint[] {
  const annotationLessons =
    annotationMode === 'ai'
      ? [
          'Choose a Data Block stored as a Table, then its Document column and Annotation column for labels. Choose a Codebook and its Code and Description columns to define the labels the model can use.',
          'Choose a Codebook (label definitions), connection and model. Preview checks one page without saving labels; Run writes labels to the dataset. Manage connections opens Settings → AI.',
          'Compare predicted labels with the text and existing labels. Preview leaves the dataset unchanged; Run writes to the chosen label columns.',
          'Use Compare To to compare label columns, or choose Export to download the labeled data.',
        ]
      : [
          'Choose a Data Block stored as a Table, then its Document column and Annotation column for labels. You can use a Codebook to define your labels.',
          'Click Start to label the rows yourself. Save keeps your edits; Cancel discards them.',
          'Check the labels against the text. During a manual session, Save keeps your edits and Cancel discards them.',
          'Use Compare To to compare label columns, or choose Export to download the labeled data. Save your edits before leaving a manual session.',
        ];
  return (['setup', 'action', 'results', 'followup'] as const).map((stage, index) => ({
    id: `${tool}.${stage}`,
    version: 1,
    stage,
    title:
      tool === 'annotation' && stage === 'action' && annotationMode === 'ai'
        ? 'Preview AI labels'
        : titles[tool][index as 0 | 1 | 2 | 3],
    body:
      tool === 'data-loader' && stage === 'action' && !hasFileLibrary
        ? 'Choose files… or drop files onto Data Loader or the graph. Wordflow imports them immediately. Each import adds a new Data Block; importing a file again adds another copy.'
        : (tool === 'annotation' ? annotationLessons : lessons[tool])[index as 0 | 1 | 2 | 3]!,
  }));
}
export function nextHint(
  tool: ToolId,
  eligible: Set<HintStage>,
  acknowledgments: Record<string, number>,
  paused: boolean,
  enabled: boolean,
  annotationMode?: 'manual' | 'ai',
  hasFileLibrary = true,
) {
  return paused || !enabled
    ? undefined
    : hintsFor(tool, annotationMode, hasFileLibrary).find(
        (hint) => eligible.has(hint.stage) && (acknowledgments[hint.id] ?? 0) < hint.version,
      );
}
