import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  checkConversion,
  getDatetimeFormats,
  type ConversionCheckResource,
  type DatetimeFormatCandidate,
} from '@/api';
import { TooltipProvider } from '@/components/ui/tooltip';
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
  failed_values: [{ value: 'soon', count: 1, first_row: 3, shortened: false }],
  failed_distinct: 1,
};

const showPanel = (
  mode: ConversionMode,
  target: 'date' | 'integer' | 'duration' | 'string' | 'float' = 'date',
  onConfirm: Mock = vi.fn(),
  onAddRowsAsDataBlock?: (values: string[]) => Promise<string>,
) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <ConversionPanel
          open
          workspaceId="w"
          nodeId="n"
          columnName="published"
          mode={mode}
          target={target}
          targetLabel={target}
          existingColumns={['published', 'title', 'published_date']}
          onAddRowsAsDataBlock={onAddRowsAsDataBlock}
          onClose={vi.fn()}
          onConfirm={onConfirm}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return onConfirm;
};

const turnOnAdvanced = async () => {
  await userEvent.click(await screen.findByRole('switch', { name: 'Advanced settings' }));
};

const namePart = async (part: string, role: string) => {
  await userEvent.selectOptions(
    await screen.findByRole('combobox', { name: `What "${part}" is` }),
    role,
  );
};

describe('ConversionPanel (issue 322)', () => {
  beforeEach(() => {
    // The Advanced choice is kept on the device.
    window.localStorage.clear();
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
    // The value that doesn't convert is listed with its rows and first row.
    expect(screen.getByText("1 value doesn't convert")).toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'soon 1 3' })).toBeInTheDocument();

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

  it('keeps each part as it is named and ignores text after the date', async () => {
    vi.mocked(getDatetimeFormats).mockResolvedValue({
      data: {
        column: 'base_name',
        sample_size: 3,
        sample_value: '2021_01_17_LaurenLancaster',
        sample_parts: ['2021', '_', '01', '_', '17', '_', 'LaurenLancaster'],
        candidates: [],
      },
    } as never);
    const onConfirm = showPanel('date');

    // No format fits, so the parts show without Advanced.
    const name = namePart;
    await name('2021', 'Year');
    // A choice stays while other parts are still unnamed.
    expect(screen.getByRole('combobox', { name: 'What "2021" is' })).toHaveDisplayValue('Year');
    await name('01', 'Month');
    await name('17', 'Day');
    expect(screen.getByRole('button', { name: 'Convert' })).toBeDisabled();
    await name('LaurenLancaster', 'Ignore (not part of the date)');

    expect(screen.queryByRole('textbox', { name: /Format code/ })).not.toBeInTheDocument();
    await turnOnAdvanced();
    expect(screen.getByRole('textbox', { name: /Format code/ })).toHaveValue('%Y_%m_%d');
    // An ignored part means searching, so the tick is on and can't be taken off.
    const search = screen.getByRole('checkbox', { name: /inside longer text/ });
    expect(search).toBeChecked();
    expect(search).toBeDisabled();
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Convert' })).toBeEnabled();
    });
    expect(vi.mocked(checkConversion).mock.lastCall?.[0].body).toMatchObject({
      datetime_format: '%Y_%m_%d',
      date_in_text: true,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Convert' }));
    expect(onConfirm).toHaveBeenCalledWith({ datetime_format: '%Y_%m_%d', date_in_text: true });
  });

  const zonedTimes = () => {
    vi.mocked(getDatetimeFormats).mockResolvedValue({
      data: {
        column: 'created_at',
        sample_size: 3,
        sample_value: '2020-10-16 15:20:22.000 +0000',
        sample_parts: [
          ...['2020', '-', '10', '-', '16', ' ', '15', ':', '20', ':', '22', '.', '000'],
          ...[' ', '+0000'],
        ],
        candidates: [
          candidate({
            // The parser reads the space before the zone without one in the format.
            format: '%Y-%m-%d %H:%M:%S%.f%z',
            examples: [{ value: '2020-10-16 15:20:22.000 +0000', result: '2020-10-16 15:20:22' }],
          }),
        ],
      },
    } as never);
  };

  it('shows the fitting formats and the check until Advanced is turned on', async () => {
    zonedTimes();
    showPanel('date');

    expect(await screen.findByRole('radio', { name: /Year-Month-Day Hour/ })).toBeChecked();
    // Converting to a date keeps the date, so the example has no time.
    expect(screen.getByText(/→ 16 Oct 2020$/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Format code/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    await turnOnAdvanced();
    const advancedSettings = screen.getByRole('group', { name: 'Advanced settings' });
    expect(advancedSettings).toBeInTheDocument();
    // Every part of the fitting format is named, the zone after its space too.
    expect(screen.getByRole('combobox', { name: 'What "2020" is' })).toHaveDisplayValue('Year');
    expect(screen.getByRole('combobox', { name: 'What "+0000" is' })).toHaveDisplayValue(
      'Time zone',
    );
    expect(screen.getByRole('button', { name: 'Ignore the rest' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /inside longer text/ })).not.toBeChecked();
  });

  it('remembers Advanced on this device', async () => {
    zonedTimes();
    showPanel('date');
    await turnOnAdvanced();
    expect(window.localStorage.getItem('ldaca.toolMode.conversion-date')).toBe('advanced');
  });

  it('searches inside each value for a typed code that reads only the date', async () => {
    zonedTimes();
    const onConfirm = showPanel('date');
    await turnOnAdvanced();

    fireEvent.change(screen.getByRole('textbox', { name: /Format code/ }), {
      target: { value: '%Y-%m-%d' },
    });
    // The parts follow the code: the time and zone are ignored.
    expect(screen.getByRole('combobox', { name: 'What "16" is' })).toHaveDisplayValue('Day');
    expect(screen.getByRole('combobox', { name: 'What "+0000" is' })).toHaveDisplayValue(
      'Ignore (not part of the date)',
    );
    expect(screen.getByRole('checkbox', { name: /inside longer text/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Your own format: Year-Month-Day/ })).toBeChecked();

    // The format in use stays in view when Advanced is turned off again.
    await turnOnAdvanced();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Your own format: Year-Month-Day/ })).toBeChecked();
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Convert' })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Convert' }));
    expect(onConfirm).toHaveBeenCalledWith({ datetime_format: '%Y-%m-%d', date_in_text: true });
  });

  const unreadFileNames = () => {
    vi.mocked(getDatetimeFormats).mockResolvedValue({
      data: {
        column: 'base_name',
        sample_size: 3,
        sample_value: '2021_01_17_Lauren_v2',
        sample_parts: ['2021', '_', '01', '_', '17', '_', 'Lauren', '_', 'v', '2'],
        candidates: [],
      },
    } as never);
  };

  it('ignores every part that has no name in one click', async () => {
    unreadFileNames();
    const onConfirm = showPanel('date');

    const ignoreRest = await screen.findByRole('button', { name: 'Ignore the rest' });
    // Nothing to ignore the rest of until a part of the date is named.
    expect(ignoreRest).toBeDisabled();
    await namePart('2021', 'Year');
    await namePart('01', 'Month');
    await namePart('17', 'Day');
    await userEvent.click(ignoreRest);

    for (const part of ['Lauren', 'v', '2']) {
      expect(screen.getByRole('combobox', { name: `What "${part}" is` })).toHaveDisplayValue(
        'Ignore (not part of the date)',
      );
    }
    expect(ignoreRest).toBeDisabled();
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Convert' })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Convert' }));
    expect(onConfirm).toHaveBeenCalledWith({ datetime_format: '%Y_%m_%d', date_in_text: true });
  });

  it('keeps the named parts when the search inside longer text is ticked', async () => {
    vi.mocked(getDatetimeFormats).mockResolvedValue({
      data: {
        column: 'base_name',
        sample_size: 3,
        sample_value: '2021_01_17',
        sample_parts: ['2021', '_', '01', '_', '17'],
        candidates: [],
      },
    } as never);
    const onConfirm = showPanel('date');
    await turnOnAdvanced();

    await namePart('2021', 'Year');
    await namePart('01', 'Month');
    const search = screen.getByRole('checkbox', { name: /inside longer text/ });
    await userEvent.click(search);
    expect(search).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'What "2021" is' })).toHaveDisplayValue('Year');
    expect(screen.getByRole('combobox', { name: 'What "01" is' })).toHaveDisplayValue('Month');

    // Naming the last part keeps the tick: no part is ignored, so it was made by hand.
    await namePart('17', 'Day');
    expect(search).toBeChecked();
    expect(search).toBeEnabled();
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Convert' })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Convert' }));
    expect(onConfirm).toHaveBeenCalledWith({ datetime_format: '%Y_%m_%d', date_in_text: true });
  });

  it('refuses an ignored part in the middle of the date', async () => {
    vi.mocked(getDatetimeFormats).mockResolvedValue({
      data: {
        column: 'base_name',
        sample_size: 1,
        sample_value: '2021_x_01_17',
        sample_parts: ['2021', '_', 'x', '_', '01', '_', '17'],
        candidates: [],
      },
    } as never);
    showPanel('date');

    for (const [part, role] of [
      ['2021', 'Year'],
      ['x', 'Ignore (not part of the date)'],
      ['01', 'Month'],
      ['17', 'Day'],
    ] as const) {
      await userEvent.selectOptions(
        await screen.findByRole('combobox', { name: `What "${part}" is` }),
        role,
      );
    }
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Only text before or after the date can be ignored',
    );
    expect(screen.getByRole('button', { name: 'Convert' })).toBeDisabled();
  });

  const slashDates = () => {
    vi.mocked(getDatetimeFormats).mockResolvedValue({
      data: {
        column: 'published',
        sample_size: 3,
        sample_value: '03/01/2020',
        sample_parts: ['03', '/', '01', '/', '2020'],
        candidates: [candidate({ format: '%d/%m/%Y' })],
      },
    } as never);
  };

  it('keeps the column and converts into a new column when asked', async () => {
    slashDates();
    const onConfirm = showPanel('date');

    const keep = await screen.findByRole('checkbox', {
      name: /Keep “published” as it is and put the converted values in a new column/,
    });
    expect(screen.queryByRole('textbox', { name: 'New column' })).not.toBeInTheDocument();
    await userEvent.click(keep);
    // The suggested name is free: "published_date" is taken.
    const name = screen.getByRole('textbox', { name: 'New column' });
    expect(name).toHaveValue('published_date_2');

    await userEvent.clear(name);
    expect(screen.getByRole('alert')).toHaveTextContent('Give the new column a name.');
    expect(screen.getByRole('button', { name: 'Convert' })).toBeDisabled();
    await userEvent.type(name, 'title');
    expect(screen.getByRole('alert')).toHaveTextContent('A column named "title" already exists.');
    expect(screen.getByRole('button', { name: 'Convert' })).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, 'published on');

    await userEvent.click(screen.getByRole('button', { name: 'Convert' }));
    expect(onConfirm).toHaveBeenCalledWith({
      datetime_format: '%d/%m/%Y',
      output_column: 'published on',
    });
    // The check tries the conversion only; where the result goes is not part of it.
    expect(vi.mocked(checkConversion).mock.lastCall?.[0].body).not.toHaveProperty('output_column');
  });

  it('offers no new column when every value converts', async () => {
    slashDates();
    vi.mocked(checkConversion).mockResolvedValue({
      data: { ...checked, converted: 3, failed: 0, failed_values: [], failed_distinct: 0 },
    } as never);
    const onConfirm = showPanel('date');

    expect(await screen.findByRole('status')).toHaveTextContent('3 of 3 values convert.');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Convert' }));
    expect(onConfirm).toHaveBeenCalledWith({ datetime_format: '%d/%m/%Y' });
  });

  it("adds the rows that don't convert as a Data Block, once", async () => {
    slashDates();
    vi.mocked(checkConversion).mockResolvedValue({
      data: {
        ...checked,
        non_empty: 6,
        failed: 4,
        failed_values: [
          { value: 'n/a', count: 3, first_row: 2, shortened: false },
          { value: 'soon', count: 1, first_row: 3, shortened: false },
        ],
        failed_distinct: 2,
      },
    } as never);
    const addRows = vi.fn().mockResolvedValue('News_published_not_converted');
    showPanel('date', 'date', vi.fn(), addRows);

    expect(await screen.findByText("2 different values don't convert")).toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'n/a 3 2' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add these rows as a Data Block' }));
    expect(addRows).toHaveBeenCalledWith(['n/a', 'soon']);
    expect(await screen.findByText('Added as “News_published_not_converted”')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add these rows as a Data Block' }),
    ).not.toBeInTheDocument();
  });

  it('offers no Data Block of rows when the values are not all listed whole', async () => {
    slashDates();
    vi.mocked(checkConversion).mockResolvedValue({
      data: {
        ...checked,
        non_empty: 500,
        converted: 200,
        failed: 300,
        failed_values: [{ value: 'n/a', count: 5, first_row: 2, shortened: false }],
        failed_distinct: 250,
      },
    } as never);
    showPanel('date', 'date', vi.fn(), vi.fn());

    expect(
      await screen.findByText('These are the 1 most frequent of 250 different values.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add these rows as a Data Block' }),
    ).not.toBeInTheDocument();
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

  it('reads two-part times as minutes and seconds unless switched (issue 324)', async () => {
    const onConfirm = showPanel('elapsed', 'duration');

    expect(
      screen.getByRole('radio', { name: /minutes and seconds \(7:58 is 7 minutes 58 seconds\)/ }),
    ).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: /hours and minutes/ }));
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Convert' })).toBeEnabled();
    });
    expect(vi.mocked(checkConversion).mock.lastCall?.[0].body).toMatchObject({
      target_type: 'duration',
      two_part_times: 'hours',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Convert' }));
    expect(onConfirm).toHaveBeenCalledWith({ two_part_times: 'hours' });
  });

  it('turns elapsed time into numbers of a chosen unit and into text', async () => {
    const toNumber = showPanel('elapsed-out', 'float');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Unit' }), 'minutes');
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Convert' })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Convert' }));
    expect(toNumber).toHaveBeenCalledWith({ elapsed_unit: 'min' });
  });

  it('offers days as Excel stores times only when reading numbers', () => {
    showPanel('elapsed-number', 'duration');
    expect(
      screen.getByRole('option', { name: 'days (as Excel stores times)' }),
    ).toBeInTheDocument();
  });
});
