export const showValue = (value: unknown): string =>
  value === null || value === undefined
    ? '—'
    : typeof value === 'object'
      ? JSON.stringify(value, (_, item: unknown) =>
          typeof item === 'bigint' ? item.toString() : item,
        )
      : typeof value === 'string'
        ? value
        : typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean'
          ? String(value)
          : '—';
