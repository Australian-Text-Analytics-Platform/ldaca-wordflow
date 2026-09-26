const NON_FOCUSED_OPACITY = 0.45;

type EChartsSeriesStatesConfig =
  | { chartType: 'bar' }
  | {
      chartType: 'line';
      selectedIndices?: ReadonlySet<number>;
      /** Enlarge selected points (Trends, issue 190); otherwise same size. */
      emphasizeSelection?: boolean;
    }
  | {
      chartType: 'area';
      areaOpacity: number;
      selectedIndices?: ReadonlySet<number>;
      emphasizeSelection?: boolean;
    };

const SYMBOL_SIZE = 6;
const SELECTED_SYMBOL_SIZE = 11;
const UNSELECTED_SYMBOL_SIZE = 4;

/** Shared native ECharts focus and point-selection states for analysis charts. */

export const buildEChartsSeriesStates = (config: EChartsSeriesStatesConfig) => {
  if (config.chartType === 'bar') {
    return {
      emphasis: { focus: 'series' as const },
      blur: { itemStyle: { opacity: NON_FOCUSED_OPACITY } },
    };
  }

  return {
    emphasis: { focus: 'series' as const, scale: false },
    blur: {
      itemStyle: { opacity: NON_FOCUSED_OPACITY },
      lineStyle: { opacity: NON_FOCUSED_OPACITY },
      ...(config.chartType === 'area'
        ? { areaStyle: { opacity: config.areaOpacity * NON_FOCUSED_OPACITY } }
        : {}),
    },
    // Selected points are large solid dots with a white ring; the rest are
    // small hollow circles, so the selection stands out (issue 190).
    ...(config.selectedIndices?.size
      ? {
          showSymbol: true,
          symbol: (_value: unknown, params: { dataIndex?: number }) =>
            config.selectedIndices?.has(params.dataIndex ?? -1) ? 'circle' : 'emptyCircle',
          symbolSize: config.emphasizeSelection
            ? (_value: unknown, params: { dataIndex?: number }) =>
                config.selectedIndices?.has(params.dataIndex ?? -1)
                  ? SELECTED_SYMBOL_SIZE
                  : UNSELECTED_SYMBOL_SIZE
            : SYMBOL_SIZE,
        }
      : {}),
  };
};
