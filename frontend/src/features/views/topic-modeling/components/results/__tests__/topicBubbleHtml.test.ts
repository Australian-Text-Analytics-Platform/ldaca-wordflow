import { describe, expect, it } from 'vitest';

import type { TopicModelingTopic } from '@/api';
import { matchChecklistOption } from '@/features/views/common/checklistSearch';
import { buildTopicBubbleHtmlDocument, buildTopicBubblePayload } from '../topicBubbleHtmlExport';
import { runTopicBubbleHtml } from '../topicBubbleHtmlRuntime';

const standalone = <T>(fn: (...args: never[]) => unknown): T =>
  new Function(`return (${fn.toString()});`)() as T;

const topic = (id: number, words: [string, number][], size: number[]) =>
  ({
    id,
    representative_words: words.map(([word, occurrence_count]) => ({ word, occurrence_count })),
    size,
    total_size: size.reduce((sum, value) => sum + value, 0),
  }) as unknown as TopicModelingTopic;

const topics = [
  topic(
    0,
    [
      ['climate', 100],
      ['policy', 25],
      ['tax', 4],
    ],
    [10, 5],
  ),
  topic(
    1,
    [
      ['housing', 9],
      ['rent', 1],
    ],
    [3, 7],
  ),
];

const exportSvg = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '400');
  svg.setAttribute('height', '300');
  svg.setAttribute('style', 'position: absolute; width: 0px; height: 0px;');
  for (const id of [0, 1]) {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('data-topic-id', String(id));
    group.append(document.createElementNS('http://www.w3.org/2000/svg', 'circle'));
    svg.append(group);
  }
  return svg;
};

describe('topic bubble interactive HTML (issue 279)', () => {
  it('embeds functions that run without the app', () => {
    const match = standalone<typeof matchChecklistOption>(matchChecklistOption);
    expect(match('climate, policy', 'POL')).toBe(true);
    expect(match('climate, policy', 'clim*')).toBe(true);
    expect(match('housing, rent', 'clim*')).toBe(false);
    expect(match('climate, policy', 'c?imate*')).toBe(true);
    expect(standalone(runTopicBubbleHtml)).toBeTypeOf('function');
  });

  it('writes the bubble picture, header and filter into one document', () => {
    const payload = buildTopicBubblePayload(topics, ['Senate', 'House'], 'clim*', 400, 300);
    expect(payload.topics[1]?.sizes).toEqual([
      { label: 'Senate', value: 3 },
      { label: 'House', value: 7 },
    ]);
    const html = buildTopicBubbleHtmlDocument(exportSvg(), payload, {
      title: 'Topic Modelling: <Senate>',
      header: [{ label: 'Number of topics', value: '2' }],
      legend: [{ label: 'Labor', color: '#d33' }],
      background: '#fff',
      foreground: '#000',
      generatedAt: 'now',
    });
    expect(html).toContain('<title>Topic Modelling: &lt;Senate&gt;</title>');
    expect(html).toContain('data-topic-id="1"');
    expect(html).not.toContain('width: 0px');
    expect(html).toContain('Labor');
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });

  it('filters with wildcards, fades the rest, shows sized words, and pans', () => {
    document.body.innerHTML =
      '<input id="filter"><span id="filter-status"></span><button id="reset"></button><div id="chart"></div><div id="card" hidden></div>';
    document.querySelector('#chart')?.append(exportSvg());
    const run = standalone<typeof runTopicBubbleHtml>(runTopicBubbleHtml);
    run(
      buildTopicBubblePayload(topics, ['Senate', 'House'], 'clim*', 400, 300),
      standalone(matchChecklistOption),
    );

    const group = (id: number) => document.querySelector(`[data-topic-id="${String(id)}"]`);
    expect(group(0)?.getAttribute('opacity')).toBeNull();
    expect(group(1)?.getAttribute('opacity')).toBe('0.18');
    expect(document.querySelector('#filter-status')?.textContent).toBe('1 of 2 topics match');

    const input = document.querySelector<HTMLInputElement>('#filter');
    if (input) {
      input.value = 'rent';
      input.dispatchEvent(new Event('input'));
    }
    expect(group(0)?.getAttribute('opacity')).toBe('0.18');
    expect(group(1)?.getAttribute('opacity')).toBeNull();

    group(0)?.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 10 }));
    const card = document.querySelector<HTMLElement>('#card');
    expect(card?.hidden).toBe(false);
    expect(card?.textContent).toContain('Topic 0');
    expect(card?.textContent).toContain('Senate: 10 · House: 5 · Total: 15');
    const sizes = Array.from(card?.querySelectorAll<HTMLElement>('.card-words span') ?? []).map(
      (span) => span.style.fontSize,
    );
    // Font size is linear in the square root of the count: 100 → 22px, 4 → 11px, and 25 sits 3/8 of the way.
    expect(sizes).toEqual(['22px', '15px', '11px']);

    const svg = document.querySelector('#chart svg');
    svg?.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 0, clientY: 0 }));
    expect(svg?.getAttribute('viewBox')).not.toBe('0 0 400 300');
    document.querySelector<HTMLButtonElement>('#reset')?.click();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 400 300');
  });
});
