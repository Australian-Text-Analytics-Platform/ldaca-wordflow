import { wrapFigureText } from '../common/figureText';
import type { TopicModelingTopic } from './topicPresentation';
import { topicShare } from './TopicSizeComposition';
import { GREY, VIZ_PALETTE, interpolateVizColor } from '../common/vizPalette';
export function topicDownload(
  chart: SVGSVGElement,
  context: {
    scope: string;
    sources: string[];
    model: string;
    count: number;
    topN: number;
    seed: number;
    wordLimit: number;
    search: string;
    lasso: number[];
    documentCounts: number[];
    topics: TopicModelingTopic[];
    selected: Set<number>;
    colors: string[];
    colourGroups?: { label: string; count: number; color: string; missing: boolean }[];
  },
) {
  const clone = chart.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute('style');
  clone.setAttribute('font-family', 'sans-serif');
  const width = Number(chart.getAttribute('width')) || 800;
  const height = Number(chart.getAttribute('height')) || 440;
  const style = getComputedStyle(document.documentElement);
  const foreground = style.getPropertyValue('--vscode-foreground').trim();
  const background = style.getPropertyValue('--vscode-surface-background').trim();
  clone.style.color = foreground;
  const backdrop = document.createElementNS(clone.namespaceURI, 'rect');
  backdrop.setAttribute('width', '100%');
  backdrop.setAttribute('height', '100%');
  backdrop.setAttribute('fill', background);
  clone.prepend(backdrop);
  clone.querySelectorAll('[fill], [stroke]').forEach((element) => {
    for (const attribute of ['fill', 'stroke']) {
      const value = element.getAttribute(attribute);
      if (value === 'currentColor') element.setAttribute(attribute, foreground);
      const token = value?.match(/^var\((--[\w-]+)\)$/)?.[1];
      if (token) element.setAttribute(attribute, style.getPropertyValue(token).trim());
    }
  });
  const lines = [
    { text: context.scope, color: foreground },
    { text: context.model, color: foreground },
    {
      text: `Topics: ${context.count} · Top topics per document: ${context.topN} · Seed: ${context.seed} · Words shown: ${context.wordLimit}`,
      color: foreground,
    },
    {
      text: `Selected topic IDs: ${[...context.selected].join(', ') || 'none'}${context.search ? ` · Search: ${context.search}` : ''} · Lasso filter: ${context.lasso.join(', ') || 'none'}`,
      color: foreground,
    },
    ...context.sources.map((source, index) => ({
      text: `${source} · ${context.documentCounts[index] ?? 0} documents`,
      color: context.colors[index] ?? foreground,
    })),
    ...(context.sources.length === 2
      ? [
          {
            text: 'In between: shared by both, by share of each Data Block',
            color: interpolateVizColor(
              context.colors[0] ?? VIZ_PALETTE[0] ?? GREY,
              context.colors[1] ?? VIZ_PALETTE[1] ?? GREY,
              0.5,
            ),
          },
        ]
      : []),
    ...(context.colourGroups?.map((group) => ({
      text: `${group.label} · ${group.count} documents`,
      color: group.color,
    })) ?? []),
    {
      text: 'Bubble area: Top-N memberships. Counts: dominant documents and share of each population. Metadata opacity: 0.25–0.8 by group-size adjusted concentration.',
      color: foreground,
    },
    ...context.topics.map((topic) => ({
      text: `T${topic.id} · ${context.sources
        .map((source, index) => {
          const count = (topic.dominantCounts ?? topic.size)[index] ?? 0;
          return `${source}: ${count} (${topicShare(count, context.documentCounts[index]) ?? 'share unknown'})`;
        })
        .join(
          ' · ',
        )}${context.colourGroups ? ` · ${context.colourGroups.map((group, index) => `${group.label}: ${topic.colourCounts?.[index] ?? 0} (${topicShare(topic.colourCounts?.[index] ?? 0, group.count) ?? 'share unknown'})`).join(' · ')}` : ''}: ${topic.representative_words
        .slice(0, context.wordLimit)
        .map((word) => word.word)
        .join(', ')}`,
      color: foreground,
    })),
  ];
  const chars = Math.max(20, Math.floor((width - 32) / 7));
  const wrapped = lines.flatMap((line) =>
    wrapFigureText(line.text, chars).map((text) => ({ text, color: line.color })),
  );
  const extra = wrapped.length * 20 + 20;
  clone.setAttribute('height', String(height + extra));
  clone.setAttribute('viewBox', `0 0 ${String(width)} ${String(height + extra)}`);
  wrapped.forEach((line, index) => {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.textContent = line.text;
    text.setAttribute('x', '16');
    text.setAttribute('y', String(height + 20 + index * 20));
    text.setAttribute('fill', line.color ?? foreground);
    text.setAttribute('font-size', '12');
    text.setAttribute('font-family', 'sans-serif');
    clone.append(text);
  });
  const quote = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = [
    [
      'Topic',
      'Selected',
      ...context.sources.map((source) => `${source} dominant documents`),
      ...context.sources.map((source) => `${source} share`),
      ...(context.colourGroups?.flatMap((group) => [
        `${group.label} dominant documents`,
        `${group.label} share`,
      ]) ?? []),
      'Top-N memberships',
      'Representative words',
      'Scope',
    ],
    ...context.topics
      .toSorted(
        (a, b) =>
          Number(context.selected.has(b.id)) - Number(context.selected.has(a.id)) ||
          b.total_size - a.total_size ||
          a.id - b.id,
      )
      .map((topic) => [
        topic.id,
        context.selected.has(topic.id),
        ...(topic.dominantCounts ?? topic.size),
        ...(topic.dominantCounts ?? topic.size).map((count, index) => {
          const denominator = context.documentCounts[index];
          return denominator == null || denominator <= 0 ? '' : count / denominator;
        }),
        ...(context.colourGroups?.flatMap((group, index) => {
          const count = topic.colourCounts?.[index] ?? 0;
          return [count, group.count > 0 ? count / group.count : ''];
        }) ?? []),
        topic.total_size,
        topic.representative_words.map((word) => word.word).join(', '),
        context.scope,
      ]),
  ];
  return { svg: clone, csv: rows.map((row) => row.map(quote).join(',')).join('\r\n') };
}
