import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DateDay,
  Field,
  IntervalDayTime,
  TimeMicrosecond,
  TimestampMicrosecond,
} from 'apache-arrow';
import { describe, expect, it, vi } from 'vitest';
import { DateTimePickerField } from './dateTimeUtils';
import { replaceCalendarDate, replaceClockTime } from './dateTimeHelpers';
import { columnCastIdentity } from '@/features/project/data-view/services/schemaMutations';

const exact = '2026-09-16T12:34:56.123456+10:30';
describe('exact temporal text with shadcn controls', () => {
  it('changes only the requested portion, retaining fractions and explicit timezone text', () => {
    expect(replaceCalendarDate(exact, new Date(2025, 1, 3), true)).toBe(
      '2025-02-03T12:34:56.123456+10:30',
    );
    expect(replaceClockTime(exact, '23:59:59.654321')).toBe('2026-09-16T23:59:59.654321+10:30');
    expect(replaceClockTime('2026-09-16 12:00:00 Australia/Sydney', '09:01:02')).toBe(
      '2026-09-16 09:01:02 Australia/Sydney',
    );
    expect(replaceClockTime('2026-09-16 12:00:00', '1:')).toBe('2026-09-16 1:');
    expect(replaceCalendarDate('2026-09-16', new Date(2025, 1, 3), false)).toBe('2025-02-03');
  });
  it('does not rewrite text on opening or Escape, and keeps invalid typed text for DuckDB', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DateTimePickerField
        value={exact}
        onChange={onChange}
        field={new Field('t', new TimestampMicrosecond('UTC'))}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Choose date' }));
    expect(screen.getByLabelText('Time')).toHaveValue('12:34:56.123456');
    await user.keyboard('{Escape}');
    expect(onChange).not.toHaveBeenCalled();
    await user.clear(screen.getByRole('textbox', { name: 'Temporal value' }));
    expect(onChange).toHaveBeenCalledWith('');
  });
  it('accepts partial time entry without normalization', async () => {
    const user = userEvent.setup();
    function Picker() {
      const [value, setValue] = useState(exact);
      return (
        <DateTimePickerField
          value={value}
          onChange={setValue}
          field={new Field('t', new TimestampMicrosecond())}
        />
      );
    }
    render(<Picker />);
    await user.click(screen.getByRole('button', { name: 'Choose date' }));
    await user.clear(screen.getByLabelText('Time'));
    await user.type(screen.getByLabelText('Time'), '99:02:03.123456789');
    expect(screen.getByRole('textbox', { name: 'Temporal value' })).toHaveValue(
      '2026-09-16T99:02:03.123456789+10:30',
    );
  });
  it.each([new TimeMicrosecond(), new IntervalDayTime()])(
    'does not show a calendar for %s',
    (type) => {
      render(<DateTimePickerField value="" onChange={vi.fn()} field={new Field('v', type)} />);
      expect(screen.queryByRole('button', { name: 'Choose date' })).not.toBeInTheDocument();
    },
  );
  it('shows a date calendar without time controls and distinguishes timestamp cast targets', async () => {
    const user = userEvent.setup();
    render(
      <DateTimePickerField
        value="2026-09-16"
        onChange={vi.fn()}
        field={new Field('v', new DateDay())}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Choose date' }));
    expect(screen.queryByLabelText('Time')).not.toBeInTheDocument();
    expect(columnCastIdentity(new Field('t', new TimestampMicrosecond()))).toBe('datetime');
    expect(columnCastIdentity(new Field('t', new TimestampMicrosecond('UTC')))).toBe('datetime_tz');
  });
});
