"use client";

import { useEffect } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export type ToastType = "success" | "error" | "info";

interface ToastProps {
  message: string | null;
  type?: ToastType;
  isVisible: boolean;
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type = "success", isVisible, onClose, duration = 4000 }: ToastProps) {
  useEffect(() => {
    if (isVisible && duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  return (
    <AnimatePresence>
      {isVisible && message && (
        <div className="fixed top-4 left-4 right-4 z-[60] flex items-center justify-center pointer-events-none sm:left-auto sm:right-6 sm:top-6 sm:w-auto">
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
            className="flex w-full items-start gap-3 rounded-2xl border p-4 shadow-2xl pointer-events-auto sm:min-w-[320px] sm:max-w-[28rem]"
            style={{ 
              background: "var(--surface)",
              borderColor: type === "error" ? "#fca5a5" : "var(--border)",
              boxShadow: "0 20px 40px -12px rgba(0,0,0,0.15)"
            }}
          >
            {type === "success" && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
            {type === "error" && <AlertCircle className="h-5 w-5 text-red-500" />}
            {type === "info" && <AlertCircle className="h-5 w-5 text-blue-500" />}
            
            <p className="flex-1 text-sm font-medium leading-snug break-words" style={{ color: "var(--foreground)" }}>
              {message}
            </p>

            <button
              onClick={onClose}
              className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
