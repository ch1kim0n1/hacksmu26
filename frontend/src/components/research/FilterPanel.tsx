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
    "bg-background-elevated border border-ev-sand rounded px-3 py-1.5 text-sm text-ev-charcoal placeholder:text-ev-warm-gray focus:outline-none focus:border-accent-savanna focus:ring-1 focus:ring-accent-savanna/30 transition-colors";

  return (
    <div className="flex flex-wrap items-end gap-3 p-4 rounded-lg bg-ev-cream border border-ev-sand">
      {/* Call type select */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase tracking-wide text-ev-warm-gray">
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
        <label className="text-[10px] uppercase tracking-wide text-ev-warm-gray">
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
        <label className="text-[10px] uppercase tracking-wide text-ev-warm-gray">
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
        <label className="text-[10px] uppercase tracking-wide text-ev-warm-gray">
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
        <label className="text-[10px] uppercase tracking-wide text-ev-warm-gray">
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
            background: `linear-gradient(to right, #C4A46C ${filters.confidence * 100}%, #D4CCC3 ${filters.confidence * 100}%)`,
          }}
        />
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 ml-auto">
        <button
          onClick={handleReset}
          className="px-3 py-1.5 text-sm text-ev-warm-gray hover:text-ev-elephant transition-colors"
        >
          Reset
        </button>
        <button
          onClick={() => onFilterChange(filters)}
          className="px-4 py-1.5 rounded bg-accent-savanna text-ev-ivory text-sm font-medium hover:bg-accent-savanna/90 transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
