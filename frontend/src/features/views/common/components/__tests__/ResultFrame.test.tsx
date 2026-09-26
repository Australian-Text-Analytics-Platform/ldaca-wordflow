import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AnalysisSplitLayout } from '../AnalysisSplitLayout';
import { ResultFrame } from '../ResultFrame';

const KEY = 'ldaca.layout.resultHeight.test.chart';

describe('ResultFrame', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('uses the default height outside an analysis results pane', () => {
    render(
      <ResultFrame storageKey="test.chart" defaultHeight={300}>
        <div>chart</div>
      </ResultFrame>,
    );
    const frame = screen.getByTestId('result-frame');
    expect(frame.style.height).toBe('300px');
    expect(frame).toHaveAttribute('data-result-size', 'default');
    expect(frame).toHaveClass('resize-y', 'overflow-hidden');
  });

  it('keeps the natural height without a default and tells the child so', () => {
    const heights: (number | null)[] = [];
    render(
      <ResultFrame storageKey="test.chart" fill={false}>
        {(height) => {
          heights.push(height);
          return <div>cloud</div>;
        }}
      </ResultFrame>,
    );
    expect(screen.getByTestId('result-frame').style.height).toBe('');
    expect(heights.every((height) => height === null)).toBe(true);
  });

  it('restores a size the user set, even inside a results pane (issue 196)', () => {
    window.localStorage.setItem(KEY, '420');
    render(
      <AnalysisSplitLayout viewId="test" parameters={<div>parameters</div>}>
        <ResultFrame storageKey="test.chart">
          <div>chart</div>
        </ResultFrame>
      </AnalysisSplitLayout>,
    );
    const frame = screen.getByTestId('result-frame');
    expect(frame.style.height).toBe('420px');
    expect(frame).toHaveAttribute('data-result-size', 'user');
  });

  it('double-clicking the corner forgets the user size', () => {
    window.localStorage.setItem(KEY, '420');
    render(
      <ResultFrame storageKey="test.chart" defaultHeight={300}>
        <div>chart</div>
      </ResultFrame>,
    );
    const frame = screen.getByTestId('result-frame');
    // jsdom rects are all zero, so any point counts as the corner.
    fireEvent.doubleClick(frame, { clientX: 0, clientY: 0 });
    expect(frame.style.height).toBe('300px');
    expect(frame).toHaveAttribute('data-result-size', 'default');
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});
