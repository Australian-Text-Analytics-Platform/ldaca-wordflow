import { Plus, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { DataType } from 'apache-arrow';
import type { ArrowField } from '@/lib/arrow/decodeArrowTable';
import * as api from '@/features/project/api';
import { NodeColumnSelector } from '../common/components/NodeColumnSelector';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Input } from '@/components/ui/input';
import { objectDependencies } from '@/features/project/projectChanges';
import { Button } from '@/components/ui/button';
export function PlotParameters({
  base,
  active,
  draft: r,
  fields,
  onChange,
}: {
  base: string;
  active: boolean;
  draft: api.PlotRequest;
  fields: ArrowField[];
  onChange: (r: api.PlotRequest) => void;
}) {
  const all = fields.map((f) => f.name);
  const numeric = fields
    .filter((f) => DataType.isInt(f.type) || DataType.isFloat(f.type) || DataType.isDecimal(f.type))
    .map((f) => f.name);
  const temporal = fields
    .filter((f) => DataType.isDate(f.type) || DataType.isTimestamp(f.type))
    .map((f) => f.name);
  const aware =
    'axis' in r &&
    fields.some(
      (f) => f.name === r.axis && DataType.isTimestamp(f.type) && Boolean(f.type.timezone),
    );
  const zones = useQuery({
    queryKey: ['native', base, 'timezones'],
    queryFn: ({ signal }) => api.plotTimezones(base, signal),
    enabled: active && aware,
    staleTime: Infinity,
  });
  const groups = 'groups' in r ? r.groups.filter((name) => all.includes(name)) : [];
  const distinct = useQuery({
    queryKey: [
      'native',
      base,
      'preprocessing-options',
      'plot-groups',
      r.source.schema,
      r.source.name,
      groups,
    ],
    queryFn: ({ signal }) =>
      api.querySql(
        base,
        [
          {
            sql: `SELECT ${groups.map((name, i) => `count(DISTINCT json_array(${api.identifier(name)})) AS ${api.identifier(String(i))}`).join(',')} FROM ${api.identifier(r.source.schema ?? 'data')}.${api.identifier(r.source.name)}`,
          },
        ],
        signal,
      ),
    enabled: active && Boolean(r.source.name) && groups.length > 0,
    meta: objectDependencies(r.source),
  });
  const column = (
    label: string,
    value: string | null,
    change: (v: string) => void,
    columns = all,
    optional = false,
  ) => (
    <NodeColumnSelector
      label={label}
      value={value ?? ''}
      preserveValue={value ?? undefined}
      columns={columns}
      clearOptionValue={optional ? '__none' : undefined}
      clearOptionLabel="None"
      onChange={(v) => {
        change(v === '__none' ? '' : v);
      }}
    />
  );
  const measure =
    'measure' in r ? (
      <>
        <label className="space-y-1">
          <span>Measure</span>
          <SearchableSelect
            ariaLabel="Measure"
            value={r.measure}
            options={('axis' in r || 'row' in r
              ? ['count', 'sum', 'mean', 'median']
              : ['count', 'sum']
            ).map((value) => ({
              value,
              label:
                value === 'count' ? 'Count rows' : value.slice(0, 1).toUpperCase() + value.slice(1),
            }))}
            onChange={(value) => {
              onChange({
                ...r,
                measure: value as api.PlotMeasure,
                value: value === 'count' ? null : r.value,
              });
            }}
          />
        </label>
        {r.measure !== 'count' &&
          column(
            'Value',
            r.value,
            (value) => {
              onChange({ ...r, value: value || null });
            },
            numeric,
          )}
      </>
    ) : null;
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">
      {'axis' in r && (
        <>
          {column(
            'Axis',
            r.axis,
            (axis) => {
              onChange({
                ...r,
                axis,
                interval: temporal.includes(axis)
                  ? { type: 'time', unit: 'day', step: 1 }
                  : { type: 'numeric', width: '1', origin: null },
              });
            },
            [...numeric, ...temporal],
          )}
          {r.interval.type === 'numeric' ? (
            <>
              <label>
                Interval width
                <Input
                  aria-label="Interval width"
                  value={r.interval.width}
                  onChange={(e) => {
                    if (r.interval.type === 'numeric')
                      onChange({ ...r, interval: { ...r.interval, width: e.target.value } });
                  }}
                />
              </label>
              <label>
                Origin (blank = minimum)
                <Input
                  aria-label="Interval origin"
                  value={r.interval.origin ?? ''}
                  onChange={(e) => {
                    if (r.interval.type === 'numeric')
                      onChange({
                        ...r,
                        interval: { ...r.interval, origin: e.target.value || null },
                      });
                  }}
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Interval
                <SearchableSelect
                  ariaLabel="Time interval"
                  value={r.interval.unit}
                  options={[
                    'second',
                    'minute',
                    'hour',
                    'day',
                    'week',
                    'month',
                    'quarter',
                    'year',
                  ].map((value) => ({ value }))}
                  onChange={(value) => {
                    onChange({
                      ...r,
                      interval: { type: 'time', unit: value as api.PlotTimeUnit, step: 1 },
                    });
                  }}
                />
              </label>
              {['second', 'minute', 'hour', 'day', 'week'].includes(r.interval.unit) && (
                <label>
                  Every
                  <Input
                    type="number"
                    aria-label="Interval step"
                    min={1}
                    value={r.interval.step}
                    onChange={(e) => {
                      if (r.interval.type === 'time')
                        onChange({
                          ...r,
                          interval: { ...r.interval, step: Number(e.target.value) },
                        });
                    }}
                  />
                </label>
              )}
              {aware && (
                <label>
                  Timezone
                  <SearchableSelect
                    ariaLabel="Timezone"
                    value={r.timezone}
                    options={(zones.data ?? ['UTC']).map((value) => ({ value }))}
                    onChange={(timezone) => {
                      onChange({ ...r, timezone });
                    }}
                  />
                  {zones.isError && (
                    <span role="alert">
                      Timezone catalogue unavailable. Retry after provisioning ICU.
                    </span>
                  )}
                </label>
              )}
            </>
          )}
          {measure}
          <section
            aria-label="Grouping"
            className="col-span-full space-y-2 border-t border-surface-border pt-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-description font-medium">
                  Grouping <span className="text-label-secondary">({r.groups.length}/3)</span>
                </h3>
                <p className="text-description text-label-secondary">
                  Split the measure into series. Leave empty for all rows.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Add group"
                disabled={r.groups.length >= 3}
                onClick={() => {
                  onChange({ ...r, groups: [...r.groups, ''] });
                }}
              >
                <Plus className="size-4" /> Add
              </Button>
            </div>
            <div className="max-h-60 space-y-3 overflow-y-auto pr-1">
              {r.groups.map((name, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    {column(
                      `Group ${String(i + 1)}`,
                      name,
                      (value) => {
                        onChange({
                          ...r,
                          groups: r.groups.map((group, index) => (index === i ? value : group)),
                        });
                      },
                      all.filter((column) => column === name || !r.groups.includes(column)),
                    )}
                    {name && (
                      <p className="text-description text-label-secondary">
                        {!all.includes(name)
                          ? 'Column unavailable'
                          : distinct.isError
                            ? 'Distinct count unavailable'
                            : `${String(distinct.data?.getChild(String(groups.indexOf(name)))?.get(0) ?? '…')} distinct values`}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-5 shrink-0"
                    aria-label={`Remove group ${String(i + 1)}`}
                    onClick={() => {
                      onChange({ ...r, groups: r.groups.filter((_, index) => index !== i) });
                    }}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      {'category' in r && (
        <>
          {column('Category', r.category, (category) => {
            onChange({ ...r, category });
          })}
          {column(
            'Stack category',
            r.stack,
            (stack) => {
              onChange({ ...r, stack: stack || null });
            },
            all,
            true,
          )}
        </>
      )}
      {'x' in r && (
        <>
          {column(
            'X',
            r.x,
            (x) => {
              onChange({ ...r, x });
            },
            numeric,
          )}
          {column(
            'Y',
            r.y,
            (y) => {
              onChange({ ...r, y });
            },
            numeric,
          )}
          {column(
            'Color category',
            r.color,
            (color) => {
              onChange({ ...r, color: color || null });
            },
            all,
            true,
          )}
          {column(
            'Bubble size',
            r.size,
            (size) => {
              onChange({ ...r, size: size || null });
            },
            numeric,
            true,
          )}
          {column(
            'Row label',
            r.label,
            (label) => {
              onChange({ ...r, label: label || null });
            },
            all,
            true,
          )}
        </>
      )}
      {'row' in r && (
        <>
          {column('Row category', r.row, (row) => {
            onChange({ ...r, row });
          })}
          {column('Column category', r.column, (column) => {
            onChange({ ...r, column });
          })}
        </>
      )}
      {'stages' in r && (
        <>
          {[...r.stages, ''].map((name, i) => (
            <div key={i}>
              {column(
                `Stage ${String(i + 1)}`,
                name,
                (v) => {
                  onChange({
                    ...r,
                    stages: [...r.stages.slice(0, i), ...(v ? [v] : []), ...r.stages.slice(i + 1)],
                  });
                },
                all.filter((n) => n === name || !r.stages.includes(n)),
                true,
              )}
            </div>
          ))}
          <p className="text-description text-label-secondary">
            Bands connect adjacent stages. Selecting several bands matches any selected transition.
          </p>
        </>
      )}
      {!('axis' in r) && measure}
    </div>
  );
}
