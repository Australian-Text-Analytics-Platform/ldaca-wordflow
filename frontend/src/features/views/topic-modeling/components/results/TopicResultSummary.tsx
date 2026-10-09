import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface TopicResultSummaryProps {
  /** Documents per Data Block the run read (after Sampling). */
  corpusSizes: number[];
  segmentCount: number;
  /** Per Data Block, documents with no real Topic; null for runs before 0.7.12. */
  ungroupedDocuments: number[] | null | undefined;
  clusterCount: number;
  defaultClusterCount: number;
  /** Segments Topic sampling clustered; null when every segment was. */
  clusteredSegments: number | null | undefined;
  /** The run's Sampling per Data Block (null or 1 for all documents). */
  sampleFractions: (number | null)[] | null | undefined;
  nodeNames: string[];
}

const count = (value: number) => value.toLocaleString();
const percent = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : 0);

/** "16,513 (63%) in a topic · 9,650 (37%) Ungrouped", the two shares adding to 100. */
function split(total: number, ungrouped: number): string {
  const ungroupedShare = percent(ungrouped, total);
  return `${count(total - ungrouped)} (${String(100 - ungroupedShare)}%) in a topic · ${count(ungrouped)} (${String(ungroupedShare)}%) Ungrouped`;
}

/**
 * One line under the results title (Chao, issue 362): documents, segments,
 * Topics, and the in-topic and Ungrouped split, so a large Ungrouped share is
 * seen at once. A run on two Data Blocks gives each one's figures on hover.
 */
export function TopicResultSummary({
  corpusSizes,
  segmentCount,
  ungroupedDocuments,
  clusterCount,
  defaultClusterCount,
  clusteredSegments,
  sampleFractions,
  nodeNames,
}: TopicResultSummaryProps) {
  const documents = corpusSizes.reduce((sum, size) => sum + size, 0);
  const sampled = (sampleFractions ?? []).filter(
    (fraction): fraction is number => fraction !== null && fraction < 1,
  );
  const sampleNote =
    sampled.length === 0
      ? ''
      : corpusSizes.length === 1 && sampled[0] !== undefined
        ? ` (${String(Math.round(sampled[0] * 100))}% sample)`
        : ' (sampled)';
  const topics =
    clusterCount === defaultClusterCount
      ? `${count(clusterCount)} ${clusterCount === 1 ? 'topic' : 'topics'}`
      : `${count(clusterCount)} topics (merged from ${count(defaultClusterCount)})`;
  const parts = [
    `${count(documents)} documents${sampleNote}`,
    `${count(segmentCount)} segments`,
    topics,
  ];
  if (clusteredSegments)
    parts.push(`topics found from ${count(clusteredSegments)} sampled segments`);
  const ungrouped = ungroupedDocuments
    ? ungroupedDocuments.reduce((sum, size) => sum + size, 0)
    : null;
  if (ungrouped !== null) parts.push(split(documents, ungrouped));

  const line = (
    <p data-testid="topic-result-summary" className="text-label-secondary text-description">
      {parts.join(' · ')}
      {ungrouped === null ? ' · Run again to see Ungrouped documents' : null}
    </p>
  );
  if (corpusSizes.length < 2 || !ungroupedDocuments) return line;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="w-fit">{line}</div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {corpusSizes.map((size, index) => (
          <div key={nodeNames[index] ?? index}>
            {nodeNames[index] ?? `Data Block ${String(index + 1)}`}: {count(size)} documents,{' '}
            {split(size, ungroupedDocuments[index] ?? 0)}
          </div>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}
