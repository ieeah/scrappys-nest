import { createContext, type ReactNode, type Ref } from 'react';

export type DockPrimaryAction = {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
};

export type DockSecondaryAction = {
  id: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'danger';
  buttonRef?: Ref<HTMLButtonElement>;
};

export type FloatingNavDockConfig = {
  primary?: DockPrimaryAction;
  secondary?: DockSecondaryAction[];
};

export type FloatingNavDockContextValue = {
  dock: FloatingNavDockConfig | null;
  setDock: (dock: FloatingNavDockConfig | null) => void;
};

export const FloatingNavDockContext = createContext<FloatingNavDockContextValue>({
  dock: null,
  setDock: () => {},
});
