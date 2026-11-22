import { useState, type ReactNode } from 'react';
import {
  FloatingNavDockContext,
  type FloatingNavDockConfig,
} from '@/context/floatingNavDockContextValue';

export type {
  DockPrimaryAction,
  DockSecondaryAction,
  FloatingNavDockConfig,
} from '@/context/floatingNavDockContextValue';

export const FloatingNavDockProvider = ({ children }: { children: ReactNode }) => {
  const [dock, setDock] = useState<FloatingNavDockConfig | null>(null);
  return (
    <FloatingNavDockContext.Provider value={{ dock, setDock }}>
      {children}
    </FloatingNavDockContext.Provider>
  );
};
