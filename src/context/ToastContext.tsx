"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

export interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
  primary?: boolean;
}

export interface ToastInput {
  emoji?: string;
  title: string;
  body?: string;
  actions?: ToastAction[];
  // Auto-dismiss after ms. Defaults: 4000 when there are no actions, sticky
  // (never auto-dismiss) when there are actions.
  duration?: number;
}

interface Toast extends ToastInput {
  id: number;
}

interface ToastContextValue {
  showToast: (t: ToastInput) => number;
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => 0,
  dismissToast: () => {},
});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (input: ToastInput) => {
      const id = ++idRef.current;
      setToasts((ts) => [...ts, { ...input, id }]);
      const autoMs =
        input.duration ?? (input.actions && input.actions.length ? null : 4000);
      if (autoMs) setTimeout(() => dismissToast(id), autoMs);
      return id;
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)] pointer-events-none pt-[env(safe-area-inset-top)]">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismissToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div className="pointer-events-auto surface-pop shadow-2xl p-3.5">
      <div className="flex items-start gap-3">
        {toast.emoji && <span className="text-2xl leading-none mt-0.5">{toast.emoji}</span>}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{toast.title}</p>
          {toast.body && <p className="text-xs text-neutral-400 mt-0.5">{toast.body}</p>}
        </div>
        <button
          onClick={onDismiss}
          className="text-neutral-600 hover:text-neutral-300 transition-colors cursor-pointer shrink-0"
          aria-label="Dismiss"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {toast.actions && toast.actions.length > 0 && (
        <div className="flex items-center gap-2 mt-3">
          {toast.actions.map((a, i) => (
            <button
              key={i}
              onClick={async () => {
                await a.onClick();
                onDismiss();
              }}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors cursor-pointer ${
                a.primary
                  ? "bg-emerald-500 hover:bg-emerald-400 text-[#0a0a0a]"
                  : "bg-white/5 hover:bg-white/10 text-neutral-300"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
