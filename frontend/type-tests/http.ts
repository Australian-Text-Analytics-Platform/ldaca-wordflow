/** Compile-only transport regressions. This module is never called by the application. */
import { request, runPlot } from '@/features/project/api';
import type { components } from '../src/api/generated/native';

export async function verifyHttpTypes() {
  const status = await (await request('', '/api/project', 'get', {})).json();
  const title: string | undefined = status.project?.title;
  void title;
  // @ts-expect-error GET is not a supported column-mutation method.
  await request('', '/api/project/nodes/{table_name}/columns', 'get', {
    path: { table_name: 'a' },
  });
  // @ts-expect-error Object path parameters are required.
  await request('', '/api/project/objects/{schema}/{table_name}/schema', 'get', {});
  // @ts-expect-error A column mutation is not a SQL request.
  await request('', '/api/project/sql', 'post', { body: { operation: 'delete', column: 'a' } });
  const page = await request('', '/api/project/nodes/{table_name}/schema', 'get', {
    path: { table_name: 'a' },
  });
  // @ts-expect-error Arrow IPC cannot be decoded as typed JSON.
  await page.json();
  // @ts-expect-error Saved request JSON remains unknown.
  const inputs = (
    await (await request('', '/api/project/analyses/{id}', 'get', { path: { id: 'id' } })).json()
  ).request.inputs;
  void inputs;
  const scatter: Required<components['schemas']['ScatterRequest']> = {
    source: { name: 'a' },
    x: 'x',
    y: 'y',
    color: null,
    size: null,
    label: null,
  };
  await runPlot('', 'id', 'scatter', scatter);
  // @ts-expect-error The selected plot mode determines its request.
  await runPlot('', 'id', 'trends', scatter);
  const task: components['schemas']['TaskProgress'] = { message: 'Work', fraction: 0.5 };
  void task;
  // @ts-expect-error JSON numbers are numbers, not bigint.
  const invalid: components['schemas']['TaskProgress'] = { message: 'Work', fraction: 1n };
  void invalid;
}
