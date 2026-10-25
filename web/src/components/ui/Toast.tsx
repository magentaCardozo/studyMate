import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { errorMessage } from '../../lib/api';

type Tone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: Tone;
  message: string;
}

const ToastContext = createContext<{ show: (message: string, tone?: Tone) => void; error: (e: unknown) => void }>({ show: () => {}, error: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
  const show = useCallback((message: string, tone: Tone = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, tone, message }]);
    setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4000);
  }, []);
  const error = useCallback((e: unknown) => show(errorMessage(e), 'error'), [show]);
  const icons = { success: <CheckCircle2 size={18} className="text-success" />, error: <AlertCircle size={18} className="text-danger" />, info: <Info size={18} className="text-muted" /> };
  return (
    <ToastContext.Provider value={{ show, error }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-line bg-white px-4 py-3 text-sm shadow-pop">
            {icons[t.tone]}
            <p className="flex-1">{t.message}</p>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Fermer" className="text-muted hover:text-charcoal">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
