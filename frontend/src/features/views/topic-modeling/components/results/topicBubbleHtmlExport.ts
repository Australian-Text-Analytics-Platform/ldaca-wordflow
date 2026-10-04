import type { TopicModelingTopic } from '@/api';
import { matchChecklistOption } from '@/features/views/common/checklistSearch';
import { chartPageColours } from '@/lib/chartHtml/chartHtmlExport';
import { escapeHtml, jsonForScript, scriptSafe } from '@/lib/chartHtml/htmlText';
import {
  toChartFilename,
  type ChartExportHeaderItem,
  type ChartExportLegendItem,
} from '@/lib/chartExport';
import { saveBlob } from '@/lib/download';
import { matchTopicWords } from '../../topicModelingAdapters';
import { runTopicBubbleHtml, type TopicBubbleHtmlPayload } from './topicBubbleHtmlRuntime';
import { topicSizeChips, type TopicCorpusPresentation } from './topicSizeChips';

/**
 * Topic Modelling interactive HTML download (issue 279). What you see is what
 * you get: the file shows the same bubble picture as the image download
 * (positions, colours, selection rings, faded topics) and adds a filter box
 * with the app's matching rules, a hover card with each topic's words sized
 * by count and its sizes, and pan and zoom. No chart library is needed.
 */

/** The topics as drawn, with the words the app shows (stop words removed). */
export function buildTopicBubblePayload(
  topics: readonly TopicModelingTopic[],
  presentation: TopicCorpusPresentation,
  nodeNames: readonly string[],
  query: string,
  width: number,
  height: number,
): TopicBubbleHtmlPayload {
  return {
    topics: topics.map((topic) => {
      const sizes = topicSizeChips({
        ...presentation,
        sizes: topic.size,
        total: topic.total_size,
        topicId: topic.id,
        showLabels: true,
      });
      return {
        id: topic.id,
        words: topic.representative_words.map((term) => ({
          word: term.word,
          count: term.occurrence_count,
        })),
        // Data Block chips carry no label in the app; name them on hover here.
        sizes: sizes && {
          ...sizes,
          chips: sizes.chips.map((chip, index) =>
            sizes.kind === 'corpora' && nodeNames[index]
              ? { ...chip, title: `${nodeNames[index]}: ${chip.title ?? chip.text}` }
              : chip,
          ),
        },
      };
    }),
    query,
    width,
    height,
  };
}

/** The bubble picture, visible and sized, from the image download's hidden SVG. */
const visibleSvgMarkup = (svg: SVGSVGElement, width: number, height: number): string => {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.removeAttribute('style');
  copy.removeAttribute('aria-hidden');
  copy.setAttribute('width', String(width));
  copy.setAttribute('height', String(height));
  copy.setAttribute('role', 'img');
  return new XMLSerializer().serializeToString(copy);
};

interface TopicBubbleHtmlDocumentOptions {
  title: string;
  header: ChartExportHeaderItem[];
  legend: ChartExportLegendItem[];
  background: string;
  foreground: string;
  generatedAt: string;
}

/** The complete, self-contained HTML document for the bubble chart. */
export function buildTopicBubbleHtmlDocument(
  svg: SVGSVGElement,
  payload: TopicBubbleHtmlPayload,
  options: TopicBubbleHtmlDocumentOptions,
): string {
  const items = options.header
    .map(
      (item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd></div>`,
    )
    .join('');
  const legend = options.legend
    .map(
      (item) =>
        `<span class="chip"><i style="background:${escapeHtml(item.color)}"></i>${escapeHtml(item.label)}</span>`,
    )
    .join('');
  const run = `(${runTopicBubbleHtml.toString()})(${jsonForScript(payload)}, (words, query) => (${matchTopicWords.toString()})(words, query, (${matchChecklistOption.toString()})));`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.title)}</title>
<style>
body{margin:0;padding:24px;background:${escapeHtml(options.background)};color:${escapeHtml(options.foreground)};font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
h1{font-size:18px;margin:0 0 8px}
dl{display:flex;flex-wrap:wrap;gap:4px 20px;margin:0 0 12px}
dl div{display:flex;gap:6px}
dt{opacity:.7}
dd{margin:0}
.tools{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 12px}
.tools input{font:inherit;padding:4px 8px;min-width:16rem;border:1px solid currentColor;border-radius:4px;background:transparent;color:inherit}
.tools button{font:inherit;padding:4px 10px;border:1px solid currentColor;border-radius:4px;background:transparent;color:inherit;cursor:pointer}
footer a{color:inherit}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin:0 0 12px}
.chip{display:inline-flex;align-items:center;gap:6px}
.chip i{display:inline-block;width:12px;height:12px;border-radius:50%}
#chart{max-width:100%;overflow:hidden;touch-action:none}
#chart svg{display:block;max-width:100%;height:auto;cursor:grab;user-select:none}
#card{position:fixed;z-index:10;max-width:18rem;padding:10px 12px;border-radius:6px;background:#fff;color:#1e293b;box-shadow:0 4px 16px rgba(0,0,0,.18);pointer-events:none}
.card-title{font-weight:600;margin-bottom:4px}
.card-words{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;line-height:1.2}
.card-sizes{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:8px;font-size:12px}
.card-chip{border-radius:3px;padding:1px 6px;font-weight:500;font-variant-numeric:tabular-nums}
.card-sum{opacity:.7}
footer{margin-top:12px;font-size:12px;opacity:.7}
</style>
</head>
<body>
<h1>${escapeHtml(options.title)}</h1>
<dl>${items}</dl>
${legend ? `<div class="legend">${legend}</div>` : ''}
<div class="tools">
<label for="filter">Find topics</label>
<input id="filter" type="search" placeholder="Words, * and ? wildcards" autocomplete="off">
<span id="filter-status" aria-live="polite"></span>
<button id="reset" type="button">Reset view</button>
</div>
<div id="chart">${visibleSvgMarkup(svg, payload.width, payload.height)}</div>
<div id="card" hidden></div>
<footer>Made with <a href="https://australian-text-analytics-platform.github.io/LDaCa_Text_Analytics_Tools/" target="_blank" rel="noopener">Wordflow</a> on ${escapeHtml(options.generatedAt)}. Hover a bubble for its words and sizes, type in Find topics to highlight matching topics, drag to move, and hold Command (Mac) or Control (Windows) while scrolling to zoom.</footer>
<script>${scriptSafe(run)}</script>
</body>
</html>
`;
}

interface DownloadTopicBubbleHtmlOptions {
  nodeName: string;
  title: string;
  header: ChartExportHeaderItem[];
  legend: ChartExportLegendItem[];
  topics: readonly TopicModelingTopic[];
  presentation: TopicCorpusPresentation;
  nodeNames: readonly string[];
  query: string;
}

/**
 * Saves the bubble chart as an interactive HTML file (issue 279).
 * Used by: TopicModelingBubbleChartSection's download dialog.
 */
export async function downloadTopicBubbleHtml(
  svg: SVGSVGElement,
  options: DownloadTopicBubbleHtmlOptions,
): Promise<void> {
  const width = Number(svg.getAttribute('width')) || 960;
  const height = Number(svg.getAttribute('height')) || 600;
  const payload = buildTopicBubblePayload(
    options.topics,
    options.presentation,
    options.nodeNames,
    options.query,
    width,
    height,
  );
  const html = buildTopicBubbleHtmlDocument(svg, payload, {
    title: options.title,
    header: options.header,
    legend: options.legend,
    ...chartPageColours(svg.parentElement ?? document.body),
    generatedAt: new Date().toLocaleString(),
  });
  await saveBlob(
    new Blob([html], { type: 'text/html' }),
    toChartFilename(options.nodeName, 'tm', 'html'),
  );
}
