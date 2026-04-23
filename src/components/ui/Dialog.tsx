"use client";

import { useEffect, ReactNode } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Dialog({ isOpen, onClose, title, children }: DialogProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0 }}
            className="relative w-full max-h-[calc(100vh-2rem)] max-w-[min(100vw-2rem,28rem)] overflow-y-auto rounded-2xl border p-5 shadow-2xl sm:p-6"
            style={{ 
              background: "var(--surface)",
              borderColor: "var(--border)"
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                {title}
              </h2>
              <button
                onClick={onClose}
                className="rounded-full p-1 transition-colors hover:bg-zinc-100"
                style={{ color: "var(--foreground-muted)" }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
