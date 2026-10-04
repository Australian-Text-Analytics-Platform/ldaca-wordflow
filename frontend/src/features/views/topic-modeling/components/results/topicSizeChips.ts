import { getReadableTextColor } from '../../topicModelingAdapters';
import { resolveTopicCorpusColor, type TopicColorScheme } from './topicModelingGraph';

export interface TopicCorpusPresentation {
  corpusCount: number;
  panelNodeIds: string[];
  nodeColors: Record<string, string>;
  defaultPalette: string[];
  /** Single-corpus metadata colouring; replaces the corpus chip when set. */
  colorScheme?: TopicColorScheme | null;
}

export interface TopicSizeChipsInput extends TopicCorpusPresentation {
  sizes: number[] | undefined;
  total?: number | null;
  /** Needed to look up metadata colour counts. */
  topicId?: number;
  /** Prints each value's label beside its count (hover cards have the room). */
  showLabels?: boolean;
}

/** One coloured count chip in a topic's size breakdown. */
interface TopicSizeChip {
  text: string;
  color: string;
  textColor: string;
  /** "House: 2100" for a metadata value; absent for a Data Block chip. */
  title?: string;
}

/**
 * The size breakdown the hover card and topic list show: one chip per
 * colour-by value (labelled when `showLabels`), or one per Data Block joined
 * by "+", then "= total". Shared with the bubble chart's HTML download
 * (issue 280) so the file shows the same chips and colours.
 */
export interface TopicSizeChipModel {
  kind: 'groups' | 'corpora';
  chips: TopicSizeChip[];
  total: number | null | undefined;
}

export function topicSizeChips({
  sizes,
  total,
  corpusCount,
  panelNodeIds,
  nodeColors,
  defaultPalette,
  colorScheme = null,
  topicId,
  showLabels = false,
}: TopicSizeChipsInput): TopicSizeChipModel | null {
  if (corpusCount === 0 || !sizes) return null;
  if (colorScheme && corpusCount === 1 && topicId !== undefined) {
    const counts = colorScheme.topicCounts[topicId] ?? [];
    return {
      kind: 'groups',
      total,
      chips: colorScheme.groups.map((group, index) => {
        const count = counts[index] ?? 0;
        return {
          text: showLabels ? `${group.label} ${String(count)}` : String(count),
          color: group.color,
          textColor: getReadableTextColor(group.color),
          title: `${group.label}: ${String(count)}`,
        };
      }),
    };
  }
  const colors = [
    resolveTopicCorpusColor(
      0,
      defaultPalette[0] ?? '#2563eb',
      panelNodeIds,
      nodeColors,
      defaultPalette,
    ),
    resolveTopicCorpusColor(
      1,
      defaultPalette[1] ?? '#dc2626',
      panelNodeIds,
      nodeColors,
      defaultPalette,
    ),
  ];
  return {
    kind: 'corpora',
    total,
    chips: sizes.slice(0, 2).map((size, index) => {
      const color = colors[index] ?? colors[0] ?? '#2563eb';
      return { text: String(size), color, textColor: getReadableTextColor(color) };
    }),
  };
}
