import { useEffect, useRef, type ReactNode } from "react";

interface Props { open: boolean; title: string; onClose: () => void; children: ReactNode; danger?: boolean }

/** Accessible modal: Esc closes, focus moves inside, background click closes. */
export function Modal({ open, title, onClose, children, danger }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose; // always call the latest handler without re-running the focus effect
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    // Focus the first field once, when the dialog opens (never again while the user types).
    const t = setTimeout(() => (ref.current?.querySelector("textarea, input, select, button.btn") as HTMLElement | null)?.focus(), 30);
    return () => { clearTimeout(t); document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h3 className="modal__title" style={danger ? { color: "var(--emergency-red)" } : undefined}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function ConfirmModal({ open, title, text, confirmLabel, danger = true, busy, onConfirm, onClose }:
  { open: boolean; title: string; text: string; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open={open} title={title} onClose={onClose} danger={danger}>
      <p className="modal__text">{text}</p>
      <div className="modal__actions">
        <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
        <button className={`btn ${danger ? "btn--danger" : "btn--primary"}`} disabled={busy} onClick={onConfirm}>{busy ? "Please wait..." : confirmLabel}</button>
      </div>
    </Modal>
  );
}
