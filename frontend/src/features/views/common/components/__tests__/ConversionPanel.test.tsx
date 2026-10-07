import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  checkConversion,
  getDatetimeFormats,
  type ConversionCheckResource,
  type DatetimeFormatCandidate,
} from '@/api';
import { ConversionPanel, type ConversionMode } from '../ConversionPanel';

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getDatetimeFormats: vi.fn(),
  checkConversion: vi.fn(),
}));

const candidate = (overrides: Partial<DatetimeFormatCandidate>): DatetimeFormatCandidate => ({
  kind: 'format',
  format: null,
  epoch_unit: null,
  examples: [],
  parsed: 3,
  sample_size: 3,
  swap_format: null,
  two_digit_year: false,
  ...overrides,
});

const checked: ConversionCheckResource = {
  total_rows: 4,
  non_empty: 3,
  converted: 2,
  failed: 1,
  samples: [{ row: 1, value: '03/01/2020', result: '2020-01-03' }],
  failures: [{ row: 3, value: 'soon' }],
};

const showPanel = (
  mode: ConversionMode,
  target: 'date' | 'integer' = 'date',
  onConfirm: Mock = vi.fn(),
) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConversionPanel
        open
        workspaceId="w"
        nodeId="n"
        columnName="published"
        mode={mode}
        target={target}
        targetLabel={target === 'date' ? 'date' : 'whole number'}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    </QueryClientProvider>,
  );
  return onConfirm;
};

describe('ConversionPanel (issue 322)', () => {
  beforeEach(() => {
    vi.mocked(getDatetimeFormats).mockReset();
    vi.mocked(checkConversion).mockReset();
    vi.mocked(checkConversion).mockResolvedValue({ data: checked } as never);
  });

  it('reads ambiguous dates day first, swaps in one click, and converts after the check', async () => {
    vi.mocked(getDatetimeFormats).mockResolvedValue({
      data: {
        column: 'published',
        sample_size: 3,
        sample_value: '03/01/2020',
        sample_parts: ['03', '/', '01', '/', '2020'],
        candidates: [
          candidate({ format: '%d/%m/%Y', swap_format: '%m/%d/%Y' }),
          candidate({ format: '%m/%d/%Y', swap_format: '%d/%m/%Y' }),
          // An Excel day number is offered but never chosen for you.
          candidate({ kind: 'excel', parsed: 3 }),
        ],
      },
    } as never);
    const onConfirm = showPanel('date');

    expect(await screen.findByRole('radio', { name: /Day\/Month\/Year/ })).toBeChecked();
    expect(await screen.findByRole('status')).toHaveTextContent(
      '2 of 3 values convert; 1 would become empty. 1 empty values stay empty.',
    );
    expect(screen.getByText('3 Jan 2020')).toBeInTheDocument();
    expect(screen.getByText(/row 3: "soon"/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Read month first' }));
    expect(screen.getByRole('radio', { name: /Month\/Day\/Year/ })).toBeChecked();
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Convert' })).toBeEnabled();
    });
    expect(vi.mocked(checkConversion).mock.lastCall?.[0].body).toMatchObject({
      column: 'published',
      target_type: 'date',
      datetime_format: '%m/%d/%Y',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Convert' }));
    expect(onConfirm).toHaveBeenCalledWith({ datetime_format: '%m/%d/%Y' });
  });

  it('waits for a century before checking two-digit years', async () => {
    vi.mocked(getDatetimeFormats).mockResolvedValue({
      data: {
        column: 'published',
        sample_size: 3,
        sample_value: '30/01/20',
        sample_parts: ['30', '/', '01', '/', '20'],
        candidates: [
          candidate({
            format: '%d/%m/%y',
            two_digit_year: true,
            examples: [{ value: '30/01/20', result: '2020-01-30' }],
          }),
        ],
      },
    } as never);
    const onConfirm = showPanel('date');

    expect(await screen.findByText(/choose the century below/)).toBeInTheDocument();
    expect(screen.getByText('Complete the choices above to see the result.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Convert' })).toBeDisabled();
    expect(checkConversion).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('radio', { name: /Split at/ }));
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Convert' })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Convert' }));
    expect(onConfirm).toHaveBeenCalledWith({
      datetime_format: '%d/%m/%y',
      two_digit_year_start: 1950,
    });
  });

  it('starts numbers with a decimal point, comma thousands and symbols ignored', async () => {
    const onConfirm = showPanel('number', 'integer');

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Convert' })).toBeEnabled();
    });
    expect(getDatetimeFormats).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Convert' }));
    expect(onConfirm).toHaveBeenCalledWith({
      decimal_mark: '.',
      thousands_separator: ',',
      ignore_symbols: true,
    });
  });
});
