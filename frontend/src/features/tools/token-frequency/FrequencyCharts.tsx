import 'echarts-wordcloud';

import { init, type EChartsType, use as registerEChartsModules } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import type { WordCloudSeriesOption } from 'echarts/types/dist/echarts';
import { useEffect, useEffectEvent, useRef } from 'react';
import { juxtorpusColor } from './frequencySettings';

registerEChartsModules([SVGRenderer]);

interface FrequencyCloudProps {
  words: { token: string; value: number; count: string; color?: string }[];
  label: string;
  color?: string;
  onTokenContextMenu?: (token: string) => void;
  onTokenClick?: (token: string) => void;
  svgRef?: (element: SVGSVGElement | null) => void;
}

// The extension implements these options but omits them from its declarations.
interface FrequencyCloudSeries extends WordCloudSeriesOption {
  keepAspect: boolean;
  shrinkToFit: boolean;
}

type ProjectionCloudProps = Omit<FrequencyCloudProps, 'words'> & {
  rows: Record<string, unknown>[];
};

// These component boundaries let the compiler retain chart inputs by query data,
// independently of changing callbacks and controls in the results panel.
export function FrequencyCorpusCloud({ rows, ...props }: ProjectionCloudProps) {
  const words = rows.map((row) => ({
    token: String(row.token),
    value: Number(row.frequency),
    count: String(row.frequency),
  }));
  return <FrequencyCloud {...props} words={words} />;
}

export function FrequencyJuxtorpusCloud({
  rows,
  referenceColor,
  studyColor,
  ...props
}: ProjectionCloudProps & { referenceColor: string; studyColor: string }) {
  const words = rows.map((row) => ({
    token: String(row.token),
    value: Number(row.freq_corpus_0) + Number(row.freq_corpus_1),
    count: String(BigInt(String(row.freq_corpus_0)) + BigInt(String(row.freq_corpus_1))),
    color: juxtorpusColor(
      Number(row.percent_corpus_0),
      Number(row.percent_corpus_1),
      referenceColor,
      studyColor,
    ),
  }));
  return <FrequencyCloud {...props} words={words} />;
}

/** SVG clouds share the same rendering for individual corpora and Juxtorpus. */
function FrequencyCloud({
  words,
  label,
  color = 'currentColor',
  onTokenContextMenu,
  onTokenClick,
  svgRef,
}: FrequencyCloudProps) {
  const plotRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const interactive = Boolean(onTokenContextMenu ?? onTokenClick);
  const handleContextMenu = useEffectEvent((event: { name?: string }) => {
    if (event.name) onTokenContextMenu?.(event.name);
  });
  const handleClick = useEffectEvent((event: { name?: string }) => {
    if (event.name) onTokenClick?.(event.name);
  });
  const draw = useEffectEvent(() => {
    const chart = chartRef.current;
    const element = plotRef.current;
    if (!chart || !element?.clientWidth) return;
    const width = element.clientWidth;
    const height = Math.max(180, Math.round(width * 0.6));
    element.style.height = `${String(height)}px`;
    const series: FrequencyCloudSeries = {
      type: 'wordCloud',
      shape: 'circle',
      keepAspect: false,
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      rotationRange: [0, 0],
      rotationStep: 1,
      gridSize: 4,
      drawOutOfBound: false,
      shrinkToFit: true,
      layoutAnimation: false,
      silent: !interactive,
      cursor: interactive ? 'pointer' : 'default',
      textStyle: {
        color,
        fontFamily: getComputedStyle(element).fontFamily,
        fontWeight: 'normal',
      },
      data: words.map((word) => ({
        name: word.token,
        value: word.value,
        textStyle: { color: word.color ?? color },
      })),
    };
    // Clearing stops the extension's pending layout before a resize or new result.
    chart.clear();
    chart.resize({ width, height });
    chart.setOption({ animation: false, series: [series] }, { notMerge: true, lazyUpdate: false });
  });

  useEffect(() => {
    const element = plotRef.current;
    if (!element) return;
    const chart = init(element, undefined, { renderer: 'svg' });
    chartRef.current = chart;
    const receiveContextMenu = (event: { name?: string }) => {
      handleContextMenu(event);
    };
    chart.on('contextmenu', 'series.wordCloud', receiveContextMenu);
    chart.on('click', 'series.wordCloud', (event: { name?: string }) => {
      handleClick(event);
    });
    let frame: number | null = null;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === chart.getWidth() || frame !== null) return;
      // Drawing changes the observed height; defer it beyond this resize delivery.
      frame = requestAnimationFrame(() => {
        frame = null;
        if (element.clientWidth !== chart.getWidth()) draw();
      });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      chart.off('contextmenu', receiveContextMenu);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    draw();
  }, [words, color, interactive]);

  useEffect(() => {
    svgRef?.(plotRef.current?.querySelector('svg') ?? null);
    return () => svgRef?.(null);
  }, [svgRef]);

  return (
    <div
      ref={plotRef}
      role="img"
      aria-label={`${label}: ${words.map((word) => `${word.token}: ${word.count}`).join(', ') || 'No matching tokens'}`}
      className="min-h-45 w-full min-w-0 text-foreground"
      onContextMenu={(event) => {
        if (onTokenContextMenu) event.preventDefault();
      }}
    />
  );
}
