"use client";

import React from "react";

interface Filters {
  callType: string;
  dateFrom: string;
  dateTo: string;
  location: string;
  confidence: number;
}

interface FilterPanelProps {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
}

const CALL_TYPES = [
  { value: "", label: "All Types" },
  { value: "contact", label: "Contact" },
  { value: "alarm", label: "Alarm" },
  { value: "song", label: "Song" },
  { value: "social", label: "Social" },
  { value: "feeding", label: "Feeding" },
  { value: "mating", label: "Mating" },
];

export default function FilterPanel({
  filters,
  onFilterChange,
}: FilterPanelProps) {
  const updateFilter = <K extends keyof Filters>(
    key: K,
    value: Filters[K]
  ) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const handleReset = () => {
    onFilterChange({
      callType: "",
      dateFrom: "",
      dateTo: "",
      location: "",
      confidence: 0,
    });
  };

  const inputBaseClass =
    "bg-echofield-surface-elevated border border-echofield-border rounded px-3 py-1.5 text-sm text-echofield-text-primary placeholder:text-echofield-text-muted focus:outline-none focus:border-accent-teal focus:ring-1 focus:ring-accent-teal/30 transition-colors";

  return (
    <div className="flex flex-wrap items-end gap-3 p-4 rounded-lg bg-echofield-surface border border-echofield-border">
      {/* Call type select */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase tracking-wide text-echofield-text-muted">
          Call Type
        </label>
        <select
          value={filters.callType}
          onChange={(e) => updateFilter("callType", e.target.value)}
          className={inputBaseClass}
        >
          {CALL_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      {/* Date from */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase tracking-wide text-echofield-text-muted">
          Date From
        </label>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => updateFilter("dateFrom", e.target.value)}
          className={inputBaseClass}
        />
      </div>

      {/* Date to */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase tracking-wide text-echofield-text-muted">
          Date To
        </label>
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => updateFilter("dateTo", e.target.value)}
          className={inputBaseClass}
        />
      </div>

      {/* Location */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase tracking-wide text-echofield-text-muted">
          Location
        </label>
        <input
          type="text"
          value={filters.location}
          onChange={(e) => updateFilter("location", e.target.value)}
          placeholder="Search location..."
          className={inputBaseClass}
        />
      </div>

      {/* Confidence slider */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase tracking-wide text-echofield-text-muted">
          Min Confidence: {Math.round(filters.confidence * 100)}%
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={filters.confidence}
          onChange={(e) => updateFilter("confidence", parseFloat(e.target.value))}
          className="w-28 h-1.5 rounded-full appearance-none cursor-pointer mt-1.5"
          style={{
            background: `linear-gradient(to right, #00D9FF ${filters.confidence * 100}%, #2A3A42 ${filters.confidence * 100}%)`,
          }}
        />
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 ml-auto">
        <button
          onClick={handleReset}
          className="px-3 py-1.5 text-sm text-echofield-text-muted hover:text-echofield-text-secondary transition-colors"
        >
          Reset
        </button>
        <button
          onClick={() => onFilterChange(filters)}
          className="px-4 py-1.5 rounded bg-accent-teal text-echofield-bg text-sm font-medium hover:bg-accent-teal/90 transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
