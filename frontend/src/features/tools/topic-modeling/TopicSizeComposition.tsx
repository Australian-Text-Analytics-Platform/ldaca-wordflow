import { GREY, VIZ_PALETTE, foregroundForVizColor } from '../common/vizPalette';
import { resolveTopicCorpusColor } from './topicModelingGraph';

export interface TopicCorpusPresentation {
  corpusCount: number;
  panelNodeIds: string[];
  nodeColors: Record<string, string>;
  defaultPalette: string[];
}

interface Props extends TopicCorpusPresentation {
  sizes: number[] | undefined;
  total?: number | null;
}

/** Renders corpus counts with the same persisted colours used by graph bubbles. */
export function TopicSizeComposition({
  sizes,
  total,
  corpusCount,
  panelNodeIds,
  nodeColors,
  defaultPalette,
}: Props) {
  if (corpusCount === 0 || !sizes) return null;
  const colorA = resolveTopicCorpusColor(
    0,
    defaultPalette[0] ?? VIZ_PALETTE[0] ?? GREY,
    panelNodeIds,
    nodeColors,
    defaultPalette,
  );
  const colorB = resolveTopicCorpusColor(
    1,
    defaultPalette[1] ?? VIZ_PALETTE[1] ?? GREY,
    panelNodeIds,
    nodeColors,
    defaultPalette,
  );
  if (sizes.length === 1) {
    return (
      <span className="inline-flex items-center gap-1">
        <span
          style={{ background: colorA, color: foregroundForVizColor(colorA) }}
          className="rounded-sm px-1.5 py-0.5 text-badge font-medium"
        >
          {sizes[0]}
        </span>
        <span className="text-badge text-description">= {total}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span
        style={{ background: colorA, color: foregroundForVizColor(colorA) }}
        className="rounded-sm px-1.5 py-0.5 text-badge font-medium"
      >
        {sizes[0]}
      </span>
      <span className="text-badge text-description">+</span>
      <span
        style={{ background: colorB, color: foregroundForVizColor(colorB) }}
        className="rounded-sm px-1.5 py-0.5 text-badge font-medium"
      >
        {sizes[1]}
      </span>
      <span className="text-badge text-description">= {total}</span>
    </span>
  );
}
