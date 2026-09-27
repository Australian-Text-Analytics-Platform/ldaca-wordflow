import { useRef, type ReactNode } from 'react';
import { Navigation, type Guard } from './useEditingNavigation';
/** Editors decide whether to save/discard; the shell waits before changing tabs or tools. */
export function EditingNavigation({ children }: { children: ReactNode }) {
  const guards = useRef(new Map<string, Guard>());
  const pending = useRef(false);
  const value = {
    register: (id: string, guard: Guard) => {
      guards.current.set(id, guard);
      return () => {
        guards.current.delete(id);
      };
    },
    navigate: (action: () => void, only?: string) => {
      if (pending.current) return;
      if (!guards.current.size) {
        action();
        return;
      }
      pending.current = true;
      void (async () => {
        try {
          for (const [id, guard] of [...guards.current])
            if ((!only || id === only) && !(await guard())) return;
          action();
        } finally {
          pending.current = false;
        }
      })();
    },
  };
  return <Navigation value={value}>{children}</Navigation>;
}
