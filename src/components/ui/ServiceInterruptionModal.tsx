"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface ServiceInterruptionModalProps {
  onReconnect: () => void;
  onClose?: () => void;
  /** Override message (e.g. for rate limit 429). */
  message?: string;
  title?: string;
}

export function ServiceInterruptionModal({ onReconnect, onClose, message, title = "Service Interruption" }: ServiceInterruptionModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose?.() ?? onReconnect();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onReconnect]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(11, 15, 25, 0.9)" }}
      role="alertdialog"
      aria-labelledby="service-interruption-title"
      aria-describedby="service-interruption-desc"
    >
      <div
        className="w-full max-w-sm rounded-sm border p-6 text-center relative"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
        }}
      >
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1 rounded transition-colors hover:opacity-80"
            style={{ color: "var(--foreground-muted)" }}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <div
          id="service-interruption-title"
          className="mb-4 font-mono text-xs uppercase tracking-wider"
          style={{ color: "var(--foreground-secondary)" }}
        >
          {title}
        </div>
        <p
          id="service-interruption-desc"
          className="mb-6 text-sm leading-relaxed"
          style={{ color: "var(--foreground-secondary)" }}
        >
          {message ?? "Connection to data sources was interrupted after multiple retries. This may be temporary."}
        </p>
        <div className="flex gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-sm font-mono text-xs uppercase tracking-wider transition-colors hover:opacity-90 border"
              style={{
                background: "transparent",
                borderColor: "var(--border)",
                color: "var(--foreground-secondary)",
              }}
            >
              Dismiss
            </button>
          )}
          <button
            onClick={onReconnect}
            className="flex-1 py-3 px-4 rounded-sm font-mono text-xs uppercase tracking-wider transition-colors hover:opacity-90"
            style={{
              background: "var(--accent)",
              color: "var(--background)",
            }}
          >
            Reconnect
          </button>
        </div>
      </div>
    </div>
  );
}
