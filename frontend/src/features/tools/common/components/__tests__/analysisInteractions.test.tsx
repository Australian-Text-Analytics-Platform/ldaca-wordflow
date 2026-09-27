import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { AnalysisAction } from '../AnalysisAction';
import { AnalysisNumberInput } from '../AnalysisNumberInput';
import { inspectAnalysisRow } from '../inspectAnalysisRow';

afterEach(() => vi.restoreAllMocks());
it('reverts invalid numeric edits with one reminder and commits valid integers', () => {
  const remind = vi.spyOn(toast, 'info').mockReturnValue(1);
  const commit = vi.fn();
  render(
    <AnalysisNumberInput value={10} min={0} max={50} onCommit={commit} aria-label="Context" />,
  );
  const field = screen.getByRole('spinbutton');
  fireEvent.change(field, { target: { value: '51' } });
  expect(commit).not.toHaveBeenCalled();
  fireEvent.blur(field);
  expect(field).toHaveValue(10);
  fireEvent.blur(field);
  expect(remind).toHaveBeenCalledOnce();
  fireEvent.change(field, { target: { value: '0' } });
  fireEvent.blur(field);
  expect(commit).toHaveBeenCalledWith(0);
});
it('explains a blocked action only when activated', () => {
  const remind = vi.spyOn(toast, 'info').mockReturnValue(1);
  const run = vi.fn();
  render(
    <AnalysisAction reason="Finish editing first." onClick={run}>
      Preview
    </AnalysisAction>,
  );
  const button = screen.getByRole('button');
  fireEvent.focus(button);
  fireEvent.mouseOver(button);
  expect(remind).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(remind).toHaveBeenCalledOnce();
  expect(run).not.toHaveBeenCalled();
});
it('row inspection respects selected text and embedded actions', () => {
  const inspect = vi.fn();
  render(
    <table>
      <tbody>
        <tr
          onClick={(event) => {
            inspectAnalysisRow(event, inspect);
          }}
        >
          <td>Context</td>
          <td>
            <button>Sort</button>
          </td>
        </tr>
      </tbody>
    </table>,
  );
  fireEvent.click(screen.getByText('Context'));
  expect(inspect).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button'));
  expect(inspect).toHaveBeenCalledOnce();
  vi.spyOn(window, 'getSelection').mockReturnValue({
    toString: () => 'selected text',
  } as Selection);
  fireEvent.click(screen.getByText('Context'));
  expect(inspect).toHaveBeenCalledOnce();
});
