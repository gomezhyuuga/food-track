import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface ToastState {
  /** Cambia en cada aviso para reiniciar el temporizador. */
  key: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface Props {
  toast: ToastState | null;
  onDismiss: () => void;
}

/** Aviso efímero. Siempre con salida: guardar y borrar se pueden deshacer. */
export default function Toast({ toast, onDismiss }: Props) {
  const [shown, setShown] = useState<ToastState | null>(null);

  useEffect(() => {
    if (toast) setShown(toast);
  }, [toast]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, 4200);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  return createPortal(
    <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">
      <span>{shown?.message}</span>
      {shown?.actionLabel && (
        <button
          onClick={() => {
            shown.onAction?.();
            onDismiss();
          }}
        >
          {shown.actionLabel}
        </button>
      )}
    </div>,
    document.body
  );
}
