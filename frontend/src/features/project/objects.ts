import type { components } from '@/api/generated/native';

export type ObjectRef = components['schemas']['Relation'];

/** Strings address registered Data Blocks; explicit references address catalogue objects. */
export type DataTarget = string | components['schemas']['ObjectTarget'];

export const objectRef = (target: DataTarget): ObjectRef =>
  typeof target === 'string'
    ? { schema: 'data', name: target }
    : { schema: target.schema ?? 'data', name: target.name };

export const targetKey = (target: DataTarget) => {
  const r = objectRef(target);
  return JSON.stringify([r.schema, r.name]);
};

export const targetLabel = (target: DataTarget) =>
  typeof target === 'string' ? target : `${objectRef(target).schema}.${target.name}`;

export const sameTarget = (left: DataTarget | null, right: DataTarget | null) =>
  left === null || right === null ? left === right : targetKey(left) === targetKey(right);

export const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`;

export const relation = (node: { table_name: string } & { schema?: string }) =>
  `${node.schema ? identifier(node.schema) : 'data'}.${identifier(node.table_name)}`;

export const objectSql = (target: DataTarget) => {
  const r = objectRef(target);
  return relation({ table_name: r.name, schema: r.schema });
};
