import { createContext, use, useEffect } from 'react';
export type Guard = () => Promise<boolean>;
export const Navigation = createContext({
  register:
    (_id: string, _guard: Guard): (() => void) =>
    () => {
      /* No editor navigation provider is mounted. */
    },
  navigate: (action: () => void, _only?: string) => {
    action();
  },
});

export function useEditingNavigation() {
  return use(Navigation).navigate;
}
export function useEditingGuard(id: string, guard: Guard) {
  const { register } = use(Navigation);
  useEffect(() => register(id, guard), [id, guard, register]);
}
