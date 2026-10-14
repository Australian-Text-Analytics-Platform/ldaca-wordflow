import { GREY, VIZ_PALETTE, foregroundForVizColor } from '../common/vizPalette';
import { resolveTopicCorpusColor } from './topicModelingGraph';

export interface TopicCorpusPresentation {
  corpusCount: number;
  panelNodeIds: string[];
  nodeColors: Record<string, string>;
  defaultPalette: string[];
  denominators?: number[];
  labels?: string[];
  groupColors?: string[];
}

export function topicShare(count: number, denominator?: number) {
  if (denominator === undefined || denominator <= 0) return null;
  const percent = (count / denominator) * 100;
  return percent > 0 && percent < 0.1
    ? '<0.1%'
    : `${percent >= 10 ? percent.toFixed(0) : percent.toFixed(1)}%`;
}

export const topicGroupLabel = (label: string) =>
  label === ''
    ? 'Empty text'
    : label.trim() === ''
      ? `Blank text (${JSON.stringify(label)})`
      : label;

/** Dominant-document counts and each group's own population, including samples. */
export function TopicSizeComposition({
  sizes,
  corpusCount,
  panelNodeIds,
  nodeColors,
  defaultPalette,
  denominators,
  labels,
  groupColors,
}: TopicCorpusPresentation & { sizes: number[] | undefined }) {
  if (corpusCount === 0 || !sizes) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {sizes.map((count, index) => {
        const color =
          groupColors?.[index] ??
          resolveTopicCorpusColor(
            index,
            VIZ_PALETTE[index] ?? GREY,
            panelNodeIds,
            nodeColors,
            defaultPalette,
          );
        const denominator = denominators?.[index];
        const share = topicShare(count, denominator);
        const label = labels?.[index] ?? `Data Block ${index + 1}`;
        return (
          <span
            key={index}
            title={`${label}: ${count.toLocaleString()} dominant documents${denominator === undefined ? '' : ` out of ${denominator.toLocaleString()} documents (${denominator > 0 ? String((count / denominator) * 100) : '0'}%)`}`}
            style={{ background: color, color: foregroundForVizColor(color) }}
            className="rounded-sm px-1.5 py-0.5 text-badge font-medium"
          >
            {count.toLocaleString()}
            {share == null ? '' : ` · ${share}`}
          </span>
        );
      })}
    </span>
  );
}
