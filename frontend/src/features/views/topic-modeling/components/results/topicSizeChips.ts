import { getReadableTextColor } from '../../topicModelingAdapters';
import { resolveTopicCorpusColor, type TopicColorScheme } from './topicModelingGraph';

export interface TopicCorpusPresentation {
  corpusCount: number;
  panelNodeIds: string[];
  nodeColors: Record<string, string>;
  defaultPalette: string[];
  /** Single-corpus metadata colouring; replaces the corpus chip when set. */
  colorScheme?: TopicColorScheme | null;
  /** Documents each Data Block gave the run (after sampling), for shares. */
  corpusSizes?: readonly number[];
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
  /** "House: 296 of 3,729 documents (7.9%)"; a Data Block chip has no label. */
  title?: string;
}

const countFormat = new Intl.NumberFormat('en');

/**
 * A count's share of its own group as the chip shows it (issue 307): whole
 * percentages from 10%, one decimal below, "<0.1%" for the tiniest shares.
 * `precise` always keeps one decimal, for tooltips.
 */
export function formatGroupShare(count: number, groupSize: number, precise = false): string | null {
  if (!(groupSize > 0)) return null;
  const percent = (Math.max(0, count) / groupSize) * 100;
  if (percent === 0) return '0%';
  if (percent < 0.1) return '<0.1%';
  if (!precise && percent >= 10) return `${String(Math.round(percent))}%`;
  return `${percent.toFixed(1).replace(/\.0$/, '')}%`;
}

/** "296 · 7.9%" and its tooltip "296 of 3,729 documents (7.9%)". */
function countWithShare(count: number, groupSize: number | undefined) {
  const share = groupSize === undefined ? null : formatGroupShare(count, groupSize);
  const precise = groupSize === undefined ? null : formatGroupShare(count, groupSize, true);
  return {
    text: share ? `${String(count)} · ${share}` : String(count),
    detail:
      precise && groupSize !== undefined
        ? `${countFormat.format(count)} of ${countFormat.format(groupSize)} documents (${precise})`
        : countFormat.format(count),
  };
}

/**
 * The size breakdown the hover card and topic list show: one chip per
 * colour-by value (labelled when `showLabels`), or one per Data Block joined
 * by "+", then "= total". Each count is followed by its share of its own
 * group (issue 307), the same share the bubble colour is weighed by. Shared with the bubble chart's HTML download
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
  corpusSizes,
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
        const { text, detail } = countWithShare(count, group.documentCount);
        return {
          text: showLabels ? `${group.label} ${text}` : text,
          color: group.color,
          textColor: getReadableTextColor(group.color),
          title: `${group.label}: ${detail}`,
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
      const { text, detail } = countWithShare(size, corpusSizes?.[index]);
      return { text, color, textColor: getReadableTextColor(color), title: detail };
    }),
  };
}
