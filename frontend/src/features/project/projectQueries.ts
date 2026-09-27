import { queryOptions } from '@tanstack/react-query';
import * as api from './api';
import { objectDependencies } from './projectChanges';

/** Data Blocks and schema-qualified objects share one schema cache and refresh boundary. */
export function schemaQuery(base: string, target: api.DataTarget, reportError = false) {
  const { schema, name } = api.objectRef(target);
  return queryOptions({
    queryKey: ['native', base, 'schema', schema, name],
    queryFn: ({ signal }) => api.nodeSchema(base, { schema, name }, signal),
    meta: { ...objectDependencies({ schema, name }), reportError },
  });
}
