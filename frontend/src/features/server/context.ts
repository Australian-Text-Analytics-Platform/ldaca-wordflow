import { createContext, use } from 'react';
import type { components } from '@/api/generated/native';

export type ServerStatus = components['schemas']['ServerStatus'];
export const ServerContext = createContext<{
  base: string;
  status: ServerStatus;
  refresh: () => Promise<void>;
} | null>(null);
export const useServer = () => use(ServerContext);

/** Only the standalone host injects this deployment configuration. */
export function serverBase(): string | null {
  const element = document.getElementById('wordflow-server-config');
  if (!element) return null;
  const value: unknown = JSON.parse(element.textContent);
  if (
    !value ||
    typeof value !== 'object' ||
    !('public_base_path' in value) ||
    typeof value.public_base_path !== 'string' ||
    !value.public_base_path.startsWith('/') ||
    value.public_base_path.startsWith('//')
  ) {
    throw new Error('Invalid Wordflow server configuration');
  }
  return value.public_base_path.replace(/\/$/, '');
}
