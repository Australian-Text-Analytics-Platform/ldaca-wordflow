import { Calendar, ChartPie, CircleHelp, Clock, List, SquareCheck, Tag, Timer } from 'lucide-react';
import {
  isArrowBooleanField,
  isArrowDateField,
  isArrowDictionaryField,
  isArrowDurationField,
  isArrowFloatField,
  isArrowIntegerField,
  isArrowListField,
  isArrowStringField,
  isArrowTimestampField,
  type ArrowField,
} from '@/lib/arrow/arrowTable';
import { isTopicCoverageField } from '@/lib/arrow/semanticTypes';

const ICON_CLASS = 'h-3.5 w-3.5';
const TEXT_CLASS = 'font-mono text-[0.7rem] leading-none tracking-tight';

/**
 * A compact symbol for a column's data type (issue 206), so the header's type
 * button stays narrow. The full type name appears in the button's tooltip and
 * in its menu.
 */
export function ColumnTypeSymbol({ field }: { field: ArrowField | undefined }) {
  if (!field) return <CircleHelp className={ICON_CLASS} aria-hidden />;
  if (isTopicCoverageField(field)) return <ChartPie className={ICON_CLASS} aria-hidden />;
  if (isArrowDictionaryField(field)) return <Tag className={ICON_CLASS} aria-hidden />;
  if (isArrowStringField(field)) {
    return (
      <span className={TEXT_CLASS} aria-hidden>
        Aa
      </span>
    );
  }
  if (isArrowIntegerField(field)) {
    return (
      <span className={TEXT_CLASS} aria-hidden>
        123
      </span>
    );
  }
  if (isArrowFloatField(field)) {
    return (
      <span className={TEXT_CLASS} aria-hidden>
        1.2
      </span>
    );
  }
  if (isArrowDateField(field)) return <Calendar className={ICON_CLASS} aria-hidden />;
  if (isArrowTimestampField(field)) return <Clock className={ICON_CLASS} aria-hidden />;
  // Elapsed time, such as a transcript's 07:58.5 (issue 324).
  if (isArrowDurationField(field)) return <Timer className={ICON_CLASS} aria-hidden />;
  if (isArrowBooleanField(field)) return <SquareCheck className={ICON_CLASS} aria-hidden />;
  if (isArrowListField(field)) return <List className={ICON_CLASS} aria-hidden />;
  return <CircleHelp className={ICON_CLASS} aria-hidden />;
}
