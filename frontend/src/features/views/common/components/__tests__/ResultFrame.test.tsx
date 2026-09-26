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
    expect(screen.getByTestId('result-frame-grip')).toHaveAttribute(
      'aria-label',
      'Resize this result',
    );
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

  it('drags the grip to a remembered size and nudges it with the arrow keys', () => {
    render(
      <ResultFrame storageKey="test.chart" defaultHeight={300}>
        <div>chart</div>
      </ResultFrame>,
    );
    const grip = screen.getByTestId('result-frame-grip');
    // jsdom measures 0, so the drag starts from the 160 px minimum.
    fireEvent.pointerDown(grip, { button: 0, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientY: 250, pointerId: 1 });
    fireEvent.pointerUp(grip, { clientY: 250, pointerId: 1 });
    const frame = screen.getByTestId('result-frame');
    expect(frame.style.height).toBe('310px');
    expect(frame).toHaveAttribute('data-result-size', 'user');
    expect(window.localStorage.getItem(KEY)).toBe('310');

    fireEvent.keyDown(grip, { key: 'ArrowUp' });
    expect(frame.style.height).toBe('270px');
  });

  it('double-clicking the grip forgets the user size', () => {
    window.localStorage.setItem(KEY, '420');
    render(
      <ResultFrame storageKey="test.chart" defaultHeight={300}>
        <div>chart</div>
      </ResultFrame>,
    );
    const frame = screen.getByTestId('result-frame');
    fireEvent.doubleClick(screen.getByTestId('result-frame-grip'));
    expect(frame.style.height).toBe('300px');
    expect(frame).toHaveAttribute('data-result-size', 'default');
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});
