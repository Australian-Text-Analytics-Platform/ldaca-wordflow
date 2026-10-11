/**
 * Help topics the desktop Help menu's search field lists (Chao, 2026-10-12).
 * Each registry entry becomes one result, titled with its section and page so
 * that searching a tool's name finds its sections too.
 */
import type { DocLinkKind, RegistryShape } from '@/tutorials/bundledRegistry';

/** Page titles, as each help file's own heading reads. */
const PAGE_TITLES: Record<string, string> = {
  'tutorials/annotation.md': 'Annotation',
  'tutorials/concordance.md': 'Concordance',
  'tutorials/data-loader.md': 'Data Loader',
  'tutorials/export.md': 'Export',
  'tutorials/index.md': 'Wordflow Help',
  'tutorials/preprocessing.md': 'Data Builder',
  'tutorials/quotation.md': 'Quotation Extraction',
  'tutorials/sequential-analysis.md': 'Trends',
  'tutorials/token-frequency.md': 'Frequency',
  'tutorials/topic-modeling.md': 'Topic Modelling',
  'tutorials/ui.md': 'Using Wordflow',
  'references/general.md': 'References',
};

export interface HelpMenuTopic {
  /** `kind:key`, how the menu names the topic back to the window. */
  id: string;
  title: string;
}

const KINDS: readonly DocLinkKind[] = ['tutorial', 'info', 'reference'];

/** One topic per registry entry, titled "Section (Page)". */
export function helpMenuTopics(registry: RegistryShape): HelpMenuTopic[] {
  return KINDS.flatMap((kind) =>
    Object.entries(registry[kind]).map(([key, target]) => {
      const page = PAGE_TITLES[target.file];
      const label = target.label ?? page ?? key;
      return {
        id: `${kind}:${key}`,
        title: page && page !== label ? `${label} (${page})` : label,
      };
    }),
  );
}

/** Splits a topic id back into its kind and key. */
export function parseHelpMenuTopic(id: string): { kind: DocLinkKind; key: string } | null {
  const separator = id.indexOf(':');
  const kind = id.slice(0, separator) as DocLinkKind;
  if (separator < 1 || !KINDS.includes(kind)) return null;
  return { kind, key: id.slice(separator + 1) };
}
