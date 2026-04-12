"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SEGMENT_LABELS: Record<string, string> = {
  upload: "Upload",
  recordings: "Recordings",
  database: "Database",
  export: "Export",
  about: "About",
  processing: "Processing",
  results: "Results",
  analysis: "Analysis",
  realtime: "Real-Time",
  compare: "Compare",
  review: "Review",
  batch: "Batch",
};

export default function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-ev-dust/60">
      <Link href="/" className="hover:text-ev-cream transition-colors">
        Home
      </Link>
      {segments.map((segment, i) => {
        const label = SEGMENT_LABELS[segment];
        if (!label) return null;

        const href = "/" + segments.slice(0, i + 1).join("/");
        const isLast = i === segments.length - 1 || !SEGMENT_LABELS[segments[i + 1]];

        return (
          <span key={href} className="flex items-center gap-1.5">
            <span className="text-ev-dust/30">/</span>
            {isLast ? (
              <span className="text-ev-dust">{label}</span>
            ) : (
              <Link href={href} className="hover:text-ev-cream transition-colors">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
