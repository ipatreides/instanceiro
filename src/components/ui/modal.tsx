"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  titleAction?: React.ReactNode;
  isDirty?: boolean;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, titleAction, isDirty, children }: ModalProps) {
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
      <div className="bg-[#1a1230] w-full sm:max-w-xl sm:rounded-lg rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-[#3D2A5C]">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            {titleAction}
          </div>
          <button onClick={handleClose} className="text-[#A89BC2] hover:text-white text-xl cursor-pointer">×</button>
        </div>
        {showConfirm && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[#2a1f40] border-b border-[#3D2A5C]">
            <span className="text-sm text-[#A89BC2]">Descartar alterações?</span>
            <div className="flex gap-2">
              <button
                onClick={handleConfirmClose}
                className="px-3 py-1 text-xs text-red-400 bg-red-900/20 border border-red-900/50 rounded hover:bg-red-900/40 transition-colors cursor-pointer"
              >
                Descartar
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-3 py-1 text-xs text-[#A89BC2] bg-[#1a1230] border border-[#3D2A5C] rounded hover:text-white transition-colors cursor-pointer"
              >
                Continuar editando
              </button>
            </div>
          </div>
        )}
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
