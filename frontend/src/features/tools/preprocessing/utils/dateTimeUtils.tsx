import { CalendarIcon } from 'lucide-react';
import { DataType } from 'apache-arrow';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ArrowField } from '@/lib/arrow/decodeArrowTable';
import {
  calendarDate,
  replaceCalendarDate,
  replaceClockTime,
  temporalParts,
} from './dateTimeHelpers';
import { useId } from 'react';

/** Exact text stays owned by the condition. The calendar only edits its date portion. */
export function DateTimePickerField({
  value,
  onChange,
  field,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  field: ArrowField;
  disabled?: boolean;
}) {
  const id = useId();
  const timestamp = DataType.isTimestamp(field.type);
  const date = DataType.isDate(field.type);
  const time = DataType.isTime(field.type);
  const placeholder = date
    ? 'YYYY-MM-DD'
    : time
      ? 'HH:MM:SS.ffffff'
      : timestamp
        ? 'YYYY-MM-DD HH:MM:SS.ffffff'
        : 'e.g., 2 days';
  const selected = calendarDate(value);
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Input
        aria-label="Temporal value"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        placeholder={placeholder}
        disabled={disabled}
        className="min-w-48 font-mono"
      />
      {(date || timestamp) && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label="Choose date"
            >
              <CalendarIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-3" aria-label="Date and time">
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected}
              captionLayout="dropdown"
              onSelect={(day) => {
                if (day) onChange(replaceCalendarDate(value, day, timestamp));
              }}
            />
            {timestamp && (
              <div className="flex flex-col gap-2 pt-2">
                <Label htmlFor={id}>Time</Label>
                <Input
                  id={id}
                  value={temporalParts(value).time}
                  placeholder="HH:MM:SS.ffffff"
                  disabled={!temporalParts(value).date}
                  onChange={(event) => {
                    onChange(replaceClockTime(value, event.target.value));
                  }}
                />
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
