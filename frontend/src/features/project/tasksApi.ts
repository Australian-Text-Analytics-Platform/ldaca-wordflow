import { request } from '@/api/client';
import type { components } from '@/api/generated/native';

export type NativeTask = components['schemas']['TaskSummary'];

export type TaskSnapshot = components['schemas']['TaskSnapshot'];

export async function getTasks(base: string, signal?: AbortSignal): Promise<TaskSnapshot> {
  return (await request(base, '/api/project/tasks', 'get', { signal })).json();
}

export async function cancelTask(base: string, id: string): Promise<TaskSnapshot> {
  return (
    await request(base, '/api/project/tasks/{task_id}/cancel', 'post', {
      path: { task_id: id },
      body: {},
    })
  ).json();
}

export async function dismissTask(base: string, id: string): Promise<TaskSnapshot> {
  return (
    await request(base, '/api/project/tasks/{task_id}', 'delete', { path: { task_id: id } })
  ).json();
}
