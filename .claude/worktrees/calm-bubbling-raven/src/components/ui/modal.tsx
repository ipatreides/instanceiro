"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  titleAction?: React.ReactNode;
  isDirty?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, titleAction, isDirty, footer, children }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Reset confirm state when modal opens/closes
  useEffect(() => {
    if (!isOpen) setShowConfirm(false);
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const handleConfirmClose = useCallback(() => {
    setShowConfirm(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60"
      onClick={(e) => e.target === overlayRef.current && handleClose()}
    >
      <div className="bg-surface w-full sm:max-w-xl sm:rounded-[var(--radius-lg)] rounded-t-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
            {titleAction}
          </div>
          <button onClick={handleClose} className="text-text-secondary hover:text-text-primary text-xl cursor-pointer">×</button>
        </div>
        {showConfirm && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-bg border-b border-border">
            <span className="text-sm text-text-secondary">Descartar alterações?</span>
            <div className="flex gap-2">
              <button
                onClick={handleConfirmClose}
                className="px-3 py-1 text-xs text-status-error bg-status-error/10 border border-status-error/30 rounded hover:bg-status-error/20 transition-colors cursor-pointer"
              >
                Descartar
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-3 py-1 text-xs text-text-secondary bg-surface border border-border rounded hover:text-text-primary transition-colors cursor-pointer"
              >
                Continuar editando
              </button>
            </div>
          </div>
        )}
        <div className="p-4 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="flex-shrink-0 border-t border-border px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
