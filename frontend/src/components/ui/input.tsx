import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-echofield-border bg-echofield-surface px-3 py-2 text-sm text-echofield-text-primary placeholder:text-echofield-text-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal/50 focus-visible:border-accent-teal/30 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
