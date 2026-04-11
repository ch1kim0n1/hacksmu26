import React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

const defaultIcon = (
  <svg
    className="h-8 w-8 text-ev-warm-gray"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
    />
  </svg>
);

export function EmptyState({
  icon = defaultIcon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-6 text-center",
        className
      )}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-background-elevated">
        {icon}
      </div>
      <h3 className="mb-1 text-lg font-semibold text-ev-charcoal">
        {title}
      </h3>
      {description && (
        <p className="mb-6 max-w-sm text-sm text-ev-elephant">
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}

export function EmptyRecordings() {
  return (
    <EmptyState
      icon={
        <svg className="h-8 w-8 text-accent-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      }
      title="No recordings yet"
      description="Upload your first elephant field recording to get started with noise removal and analysis."
    />
  );
}

export function EmptyCalls() {
  return (
    <EmptyState
      icon={
        <svg className="h-8 w-8 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
        </svg>
      }
      title="No processed calls yet"
      description="Process a recording to detect and catalog elephant vocalizations."
    />
  );
}

export function ErrorState({
  message = "Something went wrong",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <EmptyState
      icon={
        <svg className="h-8 w-8 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      }
      title="Error"
      description={message}
      action={
        onRetry ? (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-lg bg-accent-teal px-5 py-2 text-sm font-medium text-ev-ivory transition-colors hover:bg-accent-teal/90"
          >
            Try again
          </button>
        ) : undefined
      }
    />
  );
}

export function ProcessingError({
  onRetry,
}: {
  onRetry?: () => void;
}) {
  return (
    <ErrorState
      message="Processing failed. The audio file may be corrupted or in an unsupported format."
      onRetry={onRetry}
    />
  );
}

export function ConnectionLost() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-4 py-2 text-sm">
      <div className="h-2 w-2 rounded-full bg-warning animate-pulse" />
      <span className="text-warning font-medium">Connection lost</span>
      <span className="text-ev-elephant">
        — real-time updates paused
      </span>
    </div>
  );
}
