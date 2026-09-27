import type { ReactNode } from 'react';

/**
 * Renders a TanStack header or cell definition by calling it (issues 208, 209).
 * Use this instead of `flexRender`: `flexRender` mounts each function renderer
 * as a component, and column definitions are often rebuilt on every render,
 * so every header and cell remounted whenever a table re-rendered. That lost
 * focus and tooltips, and WebKit scrolled the table back to its top-left
 * corner. Column renderers must therefore be plain functions without hooks;
 * put any hooks in a component the renderer returns.
 */
export function renderColumnPart<TContext>(
  part: ReactNode | ((context: TContext) => ReactNode) | undefined,
  context: TContext,
): ReactNode {
  return typeof part === 'function' ? part(context) : part;
}
