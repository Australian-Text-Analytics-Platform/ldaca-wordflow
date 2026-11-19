import { SelectItem } from '@/components/ui/select';
import {
  annotationCellText,
  classifyAnnotationLabel,
  normalizeAnnotationClassOptions,
  NOT_A_CODE_EXPLANATION,
} from '../annotationLabelModel';

interface CurrentAnnotationValueItemProps {
  value: unknown;
  classOptions: readonly string[];
}

/** Keeps any current raw value that has no exact dropdown option visible and replaceable. */
export function CurrentAnnotationValueItem({
  value,
  classOptions,
}: CurrentAnnotationValueItemProps) {
  const raw = annotationCellText(value);
  if (raw === '' || normalizeAnnotationClassOptions(classOptions).includes(raw)) return null;
  const invalid = classifyAnnotationLabel(value, classOptions).invalid;
  return (
    <SelectItem
      value={raw}
      className={invalid ? 'italic text-description' : undefined}
      title={invalid ? NOT_A_CODE_EXPLANATION : undefined}
    >
      {raw}
    </SelectItem>
  );
}
