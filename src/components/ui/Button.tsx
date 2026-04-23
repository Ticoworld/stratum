"use client";

import { forwardRef, ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "destructive" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, disabled, children, ...props }, ref) => {
    const baseStyles = `
      relative inline-flex items-center justify-center gap-2
      font-medium tracking-[0.01em]
      transition-all duration-200 ease-out
      disabled:opacity-50 disabled:cursor-not-allowed
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background
    `;

    const variants = {
      primary: `
        bg-[color:var(--accent)]
        text-white
        hover:bg-[color:color-mix(in_srgb,var(--accent) 88%,black)]
        focus-visible:ring-[color:color-mix(in_srgb,var(--accent) 65%,white)]
        shadow-sm hover:shadow-[0_8px_20px_rgba(16,24,40,0.12)]
      `,
      destructive: `
        bg-danger text-white
        hover:bg-danger-light
        focus-visible:ring-danger
        shadow-sm hover:shadow
      `,
      ghost: `
        bg-transparent text-muted
        border border-[var(--border)]
        hover:bg-[var(--surface-elevated)] hover:text-foreground hover:border-[var(--border-subtle)]
        focus-visible:ring-[var(--border-subtle)]
      `,
    };

    const sizes = {
      sm: "h-8 px-3 text-sm rounded-lg",
      md: "h-10 px-4 text-sm rounded-lg",
      lg: "h-12 px-6 text-base rounded-xl",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading ? (
          <svg
            className="h-4 w-4 animate-spin shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
