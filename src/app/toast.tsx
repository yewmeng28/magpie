import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface Toast {
  id: number;
  message: string;
  undo?: () => Promise<void> | void;
}

type Show = (message: string, undo?: Toast['undo']) => void;

const ToastContext = createContext<Show>(() => {});

/** How long a message stays, and so how long Undo is offered. */
const SHOW_FOR = 6000;

/**
 * One short message at a time above the tab bar, with Undo for changes that can be reversed. Undo replaces
 * confirmation pop-ups: the action happens straight away and stays reversible for a few seconds.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const next = useRef(0);
  const show = useCallback<Show>((message, undo) => setToast({ id: ++next.current, message, undo }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast((t) => (t?.id === toast.id ? null : t)), SHOW_FOR);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-slot" role="status" aria-live="polite">
        {toast && (
          <div className="toast" key={toast.id}>
            <span>{toast.message}</span>
            {toast.undo && (
              <button
                onClick={async () => {
                  const undo = toast.undo!;
                  setToast(null);
                  await undo();
                }}
              >
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
