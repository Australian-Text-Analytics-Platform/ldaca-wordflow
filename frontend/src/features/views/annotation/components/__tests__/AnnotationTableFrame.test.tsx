import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AnnotationTableFrame } from '../AnnotationTableFrame';

const renderFrame = () =>
  render(
    <AnnotationTableFrame belowTable={<p>footer</p>}>
      <table>
        <tbody>
          <tr>
            <td>cell</td>
          </tr>
        </tbody>
      </table>
    </AnnotationTableFrame>,
  );

describe('AnnotationTableFrame', () => {
  it('renders an always-visible scroll area with the table and footer', () => {
    renderFrame();

    expect(screen.getByTestId('analysis-table-scroll-area')).toBeInTheDocument();
    expect(screen.getByText('cell')).toBeInTheDocument();
    expect(screen.getByText('footer')).toBeInTheDocument();
  });

  it('keeps a bounded default height outside an analysis results pane', () => {
    renderFrame();

    expect(screen.getByTestId('analysis-table-scroll-area').style.maxHeight).toBe(
      'min(384px, 75vh)',
    );
  });

  it('offers a corner resize grip instead of the old bottom handle (issue 196)', () => {
    renderFrame();

    expect(screen.getByTestId('result-frame')).toHaveClass('resize-y', 'overflow-hidden');
    expect(screen.queryByTestId('annotation-table-resize-handle')).not.toBeInTheDocument();
  });
});
