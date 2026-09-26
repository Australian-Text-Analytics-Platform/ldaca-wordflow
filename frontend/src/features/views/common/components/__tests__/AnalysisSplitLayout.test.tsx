import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AnalysisSplitLayout } from '../AnalysisSplitLayout';

const STORAGE_KEY = 'ldaca.layout.analysisParametersHeight.test-view';

/** Renders the split with results that can be toggled from the test. */
function Harness({ initialResults = true }: { initialResults?: boolean }) {
  const [showResults, setShowResults] = useState(initialResults);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setShowResults((value) => !value);
        }}
      >
        toggle results
      </button>
      <AnalysisSplitLayout viewId="test-view" parameters={<div>Parameters card</div>}>
        {showResults ? <div>Results card</div> : null}
      </AnalysisSplitLayout>
    </>
  );
}

describe('AnalysisSplitLayout', () => {
  beforeAll(() => {
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('shows the handle only once the results pane has content', async () => {
    render(<Harness initialResults={false} />);
    expect(screen.queryByTestId('analysis-split-handle')).not.toBeInTheDocument();
    expect(screen.getByTestId('analysis-split-parameters')).toHaveTextContent('Parameters card');

    fireEvent.click(screen.getByRole('button', { name: 'toggle results' }));
    expect(await screen.findByTestId('analysis-split-handle')).toBeInTheDocument();
    expect(screen.getByTestId('analysis-split-results')).toHaveTextContent('Results card');
  });

  it('keeps the parameters at their natural height until the handle is used', () => {
    render(<Harness />);
    const parameters = screen.getByTestId('analysis-split-parameters');
    expect(parameters.style.height).toBe('');
    expect(parameters).toHaveClass('flex-[0_1_auto]');
  });

  it('drags to a remembered height and double-click returns to the natural height', () => {
    render(<Harness />);
    const handle = screen.getByTestId('analysis-split-handle');
    const parameters = screen.getByTestId('analysis-split-parameters');

    fireEvent.pointerDown(handle, { button: 0, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 340, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientY: 340, pointerId: 1 });
    // jsdom measures 0, so the drag starts from the 96 px minimum.
    expect(parameters.style.height).toBe('336px');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('336');

    fireEvent.doubleClick(handle);
    expect(parameters.style.height).toBe('');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('restores the remembered height and nudges it with the arrow keys', () => {
    window.localStorage.setItem(STORAGE_KEY, '300');
    render(<Harness />);
    const parameters = screen.getByTestId('analysis-split-parameters');
    expect(parameters.style.height).toBe('300px');

    fireEvent.keyDown(screen.getByTestId('analysis-split-handle'), { key: 'ArrowUp' });
    expect(parameters.style.height).toBe('260px');
    fireEvent.keyDown(screen.getByTestId('analysis-split-handle'), { key: 'ArrowDown' });
    expect(parameters.style.height).toBe('300px');
  });

  it('never makes the parameters pane smaller than its minimum', () => {
    window.localStorage.setItem(STORAGE_KEY, '100');
    render(<Harness />);
    fireEvent.keyDown(screen.getByTestId('analysis-split-handle'), { key: 'ArrowUp' });
    expect(screen.getByTestId('analysis-split-parameters').style.height).toBe('96px');
  });
});
