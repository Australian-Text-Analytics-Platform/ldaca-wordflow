import * as projectApi from '@/features/project/api';
import * as objectsApi from '@/features/project/objects';
import { queryOptions } from '@tanstack/react-query';
import { objectDependencies } from './projectChanges';

/** Data Blocks and schema-qualified objects share one schema cache and refresh boundary. */
export function schemaQuery(base: string, target: objectsApi.DataTarget, reportError = false) {
  const { schema, name } = objectsApi.objectRef(target);
  return queryOptions({
    queryKey: ['native', base, 'schema', schema, name],
    queryFn: ({ signal }) => projectApi.nodeSchema(base, { schema, name }, signal),
    meta: { ...objectDependencies({ schema, name }), reportError },
  });
}
