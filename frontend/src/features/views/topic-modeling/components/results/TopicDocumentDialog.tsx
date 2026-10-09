import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryTopicDocument, type TopicDocument } from '@/api';
import { RowDetailPanel } from '@/features/views/common/components/RowDetailPanel';
import { cn } from '@/lib/utils';
import { codePointOffsets, splitTopicWords } from './topicExamplesModel';
import { topicLabel } from '../../ungrouped';

interface TopicDocumentDialogProps {
  workspaceId: string;
  analysisId: string;
  clusterCount: number;
  /** The Topic whose examples are shown: its segments are highlighted strongest. */
  topicId: number;
  documentIndex: number;
  /** Code-point start of the segment that was opened, shown first. */
  startAt: number;
  /** The Topic's words, shown after the title for reference. */
  topicWords?: readonly string[];
  /** The shown bubble's base colour: the current segment's text, and a tint for the others. */
  topicColor?: string;
  onClose: () => void;
}

const SHOWN_SEGMENT = 'rounded-sm box-decoration-clone';
const OTHER_SEGMENT = 'rounded-sm bg-[color-mix(in_srgb,var(--vscode-foreground)_8%,transparent)]';

/**
 * The full document of a Topic example (issue 353), in the shared Row Details
 * window: every segment is highlighted, the shown Topic's strongest and other
 * Topics pale; Ungrouped text stays plain. Previous/Next segment steps through
 * the shown Topic's segments in this document.
 */
export function TopicDocumentDialog({
  workspaceId,
  analysisId,
  clusterCount,
  topicId,
  documentIndex,
  startAt,
  topicWords = [],
  topicColor = 'var(--vscode-charts-orange)',
  onClose,
}: TopicDocumentDialogProps) {
  // The segment being read has a stronger tint of the Topic's colour than
  // its other segments; coloured text was hard to read in some colours
  // (Chao, 2026-10-08).
  const tint = (percent: number) => ({
    background: `color-mix(in srgb, ${topicColor} ${String(percent)}%, transparent)`,
  });
  const currentStyle = tint(50);
  const otherStyle = tint(20);
  const documentQuery = useQuery({
    queryKey: [
      'workspaces',
      workspaceId,
      'analyses',
      analysisId,
      'topic-document',
      clusterCount,
      documentIndex,
    ],
    staleTime: 0,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      const { data } = await queryTopicDocument({
        path: { workspace_id: workspaceId, analysis_id: analysisId },
        body: { cluster_count: clusterCount, document_index: documentIndex },
        signal,
        throwOnError: true,
      });
      return data;
    },
  });
  const document: TopicDocument | undefined = documentQuery.data;
  const shownSpans = useMemo(
    () => (document?.spans ?? []).filter((span) => span.topic_id === topicId),
    [document, topicId],
  );
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const startIndex = Math.max(
    0,
    shownSpans.findIndex((span) => span.start === startAt),
  );
  const currentIndex = chosenIndex ?? startIndex;
  const current = shownSpans[currentIndex];

  const renderText = (text: string) => {
    if (!document) return text;
    const offsets = codePointOffsets(text);
    const at = (codePoint: number) => offsets[Math.min(codePoint, offsets.length - 1)] ?? 0;
    const pieces: React.ReactNode[] = [];
    let last = 0;
    document.spans.forEach((span, index) => {
      const start = at(span.start);
      const end = at(span.end);
      if (start > last) pieces.push(text.slice(last, start));
      if (span.topic_id < 0) {
        pieces.push(text.slice(start, end));
      } else {
        const isShown = span.topic_id === topicId;
        const isCurrent = isShown && current?.start === span.start;
        pieces.push(
          <span
            key={`${String(index)}-${String(span.start)}`}
            title={topicLabel(span.topic_id)}
            data-row-detail-anchor={isCurrent ? '' : undefined}
            data-current-segment={isCurrent ? '' : undefined}
            data-tint={isCurrent ? 'strong' : isShown ? 'light' : undefined}
            className={isShown ? SHOWN_SEGMENT : OTHER_SEGMENT}
            style={isCurrent ? currentStyle : isShown ? otherStyle : undefined}
          >
            {isShown
              ? // The Topic's words, bold and italic within its segments (Chao, 2026-10-08).
                splitTopicWords(text.slice(start, end), topicWords).map((piece, pieceIndex) =>
                  piece.word ? (
                    <strong key={pieceIndex} className="font-bold italic">
                      {piece.text}
                    </strong>
                  ) : (
                    piece.text
                  ),
                )
              : text.slice(start, end)}
          </span>,
        );
      }
      last = Math.max(last, end);
    });
    if (last < text.length) pieces.push(text.slice(last));
    return <span className="whitespace-pre-wrap">{pieces}</span>;
  };

  return (
    <RowDetailPanel
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      payload={
        document
          ? {
              record: {
                'Data Block': document.node_name,
                Row: document.row_index + 1,
                ...document.metadata,
              },
              fullText: document.text,
            }
          : null
      }
      customization={{
        title: 'Document',
        label: topicLabel(topicId),
        anchorKey: current?.start,
        titleDetail: topicWords.length > 0 ? topicWords.join(', ') : undefined,
        summaryFields: [
          {
            label: 'Highlights',
            value: (
              <span className="flex flex-wrap items-center gap-2">
                <span className={cn(SHOWN_SEGMENT, 'px-1')} style={currentStyle}>
                  Topic {topicId}, this segment
                </span>
                <span className={cn(SHOWN_SEGMENT, 'px-1')} style={otherStyle}>
                  Topic {topicId}, others
                </span>
                <strong className="px-1 font-bold italic">topic words</strong>
                <span className={cn(OTHER_SEGMENT, 'px-1')}>Other topics</span>
                <span className="text-description">Ungrouped: not highlighted</span>
              </span>
            ),
          },
          {
            label: 'Segment',
            value:
              shownSpans.length > 0
                ? `${String(currentIndex + 1)} of ${String(shownSpans.length)} in Topic ${String(topicId)}`
                : '—',
          },
        ],
        renderDocumentText: (text) => renderText(text),
      }}
      navigation={{
        canPrevious: currentIndex > 0,
        canNext: currentIndex < shownSpans.length - 1,
        pendingDirection: null,
        error: documentQuery.isError ? "Couldn't load this document." : null,
        onPrevious: () => {
          setChosenIndex(Math.max(0, currentIndex - 1));
        },
        onNext: () => {
          setChosenIndex(Math.min(shownSpans.length - 1, currentIndex + 1));
        },
        previousLabel: 'Previous segment',
        nextLabel: 'Next segment',
      }}
    />
  );
}
