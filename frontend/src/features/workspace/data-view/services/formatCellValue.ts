/**
 * Text for one Data Editor cell (issue 205): lists read as "a, b", and structs
 * as "key: value; key: value" instead of "[object Object]".
 */
export function formatCellValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return '';
  // Arrow rows and vectors know their own plain JSON shape.
  const plain =
    typeof (value as { toJSON?: unknown }).toJSON === 'function'
      ? (value as { toJSON: () => unknown }).toJSON()
      : value;
  if (Array.isArray(plain)) return plain.map((item) => formatCellValue(item)).join(', ');
  if (plain && typeof plain === 'object') {
    return Object.entries(plain as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${formatCellValue(item)}`)
      .join('; ');
  }
  return plain === value ? '' : formatCellValue(plain);
}
