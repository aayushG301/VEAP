import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type Kind = "info" | "success" | "warning" | "error";
interface ToastItem { id: number; kind: Kind; text: string }
interface Ctx { toast: (text: string, kind?: Kind) => void }
const ToastCtx = createContext<Ctx>({ toast: () => undefined });
export const useToast = () => useContext(ToastCtx);
const ICON: Record<Kind, string> = { info: "ℹ️", success: "✅", warning: "⚠️", error: "⛔" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const toast = useCallback((text: string, kind: Kind = "info") => {
    const id = Date.now() + Math.random();
    setItems((l) => [...l.slice(-3), { id, kind, text }]);
    setTimeout(() => dismiss(id), kind === "error" ? 6000 : 3800);
  }, [dismiss]);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-container" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`}>
            <span aria-hidden>{ICON[t.kind]}</span><span>{t.text}</span>
            <button aria-label="Dismiss" onClick={() => dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
