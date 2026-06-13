import { useState, createContext, useContext, useCallback, ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto-remove after 4 seconds
    setTimeout(() => {
      removeToast(id);
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      {/* Toast Portal/Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between gap-4 px-4 py-3 rounded-xl border backdrop-blur-md transition-all duration-300 animate-slide-in-right ${
              toast.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300 shadow-[0_8px_32px_rgba(16,185,129,0.15)]'
                : toast.type === 'error'
                ? 'bg-red-500/10 border-red-500/20 text-red-300 shadow-[0_8px_32px_rgba(239,68,68,0.15)]'
                : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300 shadow-[0_8px_32px_rgba(99,102,241,0.15)]'
            }`}
          >
            <p className="text-sm font-semibold tracking-wide font-inter">
              {toast.message}
            </p>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-white/40 hover:text-white/80 transition-colors text-xs font-bold font-inter"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return {
    success: (msg: string) => context.addToast(msg, 'success'),
    error: (msg: string) => context.addToast(msg, 'error'),
    info: (msg: string) => context.addToast(msg, 'info'),
  };
}
