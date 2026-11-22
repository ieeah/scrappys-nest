import { useContext, useEffect } from 'react';
import {
  FloatingNavDockContext,
  type FloatingNavDockConfig,
} from '@/context/floatingNavDockContextValue';

export const useFloatingNavDock = () => useContext(FloatingNavDockContext).dock;

export const useSetFloatingNavDock = (config: FloatingNavDockConfig | null) => {
  const { setDock } = useContext(FloatingNavDockContext);

  useEffect(() => {
    setDock(config);
    return () => setDock(null);
  }, [config, setDock]);
};
