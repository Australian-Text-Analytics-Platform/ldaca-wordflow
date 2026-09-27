import type { TopicModelingTopic } from './topicPresentation';
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
    context.scope,
    context.model,
    `Topics: ${String(context.count)} · Top topics per document: ${String(context.topN)} · Seed: ${String(context.seed)} · Words shown: ${String(context.wordLimit)}`,
    `Selected topic IDs: ${[...context.selected].join(', ') || 'none'}${context.search ? ` · Search: ${context.search}` : ''} · Lasso filter: ${context.lasso.join(', ') || 'none'}`,
    ...context.sources.map(
      (source, i) =>
        `${source} · ${String(context.documentCounts[i] ?? 0)} documents · ${String(context.topics.reduce((sum, topic) => sum + (topic.size[i] ?? 0), 0))} memberships`,
    ),
  ];
  const sourceEnd = lines.length;
  lines.push(
    ...context.topics.map(
      (topic) =>
        `T${String(topic.id)} · ${String(topic.total_size)} memberships: ${topic.representative_words
          .slice(0, context.wordLimit)
          .map((word) => word.word)
          .join(', ')}`,
    ),
  );
  const chars = Math.max(20, Math.floor((width - 32) / 7));
  const wrapped = lines.flatMap((line, index) =>
    Array.from({ length: Math.max(1, Math.ceil(line.length / chars)) }, (_, part) => ({
      text: line.slice(part * chars, (part + 1) * chars),
      color: index >= 4 && index < sourceEnd ? context.colors[index - 4] : foreground,
    })),
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
    ['Topic', 'Selected', ...context.sources, 'Total', 'Representative words', 'Scope'],
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
        ...topic.size,
        topic.total_size,
        topic.representative_words.map((word) => word.word).join(', '),
        context.scope,
      ]),
  ];
  return { svg: clone, csv: rows.map((row) => row.map(quote).join(',')).join('\r\n') };
}
