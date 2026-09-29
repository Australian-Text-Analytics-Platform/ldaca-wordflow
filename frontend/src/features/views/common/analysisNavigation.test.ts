import { describe, expect, it } from 'vitest';
import type { Tab } from '@/api';
import {
  analysisNavigationForKind,
  displayTabTitle,
  nextTabTitle,
  analysisNavigationForView,
  analysisTabQuickAccessLabel,
  filterAnalysisTabs,
  taskTabName,
} from './analysisNavigation';

const tab = (kind: Tab['kind'], name: string): Tab => ({
  id: `${kind}-${name}`,
  kind,
  name,
  created_at: '2026-08-28T00:00:00Z',
  modified_at: '2026-08-28T00:00:00Z',
  revision: 1,
});

describe('analysis navigation metadata', () => {
  it('maps backend kinds to their view and quick-access label', () => {
    expect(analysisNavigationForKind('token_frequency')).toEqual({
      kind: 'token_frequency',
      view: 'token-frequency',
      label: 'Frequency',
      shortLabel: 'Freq',
      tabPrefix: 'F',
    });
    expect(analysisNavigationForView('analysis')?.kind).toBe('sequential');
    expect(analysisNavigationForView('data-loader')).toBeNull();
    expect(analysisTabQuickAccessLabel(tab('token_frequency', 'Analysis 1'))).toBe(
      'Frequency: F-1',
    );
  });

  it('names tabs with the tool prefix and shows older default names with it (issue 211)', () => {
    expect(displayTabTitle('Analysis 3', 'token_frequency')).toBe('F-3');
    expect(displayTabTitle('3', 'topic_modeling')).toBe('TM-3');
    expect(displayTabTitle('C-2', 'concordance')).toBe('C-2');
    expect(displayTabTitle('JP vs AUS', 'token_frequency')).toBe('JP vs AUS');
    expect(displayTabTitle('Analysis of tweets', 'token_frequency')).toBe('Analysis of tweets');
    // Another tool's prefix is a renamed name, not a default one.
    expect(displayTabTitle('C-2', 'token_frequency')).toBe('C-2');
    expect(nextTabTitle([], 'token_frequency')).toBe('F-1');
    expect(nextTabTitle(['Analysis 1', '4', 'JP vs AUS'], 'sequential')).toBe('T-5');
    expect(nextTabTitle(['Q-1', 'Q-7', '2'], 'quotation')).toBe('Q-8');
    expect(nextTabTitle(['JP vs AUS'], 'annotation')).toBe('A-2');
  });

  it('filters case-insensitively by analysis type or Tab name', () => {
    const tabs = [
      tab('token_frequency', 'Analysis 1'),
      tab('sequential', 'Timeline comparison'),
      tab('concordance', 'Keyword review'),
    ];

    expect(filterAnalysisTabs(tabs, 'FREQ')).toEqual([tabs[0]]);
    expect(filterAnalysisTabs(tabs, 'timeline')).toEqual([tabs[1]]);
    expect(filterAnalysisTabs(tabs, '  review ')).toEqual([tabs[2]]);
    expect(filterAnalysisTabs(tabs, '')).toEqual(tabs);
  });

  it('starts every task name with the tool prefix (issue 235)', () => {
    expect(taskTabName('C-2', 'concordance')).toBe('C-2');
    expect(taskTabName('3', 'token_frequency')).toBe('F-3');
    expect(taskTabName('yeah', 'concordance')).toBe('C - yeah');
    expect(taskTabName('JP vs AUS', 'topic_modeling')).toBe('TM - JP vs AUS');
  });
});
