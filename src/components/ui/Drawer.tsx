"use client";

import { useEffect, ReactNode } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Drawer({ isOpen, onClose, title, children }: DrawerProps) {
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
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm"
          />
          
          {/* Drawer Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300, bounce: 0 }}
            className="relative h-full w-full max-w-md border-l shadow-2xl"
            style={{ 
              background: "var(--surface)",
              borderColor: "var(--border)"
            }}
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b px-6 py-5" style={{ borderColor: "var(--border)" }}>
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  {title}
                </h2>
                <button
                  onClick={onClose}
                  className="rounded-full p-1 transition-colors hover:bg-zinc-100/50"
                  style={{ color: "var(--foreground-muted)" }}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto px-6 py-6">
                {children}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
