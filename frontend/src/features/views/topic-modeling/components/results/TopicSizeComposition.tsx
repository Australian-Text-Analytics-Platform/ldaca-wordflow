import {
  topicSizeChips,
  type TopicCorpusPresentation,
  type TopicSizeChipsInput,
} from './topicSizeChips';

export type { TopicCorpusPresentation };

/** Renders corpus counts with the same persisted colours used by graph bubbles. */
export function TopicSizeComposition(props: TopicSizeChipsInput) {
  const model = topicSizeChips(props);
  if (!model) return null;
  if (model.kind === 'groups') {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        {model.chips.map((chip, index) => (
          <span
            key={`${chip.title ?? ''}:${String(index)}`}
            style={{ background: chip.color, color: chip.textColor }}
            className="rounded-sm px-1.5 py-0.5 text-badge font-medium tabular-nums"
            title={chip.title}
            aria-label={chip.title}
          >
            {chip.text}
          </span>
        ))}
        <span className="text-badge text-description">= {model.total}</span>
      </span>
    );
  }
  return (
    <span
      className={
        model.chips.length === 1
          ? 'inline-flex items-center gap-1'
          : 'inline-flex flex-wrap items-center gap-1'
      }
    >
      {model.chips.map((chip, index) => (
        <span key={String(index)} className="contents">
          {index > 0 ? <span className="text-badge text-description">+</span> : null}
          <span
            style={{ background: chip.color, color: chip.textColor }}
            className="rounded-sm px-1.5 py-0.5 text-badge font-medium tabular-nums"
            title={chip.title}
            aria-label={chip.title}
          >
            {chip.text}
          </span>
        </span>
      ))}
      <span className="text-badge text-description">= {model.total}</span>
    </span>
  );
}
